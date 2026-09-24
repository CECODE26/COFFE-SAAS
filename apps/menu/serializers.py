from rest_framework import serializers
from .models import Category, MenuItem


class MenuItemSerializer(serializers.ModelSerializer):
    profit_margin = serializers.SerializerMethodField()

    class Meta:
        model = MenuItem
        fields = [
            'id', 'name', 'slug', 'description', 'price', 'cost',
            'image', 'is_available', 'preparation_time',
            'is_vegetarian', 'is_vegan', 'has_gluten',
            'profit_margin', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_profit_margin(self, obj):
        return round(obj.get_profit_margin(), 2)


class CategoryListSerializer(serializers.ModelSerializer):
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            'id', 'name', 'slug', 'description', 'icon',
            'order', 'is_active', 'items_count'
        ]

    def get_items_count(self, obj):
        return obj.items.filter(is_active=True).count()


class CategoryDetailSerializer(serializers.ModelSerializer):
    items = MenuItemSerializer(many=True, read_only=True)

    class Meta:
        model = Category
        fields = [
            'id', 'name', 'slug', 'description', 'icon',
            'order', 'is_active', 'items', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CategoryCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['name', 'slug', 'description', 'icon', 'order', 'is_active']

    def validate_name(self, value):
        request = self.context.get('request')
        if request and hasattr(request, 'tenant'):
            if Category.objects.filter(
                tenant=request.tenant, name=value
            ).exclude(id=self.instance.id if self.instance else None).exists():
                raise serializers.ValidationError("Categoría con este nombre ya existe")
        return value


class MenuItemCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = [
            'name', 'slug', 'description', 'price', 'cost', 'category',
            'image', 'is_available', 'is_active', 'preparation_time',
            'is_vegetarian', 'is_vegan', 'has_gluten'
        ]

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("El precio debe ser mayor a 0")
        return value

    def validate_cost(self, value):
        if value < 0:
            raise serializers.ValidationError("El costo no puede ser negativo")
        return value
