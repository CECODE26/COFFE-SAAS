from rest_framework import serializers
from .models import Cafeteria


class CafeteriaListSerializer(serializers.ModelSerializer):
    active_users_count = serializers.SerializerMethodField()
    mesas_count = serializers.SerializerMethodField()

    class Meta:
        model = Cafeteria
        fields = [
            'id', 'name', 'slug', 'city', 'phone', 'email',
            'capacity', 'open_time', 'close_time', 'is_active',
            'active_users_count', 'mesas_count', 'created_at'
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
            'max_tables', 'capacity', 'open_time', 'close_time',
            'logo', 'banner', 'is_active', 'tenant', 'tenant_name',
            'active_users_count', 'mesas_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']

    def get_active_users_count(self, obj):
        return obj.get_active_users_count()

    def get_mesas_count(self, obj):
        return obj.get_mesas_count()


class CafeteriaCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cafeteria
        fields = [
            'name', 'description', 'address', 'city',
            'postal_code', 'phone', 'email', 'ruc',
            'max_tables', 'capacity', 'open_time', 'close_time',
            'logo', 'banner'
        ]

    def validate_name(self, value):
        request = self.context.get('request')
        tenant = request.tenant if hasattr(request, 'tenant') else None

        if tenant and Cafeteria.objects.filter(
            tenant=tenant, name=value
        ).exists():
            raise serializers.ValidationError("Ya existe una cafetería con este nombre.")
        return value

    def validate_max_tables(self, value):
        if value < 1:
            raise serializers.ValidationError("Debe tener al menos 1 mesa.")
        return value

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("La capacidad debe ser mayor a 0.")
        return value

    def create(self, validated_data):
        from django.utils.text import slugify

        request = self.context.get('request')
        tenant = request.tenant if hasattr(request, 'tenant') else None

        validated_data['slug'] = slugify(validated_data['name'])
        validated_data['tenant'] = tenant

        return super().create(validated_data)


class CafeteriaUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cafeteria
        fields = [
            'name', 'description', 'address', 'city',
            'postal_code', 'phone', 'email',
            'max_tables', 'capacity', 'open_time', 'close_time',
            'logo', 'banner', 'is_active'
        ]

    def validate_max_tables(self, value):
        if value < 1:
            raise serializers.ValidationError("Debe tener al menos 1 mesa.")
        return value

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
