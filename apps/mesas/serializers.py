from rest_framework import serializers
from .models import Mesa, Reserva, generar_token_qr
from datetime import datetime, timedelta
from django.db import IntegrityError, transaction
from django.utils import timezone
from apps.cafeterias.models import Cafeteria

# Límites al crear/editar mesas desde el panel
MAX_CAPACIDAD_MESA = 30
MAX_NUMERO_MESA = 9999
# Roles que gestionan mesas solo en su propio local (la cafetería se toma del usuario)
ROLES_GESTION_LOCAL = ('cafe_admin', 'gerente')


def slug_de_mesa(numero):
    return f'mesa-{numero}'


def token_qr_unico():
    """Token nuevo para el QR que no choque con el de otra mesa (colisión casi imposible, pero se evita el 500)"""
    token = generar_token_qr()
    while Mesa.objects.filter(qr_code=token).exists():
        token = generar_token_qr()
    return token


def mensaje_numero_repetido(mesa):
    """400 al repetir el número de una mesa del mismo local (activa o desactivada)"""
    if not mesa.is_active:
        return (
            f'Ya existe la mesa {mesa.number} en este local (desactivada): '
            f'reactívala o usa otro número.'
        )
    return f'Ya existe la mesa {mesa.number} en este local.'


def mesas_activas_de(cafeteria):
    return Mesa.objects.filter(cafeteria=cafeteria, is_active=True).count()


class MesaListSerializer(serializers.ModelSerializer):
    occupied_time = serializers.SerializerMethodField()
    current_order_number = serializers.CharField(source='current_order.order_number', read_only=True)
    cafeteria_name = serializers.CharField(source='cafeteria.name', read_only=True)

    class Meta:
        model = Mesa
        fields = [
            'id', 'number', 'slug', 'capacity', 'min_capacity', 'status', 'guest_count',
            'location', 'description', 'occupied_time', 'current_order_number', 'is_active',
            'cafeteria', 'cafeteria_name',
            # Token del QR (para imprimir la tarjeta) y aviso tras un cobro parcial por QR
            'qr_code', 'nota_cierre'
        ]
        read_only_fields = ['id', 'qr_code', 'nota_cierre']

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


def _campo_capacidad(nombre):
    return serializers.IntegerField(
        min_value=1, max_value=MAX_CAPACIDAD_MESA, required=False,
        error_messages={
            'invalid': 'Escribe un número entero.',
            'min_value': f'La {nombre} debe ser de al menos 1 persona.',
            'max_value': f'La {nombre} no puede pasar de {MAX_CAPACIDAD_MESA} personas.',
        }
    )


class MesaGestionSerializer(serializers.ModelSerializer):
    """
    Editar una mesa desde el panel (PATCH/PUT): número, capacidad, zona y descripción.
    qr_code, tenant, cafetería y estado no se cambian por aquí (se ignoran si llegan).
    """
    number = serializers.IntegerField(
        min_value=1, max_value=MAX_NUMERO_MESA,
        error_messages={
            'required': 'Indica el número de la mesa.',
            'null': 'Indica el número de la mesa.',
            'invalid': 'El número de mesa debe ser un número entero.',
            'min_value': 'El número de mesa debe ser mayor a 0.',
            'max_value': f'El número de mesa no puede pasar de {MAX_NUMERO_MESA}.',
        }
    )
    capacity = _campo_capacidad('capacidad')
    min_capacity = _campo_capacidad('capacidad mínima')
    location = serializers.CharField(max_length=100, required=False, allow_blank=True)
    description = serializers.CharField(max_length=500, required=False, allow_blank=True)

    class Meta:
        model = Mesa
        fields = ['number', 'capacity', 'min_capacity', 'location', 'description']
        # La unicidad (local, número) se valida a mano para dar un mensaje claro
        validators = []

    def _cafeteria(self, attrs):
        return self.instance.cafeteria

    def validate(self, attrs):
        mesa = self.instance

        # Capacidad mínima ≤ capacidad (con los valores actuales para lo que no llega)
        if mesa is None or 'capacity' in attrs or 'min_capacity' in attrs:
            capacidad = attrs.get('capacity', mesa.capacity if mesa else 4)
            # Mesa nueva sin mínimo: cualquiera puede sentarse (1)
            minima = attrs.get('min_capacity', mesa.min_capacity if mesa else 1)
            if minima > capacidad:
                raise serializers.ValidationError({
                    'min_capacity': [
                        f'La capacidad mínima ({minima}) no puede ser mayor que la capacidad ({capacidad}).'
                    ]
                })
            if mesa is None:
                attrs['capacity'], attrs['min_capacity'] = capacidad, minima

        # Número único por local (incluye las mesas desactivadas)
        numero = attrs.get('number')
        if numero is not None and (mesa is None or numero != mesa.number):
            repetidas = Mesa.objects.filter(cafeteria=self._cafeteria(attrs), number=numero)
            if mesa is not None:
                repetidas = repetidas.exclude(pk=mesa.pk)
            repetida = repetidas.first()
            if repetida is not None:
                raise serializers.ValidationError({'number': [mensaje_numero_repetido(repetida)]})
        return attrs

    def update(self, instance, validated_data):
        if 'number' in validated_data:
            validated_data['slug'] = slug_de_mesa(validated_data['number'])
        try:
            with transaction.atomic():
                return super().update(instance, validated_data)
        except IntegrityError:
            # Otra persona tomó ese número al mismo tiempo
            raise serializers.ValidationError({
                'number': [f"Ya existe la mesa {validated_data.get('number')} en este local."]
            })


