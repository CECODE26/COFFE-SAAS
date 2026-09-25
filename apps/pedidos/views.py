from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db import transaction
from django.db.models import Q, Sum, Count, Avg
from django.db.models.functions import Coalesce

from .models import Order, OrderItem
from .serializers import (
    OrderListSerializer, OrderDetailSerializer, OrderCreateSerializer,
    OrderUpdateSerializer, OrderStateChangeSerializer, OrderPaymentSerializer,
    OrderItemDetailSerializer, OrderStatsSerializer, OrderTableroSerializer
)
from apps.accounts.permissions import IsTenantMember, IsCafeUser

# Estados en curso (columnas CAJA y COCINA del tablero)
ESTADOS_ACTIVOS = ['pendiente', 'confirmada', 'preparando', 'lista']
# Entregados de hoy que se muestran en la columna ENTREGADO
MAX_ENTREGADOS_TABLERO = 30

# "El pedido PED-... está <texto>" en los mensajes de error
ESTADO_TEXTO = {
    'pendiente': 'pendiente',
    'confirmada': 'confirmado',
    'preparando': 'en preparación',
    'lista': 'listo',
    'entregada': 'entregado',
    'cancelada': 'cancelado',
}


def pedido_qr_cobrado(order, que_no):
    """
    400 si el pedido se hizo por QR y ya se cobró en la cuenta de la mesa (None si no): cancelarlo o
    tocar sus ítems dejaría un pedido pagado y cancelado y un ticket que no cuadra con lo cobrado.
    """
    if not (order.is_paid and order.sesion_cliente_id):
        return None
    return Response(
        {'error': f'El pedido {order.order_number} ya se cobró en la cuenta de la mesa: {que_no}.'},
        status=status.HTTP_400_BAD_REQUEST
    )


