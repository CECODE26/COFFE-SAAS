from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Tenant
from .serializers import (
    TenantListSerializer, TenantDetailSerializer,
    TenantCreateSerializer, TenantUpdateSerializer, TenantStatsSerializer
)
from apps.accounts.permissions import IsSuperAdmin, IsDistribuidorAdmin, IsTenantOwner


class TenantViewSet(viewsets.ModelViewSet):
    """CRUD de Distribuidores (Tenants)"""
    queryset = Tenant.objects.all()
    permission_classes = [IsAuthenticated]
    search_fields = ['name', 'email', 'ruc', 'business_name']
    ordering_fields = ['created_at', 'name', 'plan', 'status']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return TenantCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return TenantUpdateSerializer
        elif self.action == 'retrieve':
            return TenantDetailSerializer
        return TenantListSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [IsAuthenticated(), IsSuperAdmin()]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsSuperAdmin()]
        elif self.action in ['retrieve', 'stats', 'list']:
            return [IsAuthenticated()]
        return [IsAuthenticated()]

    def get_queryset(self):
        """Filtrar tenants según el usuario"""
        user = self.request.user

        if user.role == 'super_admin':
            return Tenant.objects.all()

        if user.role == 'distribuidor_admin':
            return Tenant.objects.filter(id=user.tenant_id)

        # Otros usuarios no pueden listar tenants
        return Tenant.objects.none()

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Obtener estadísticas del tenant"""
        tenant = self.get_object()

        # Verificar permisos
        if request.user.role == 'distribuidor_admin' and request.user.tenant_id != tenant.id:
            return Response(
                {'error': 'No tienes permisos para ver este tenant'},
                status=status.HTTP_403_FORBIDDEN
            )

        stats_data = {
            'total_cafes': tenant.cafeterias.count(),
            'active_cafes': tenant.get_active_cafes_count(),
            'total_users': tenant.users.count(),
            'active_users': tenant.get_active_users_count(),
            'plan': tenant.plan,
            'subscription_expires_at': tenant.subscription_expires_at,
            'can_create_cafe': tenant.can_create_cafe(),
            'can_create_user': tenant.can_create_user(),
        }

        serializer = TenantStatsSerializer(stats_data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_tenant(self, request):
        """Obtener el tenant actual del usuario"""
        if not request.user.tenant:
            return Response(
                {'error': 'No tienes un tenant asignado'},
                status=status.HTTP_400_BAD_REQUEST
            )

        tenant = request.user.tenant
        serializer = TenantDetailSerializer(tenant)
        return Response(serializer.data)

    @action(
        detail=True, methods=['post'],
        permission_classes=[IsAuthenticated, IsSuperAdmin]
    )
    def activate(self, request, pk=None):
        """Activar un tenant"""
        tenant = self.get_object()
        tenant.is_active = True
        tenant.status = 'active'
        tenant.save()
        return Response(
            {'status': 'success', 'message': 'Tenant activado'},
            status=status.HTTP_200_OK
        )

    @action(
        detail=True, methods=['post'],
        permission_classes=[IsAuthenticated, IsSuperAdmin]
    )
    def deactivate(self, request, pk=None):
        """Desactivar un tenant"""
        tenant = self.get_object()
        tenant.is_active = False
        tenant.status = 'inactive'
        tenant.save()
        return Response(
            {'status': 'success', 'message': 'Tenant desactivado'},
            status=status.HTTP_200_OK
        )

    @action(
        detail=True, methods=['post'],
        permission_classes=[IsAuthenticated, IsSuperAdmin]
    )
    def upgrade_plan(self, request, pk=None):
        """Mejorar plan del tenant"""
        tenant = self.get_object()
        plan = request.data.get('plan')

        valid_plans = ['free', 'basic', 'pro', 'enterprise']
        if plan not in valid_plans:
            return Response(
                {'error': 'Plan inválido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Asignar límites según plan
        plan_limits = {
            'free': {'cafes': 1, 'users': 10},
            'basic': {'cafes': 5, 'users': 50},
            'pro': {'cafes': 20, 'users': 500},
            'enterprise': {'cafes': 999, 'users': 9999},
        }

        limits = plan_limits.get(plan)
        tenant.plan = plan
        tenant.max_cafes = limits['cafes']
        tenant.max_users = limits['users']
        tenant.save()

        return Response(
            {
                'status': 'success',
                'message': f'Plan actualizado a {plan}',
                'data': TenantDetailSerializer(tenant).data
            },
            status=status.HTTP_200_OK
        )
