from rest_framework import serializers
from .models import Cafeteria
from apps.tenants.models import Tenant


class CafeteriaListSerializer(serializers.ModelSerializer):
    active_users_count = serializers.SerializerMethodField()
    mesas_count = serializers.SerializerMethodField()
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = Cafeteria
        fields = [
            'id', 'name', 'slug', 'city', 'address', 'phone', 'email',
            'capacity', 'open_time', 'close_time', 'is_active',
            'active_users_count', 'mesas_count', 'created_at',
            'tenant', 'tenant_name'
        ]
        read_only_fields = ['id', 'created_at']

    def get_active_users_count(self, obj):
        return obj.get_active_users_count()

    def get_mesas_count(self, obj):
        return obj.get_mesas_count()


class CafeteriaDetailSerializer(serializers.ModelSerializer):
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
            'active_users_count', 'mesas_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']

    def get_active_users_count(self, obj):
        return obj.get_active_users_count()

    def get_mesas_count(self, obj):
        return obj.get_mesas_count()


class CafeteriaCreateSerializer(serializers.ModelSerializer):
    # Solo el super admin lo envía; el distribuidor usa su propio tenant
    tenant = serializers.PrimaryKeyRelatedField(queryset=Tenant.objects.all(), required=False)

    class Meta:
        model = Cafeteria
        fields = [
            'id', 'tenant', 'name', 'description', 'address', 'city',
            'postal_code', 'phone', 'email', 'ruc',
            'capacity', 'open_time', 'close_time',
            'logo', 'banner'
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

        if not tenant.can_create_cafe():
            raise serializers.ValidationError(
                {'non_field_errors': f'{tenant.name} alcanzó el límite de {tenant.max_cafes} cafeterías de su plan.'}
            )

        slug = slugify(attrs['name'])
        if Cafeteria.objects.filter(tenant=tenant, slug=slug).exists():
            raise serializers.ValidationError({'name': 'Ya existe una cafetería con este nombre.'})
        attrs['slug'] = slug
        return attrs


class CafeteriaUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cafeteria
        fields = [
            'name', 'description', 'address', 'city',
            'postal_code', 'phone', 'email',
            'capacity', 'open_time', 'close_time',
            'logo', 'banner', 'is_active'
        ]

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("La capacidad debe ser mayor a 0.")
        return value


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
