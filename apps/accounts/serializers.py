from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import authenticate
from .models import User
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

    class Meta:
        model = User
        fields = [
            'email', 'first_name', 'last_name', 'phone',
            'password', 'password2', 'role', 'cafeteria',
            'language', 'timezone'
        ]

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Este email ya está registrado.")
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError(
                {'password': 'Las contraseñas no coinciden.'}
            )
        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        tenant = request.tenant if hasattr(request, 'tenant') else None

        user = User.objects.create_user(
            email=validated_data['email'],
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            password=validated_data['password'],
            phone=validated_data.get('phone', ''),
            role=validated_data.get('role', 'usuario'),
            cafeteria=validated_data.get('cafeteria'),
            tenant=tenant,
            language=validated_data.get('language', 'es'),
            timezone=validated_data.get('timezone', 'America/Guayaquil'),
        )
        return user


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

        attrs['user'] = user
        return super().validate({'user': user})

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email'] = user.email
        token['role'] = user.role
        token['tenant_id'] = str(user.tenant_id) if user.tenant_id else None
        token['cafeteria_id'] = str(user.cafeteria_id) if user.cafeteria_id else None
        return token


class DistribuidorRegistrationSerializer(serializers.Serializer):
    """Registro de nuevo Distribuidor"""
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, min_length=8)

    # Distribuidor Info
    distribuidor_name = serializers.CharField(max_length=255)
    ruc = serializers.CharField(max_length=20)
    business_name = serializers.CharField(max_length=255)

    # First user (Admin)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20, required=False)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Este email ya está registrado.")
        return value

    def validate_ruc(self, value):
        if Tenant.objects.filter(ruc=value).exists():
            raise serializers.ValidationError("Este RUC ya está registrado.")
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError(
                {'password': 'Las contraseñas no coinciden.'}
            )
        return attrs

    def create(self, validated_data):
        # Create Tenant
        from django.utils.text import slugify

        tenant = Tenant.objects.create(
            name=validated_data['distribuidor_name'],
            slug=slugify(validated_data['distribuidor_name']),
            email=validated_data['email'],
            ruc=validated_data['ruc'],
            business_name=validated_data['business_name'],
            phone=validated_data.get('phone', ''),
            plan='free',
            max_cafes=1,
            max_users=10,
        )

        # Create Admin User
        user = User.objects.create_user(
            email=validated_data['email'],
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            password=validated_data['password'],
            phone=validated_data.get('phone', ''),
            role='distribuidor_admin',
            tenant=tenant,
            is_staff=True,
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
