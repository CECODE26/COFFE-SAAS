import re

from django.db import IntegrityError, transaction
from django.utils.text import slugify
from rest_framework import serializers

from .models import LIMITES_POR_PLAN, PLANES_DE_PAGO, Tenant


class TenantListSerializer(serializers.ModelSerializer):
    active_cafes_count = serializers.SerializerMethodField()
    active_users_count = serializers.SerializerMethodField()
    # Cuentas Distribuidor (activas o no): con 0, el formulario de usuarios lo marca "(sin cuenta)"
    admins_count = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'slug', 'email', 'phone',
            'business_name', 'plan', 'status',
            'active_cafes_count', 'active_users_count', 'admins_count',
            'max_cafes', 'max_users', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_active_cafes_count(self, obj):
        return obj.get_active_cafes_count()

    def get_active_users_count(self, obj):
        return obj.get_active_users_count()

    def get_admins_count(self, obj):
        # La lista lo trae anotado en la misma consulta (TenantViewSet.get_queryset); si no, se cuenta aquí
        anotado = getattr(obj, 'admins_count', None)
        if anotado is not None:
            return anotado
        return obj.users.filter(role='distribuidor_admin').count()


class TenantDetailSerializer(serializers.ModelSerializer):
    active_cafes_count = serializers.SerializerMethodField()
    active_users_count = serializers.SerializerMethodField()
    can_create_cafe = serializers.SerializerMethodField()
    can_create_user = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'slug', 'description', 'email', 'phone',
            'address', 'city', 'ruc', 'business_name', 'website',
            'logo', 'plan', 'status', 'is_active', 'max_cafes',
            'max_users', 'subscription_expires_at', 'active_cafes_count',
            'active_users_count', 'can_create_cafe', 'can_create_user',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_active_cafes_count(self, obj):
        return obj.get_active_cafes_count()

    def get_active_users_count(self, obj):
        return obj.get_active_users_count()

    def get_can_create_cafe(self, obj):
        return obj.can_create_cafe()

    def get_can_create_user(self, obj):
        return obj.can_create_user()


def _requerido(mensaje):
    return {'required': mensaje, 'blank': mensaje, 'null': mensaje}


# Provincias del RUC: 01 a 24 y 30 (ecuatorianos en el exterior)
_PROVINCIAS_RUC = {f'{n:02d}' for n in range(1, 25)} | {'30'}


def validar_ruc(value):
    """
    RUC ecuatoriano: 13 dígitos, provincia válida, tercer dígito 0-5 (persona natural),
    6 (entidad pública) o 9 (sociedad), y establecimiento distinto de 000.
    No se exige el dígito verificador: hay RUC de sociedades vigentes que no lo cumplen.
    """
    value = (value or '').strip()
    if not re.fullmatch(r'\d{13}', value):
        raise serializers.ValidationError("El RUC debe tener exactamente 13 dígitos numéricos.")
    if value[:2] not in _PROVINCIAS_RUC:
        raise serializers.ValidationError("El RUC no es válido: los dos primeros dígitos deben ser una provincia (01 a 24 o 30).")
    if value[2] in '78':
        raise serializers.ValidationError("El RUC no es válido: el tercer dígito debe ser 0 a 6 o 9.")
    if value.endswith('000'):
        raise serializers.ValidationError("El RUC no es válido: debe terminar en el número de establecimiento (p. ej. 001).")
    return value


def validar_nombre_distribuidor(value, excluir=None):
    """Nombre comercial único sin distinguir mayúsculas ni espacios alrededor"""
    value = value.strip()
    otros = Tenant.objects.filter(name__iexact=value)
    if excluir is not None:
        otros = otros.exclude(pk=excluir.pk)
    if otros.exists():
        raise serializers.ValidationError("Ya existe un distribuidor con este nombre.")
    return value


def slug_disponible(nombre):
    """Slug derivado del nombre; si ya existe se agrega -2, -3…"""
    max_len = Tenant._meta.get_field('slug').max_length
    base = slugify(nombre)[:max_len].strip('-') or 'distribuidor'
    slug, n = base, 2
    while Tenant.objects.filter(slug=slug).exists():
        sufijo = f'-{n}'
        slug = base[:max_len - len(sufijo)].rstrip('-') + sufijo
        n += 1
    return slug


