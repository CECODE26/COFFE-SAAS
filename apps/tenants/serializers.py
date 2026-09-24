from rest_framework import serializers
from .models import Tenant


class TenantListSerializer(serializers.ModelSerializer):
    active_cafes_count = serializers.SerializerMethodField()
    active_users_count = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'slug', 'email', 'phone',
            'business_name', 'plan', 'status',
            'active_cafes_count', 'active_users_count',
            'max_cafes', 'max_users', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_active_cafes_count(self, obj):
        return obj.get_active_cafes_count()

    def get_active_users_count(self, obj):
        return obj.get_active_users_count()


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


class TenantCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = [
            'name', 'description', 'email', 'phone',
            'address', 'city', 'ruc', 'business_name', 'website', 'logo'
        ]

    def validate_name(self, value):
        if Tenant.objects.filter(name=value).exists():
            raise serializers.ValidationError("Este nombre de distribuidor ya existe.")
        return value

    def validate_ruc(self, value):
        if Tenant.objects.filter(ruc=value).exists():
            raise serializers.ValidationError("Este RUC ya está registrado.")
        return value

    def create(self, validated_data):
        from django.utils.text import slugify

        validated_data['slug'] = slugify(validated_data['name'])
        return super().create(validated_data)


class TenantUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = [
            'name', 'description', 'email', 'phone',
            'address', 'city', 'ruc', 'business_name', 'website', 'logo',
            'status', 'is_active', 'plan'
        ]
        read_only_fields = ['ruc']

    def validate_name(self, value):
        instance = self.instance
        if Tenant.objects.filter(name=value).exclude(id=instance.id).exists():
            raise serializers.ValidationError("Este nombre de distribuidor ya existe.")
        return value


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
