from django.db.models import Count, Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import LIMITES_POR_PLAN, PLANES_DE_PAGO, Tenant
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

    # Acciones que solo hace el super admin. Este método reemplaza los permission_classes
    # de cada @action, así que la lista tiene que incluirlas a todas.
    SOLO_SUPER_ADMIN = ['create', 'update', 'partial_update', 'destroy', 'activate', 'deactivate', 'upgrade_plan']

    def get_permissions(self):
        if self.action in self.SOLO_SUPER_ADMIN:
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        """Filtrar tenants según el usuario"""
        user = self.request.user

        if user.role == 'super_admin':
            queryset = Tenant.objects.all()
        elif user.role == 'distribuidor_admin':
            queryset = Tenant.objects.filter(id=user.tenant_id)
        else:
            # Otros usuarios no pueden listar tenants
            return Tenant.objects.none()

        if self.action == 'list':
            # Cuentas Distribuidor de cada uno en la misma consulta (TenantListSerializer.admins_count)
            queryset = queryset.annotate(
                admins_count=Count('users', filter=Q(users__role='distribuidor_admin'))
            )
        return queryset

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

        if plan == 'free':
            return Response(
                {'error': 'No hay plan gratis: elige Básico, Pro o Empresa.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not isinstance(plan, str) or plan not in PLANES_DE_PAGO:
            return Response(
                {'error': 'Plan inválido: elige Básico, Pro o Empresa.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Asignar límites según plan (los mismos que al crear el distribuidor)
        limites = LIMITES_POR_PLAN[plan]
        tenant.plan = plan
        tenant.max_cafes = limites['max_cafes']
        tenant.max_users = limites['max_users']
        tenant.save()

        # Bajar a un plan con menos cupo del que ya usa se permite, pero se avisa
        nombre_plan = tenant.get_plan_display()
        excesos = []
        cafes, usuarios = tenant.get_active_cafes_count(), tenant.users.count()
        if cafes > tenant.max_cafes:
            excesos.append(f'{cafes} cafeterías activas (el {nombre_plan} permite {tenant.max_cafes})')
        if usuarios > tenant.max_users:
            excesos.append(f'{usuarios} usuarios (el {nombre_plan} permite {tenant.max_users})')
        aviso = (
            f'{tenant.name} tiene {" y ".join(excesos)}: no podrá crear más hasta bajar de ese número.'
            if excesos else None
        )

        return Response(
            {
                'status': 'success',
                'message': f'Plan actualizado a {plan}',
                'aviso': aviso,
                'data': TenantDetailSerializer(tenant).data
            },
            status=status.HTTP_200_OK
        )
