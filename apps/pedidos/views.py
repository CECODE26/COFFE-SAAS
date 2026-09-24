from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Q, Sum, Count

from .models import Order, OrderItem
from .serializers import (
    OrderListSerializer, OrderDetailSerializer, OrderCreateSerializer,
    OrderUpdateSerializer, OrderStateChangeSerializer, OrderPaymentSerializer,
    OrderItemDetailSerializer, OrderStatsSerializer
)
from apps.accounts.permissions import IsTenantMember, IsCafeUser


class OrderViewSet(viewsets.ModelViewSet):
    """CRUD de Pedidos"""
    queryset = Order.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    search_fields = ['order_number', 'customer_name', 'customer_phone']
    ordering_fields = ['created_at', 'total', 'status']
    ordering = ['-created_at']

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
            return Order.objects.all()

        if user.role == 'distribuidor_admin':
            return Order.objects.filter(tenant=user.tenant)

        if user.cafeteria:
            return Order.objects.filter(cafeteria=user.cafeteria)

        return Order.objects.none()

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

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirmar pedido"""
        order = self.get_object()

        if order.status != 'pendiente':
            return Response(
                {'error': 'Solo se pueden confirmar pedidos pendientes'},
                status=status.HTTP_400_BAD_REQUEST
            )

        order.confirm()
        return Response(
            {'status': 'success', 'message': 'Pedido confirmado'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def send_to_kitchen(self, request, pk=None):
        """Enviar pedido a cocina"""
        order = self.get_object()

        if order.status not in ['pendiente', 'confirmada']:
            return Response(
                {'error': 'Pedido no puede ser enviado a cocina'},
                status=status.HTTP_400_BAD_REQUEST
            )

        order.status = 'preparando'
        # Marcar todos los items como preparando
        for item in order.items.all():
            item.status = 'preparando'
            item.save()
        order.save()

        return Response(
            {'status': 'success', 'message': 'Pedido enviado a cocina'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def mark_ready(self, request, pk=None):
        """Marcar pedido como listo"""
        order = self.get_object()

        if order.status != 'preparando':
            return Response(
                {'error': 'Pedido no está siendo preparado'},
                status=status.HTTP_400_BAD_REQUEST
            )

        order.status = 'lista'
        # Marcar todos los items como listos
        for item in order.items.all():
            item.status = 'lista'
            item.save()
        order.save()

        return Response(
            {'status': 'success', 'message': 'Pedido listo para servir'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Completar/Entregar pedido"""
        order = self.get_object()

        if order.status not in ['lista', 'preparando']:
            return Response(
                {'error': 'Pedido no puede ser completado'},
                status=status.HTTP_400_BAD_REQUEST
            )

        order.complete()
        return Response(
            {'status': 'success', 'message': 'Pedido entregado'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancelar pedido"""
        order = self.get_object()

        if order.status in ['entregada', 'cancelada']:
            return Response(
                {'error': 'No se puede cancelar un pedido completado'},
                status=status.HTTP_400_BAD_REQUEST
            )

        order.cancel()
        return Response(
            {'status': 'success', 'message': 'Pedido cancelado'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        """Marcar pedido como pagado"""
        order = self.get_object()
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
        """Aplicar descuento al pedido"""
        order = self.get_object()
        discount = request.data.get('discount')

        if not discount or float(discount) < 0:
            return Response(
                {'error': 'Descuento inválido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        order.discount = discount
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
            'average_order_value': queryset.aggregate(avg=Sum('total'))['avg'] or 0,
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
        today = timezone.now().date()
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

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancelar item"""
        item = self.get_object()

        if item.status in ['entregada', 'cancelada']:
            return Response(
                {'error': 'Item no puede ser cancelado'},
                status=status.HTTP_400_BAD_REQUEST
            )

        item.status = 'cancelada'
        item.save()
        item.order.calculate_total()

        return Response(
            {'status': 'success', 'message': 'Item cancelado'},
            status=status.HTTP_200_OK
        )
