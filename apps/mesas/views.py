from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Q, Count

from .models import Mesa, Reserva
from .serializers import (
    MesaListSerializer, MesaDetailSerializer, MesaCreateUpdateSerializer,
    MesaStatusChangeSerializer, MesaStatsSerializer,
    ReservaListSerializer, ReservaDetailSerializer, ReservaCreateSerializer,
    ReservaUpdateSerializer
)
from apps.accounts.permissions import IsTenantMember, IsCafeUser, IsDistribuidorAdmin


class MesaViewSet(viewsets.ModelViewSet):
    """CRUD de Mesas"""
    queryset = Mesa.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    search_fields = ['number', 'description', 'location']
    ordering_fields = ['number', 'status', 'capacity']
    ordering = ['number']

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
            return Mesa.objects.all()

        if user.role == 'distribuidor_admin':
            return Mesa.objects.filter(tenant=user.tenant)

        if user.cafeteria:
            return Mesa.objects.filter(cafeteria=user.cafeteria)

        return Mesa.objects.none()

    def perform_create(self, serializer):
        """Crear mesa"""
        serializer.save()

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

        # Ocupación promedio
        occupied_capacity = queryset.filter(status='ocupada').aggregate(
            count=Count('id')
        )['count'] or 0
        total_capacity = queryset.aggregate(
            total=Count('id')
        )['total'] or 1

        average_occupancy = (occupied_capacity / total_capacity) * 100 if total_capacity > 0 else 0

        stats_data = {
            'total_mesas': total_mesas,
            'available_mesas': available,
            'occupied_mesas': occupied,
            'reserved_mesas': reserved,
            'cleaning_mesas': cleaning,
            'average_occupancy': round(average_occupancy, 2),
            'total_capacity': queryset.aggregate(cap=Count('capacity'))['cap'] or 0,
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
    ordering = ['reservation_date', 'reservation_time']

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
            return [IsAuthenticated(), IsDistribuidorAdmin()]
        return [IsAuthenticated(), IsTenantMember()]

    def get_queryset(self):
        """Filtrar reservas por cafetería del usuario"""
        user = self.request.user

        if user.role == 'super_admin':
            return Reserva.objects.all()

        if user.role == 'distribuidor_admin':
            return Reserva.objects.filter(mesa__tenant=user.tenant)

        if user.cafeteria:
            return Reserva.objects.filter(mesa__cafeteria=user.cafeteria)

        # Clientes solo ven sus propias reservas
        if user.role == 'usuario':
            return Reserva.objects.filter(customer_email=user.email)

        return Reserva.objects.none()

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
