from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, BasePermission
from django.utils import timezone
from django.db.models import Q, Count, Sum

from .models import Mesa, Reserva
from .serializers import (
    MesaListSerializer, MesaDetailSerializer, MesaCreateUpdateSerializer,
    MesaStatusChangeSerializer, MesaStatsSerializer,
    ReservaListSerializer, ReservaDetailSerializer, ReservaCreateSerializer,
    ReservaUpdateSerializer
)
from apps.accounts.permissions import IsTenantMember, IsCafeUser, IsDistribuidorAdmin


class IsPersonalReservas(BasePermission):
    """
    Personal que puede confirmar/cancelar reservas: el staff del local
    (cafe_admin, gerente, camarero, cajero, cocinero), distribuidor_admin y super_admin.
    Los clientes (rol 'usuario') quedan fuera. El alcance por local/tenant lo
    da ReservaViewSet.get_queryset (get_object() devuelve 404 fuera de él).
    """
    message = "Solo el personal del local puede confirmar o cancelar reservas."
    ROLES_LOCAL = ['cafe_admin', 'gerente', 'camarero', 'cajero', 'cocinero']

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.role in ['super_admin', 'distribuidor_admin']:
            return True
        return user.role in self.ROLES_LOCAL and user.cafeteria_id is not None


class MesaViewSet(viewsets.ModelViewSet):
    """CRUD de Mesas"""
    queryset = Mesa.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    search_fields = ['number', 'description', 'location']
    ordering_fields = ['number', 'status', 'capacity']
    # Orden estable (local, número) para que la paginación no repita ni omita mesas.
    # 'id' desempata si dos locales tuvieran el mismo nombre.
    ordering = ['cafeteria__name', 'number', 'id']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return MesaDetailSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return MesaCreateUpdateSerializer
        return MesaListSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsDistribuidorAdmin()]
        elif self.action in ['occupy', 'free', 'cleaning', 'change_status']:
            return [IsAuthenticated(), IsCafeUser()]
        return [IsAuthenticated(), IsTenantMember()]

    def get_queryset(self):
        """Filtrar mesas por cafetería del usuario"""
        user = self.request.user

        if user.role == 'super_admin':
            queryset = Mesa.objects.all()
        elif user.role == 'distribuidor_admin':
            queryset = Mesa.objects.filter(tenant=user.tenant)
        elif user.cafeteria:
            queryset = Mesa.objects.filter(cafeteria=user.cafeteria)
        else:
            return Mesa.objects.none()

        # Las mesas de locales cerrados (cafeteria.is_active=False) no forman parte de la
        # operación: no se listan ni se pueden ocupar/liberar (get_object() da 404), y
        # stats/available/occupied/by_qr cuentan solo mesas de locales abiertos.
        # Aplica también a super_admin. Las reservas de esos locales siguen en ReservaViewSet.
        queryset = queryset.filter(cafeteria__is_active=True)

        # Orden estable también para las acciones que no pasan por OrderingFilter
        return queryset.select_related('cafeteria', 'current_order').order_by(
            'cafeteria__name', 'number', 'id'
        )

    def perform_create(self, serializer):
        """Crear mesa"""
        serializer.save()

    def _bloqueo_por_pedido_abierto(self, mesa):
        """
        Una mesa solo deja de estar ocupada cuando no tiene pedidos abiertos de tipo mesa
        (abierto = no cancelado y no pagado). Si queda alguno, devuelve un 400 que el
        frontend muestra tal cual; si no, None.
        """
        abierto = mesa.orders.filter(order_type='mesa', is_paid=False).exclude(
            status='cancelada'
        ).order_by('created_at').first()
        if abierto is None:
            return None
        # Un pedido entregado ya no se puede cancelar: solo queda cobrarlo
        que_hacer = 'cóbralo' if abierto.status == 'entregada' else 'cóbralo o cancélalo'
        return Response(
            {
                'error': (
                    f'La mesa {mesa.number} tiene el pedido {abierto.order_number} abierto: '
                    f'{que_hacer} antes de liberarla.'
                )
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    @action(detail=True, methods=['post'])
    def occupy(self, request, pk=None):
        """Marcar mesa como ocupada"""
        mesa = self.get_object()
        guest_count = request.data.get('guest_count', 1)

        try:
            guest_count = int(guest_count)
            if guest_count < mesa.min_capacity or guest_count > mesa.capacity:
                return Response(
                    {
                        'error': f'Número de clientes fuera de rango ({mesa.min_capacity}-{mesa.capacity})'
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (ValueError, TypeError):
            return Response(
                {'error': 'guest_count debe ser un número'},
                status=status.HTTP_400_BAD_REQUEST
            )

        mesa.occupy(guest_count)

        return Response(
            {
                'status': 'success',
                'message': f'Mesa {mesa.number} ocupada',
                'mesa': MesaDetailSerializer(mesa).data
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def free(self, request, pk=None):
        """Liberar mesa"""
        mesa = self.get_object()

        if mesa.status == 'disponible':
            return Response(
                {'error': 'Mesa ya está disponible'},
                status=status.HTTP_400_BAD_REQUEST
            )

        bloqueo = self._bloqueo_por_pedido_abierto(mesa)
        if bloqueo:
            return bloqueo

        mesa.free()

        return Response(
            {
                'status': 'success',
                'message': f'Mesa {mesa.number} liberada',
                'mesa': MesaDetailSerializer(mesa).data
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def cleaning(self, request, pk=None):
        """Marcar mesa como en limpieza"""
        mesa = self.get_object()
        bloqueo = self._bloqueo_por_pedido_abierto(mesa)
        if bloqueo:
            return bloqueo

        mesa.cleaning()

        return Response(
            {
                'status': 'success',
                'message': f'Mesa {mesa.number} marcada como limpiando'
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def maintenance(self, request, pk=None):
        """Marcar mesa como en mantenimiento"""
        mesa = self.get_object()
        bloqueo = self._bloqueo_por_pedido_abierto(mesa)
        if bloqueo:
            return bloqueo

        mesa.maintenance()

        return Response(
            {
                'status': 'success',
                'message': f'Mesa {mesa.number} marcada como mantenimiento'
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        """Cambiar estado de mesa"""
        mesa = self.get_object()
        serializer = MesaStatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data['status']
        guest_count = serializer.validated_data.get('guest_count')

        # Salir de 'ocupada' exige que no quede ningún pedido abierto en la mesa
        if new_status != 'ocupada':
            bloqueo = self._bloqueo_por_pedido_abierto(mesa)
            if bloqueo:
                return bloqueo

        mesa.status = new_status

        if new_status == 'ocupada' and guest_count:
            mesa.guest_count = guest_count
            mesa.occupied_since = timezone.now()
        elif new_status in ['disponible', 'limpiando']:
            mesa.guest_count = 0
            mesa.occupied_since = None
            if new_status == 'disponible':
                mesa.current_order = None

        mesa.save()

        return Response(
            {
                'status': 'success',
                'message': f'Estado actualizado a {mesa.get_status_display()}',
                'mesa': MesaDetailSerializer(mesa).data
            },
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'])
    def available(self, request):
        """Obtener mesas disponibles"""
        queryset = self.get_queryset().filter(status='disponible', is_active=True)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = MesaListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = MesaListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def occupied(self, request):
        """Obtener mesas ocupadas"""
        queryset = self.get_queryset().filter(status='ocupada')

        serializer = MesaListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Estadísticas de mesas"""
        queryset = self.get_queryset()

        total_mesas = queryset.count()
        available = queryset.filter(status='disponible').count()
        occupied = queryset.filter(status='ocupada').count()
        reserved = queryset.filter(status='reservada').count()
        cleaning = queryset.filter(status='limpiando').count()

        # Capacidad total = suma de asientos de todas las mesas (no el número de mesas)
        total_capacity = queryset.aggregate(total=Sum('capacity'))['total'] or 0

        # Ocupación promedio: % de mesas ocupadas sobre el total de mesas
        average_occupancy = (occupied / total_mesas) * 100 if total_mesas > 0 else 0

        stats_data = {
            'total_mesas': total_mesas,
            'available_mesas': available,
            'occupied_mesas': occupied,
            'reserved_mesas': reserved,
            'cleaning_mesas': cleaning,
            'average_occupancy': round(average_occupancy, 2),
            'total_capacity': total_capacity,
        }

        serializer = MesaStatsSerializer(stats_data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_qr(self, request):
        """Obtener mesa por código QR"""
        qr_code = request.query_params.get('qr_code')

        if not qr_code:
            return Response(
                {'error': 'qr_code requerido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            mesa = self.get_queryset().get(qr_code=qr_code)
            serializer = MesaDetailSerializer(mesa)
            return Response(serializer.data)
        except Mesa.DoesNotExist:
            return Response(
                {'error': 'Mesa no encontrada'},
                status=status.HTTP_404_NOT_FOUND
            )


class ReservaViewSet(viewsets.ModelViewSet):
    """CRUD de Reservas"""
    queryset = Reserva.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    search_fields = ['customer_name', 'customer_phone', 'customer_email']
    ordering_fields = ['reservation_date', 'reservation_time', 'status']
    # 'id' desempata reservas a la misma fecha y hora (paginación estable)
    ordering = ['reservation_date', 'reservation_time', 'id']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ReservaDetailSerializer
        elif self.action == 'create':
            return ReservaCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return ReservaUpdateSerializer
        return ReservaListSerializer

    def get_permissions(self):
        if self.action in ['create']:
            return [IsAuthenticated()]
        elif self.action in ['confirm', 'cancel']:
            # Personal del local, distribuidor_admin o super_admin. get_queryset ya limita
            # a las reservas de su local / tenant; fuera de él get_object() da 404.
            return [IsAuthenticated(), IsPersonalReservas()]
        return [IsAuthenticated(), IsTenantMember()]

    def get_queryset(self):
        """Filtrar reservas por cafetería del usuario"""
        user = self.request.user

        if user.role == 'super_admin':
            queryset = Reserva.objects.all()
        elif user.role == 'distribuidor_admin':
            queryset = Reserva.objects.filter(mesa__tenant=user.tenant)
        elif user.cafeteria:
            queryset = Reserva.objects.filter(mesa__cafeteria=user.cafeteria)
        # Clientes solo ven sus propias reservas
        elif user.role == 'usuario':
            queryset = Reserva.objects.filter(customer_email=user.email)
        else:
            return Reserva.objects.none()

        # mesa_number y cafeteria_name sin N+1
        return queryset.select_related('mesa__cafeteria')

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirmar reserva"""
        reserva = self.get_object()

        if reserva.status != 'pendiente':
            return Response(
                {'error': 'Solo reservas pendientes pueden confirmarse'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reserva.confirm()

        return Response(
            {
                'status': 'success',
                'message': 'Reserva confirmada',
                'reserva': ReservaDetailSerializer(reserva).data
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancelar reserva"""
        reserva = self.get_object()

        if reserva.status == 'completada':
            return Response(
                {'error': 'No se puede cancelar una reserva completada'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reserva.cancel()

        return Response(
            {
                'status': 'success',
                'message': 'Reserva cancelada'
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Completar reserva"""
        reserva = self.get_object()

        if reserva.status != 'confirmada':
            return Response(
                {'error': 'Solo reservas confirmadas pueden completarse'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reserva.complete()

        return Response(
            {
                'status': 'success',
                'message': 'Reserva completada'
            },
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        """Obtener reservas próximas (30 min)"""
        from datetime import timedelta

        now = timezone.now()
        thirty_min_later = now + timedelta(minutes=30)

        queryset = self.get_queryset().filter(
            status__in=['pendiente', 'confirmada'],
            reservation_date=now.date(),
            reservation_time__lte=thirty_min_later.time(),
            reservation_time__gte=now.time()
        )

        serializer = ReservaListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def today(self, request):
        """Obtener reservas de hoy"""
        today = timezone.now().date()
        queryset = self.get_queryset().filter(
            reservation_date=today,
            status__in=['pendiente', 'confirmada']
        )

        serializer = ReservaListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_date(self, request):
        """Obtener reservas por fecha"""
        date_str = request.query_params.get('date')

        if not date_str:
            return Response(
                {'error': 'date requerido (YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from datetime import datetime
            reservation_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Formato de fecha inválido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = self.get_queryset().filter(
            reservation_date=reservation_date,
            status__in=['pendiente', 'confirmada']
        )

        serializer = ReservaListSerializer(queryset, many=True)
        return Response(serializer.data)
