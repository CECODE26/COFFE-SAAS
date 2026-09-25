"""API del personal para las sesiones QR de las mesas (/api/v1/comensales/). Auth JWT.

Mismo alcance que apps/mesas (MesaViewSet.get_queryset): super_admin todo, distribuidor_admin su tenant,
el resto su cafetería; solo locales abiertos. Fuera del alcance → 404.
"""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsTenantMember
from apps.cafeterias.models import Cafeteria
from apps.mesas.models import Mesa

from . import services
from .errores import ErrorComensal
from .models import AlertaMesero, SesionCliente, SolicitudPago
from .permissions import EsPersonalDelLocal
from .serializers import CobrarSerializer, alerta_personal, detalle_mesa_personal, dinero, fecha


def mesas_del_usuario(user):
    """Mesas que el usuario puede atender (igual que MesaViewSet.get_queryset)"""
    if user.role == 'super_admin':
        queryset = Mesa.objects.all()
    elif user.role == 'distribuidor_admin':
        queryset = Mesa.objects.filter(tenant=user.tenant)
    elif user.cafeteria_id:
        queryset = Mesa.objects.filter(cafeteria_id=user.cafeteria_id)
    else:
        return Mesa.objects.none()
    return queryset.filter(cafeteria__is_active=True)


def cafeterias_del_usuario(user):
    if user.role == 'super_admin':
        queryset = Cafeteria.objects.all()
    elif user.role == 'distribuidor_admin':
        queryset = Cafeteria.objects.filter(tenant=user.tenant)
    elif user.cafeteria_id:
        queryset = Cafeteria.objects.filter(pk=user.cafeteria_id)
    else:
        return Cafeteria.objects.none()
    return queryset.filter(is_active=True)


class VistaPersonal(APIView):
    """Base: IsAuthenticated + IsTenantMember + personal del local; errores de negocio como {'error': ...}"""
    permission_classes = [IsAuthenticated, IsTenantMember, EsPersonalDelLocal]

    def handle_exception(self, exc):
        if isinstance(exc, ErrorComensal):
            response = Response(exc.datos_personal(), status=exc.status_code, headers=exc.headers)
            response.exception = True
            return response
        return super().handle_exception(exc)

    def mesas(self):
        return mesas_del_usuario(self.request.user)

    def get_mesa(self, mesa_id):
        return get_object_or_404(self.mesas().select_related('cafeteria', 'tenant'), pk=mesa_id)


class MesaDetalleView(VistaPersonal):
    """GET mesas/<mesa_id>/: grupos, cuentas pedidas, solicitudes de unión y alertas de la mesa"""

    def get(self, request, mesa_id):
        services.limpiar_sesiones_inactivas()
        mesa = self.get_mesa(mesa_id)
        return Response(detalle_mesa_personal(mesa))


class MesaCobrarView(VistaPersonal):
    """POST mesas/<mesa_id>/cobrar/ {metodo_pago, solicitud?, sesiones?}"""

    def post(self, request, mesa_id):
        mesa = self.get_mesa(mesa_id)
        serializer = CobrarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data
        solicitud = None
        if datos.get('solicitud'):
            solicitud = SolicitudPago.objects.filter(pk=datos['solicitud'], mesa=mesa).first()
            if solicitud is None:
                raise ErrorComensal('Esa solicitud de cuenta no es de esta mesa.')
        resultado = services.cobrar(
            mesa, request.user, datos['metodo_pago'], solicitud=solicitud, sesiones=datos.get('sesiones') or None
        )
        return Response(resultado)


class MesaCerrarView(VistaPersonal):
    """POST mesas/<mesa_id>/cerrar/: cierre manual (sin consumo por cobrar)"""

    def post(self, request, mesa_id):
        mesa = self.get_mesa(mesa_id)
        resultado = services.cerrar_mesa(mesa, request.user)
        return Response(resultado)


class SesionCodigoView(VistaPersonal):
    """POST sesiones/<sesion_id>/codigo/: código de reconexión (4 dígitos, 5 min, 5 intentos)"""

    def post(self, request, sesion_id):
        sesion = get_object_or_404(SesionCliente.objects.filter(mesa__in=self.mesas()), pk=sesion_id)
        sesion = services.generar_codigo_reconexion(sesion, request.user)
        return Response({
            'codigo': sesion.codigo_reconexion,
            'expira_at': fecha(sesion.codigo_expira_at),
            'alias': sesion.alias,
        })


class AlertasView(VistaPersonal):
    """GET alertas/?atendida=false: alertas del alcance del usuario (las no atendidas por defecto)"""

    def get(self, request):
        services.limpiar_sesiones_inactivas()
        atendida = (request.query_params.get('atendida') or 'false').lower() in ('true', '1', 'si', 'sí')
        alertas = (
            AlertaMesero.objects.filter(mesa__in=self.mesas(), atendida=atendida)
            .select_related('mesa', 'sesion')
        )
        if atendida:
            # Historial corto: las 50 atendidas más recientes
            alertas = list(alertas.order_by('-atendida_at', '-created_at')[:50])
        else:
            alertas = alertas.order_by('created_at')
        return Response([alerta_personal(a, con_mesa=True) for a in alertas])


class AlertaAtenderView(VistaPersonal):
    """POST alertas/<alerta_id>/atender/"""

    def post(self, request, alerta_id):
        alerta = get_object_or_404(
            AlertaMesero.objects.filter(mesa__in=self.mesas()).select_related('mesa', 'sesion'), pk=alerta_id
        )
        if not alerta.atendida:
            alerta.atendida = True
            alerta.atendida_por = request.user
            alerta.atendida_at = timezone.now()
            alerta.save(update_fields=['atendida', 'atendida_por', 'atendida_at'])
        datos = alerta_personal(alerta, con_mesa=True)
        datos['atendida'] = True
        datos['atendida_at'] = fecha(alerta.atendida_at)
        return Response(datos, status=status.HTTP_200_OK)


class ResumenView(VistaPersonal):
    """GET resumen/: {mesa_id: {personas, por_cobrar, solicitudes_pendientes, alertas_pendientes}} (solo mesas con algo)"""

    def get(self, request):
        services.limpiar_sesiones_inactivas()
        resumen = services.resumen_mesas(cafeterias_del_usuario(request.user))
        datos = {}
        for mesa_id, fila in resumen.items():
            if not (fila['personas'] or fila['total_pendiente'] or fila['solicitudes_pendientes']
                    or fila['alertas_pendientes']):
                continue
            datos[str(mesa_id)] = {
                'personas': fila['personas'],
                'por_cobrar': dinero(fila['total_pendiente']),
                'solicitudes_pendientes': fila['solicitudes_pendientes'],
                'alertas_pendientes': fila['alertas_pendientes'],
            }
        return Response(datos)
