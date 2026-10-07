from rest_framework import serializers
from .models import Cafeteria
from .planes import MENSAJE_PLAN_INVALIDO, PLAN_CHOICES, info_plan
from apps.tenants.models import Tenant

# Quién elige y cambia el plan de una cafetería: el super admin (cualquiera) y el distribuidor dueño
# (las de su red; el alcance lo dan el queryset y los permisos de CafeteriaViewSet). El resto solo lo ve.
ROLES_QUE_CAMBIAN_PLAN = ('super_admin', 'distribuidor_admin')


def puede_cambiar_plan(usuario):
    return getattr(usuario, 'role', None) in ROLES_QUE_CAMBIAN_PLAN


def campo_plan():
    """Plan escribible con mensajes propios (los valores raros -lista, número, null- también dan 400)"""
    return serializers.ChoiceField(
        choices=PLAN_CHOICES, required=False,
        error_messages={
            'invalid_choice': MENSAJE_PLAN_INVALIDO, 'null': MENSAJE_PLAN_INVALIDO, 'blank': MENSAJE_PLAN_INVALIDO,
        },
    )


class PlanInfoMixin(serializers.Serializer):
    """plan_info: código, nombre y precio del plan (sin y con IVA), para pintarlo sin repetir el catálogo"""
    plan_info = serializers.SerializerMethodField()

    def get_plan_info(self, obj):
        return info_plan(obj.plan)


class CafeteriaListSerializer(PlanInfoMixin, serializers.ModelSerializer):
    active_users_count = serializers.SerializerMethodField()
    mesas_count = serializers.SerializerMethodField()
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = Cafeteria
        fields = [
            'id', 'name', 'slug', 'city', 'address', 'phone', 'email',
            'capacity', 'open_time', 'close_time', 'is_active',
            'active_users_count', 'mesas_count', 'created_at',
            'tenant', 'tenant_name', 'plan', 'plan_info'
        ]
        read_only_fields = ['id', 'created_at', 'plan']

    def get_active_users_count(self, obj):
        return obj.get_active_users_count()

    def get_mesas_count(self, obj):
        return obj.get_mesas_count()


class CafeteriaDetailSerializer(PlanInfoMixin, serializers.ModelSerializer):
    active_users_count = serializers.SerializerMethodField()
    mesas_count = serializers.SerializerMethodField()
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = Cafeteria
        fields = [
            'id', 'name', 'slug', 'description', 'address', 'city',
            'postal_code', 'phone', 'email', 'ruc', 'registration_number',
            'capacity', 'open_time', 'close_time',
            'logo', 'banner', 'is_active', 'tenant', 'tenant_name',
            'plan', 'plan_info',
            'active_users_count', 'mesas_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'tenant', 'plan', 'created_at', 'updated_at']

    def get_active_users_count(self, obj):
        return obj.get_active_users_count()

    def get_mesas_count(self, obj):
        return obj.get_mesas_count()


class CafeteriaCreateSerializer(serializers.ModelSerializer):
    # Solo el super admin lo envía; el distribuidor usa su propio tenant
    tenant = serializers.PrimaryKeyRelatedField(queryset=Tenant.objects.all(), required=False)
    # Lo eligen el super admin o el distribuidor (los únicos que crean cafeterías); sin enviarlo: Mensual
    plan = campo_plan()

    class Meta:
        model = Cafeteria
        fields = [
            'id', 'tenant', 'name', 'description', 'address', 'city',
            'postal_code', 'phone', 'email', 'ruc',
            'capacity', 'open_time', 'close_time',
            'logo', 'banner', 'plan'
        ]
        read_only_fields = ['id']

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("La capacidad debe ser mayor a 0.")
        return value

    def validate(self, attrs):
        from django.utils.text import slugify

        user = self.context['request'].user
        if user.role == 'super_admin':
            tenant = attrs.get('tenant')
            if not tenant:
                raise serializers.ValidationError({'tenant': 'Selecciona un distribuidor.'})
        else:
            tenant = user.tenant
        attrs['tenant'] = tenant

        slug = slugify(attrs['name'])
        if Cafeteria.objects.filter(tenant=tenant, slug=slug).exists():
            raise serializers.ValidationError({'name': 'Ya existe una cafetería con este nombre.'})
        attrs['slug'] = slug
        return attrs

    def to_representation(self, instance):
        # La respuesta trae la ficha completa (con plan_info) para pintarla sin recargar
        return CafeteriaDetailSerializer(instance, context=self.context).data


class CafeteriaUpdateSerializer(serializers.ModelSerializer):
    # Escribible solo por super admin y distribuidor. Al admin de la cafetería CafeteriaViewSet le responde 403
    # si intenta otro plan; si manda el mismo que ya tiene, aquí se descarta (no cambia nada).
    plan = campo_plan()

    class Meta:
        model = Cafeteria
        fields = [
            'name', 'description', 'address', 'city',
            'postal_code', 'phone', 'email',
            'capacity', 'open_time', 'close_time',
            'logo', 'banner', 'is_active', 'plan'
        ]

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("La capacidad debe ser mayor a 0.")
        return value

    def validate(self, attrs):
        if not puede_cambiar_plan(self.context['request'].user):
            attrs.pop('plan', None)
        return attrs

    def to_representation(self, instance):
        return CafeteriaDetailSerializer(instance, context=self.context).data


class CafeteriaStatsSerializer(serializers.Serializer):
    """Estadísticas de Cafetería"""
    total_users = serializers.IntegerField()
    active_users = serializers.IntegerField()
    total_tables = serializers.IntegerField()
    occupied_tables = serializers.IntegerField()
    available_tables = serializers.IntegerField()
    capacity = serializers.IntegerField()
    open_time = serializers.TimeField()
    close_time = serializers.TimeField()
