from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import authenticate
from django.db import transaction
from .models import User
from .permissions import PERSONAL_DE_CAFETERIA
from apps.tenants.models import Tenant


class UserSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    cafeteria_name = serializers.CharField(source='cafeteria.name', read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name',
            'phone', 'role', 'tenant', 'tenant_name', 'cafeteria',
            'cafeteria_name', 'is_active', 'created_at', 'updated_at',
            'language', 'timezone'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'tenant']
        extra_kwargs = {
            'email': {'validators': []},
        }

    def get_full_name(self, obj):
        return obj.get_full_name()


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=User.ROLE_CHOICES, default='usuario')
    # Solo el super admin lo envía; el distribuidor usa su propio tenant
    tenant = serializers.PrimaryKeyRelatedField(queryset=Tenant.objects.all(), required=False, allow_null=True)

    # Quién crea a quién (espejo en frontend/src/components/UserForm.jsx):
    # el distribuidor solo da de alta Admin Cafetería y este, el personal de su local.
    ASSIGNABLE_ROLES = {
        'super_admin': [r for r, _ in User.ROLE_CHOICES],
        'distribuidor_admin': ['cafe_admin'],
        'cafe_admin': list(PERSONAL_DE_CAFETERIA),
    }
    ROLE_ERRORS = {
        'distribuidor_admin': 'Como distribuidor solo puedes crear usuarios Admin Cafetería.',
        'cafe_admin': 'Solo puedes crear gerente, camarero, cajero o cocinero para tu cafetería.',
    }
    # Roles que trabajan dentro de un local
    CAFE_ROLES = ['cafe_admin', 'gerente', 'camarero', 'cajero', 'cocinero']

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'phone',
            'password', 'password2', 'role', 'tenant', 'cafeteria',
            'language', 'timezone'
        ]
        read_only_fields = ['id']

    def to_internal_value(self, data):
        # Tenant (y local, para el admin de cafetería) los pone el backend: lo que mande el cliente se ignora
        creator = self.context['request'].user
        if creator.role != 'super_admin' and hasattr(data, 'copy'):
            data = data.copy()
            data.pop('tenant', None)
            if creator.role == 'cafe_admin':
                data.pop('cafeteria', None)
        return super().to_internal_value(data)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Este email ya está registrado.")
        return value.lower()

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError(
                {'password2': 'Las contraseñas no coinciden.'}
            )

        creator = self.context['request'].user
        role = attrs.get('role', 'usuario')

        if role not in self.ASSIGNABLE_ROLES.get(creator.role, []):
            raise serializers.ValidationError(
                {'role': self.ROLE_ERRORS.get(creator.role, 'No puedes asignar este rol.')}
            )

        if creator.role == 'super_admin':
            tenant = attrs.get('tenant')
            if role != 'super_admin' and not tenant:
                raise serializers.ValidationError({'tenant': 'Selecciona un distribuidor.'})
            if role == 'super_admin':
                tenant = None
        else:
            # Distribuidor y admin de cafetería crean siempre dentro de su propio tenant
            tenant = creator.tenant
        attrs['tenant'] = tenant

        if creator.role == 'cafe_admin':
            # Su personal va siempre a su cafetería, mande lo que mande el cliente
            attrs['cafeteria'] = creator.cafeteria
            if not creator.cafeteria_id:
                raise serializers.ValidationError({'cafeteria': 'Tu cuenta no tiene una cafetería asignada.'})

        cafeteria = attrs.get('cafeteria')
        if role in self.CAFE_ROLES and not cafeteria:
            raise serializers.ValidationError({'cafeteria': 'Este rol necesita una cafetería.'})
        if role not in self.CAFE_ROLES:
            attrs['cafeteria'] = cafeteria = None
        if cafeteria and cafeteria.tenant_id != getattr(tenant, 'id', None):
            raise serializers.ValidationError({'cafeteria': 'La cafetería no pertenece a este distribuidor.'})

        if tenant and not tenant.can_create_user():
            raise serializers.ValidationError(
                {'non_field_errors': f'{tenant.name} alcanzó el límite de {tenant.max_users} usuarios de su plan.'}
            )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        return User.objects.create_user(
            password=password,
            is_staff=validated_data.get('role') == 'super_admin',
            is_superuser=validated_data.get('role') == 'super_admin',
            **validated_data,
        )


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop('username', None)

    def validate(self, attrs):
        email = attrs.get('email')
        password = attrs.get('password')

        user = authenticate(email=email, password=password)

        if not user:
            raise serializers.ValidationError('Email o contraseña inválidos.')

        if not user.is_active:
            raise serializers.ValidationError('Esta cuenta está desactivada.')

        refresh = self.get_token(user)
        return {'refresh': str(refresh), 'access': str(refresh.access_token)}

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email'] = user.email
        token['role'] = user.role
        token['tenant_id'] = str(user.tenant_id) if user.tenant_id else None
        token['cafeteria_id'] = str(user.cafeteria_id) if user.cafeteria_id else None
        return token


class DistribuidorRegistrationSerializer(serializers.Serializer):
    """
    Alta de un distribuidor junto con su administrador en una sola llamada (solo super admin).
    El distribuidor pasa por las mismas reglas que en la consola (TenantCreateSerializer):
    plan de pago, RUC válido, nombre único y slug libre.
    """
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, min_length=8)

    # Distribuidor Info
    distribuidor_name = serializers.CharField(max_length=255)
    ruc = serializers.CharField(max_length=20)
    business_name = serializers.CharField(max_length=255)
    plan = serializers.CharField(required=False, default='basic')

    # First user (Admin)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Este email ya está registrado.")
        return value.lower()

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError(
                {'password': 'Las contraseñas no coinciden.'}
            )

        from apps.tenants.serializers import TenantCreateSerializer
        tenant_serializer = TenantCreateSerializer(data={
            'name': attrs['distribuidor_name'],
            'business_name': attrs['business_name'],
            'ruc': attrs['ruc'],
            'email': attrs['email'],
            'phone': attrs.get('phone', ''),
            'plan': attrs['plan'],
        }, context=self.context)
        if not tenant_serializer.is_valid():
            errores = dict(tenant_serializer.errors)
            if 'name' in errores:
                errores['distribuidor_name'] = errores.pop('name')
            raise serializers.ValidationError(errores)
        attrs['tenant_serializer'] = tenant_serializer
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            tenant = validated_data['tenant_serializer'].save()
            user = User.objects.create_user(
                email=validated_data['email'],
                first_name=validated_data['first_name'],
                last_name=validated_data['last_name'],
                password=validated_data['password'],
                phone=validated_data.get('phone', ''),
                role='distribuidor_admin',
                tenant=tenant,
            )
        return {'tenant': tenant, 'user': user}


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'first_name', 'last_name', 'phone',
            'language', 'timezone'
        ]


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password2 = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password2']:
            raise serializers.ValidationError(
                {'new_password': 'Las contraseñas no coinciden.'}
            )
        return attrs

    def save(self, user):
        if not user.check_password(attrs['old_password']):
            raise serializers.ValidationError(
                {'old_password': 'Contraseña actual incorrecta.'}
            )
        user.set_password(attrs['new_password'])
        user.save()
        return user
