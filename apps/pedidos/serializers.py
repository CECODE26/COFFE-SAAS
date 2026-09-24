from rest_framework import serializers
from .models import Order, OrderItem
from apps.menu.models import MenuItem


class OrderItemDetailSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(source='menu_item.name', read_only=True)
    menu_item_image = serializers.ImageField(source='menu_item.image', read_only=True)
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            'id', 'menu_item', 'menu_item_name', 'menu_item_image',
            'quantity', 'unit_price', 'special_price', 'total_price',
            'status', 'notes', 'created_at', 'completed_at'
        ]
        read_only_fields = ['id', 'created_at', 'completed_at']

    def get_total_price(self, obj):
        return str(obj.get_total_price())


class OrderItemCreateSerializer(serializers.ModelSerializer):
    menu_item = serializers.PrimaryKeyRelatedField(queryset=MenuItem.objects.all())

    class Meta:
        model = OrderItem
        fields = ['menu_item', 'quantity', 'special_price', 'notes']

    def validate_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError("La cantidad debe ser al menos 1")
        return value

    def validate_special_price(self, value):
        if value and value < 0:
            raise serializers.ValidationError("El precio no puede ser negativo")
        return value


class OrderListSerializer(serializers.ModelSerializer):
    customer_info = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'status', 'order_type', 'total',
            'is_paid', 'customer_info', 'items_count', 'created_at'
        ]
        read_only_fields = ['id', 'order_number', 'created_at']

    def get_customer_info(self, obj):
        if obj.order_type == 'mesa' and obj.mesa:
            return f"Mesa {obj.mesa.number}"
        return obj.customer_name or "Cliente"

    def get_items_count(self, obj):
        return obj.items.count()


class OrderDetailSerializer(serializers.ModelSerializer):
    items = OrderItemDetailSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    cafeteria_name = serializers.CharField(source='cafeteria.name', read_only=True)
    mesa_info = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'tenant', 'cafeteria', 'cafeteria_name',
            'order_type', 'status', 'mesa', 'mesa_info',
            'customer_name', 'customer_phone', 'customer_address',
            'subtotal', 'tax', 'discount', 'total',
            'payment_method', 'is_paid', 'paid_at',
            'notes', 'kitchen_notes',
            'created_by', 'created_by_name', 'items',
            'created_at', 'confirmed_at', 'completed_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'order_number', 'subtotal', 'tax', 'total',
            'created_at', 'confirmed_at', 'completed_at', 'updated_at'
        ]

    def get_mesa_info(self, obj):
        if obj.mesa:
            return {
                'id': str(obj.mesa.id),
                'number': obj.mesa.number,
                'capacity': obj.mesa.capacity
            }
        return None


class OrderCreateSerializer(serializers.ModelSerializer):
    items = OrderItemCreateSerializer(many=True, write_only=True)

    class Meta:
        model = Order
        fields = [
            'order_type', 'mesa', 'customer_name', 'customer_phone',
            'customer_address', 'notes', 'kitchen_notes', 'items'
        ]

    def validate_mesa(self, value):
        if self.initial_data.get('order_type') == 'mesa' and not value:
            raise serializers.ValidationError("Debe seleccionar una mesa para pedidos de mesa")
        return value

    def validate_customer_address(self, value):
        if self.initial_data.get('order_type') == 'delivery' and not value:
            raise serializers.ValidationError("La dirección es requerida para delivery")
        return value

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        request = self.context.get('request')

        order = Order.objects.create(
            tenant=request.tenant,
            cafeteria=request.user.cafeteria,
            created_by=request.user,
            **validated_data
        )

        # Crear items del pedido
        for item_data in items_data:
            menu_item = item_data['menu_item']
            OrderItem.objects.create(
                order=order,
                menu_item=menu_item,
                unit_price=menu_item.price,
                **{k: v for k, v in item_data.items() if k != 'menu_item'}
            )

        order.calculate_total()
        return order


class OrderUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = [
            'status', 'customer_name', 'customer_phone',
            'customer_address', 'notes', 'kitchen_notes',
            'discount', 'payment_method'
        ]

    def update(self, instance, validated_data):
        # Recalcular total si hay descuento
        if 'discount' in validated_data:
            instance.discount = validated_data['discount']
            instance.calculate_total()

        return super().update(instance, validated_data)


class OrderStateChangeSerializer(serializers.Serializer):
    """Serializer para cambiar estado de pedido"""
    new_status = serializers.ChoiceField(choices=Order.STATUS_CHOICES)


class OrderPaymentSerializer(serializers.Serializer):
    """Serializer para registrar pago"""
    payment_method = serializers.ChoiceField(choices=Order.PAYMENT_METHOD_CHOICES)


class OrderStatsSerializer(serializers.Serializer):
    """Estadísticas de Pedidos"""
    total_orders = serializers.IntegerField()
    pending_orders = serializers.IntegerField()
    completed_orders = serializers.IntegerField()
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    average_order_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    cash_collected = serializers.DecimalField(max_digits=12, decimal_places=2)
