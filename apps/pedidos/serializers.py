from rest_framework import serializers
from .models import Order, OrderItem
from apps.menu.models import MenuItem
from apps.mesas.models import Mesa


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


class OrigenPedidoMixin(serializers.Serializer):
    """
    Campos comunes para distinguir los pedidos hechos por QR de los del personal y ubicar la mesa.
    Usa select_related('mesa', 'sesion_cliente') de la vista para no hacer consultas extra.
    """
    origen = serializers.SerializerMethodField()
    comensal_alias = serializers.SerializerMethodField()
    mesa_numero = serializers.SerializerMethodField()
    mesa_zona = serializers.SerializerMethodField()

    CAMPOS_ORIGEN = ['origen', 'comensal_alias', 'mesa_numero', 'mesa_zona']

    def get_origen(self, obj):
        """'qr' si lo pidió un comensal desde su celular; 'personal' si lo registró el personal"""
        return 'qr' if obj.sesion_cliente_id else 'personal'

    def get_comensal_alias(self, obj):
        return obj.sesion_cliente.alias if obj.sesion_cliente_id else None

    def get_mesa_numero(self, obj):
        return obj.mesa.number if obj.mesa_id else None

    def get_mesa_zona(self, obj):
        # La "zona" de la mesa es su ubicación (Terraza, Barra...)
        return obj.mesa.location if obj.mesa_id else None


class OrderListSerializer(OrigenPedidoMixin, serializers.ModelSerializer):
    customer_info = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    cafeteria_name = serializers.CharField(source='cafeteria.name', read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'status', 'order_type', 'total',
            'is_paid', 'customer_info', 'items_count', 'items', 'created_at',
            'tenant', 'cafeteria', 'cafeteria_name'
        ] + OrigenPedidoMixin.CAMPOS_ORIGEN
        read_only_fields = ['id', 'order_number', 'created_at']

    def get_customer_info(self, obj):
        if obj.order_type == 'mesa' and obj.mesa:
            return f"Mesa {obj.mesa.number}"
        return obj.customer_name or "Cliente"

    def get_items_count(self, obj):
        # len() sobre .all() usa el prefetch de la vista (sin consulta extra)
        return len(obj.items.all())

    def get_items(self, obj):
        """Resumen de items: [{menu_item_name, quantity}] (usa prefetch 'items__menu_item')"""
        return [
            {'menu_item_name': item.menu_item.name, 'quantity': item.quantity}
            for item in obj.items.all()
        ]


class OrderTableroSerializer(OrderListSerializer):
    """
    Pedido en el tablero CAJA / COCINA / ENTREGADO: lo de la lista más las notas y las horas
    de cada paso. Los items llevan su nota ("sin azúcar") para cocina.
    """

    class Meta(OrderListSerializer.Meta):
        fields = OrderListSerializer.Meta.fields + [
            'customer_name', 'mesa', 'notes', 'kitchen_notes',
            'confirmed_at', 'completed_at', 'updated_at'
        ]

    def get_items(self, obj):
        """[{id, menu_item_name, quantity, notes, status}] (usa prefetch 'items__menu_item')"""
        return [
            {
                'id': str(item.id),
                'menu_item_name': item.menu_item.name,
                'quantity': item.quantity,
                'notes': item.notes,
                'status': item.status,
            }
            for item in obj.items.all()
        ]


class OrderDetailSerializer(OrigenPedidoMixin, serializers.ModelSerializer):
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
        ] + OrigenPedidoMixin.CAMPOS_ORIGEN
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
        extra_kwargs = {
            'mesa': {'error_messages': {'does_not_exist': 'Esa mesa no es de tu local.'}},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Solo mesas del local del usuario y productos de su distribuidor: si no, un pedido ajeno quedaría
        # colgado de una mesa de otro local y la bloquearía (sin que su personal pudiera verlo ni cancelarlo)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return
        cafeteria_id = user.cafeteria_id
        tenant_id = user.cafeteria.tenant_id if cafeteria_id else user.tenant_id
        self.fields['mesa'].queryset = Mesa.objects.filter(cafeteria_id=cafeteria_id)
        producto = self.fields['items'].child.fields['menu_item']
        producto.queryset = MenuItem.objects.filter(tenant_id=tenant_id)
        producto.error_messages['does_not_exist'] = 'Ese producto no está en el menú de tu local.'

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
        cafeteria = request.user.cafeteria

        # El distribuidor sale del local del usuario, no del header X-Tenant-ID (lo controla el cliente)
        order = Order.objects.create(
            tenant_id=cafeteria.tenant_id,
            cafeteria=cafeteria,
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
    """
    Edición de datos del pedido. El estado solo cambia con las acciones del tablero (confirm,
    send_to_kitchen, mark_ready, complete, cancel), que validan cada paso. Lo ya cobrado no se toca:
    el descuento de un pedido pagado y el método de pago de un pedido por QR (se registra al cobrar la
    cuenta de la mesa) quedan fijos. La vista lo ejecuta con la fila bloqueada (select_for_update).
    """

    class Meta:
        model = Order
        fields = [
            'status', 'customer_name', 'customer_phone',
            'customer_address', 'notes', 'kitchen_notes',
            'discount', 'payment_method'
        ]

    def validate_discount(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError('El descuento no puede ser negativo.')
        return value

    def validate(self, attrs):
        pedido = self.instance
        if pedido is None:
            return attrs
        if 'status' in attrs and attrs['status'] != pedido.status:
            raise serializers.ValidationError({
                'status': 'El estado del pedido se cambia desde el tablero (enviar a cocina, preparar, '
                          'entregar o cancelar).'
            })
        if pedido.is_paid and 'discount' in attrs and attrs['discount'] != pedido.discount:
            raise serializers.ValidationError({
                'discount': f'El pedido {pedido.order_number} ya fue cobrado: no se puede cambiar el descuento.'
            })
        if (
            pedido.sesion_cliente_id and 'payment_method' in attrs
            and attrs['payment_method'] != pedido.payment_method
        ):
            raise serializers.ValidationError({
                'payment_method': 'Este pedido se hizo por QR: el método de pago se registra al cobrar la cuenta '
                                  'de la mesa (Mesas → detalle).'
            })
        return attrs

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
    # 'pendiente' no es un método de pago válido para marcar como pagado
    payment_method = serializers.ChoiceField(
        choices=[c for c in Order.PAYMENT_METHOD_CHOICES if c[0] != 'pendiente'],
        error_messages={
            'required': 'Debes indicar el método de pago: efectivo, tarjeta o transferencia.',
            'null': 'Debes indicar el método de pago: efectivo, tarjeta o transferencia.',
            'invalid_choice': 'Método de pago "{input}" no válido. Usa efectivo, tarjeta o transferencia.',
        },
    )


class OrderStatsSerializer(serializers.Serializer):
    """Estadísticas de Pedidos"""
    total_orders = serializers.IntegerField()
    pending_orders = serializers.IntegerField()
    completed_orders = serializers.IntegerField()
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    average_order_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    cash_collected = serializers.DecimalField(max_digits=12, decimal_places=2)