class MesaCreateSerializer(MesaGestionSerializer):
    """
    Crear una mesa desde el panel. La cafetería depende del rol:
      - cafe_admin / gerente: siempre la suya (se ignora la que llegue).
      - distribuidor_admin: una de su tenant (obligatoria).
      - super_admin: cualquiera (obligatoria).
    El local debe estar abierto (no hay tope de mesas). El tenant sale del local,
    el slug del número y el QR se genera aquí (nunca se acepta del cliente).
    """
    cafeteria = serializers.PrimaryKeyRelatedField(
        queryset=Cafeteria.objects.all(), required=False, allow_null=True,
        pk_field=serializers.UUIDField(error_messages={'invalid': 'Local inválido.'}),
        error_messages={
            'does_not_exist': 'Ese local no existe o no pertenece a tu cadena.',
            'incorrect_type': 'Local inválido.',
        }
    )

    class Meta(MesaGestionSerializer.Meta):
        fields = MesaGestionSerializer.Meta.fields + ['cafeteria']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Sin usuario con rol (p. ej. al generar el esquema OpenAPI) el campo queda tal cual
        user = getattr(self.context.get('request'), 'user', None)
        role = getattr(user, 'role', None)
        if role in ROLES_GESTION_LOCAL:
            # Se usa siempre el local del usuario: lo que llegue en 'cafeteria' se ignora
            self.fields.pop('cafeteria')
        elif role is not None and role != 'super_admin':
            self.fields['cafeteria'].queryset = Cafeteria.objects.filter(tenant_id=user.tenant_id)

    def _cafeteria(self, attrs):
        return attrs['cafeteria']

    def validate(self, attrs):
        user = self.context['request'].user
        if user.role in ROLES_GESTION_LOCAL:
            cafeteria = user.cafeteria
            if cafeteria is None:
                raise serializers.ValidationError(
                    {'non_field_errors': ['No tienes un local asignado: pide al distribuidor que te asigne uno.']}
                )
            clave = 'non_field_errors'
        else:
            cafeteria = attrs.get('cafeteria')
            if cafeteria is None:
                raise serializers.ValidationError({'cafeteria': ['Elige el local de la mesa.']})
            clave = 'cafeteria'

        # Las mesas de un local cerrado no se muestran ni se usan: no tiene sentido crearlas
        if not cafeteria.is_active:
            raise serializers.ValidationError(
                {clave: [f'{cafeteria.name} está cerrado: ábrelo antes de agregarle mesas.']}
            )

        attrs['cafeteria'] = cafeteria
        return super().validate(attrs)

    def create(self, validated_data):
        # Llamar dentro de transaction.atomic(): el local queda bloqueado mientras se crea la mesa,
        # así dos altas simultáneas no repiten número. No hay tope de mesas: las que quiera el negocio.
        cafeteria = Cafeteria.objects.select_for_update().get(pk=validated_data['cafeteria'].pk)
        repetida = Mesa.objects.filter(cafeteria=cafeteria, number=validated_data['number']).first()
        if repetida is not None:
            raise serializers.ValidationError({'number': [mensaje_numero_repetido(repetida)]})

        validated_data.update(
            cafeteria=cafeteria,
            tenant_id=cafeteria.tenant_id,
            slug=slug_de_mesa(validated_data['number']),
            # Token del QR: aleatorio y no adivinable (nunca el id ni el número de la mesa)
            qr_code=token_qr_unico(),
        )
        return Mesa.objects.create(**validated_data)


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


def mesas_reservables_de(user):
    """
    Mesas que el usuario puede reservar: las de su local (personal), las de su cadena (distribuidor) o
    cualquiera (super_admin); siempre de locales abiertos. Nadie reserva mesas de otra cadena.
    """
    mesas = Mesa.objects.filter(cafeteria__is_active=True)
    role = getattr(user, 'role', None)
    if role == 'super_admin':
        return mesas
    if role == 'distribuidor_admin' and user.tenant_id:
        return mesas.filter(tenant_id=user.tenant_id)
    if getattr(user, 'cafeteria_id', None):
        return mesas.filter(cafeteria_id=user.cafeteria_id)
    return Mesa.objects.none()


class ReservaCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reserva
        fields = [
            'mesa', 'customer_name', 'customer_phone', 'customer_email',
            'guest_count', 'reservation_date', 'reservation_time', 'notes'
        ]
        extra_kwargs = {
            'mesa': {'error_messages': {
                'does_not_exist': 'Esa mesa no existe o no es de tu local.',
                'incorrect_type': 'Mesa inválida.',
            }},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Solo mesas del alcance del usuario (sin usuario, p. ej. al generar el esquema, queda tal cual)
        user = getattr(self.context.get('request'), 'user', None)
        if user is not None and user.is_authenticated:
            self.fields['mesa'].queryset = mesas_reservables_de(user)

    def validate_reservation_date(self, value):
        if value < timezone.now().date():
            raise serializers.ValidationError("La fecha debe ser hoy o en el futuro")
        return value

    def validate(self, attrs):
        mesa = attrs['mesa']
        reservation_date = attrs['reservation_date']
        reservation_time = attrs['reservation_time']
        guest_count = attrs['guest_count']

        # Una mesa desactivada no se puede reservar
        if not mesa.is_active:
            raise serializers.ValidationError(
                {'mesa': [f'La mesa {mesa.number} está desactivada: elige otra mesa.']}
            )

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