class TenantCreateSerializer(serializers.ModelSerializer):
    """Alta de un distribuidor desde la consola del super admin"""

    # Campos declarados a mano: validaciones y mensajes propios (sin los de unicidad del modelo)
    name = serializers.CharField(max_length=255, error_messages=_requerido('Escribe el nombre comercial.'))
    business_name = serializers.CharField(max_length=255, error_messages=_requerido('Escribe la razón social.'))
    email = serializers.EmailField(error_messages={
        **_requerido('Escribe el email de contacto.'), 'invalid': 'Escribe un email válido.',
    })
    ruc = serializers.CharField(max_length=20, error_messages=_requerido('Escribe el RUC.'))
    plan = serializers.CharField(required=False, default='basic')

    class Meta:
        model = Tenant
        fields = [
            'name', 'description', 'email', 'phone',
            'address', 'city', 'ruc', 'business_name', 'website', 'logo', 'plan'
        ]

    def validate_name(self, value):
        return validar_nombre_distribuidor(value)

    def validate_email(self, value):
        return value.lower()

    def validate_ruc(self, value):
        value = validar_ruc(value)
        if Tenant.objects.filter(ruc=value).exists():
            raise serializers.ValidationError("Este RUC ya está registrado.")
        return value

    def validate_plan(self, value):
        if value == 'free':
            raise serializers.ValidationError("No hay plan gratis: elige Básico, Pro o Empresa.")
        if value not in PLANES_DE_PAGO:
            raise serializers.ValidationError("Plan inválido: elige Básico, Pro o Empresa.")
        return value

    def create(self, validated_data):
        validated_data.update(LIMITES_POR_PLAN[validated_data['plan']])
        # Dos altas simultáneas pueden pasar las validaciones y chocar en la base (unique de
        # slug, nombre o RUC): el slug se recalcula y reintenta; lo demás se responde como 400.
        for _ in range(3):
            validated_data['slug'] = slug_disponible(validated_data['name'])
            try:
                with transaction.atomic():
                    return super().create(validated_data)
            except IntegrityError:
                if Tenant.objects.filter(ruc=validated_data['ruc']).exists():
                    raise serializers.ValidationError({'ruc': "Este RUC ya está registrado."})
                if Tenant.objects.filter(name__iexact=validated_data['name']).exists():
                    raise serializers.ValidationError({'name': "Ya existe un distribuidor con este nombre."})
        raise serializers.ValidationError("No se pudo crear el distribuidor. Inténtalo de nuevo.")

    def to_representation(self, instance):
        # La respuesta trae la ficha completa (id, plan, límites, estado…) para pintarla sin recargar
        return TenantDetailSerializer(instance, context=self.context).data


class NuevoDistribuidorSerializer(TenantCreateSerializer):
    """
    Empresa que se crea junto con su primera cuenta Distribuidor desde Nuevo usuario
    (campo nuevo_distribuidor de UserCreateSerializer). Mismas reglas que la consola: nombre y RUC
    únicos, RUC válido y slug libre. Email y teléfono de contacto son opcionales (quien lo usa pone
    los de la cuenta) y el plan no se elige: queda el del modelo.
    """
    email = serializers.EmailField(required=False, allow_blank=True, error_messages={
        'invalid': 'Escribe un email válido.',
    })
    plan = serializers.HiddenField(default=Tenant._meta.get_field('plan').get_default())

    class Meta(TenantCreateSerializer.Meta):
        fields = ['name', 'business_name', 'ruc', 'email', 'phone', 'plan']


class TenantUpdateSerializer(serializers.ModelSerializer):
    """
    Edición de la ficha. El plan (y sus límites) solo cambia con la acción upgrade_plan,
    para que plan, max_cafes y max_users no se desincronicen.
    """
    class Meta:
        model = Tenant
        fields = [
            'name', 'description', 'email', 'phone',
            'address', 'city', 'ruc', 'business_name', 'website', 'logo',
            'status', 'is_active', 'plan', 'max_cafes', 'max_users'
        ]
        read_only_fields = ['ruc', 'plan', 'max_cafes', 'max_users']

    def validate_name(self, value):
        return validar_nombre_distribuidor(value, excluir=self.instance)

    def validate_email(self, value):
        return value.lower()

    def validate(self, attrs):
        # Estado e is_active van juntos, como en las acciones activate y deactivate
        if 'status' in attrs and 'is_active' not in attrs:
            attrs['is_active'] = attrs['status'] == 'active'
        elif 'is_active' in attrs and 'status' not in attrs:
            attrs['status'] = 'active' if attrs['is_active'] else 'inactive'
        return attrs


class TenantStatsSerializer(serializers.Serializer):
    """Estadísticas del Tenant"""
    total_cafes = serializers.IntegerField()
    active_cafes = serializers.IntegerField()
    total_users = serializers.IntegerField()
    active_users = serializers.IntegerField()
    plan = serializers.CharField()
    subscription_expires_at = serializers.DateTimeField()
    can_create_cafe = serializers.BooleanField()
    can_create_user = serializers.BooleanField()
