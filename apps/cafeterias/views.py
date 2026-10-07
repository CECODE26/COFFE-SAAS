from collections.abc import Mapping
from decimal import Decimal

from django.db import transaction
from django.db.models import Count
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Cafeteria
from .planes import IVA_PORCENTAJE, NOTA_IVA, PLANES, con_iva, info_plan
from .serializers import (
    CafeteriaListSerializer, CafeteriaDetailSerializer,
    CafeteriaCreateSerializer, CafeteriaUpdateSerializer, CafeteriaStatsSerializer,
    puede_cambiar_plan,
)
from apps.accounts.permissions import (
    IsDistribuidorAdmin, IsCafeAdmin, CanCreateCafeteria, IsTenantMember
)
from apps.auditoria.services import registrar

PLAN_SOLO_LECTURA = (
    'Solo el super administrador o el distribuidor de esta cafetería pueden cambiar su plan.'
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
        elif self.action == 'resumen_planes':
            return [IsAuthenticated(), IsDistribuidorAdmin()]
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

    def update(self, request, *args, **kwargs):
        # El plan lo ven todos, pero solo lo cambian el super admin y el distribuidor dueño. Al admin de la
        # cafetería se le responde 403 si pide OTRO plan; el mismo que ya tiene no cambia nada y se acepta.
        if not puede_cambiar_plan(request.user) and isinstance(request.data, Mapping) and 'plan' in request.data:
            if request.data.get('plan') != self.get_object().plan:
                raise PermissionDenied(PLAN_SOLO_LECTURA)
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        with transaction.atomic():
            # Plan anterior leído con la fila bloqueada: dos cambios a la vez quedan auditados en orden
            antes = (
                Cafeteria.objects.select_for_update()
                .values_list('plan', flat=True)
                .get(pk=serializer.instance.pk)
            )
            cafeteria = serializer.save()
            if cafeteria.plan != antes:
                registrar(
                    self.request.user, 'cafeteria.cambiar_plan', cafeteria,
                    nombre=cafeteria.name, antes=antes, despues=cafeteria.plan,
                    antes_nombre=info_plan(antes)['nombre'], despues_nombre=info_plan(cafeteria.plan)['nombre'],
                )

    @action(detail=False, methods=['get'])
    def resumen_planes(self, request):
        """
        Cafeterías activas por plan e ingreso mensual estimado (suma de los precios, SIN IVA), para la consola
        del super admin (toda la plataforma) y el panel del distribuidor (su red). Activa = local abierto de un
        distribuidor activo: un distribuidor inactivo o suspendido no opera (su personal no entra) y no factura.
        Una sola consulta agrupada, sin importar cuántas cafeterías haya.
        """
        conteo = dict(
            self.get_queryset()
            .filter(is_active=True, tenant__is_active=True)
            .order_by()
            .values_list('plan')
            .annotate(n=Count('id'))
        )
        planes = []
        for codigo, datos in PLANES.items():
            cafeterias = conteo.get(codigo, 0)
            planes.append({
                **info_plan(codigo),
                'cafeterias_activas': cafeterias,
                'ingreso_mensual': str(datos['precio_mensual'] * cafeterias),
            })
        ingreso = sum((Decimal(p['ingreso_mensual']) for p in planes), Decimal('0.00'))
        return Response({
            'planes': planes,
            'cafeterias_activas': sum(p['cafeterias_activas'] for p in planes),
            'ingreso_mensual': str(ingreso),
            'ingreso_mensual_con_iva': str(con_iva(ingreso)),
            'iva_porcentaje': IVA_PORCENTAJE,
            'nota': NOTA_IVA,
        })

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

        # Mesas reales del local (no hay tope de mesas)
        mesas = cafeteria.mesas.filter(is_active=True)
        stats_data = {
            'total_users': cafeteria.get_active_users_count(),
            'active_users': cafeteria.get_active_users_count(),
            'total_tables': mesas.count(),
            'occupied_tables': mesas.filter(status='ocupada').count(),
            'available_tables': mesas.filter(status='disponible').count(),
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
