from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Cafeteria
from .serializers import (
    CafeteriaListSerializer, CafeteriaDetailSerializer,
    CafeteriaCreateSerializer, CafeteriaUpdateSerializer, CafeteriaStatsSerializer
)
from apps.accounts.permissions import (
    IsDistribuidorAdmin, IsCafeAdmin, CanCreateCafeteria, IsTenantMember
)


class CafeteriaViewSet(viewsets.ModelViewSet):
    """CRUD de Cafeterías"""
    queryset = Cafeteria.objects.all()
    permission_classes = [IsAuthenticated]
    search_fields = ['name', 'city', 'email', 'phone']
    ordering_fields = ['created_at', 'name', 'city', 'capacity']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return CafeteriaCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return CafeteriaUpdateSerializer
        elif self.action == 'retrieve':
            return CafeteriaDetailSerializer
        return CafeteriaListSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [IsAuthenticated(), IsDistribuidorAdmin(), CanCreateCafeteria()]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsCafeAdmin()]
        else:
            return [IsAuthenticated(), IsTenantMember()]

    def get_queryset(self):
        """Filtrar cafeterías por tenant del usuario actual"""
        user = self.request.user

        if user.role == 'super_admin':
            return Cafeteria.objects.all()

        if user.role == 'distribuidor_admin':
            return Cafeteria.objects.filter(tenant=user.tenant)

        # Otros roles solo ven su cafetería asignada
        if user.cafeteria:
            return Cafeteria.objects.filter(id=user.cafeteria_id)

        return Cafeteria.objects.none()

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Obtener estadísticas de la cafetería"""
        cafeteria = self.get_object()

        # Verificar permisos
        if request.user.role == 'distribuidor_admin':
            if request.user.tenant_id != cafeteria.tenant_id:
                return Response(
                    {'error': 'No tienes permisos para ver esta cafetería'},
                    status=status.HTTP_403_FORBIDDEN
                )

        stats_data = {
            'total_users': cafeteria.get_active_users_count(),
            'active_users': cafeteria.get_active_users_count(),
            'total_tables': cafeteria.max_tables,
            'occupied_tables': 0,  # A implementar con modelo de Mesas
            'available_tables': cafeteria.max_tables,
            'capacity': cafeteria.capacity,
            'open_time': cafeteria.open_time,
            'close_time': cafeteria.close_time,
        }

        serializer = CafeteriaStatsSerializer(stats_data)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def users(self, request, pk=None):
        """Listar usuarios de la cafetería"""
        cafeteria = self.get_object()

        # Verificar permisos
        if request.user.role == 'distribuidor_admin':
            if request.user.tenant_id != cafeteria.tenant_id:
                return Response(
                    {'error': 'No tienes permisos'},
                    status=status.HTTP_403_FORBIDDEN
                )

        users = cafeteria.users.filter(is_active=True)

        from apps.accounts.serializers import UserSerializer
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)

    @action(
        detail=True, methods=['post'],
        permission_classes=[IsAuthenticated, IsDistribuidorAdmin]
    )
    def activate(self, request, pk=None):
        """Activar cafetería"""
        cafeteria = self.get_object()
        cafeteria.is_active = True
        cafeteria.save()
        return Response(
            {'status': 'success', 'message': 'Cafetería activada'},
            status=status.HTTP_200_OK
        )

    @action(
        detail=True, methods=['post'],
        permission_classes=[IsAuthenticated, IsDistribuidorAdmin]
    )
    def deactivate(self, request, pk=None):
        """Desactivar cafetería"""
        cafeteria = self.get_object()
        cafeteria.is_active = False
        cafeteria.save()
        return Response(
            {'status': 'success', 'message': 'Cafetería desactivada'},
            status=status.HTTP_200_OK
        )