class OrderViewSet(viewsets.ModelViewSet):
    """CRUD de Pedidos"""
    queryset = Order.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    search_fields = ['order_number', 'customer_name', 'customer_phone']
    ordering_fields = ['created_at', 'total', 'status']
    # '-id' desempata pedidos con el mismo created_at para que la paginación no repita ni omita
    ordering = ['-created_at', '-id']

    def get_serializer_class(self):
        if self.action == 'create':
            return OrderCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return OrderUpdateSerializer
        elif self.action == 'retrieve':
            return OrderDetailSerializer
        return OrderListSerializer

    def get_queryset(self):
        """Filtrar pedidos por cafetería del usuario"""
        user = self.request.user

        if user.role == 'super_admin':
            queryset = Order.objects.all()
        elif user.role == 'distribuidor_admin':
            queryset = Order.objects.filter(tenant=user.tenant)
        elif user.cafeteria:
            queryset = Order.objects.filter(cafeteria=user.cafeteria)
        else:
            return Order.objects.none()

        # Evitar N+1: mesa/cafetería (customer_info, mesa_numero, cafeteria_name), comensal QR
        # (comensal_alias) e items con su producto
        return queryset.select_related('mesa', 'cafeteria', 'sesion_cliente').prefetch_related(
            'items__menu_item'
        )

    def get_permissions(self):
        if self.action == 'create':
            return [IsAuthenticated(), IsCafeUser()]
        return [IsAuthenticated(), IsTenantMember()]

    def perform_create(self, serializer):
        """Crear pedido"""
        if not self.request.user.cafeteria:
            return Response(
                {'error': 'No tienes una cafetería asignada'},
                status=status.HTTP_400_BAD_REQUEST
            )
        serializer.save()

    # Flujo del tablero: pendiente (CAJA) --confirm--> confirmada (COCINA "En cola")
    # --send_to_kitchen--> preparando --mark_ready--> lista --complete--> entregada (ENTREGADO).
    # complete también vale desde preparando; cancel desde pendiente, confirmada o preparando.

    def _pedido_bloqueado(self):
        """
        get_object() (alcance y permisos) y luego la fila con SELECT FOR UPDATE (llamar dentro de
        transaction.atomic): si caja y cocina pulsan a la vez, el segundo ve el estado ya cambiado.
        """
        order = self.get_object()
        return Order.objects.select_for_update().get(pk=order.pk)

    def update(self, request, *args, **kwargs):
        """PUT/PATCH con la fila bloqueada: un cobro simultáneo (is_paid) no se pisa con un save() viejo"""
        partial = kwargs.pop('partial', False)
        with transaction.atomic():
            instance = self._pedido_bloqueado()
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
        return Response(serializer.data)

    def _transicion_no_aplica(self, order, regla):
        """400 claro cuando la acción no corresponde al estado actual del pedido"""
        return Response(
            {
                'error': (
                    f'El pedido {order.order_number} está '
                    f'{ESTADO_TEXTO.get(order.status, order.status)}: {regla}'
                )
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirmar pedido (en el tablero: "Enviar a cocina", de CAJA a COCINA)"""
        with transaction.atomic():
            order = self._pedido_bloqueado()

            if order.status != 'pendiente':
                return self._transicion_no_aplica(
                    order, 'solo se envían a cocina (confirman) los pedidos pendientes.'
                )

            order.confirm()

        return Response(
            {'status': 'success', 'message': 'Pedido confirmado'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def send_to_kitchen(self, request, pk=None):
        """Empezar a preparar un pedido confirmado (en el tablero: "En preparación")"""
        with transaction.atomic():
            order = self._pedido_bloqueado()

            if order.status != 'confirmada':
                return self._transicion_no_aplica(
                    order, 'solo pasa a preparación un pedido confirmado (en cola de cocina).'
                )

            order.status = 'preparando'
            # Marcar los items como preparando (los cancelados siguen cancelados)
            for item in order.items.exclude(status='cancelada'):
                item.status = 'preparando'
                item.save()
            order.save()

        return Response(
            {'status': 'success', 'message': 'Pedido enviado a cocina'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def mark_ready(self, request, pk=None):
        """Marcar pedido como listo (en el tablero: "Preparado")"""
        with transaction.atomic():
            order = self._pedido_bloqueado()

            if order.status != 'preparando':
                return self._transicion_no_aplica(
                    order, 'solo se marca como listo un pedido en preparación.'
                )

            order.status = 'lista'
            # Marcar los items como listos (los cancelados siguen cancelados)
            for item in order.items.exclude(status='cancelada'):
                item.status = 'lista'
                item.save()
            order.save()

        return Response(
            {'status': 'success', 'message': 'Pedido listo para servir'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Completar/Entregar pedido (en el tablero: "Entregado")"""
        with transaction.atomic():
            order = self._pedido_bloqueado()

            if order.status not in ['lista', 'preparando']:
                return self._transicion_no_aplica(
                    order, 'solo se entrega un pedido listo o en preparación.'
                )

            order.complete()

        return Response(
            {'status': 'success', 'message': 'Pedido entregado'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancelar pedido (pendiente, confirmado o en preparación)"""
        with transaction.atomic():
            order = self._pedido_bloqueado()

            if order.status not in ['pendiente', 'confirmada', 'preparando']:
                return self._transicion_no_aplica(
                    order, 'solo se cancela un pedido pendiente, confirmado o en preparación.'
                )

            bloqueo = pedido_qr_cobrado(order, 'no se puede cancelar')
            if bloqueo:
                return bloqueo

            order.cancel()

        return Response(
            {'status': 'success', 'message': 'Pedido cancelado'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        """Marcar pedido como pagado (los pedidos por QR se cobran desde la cuenta de la mesa)"""
        order = self.get_object()

        if order.sesion_cliente_id:
            return Response(
                {'error': 'Este pedido se hizo por QR: cóbralo desde la cuenta de la mesa (Mesas → detalle).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = OrderPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payment_method = serializer.validated_data['payment_method']
        order.mark_as_paid(payment_method)

        return Response(
            {'status': 'success', 'message': 'Pedido marcado como pagado'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def apply_discount(self, request, pk=None):
        """Aplicar descuento al pedido (no a uno ya cobrado)"""
        discount = request.data.get('discount')
        try:
            valor = Decimal(str(discount))
            invalido = not discount or not valor.is_finite() or valor < 0 or valor >= Decimal('1e10')
        except (InvalidOperation, ValueError):
            invalido = True
        if invalido:
            return Response(
                {'error': 'Descuento inválido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            order = self._pedido_bloqueado()
            if order.is_paid:
                return Response(
                    {'error': f'El pedido {order.order_number} ya fue cobrado: no se puede cambiar el descuento.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            order.discount = valor
            order.calculate_total()

        return Response(
            {
                'status': 'success',
                'message': 'Descuento aplicado',
                'total': str(order.total)
            },
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Obtener pedidos pendientes/activos"""
        queryset = self.get_queryset().filter(
            status__in=['pendiente', 'confirmada', 'preparando', 'lista']
        )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = OrderListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = OrderListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def tablero(self, request):
        """
        Tablero CAJA / COCINA / ENTREGADO: todos los pedidos en curso (pendiente, confirmada,
        preparando, lista) y los 30 entregados más recientes de hoy. Sin paginar y del más
        antiguo al más nuevo (created_at ascendente). Mismo alcance que el listado.
        """
        queryset = self.get_queryset()

        # "De hoy" según la hora de entrega (updated_at si un pedido antiguo no la tiene)
        entregados_hoy = list(
            queryset.filter(status='entregada')
            .annotate(entregado_en=Coalesce('completed_at', 'updated_at'))
            .filter(entregado_en__date=timezone.localdate())
            .order_by('-entregado_en', '-id')
            .values_list('pk', flat=True)[:MAX_ENTREGADOS_TABLERO]
        )

        queryset = queryset.filter(
            Q(status__in=ESTADOS_ACTIVOS) | Q(pk__in=entregados_hoy)
        ).order_by('created_at', 'id')

        serializer = OrderTableroSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Estadísticas de pedidos"""
        queryset = self.get_queryset()

        # Filtros por rango de fecha
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if start_date:
            queryset = queryset.filter(created_at__gte=start_date)
        if end_date:
            queryset = queryset.filter(created_at__lte=end_date)

        stats_data = {
            'total_orders': queryset.count(),
            'pending_orders': queryset.filter(status__in=['pendiente', 'confirmada', 'preparando', 'lista']).count(),
            'completed_orders': queryset.filter(status='entregada').count(),
            'total_revenue': queryset.filter(is_paid=True).aggregate(Sum('total'))['total__sum'] or 0,
            # Ticket promedio: media de total de los pedidos no cancelados (antes sumaba)
            'average_order_value': queryset.exclude(status='cancelada').aggregate(avg=Avg('total'))['avg'] or 0,
            'cash_collected': queryset.filter(
                is_paid=True,
                payment_method='efectivo'
            ).aggregate(Sum('total'))['total__sum'] or 0,
        }

        serializer = OrderStatsSerializer(stats_data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def today(self, request):
        """Pedidos de hoy"""
        # Fecha local (America/Guayaquil): con la fecha UTC, desde las 19:00 "hoy" ya era mañana
        today = timezone.localdate()
        queryset = self.get_queryset().filter(created_at__date=today)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = OrderListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = OrderListSerializer(queryset, many=True)
        return Response(serializer.data)


class OrderItemViewSet(viewsets.ModelViewSet):
    """CRUD de Items de Pedido"""
    queryset = OrderItem.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    serializer_class = OrderItemDetailSerializer

    def get_queryset(self):
        """Filtrar items por pedidos de la cafetería del usuario"""
        user = self.request.user

        if user.role == 'super_admin':
            return OrderItem.objects.all()

        if user.role == 'distribuidor_admin':
            return OrderItem.objects.filter(order__tenant=user.tenant)

        if user.cafeteria:
            return OrderItem.objects.filter(order__cafeteria=user.cafeteria)

        return OrderItem.objects.none()

    @action(detail=True, methods=['post'])
    def mark_ready(self, request, pk=None):
        """Marcar item como listo"""
        item = self.get_object()

        if item.status != 'preparando':
            return Response(
                {'error': 'Item no está siendo preparado'},
                status=status.HTTP_400_BAD_REQUEST
            )

        item.mark_as_ready()
        return Response(
            {'status': 'success', 'message': 'Item marcado como listo'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def mark_completed(self, request, pk=None):
        """Marcar item como completado"""
        item = self.get_object()

        if item.status != 'lista':
            return Response(
                {'error': 'Item no está listo'},
                status=status.HTTP_400_BAD_REQUEST
            )

        item.mark_as_completed()
        return Response(
            {'status': 'success', 'message': 'Item completado'},
            status=status.HTTP_200_OK
        )

    def _pedido_bloqueado(self, item):
        """Pedido del ítem con SELECT FOR UPDATE (llamar dentro de transaction.atomic)"""
        return Order.objects.select_for_update().get(pk=item.order_id)

    def update(self, request, *args, **kwargs):
        """Editar un ítem: no en un pedido por QR ya cobrado (el ticket dejaría de cuadrar)"""
        with transaction.atomic():
            order = self._pedido_bloqueado(self.get_object())
            bloqueo = pedido_qr_cobrado(order, 'no se pueden cambiar sus productos')
            if bloqueo:
                return bloqueo
            return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Borrar un ítem: no en un pedido por QR ya cobrado"""
        with transaction.atomic():
            order = self._pedido_bloqueado(self.get_object())
            bloqueo = pedido_qr_cobrado(order, 'no se pueden quitar sus productos')
            if bloqueo:
                return bloqueo
            return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancelar item (su precio deja de contar en el total del pedido)"""
        item = self.get_object()

        with transaction.atomic():
            order = self._pedido_bloqueado(item)
            item = OrderItem.objects.select_for_update().get(pk=item.pk)

            if item.status in ['entregada', 'cancelada']:
                return Response(
                    {'error': 'Item no puede ser cancelado'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            bloqueo = pedido_qr_cobrado(order, 'no se pueden cancelar sus productos')
            if bloqueo:
                return bloqueo

            item.status = 'cancelada'
            item.save()
            order.calculate_total()

        return Response(
            {'status': 'success', 'message': 'Item cancelado'},
            status=status.HTTP_200_OK
        )
