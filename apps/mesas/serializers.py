from rest_framework import serializers
from .models import Mesa, Reserva
from datetime import datetime, timedelta
from django.utils import timezone


class MesaListSerializer(serializers.ModelSerializer):
    occupied_time = serializers.SerializerMethodField()
    current_order_number = serializers.CharField(source='current_order.order_number', read_only=True)
    cafeteria_name = serializers.CharField(source='cafeteria.name', read_only=True)

    class Meta:
        model = Mesa
        fields = [
            'id', 'number', 'slug', 'capacity', 'min_capacity', 'status', 'guest_count',
            'location', 'occupied_time', 'current_order_number', 'is_active',
            'cafeteria', 'cafeteria_name'
        ]
        read_only_fields = ['id']

    def get_occupied_time(self, obj):
        """Tiempo ocupado en minutos"""
        return obj.get_occupied_time()


class MesaDetailSerializer(serializers.ModelSerializer):
    occupied_time = serializers.SerializerMethodField()
    qr_data = serializers.SerializerMethodField()
    current_order = serializers.SerializerMethodField()

    class Meta:
        model = Mesa
        fields = [
            'id', 'number', 'slug', 'description', 'capacity', 'min_capacity',
            'status', 'guest_count', 'location', 'qr_code', 'qr_data',
            'occupied_since', 'occupied_time', 'current_order',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'occupied_since']

    def get_occupied_time(self, obj):
        return obj.get_occupied_time()

    def get_qr_data(self, obj):
        return obj.get_qr_data()

    def get_current_order(self, obj):
        if obj.current_order:
            return {
                'id': str(obj.current_order.id),
                'order_number': obj.current_order.order_number,
                'status': obj.current_order.status,
                'total': str(obj.current_order.total),
                'is_paid': obj.current_order.is_paid,
            }
        return None


class MesaCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mesa
        fields = [
            'number', 'description', 'capacity', 'min_capacity',
            'location', 'is_active'
        ]

    def validate_number(self, value):
        if value < 1:
            raise serializers.ValidationError("Número de mesa debe ser mayor a 0")
        return value

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("Capacidad debe ser mayor a 0")
        return value

    def validate(self, attrs):
        if attrs['min_capacity'] > attrs['capacity']:
            raise serializers.ValidationError(
                "Capacidad mínima no puede ser mayor a la capacidad total"
            )
        return attrs

    def create(self, validated_data):
        import uuid
        from django.utils.text import slugify

        request = self.context.get('request')

        # Generar slug
        validated_data['slug'] = slugify(f"mesa-{validated_data['number']}")

        # Generar QR único
        validated_data['qr_code'] = str(uuid.uuid4())

        # Asignar tenant y cafeteria
        validated_data['tenant'] = request.tenant
        validated_data['cafeteria'] = request.user.cafeteria

        return super().create(validated_data)


class MesaStatusChangeSerializer(serializers.Serializer):
    """Cambiar estado de mesa"""
    status = serializers.ChoiceField(choices=Mesa.STATUS_CHOICES)
    guest_count = serializers.IntegerField(required=False, min_value=0)


class ReservaListSerializer(serializers.ModelSerializer):
    mesa_number = serializers.IntegerField(source='mesa.number', read_only=True)
    # Nombre del local al que pertenece la mesa
    cafeteria_name = serializers.CharField(source='mesa.cafeteria.name', read_only=True)
    days_until = serializers.SerializerMethodField()

    class Meta:
        model = Reserva
        fields = [
            'id', 'mesa', 'mesa_number', 'cafeteria_name',
            'customer_name', 'customer_phone', 'customer_email',
            'guest_count', 'reservation_date', 'reservation_time',
            'status', 'notes', 'days_until'
        ]
        read_only_fields = ['id']

    def get_days_until(self, obj):
        """Días hasta la reserva"""
        delta = obj.reservation_date - timezone.now().date()
        return delta.days


class ReservaDetailSerializer(serializers.ModelSerializer):
    mesa_info = serializers.SerializerMethodField()

    class Meta:
        model = Reserva
        fields = [
            'id', 'mesa', 'mesa_info', 'customer_name', 'customer_phone',
            'customer_email', 'guest_count', 'reservation_date', 'reservation_time',
            'status', 'notes', 'created_at', 'confirmed_at', 'completed_at',
            'cancelled_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'confirmed_at', 'completed_at', 'cancelled_at']

    def get_mesa_info(self, obj):
        return {
            'id': str(obj.mesa.id),
            'number': obj.mesa.number,
            'capacity': obj.mesa.capacity,
        }


class ReservaCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reserva
        fields = [
            'mesa', 'customer_name', 'customer_phone', 'customer_email',
            'guest_count', 'reservation_date', 'reservation_time', 'notes'
        ]

    def validate_reservation_date(self, value):
        if value < timezone.now().date():
            raise serializers.ValidationError("La fecha debe ser hoy o en el futuro")
        return value

    def validate(self, attrs):
        mesa = attrs['mesa']
        reservation_date = attrs['reservation_date']
        reservation_time = attrs['reservation_time']
        guest_count = attrs['guest_count']

        # Validar capacidad
        if guest_count > mesa.capacity:
            raise serializers.ValidationError(
                f"El grupo es muy grande para esta mesa (capacidad: {mesa.capacity})"
            )

        if guest_count < mesa.min_capacity:
            raise serializers.ValidationError(
                f"El grupo es muy pequeño para esta mesa (mínimo: {mesa.min_capacity})"
            )

        # Validar que no haya conflicto de horario
        from datetime import timedelta
        reservation_datetime = timezone.make_aware(
            datetime.combine(reservation_date, reservation_time)
        )
        start_time = reservation_datetime - timedelta(minutes=30)
        end_time = reservation_datetime + timedelta(minutes=90)  # Duración estimada

        conflicting = Reserva.objects.filter(
            mesa=mesa,
            reservation_date=reservation_date,
            status__in=['pendiente', 'confirmada']
        ).filter(
            reservation_time__lt=end_time.time(),
            reservation_time__gt=start_time.time()
        )

        if conflicting.exists():
            raise serializers.ValidationError(
                "Esta mesa tiene un conflicto de horario con otra reserva"
            )

        return attrs

    def create(self, validated_data):
        from datetime import datetime

        request = self.context.get('request')

        # Auto-confirmar si se reserva desde admin
        if request.user.role in ['distribuidor_admin', 'cafe_admin']:
            validated_data['status'] = 'confirmada'

        return super().create(validated_data)


class ReservaUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reserva
        fields = ['customer_name', 'customer_phone', 'customer_email', 'guest_count', 'notes']


class MesaStatsSerializer(serializers.Serializer):
    """Estadísticas de Mesas"""
    total_mesas = serializers.IntegerField()
    available_mesas = serializers.IntegerField()
    occupied_mesas = serializers.IntegerField()
    reserved_mesas = serializers.IntegerField()
    cleaning_mesas = serializers.IntegerField()
    average_occupancy = serializers.DecimalField(max_digits=5, decimal_places=2)
    total_capacity = serializers.IntegerField()
