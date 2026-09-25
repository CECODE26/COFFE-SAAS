"""API del cliente que escanea el QR de la mesa (/api/v1/cliente/). Auth por cookie, solo JSON."""
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .authentication import SesionClienteAuthentication
from .cookies import borrar_cookie, leer_token, nombre_cookie, poner_cookie, renovar_cookie
from .errores import ErrorComensal
from .models import SesionCliente
from .permissions import ExigeXHR, SesionPuedeEscribir, TieneSesion
from .serializers import (
    AlertaSerializer, CrearPedidoSerializer, EntrarSerializer, PedirCuentaSerializer, ReconectarSerializer,
    datos_cuenta, datos_menu, datos_mesa, datos_sesion, datos_solicitud, datos_ticket, fecha, pedido_cliente,
    pedidos_de, primer_error,
)


class VistaCliente(APIView):
    """Base de las vistas del comensal.

    - Auth: cookie (SesionClienteAuthentication), sin JWT ni SessionAuthentication.
    - Anti-CSRF: métodos no seguros exigen X-Requested-With: XMLHttpRequest. Solo JSON.
    - Actividad: toda request renueva ultima_actividad y la cookie (sliding), salvo los métodos de
      `metodos_polling` (GET sesion/ y GET pedidos/).
    """
    authentication_classes = [SesionClienteAuthentication]
    permission_classes = [ExigeXHR, TieneSesion, SesionPuedeEscribir]
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]
    metodos_polling = ()
    permite_pagada = False
    _renovar_cookie = False

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        sesion = request.auth
        if isinstance(sesion, SesionCliente) and request.method not in self.metodos_polling:
            services.registrar_actividad(sesion)
            self._renovar_cookie = sesion.estado == 'activa'

    def handle_exception(self, exc):
        if isinstance(exc, ErrorComensal):
            headers = dict(exc.headers)
            if exc.status_code == status.HTTP_401_UNAUTHORIZED:
                headers.setdefault('WWW-Authenticate', 'Cookie realm="comensal"')
            response = Response(exc.datos_cliente(), status=exc.status_code, headers=headers)
            response.exception = True
            if exc.borrar_cookie:
                borrar_cookie(response)
            return response
        return super().handle_exception(exc)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        # Solo la sesión ya resuelta: leer request.auth aquí volvería a autenticar si falló antes (p. ej. un 406)
        sesion = getattr(request, '_auth', None)
        if (
            self._renovar_cookie and isinstance(sesion, SesionCliente) and sesion.estado == 'activa'
            and response.status_code != status.HTTP_401_UNAUTHORIZED
            and nombre_cookie() not in response.cookies
        ):
            renovar_cookie(response, sesion)
        return response

    def validar(self, serializer_class, data):
        """Valida la entrada; si falla → 400 {detail: primer mensaje, errores: {...}}"""
        serializer = serializer_class(data=data)
        if not serializer.is_valid():
            raise ErrorComensal(
                primer_error(serializer.errors) or 'Revisa los datos enviados.',
                codigo='datos_invalidos', errores=serializer.errors,
            )
        return serializer.validated_data


class VistaClientePublica(VistaCliente):
    """Bienvenida, entrar y reconectar: no exigen cookie (la leen si existe)"""
    authentication_classes = []
    permission_classes = [ExigeXHR]


def _respuesta_sesion(sesion, union_pendiente):
    """Respuesta de entrar/reconectar + Set-Cookie"""
    response = Response({
        'sesion': {'id': str(sesion.id), 'alias': sesion.alias, 'estado': sesion.estado},
        'union_pendiente': union_pendiente,
    })
    return poner_cookie(response, sesion)


def _mesa_o_404(qr):
    mesa = services.buscar_mesa(qr)
    if mesa is None:
        raise ErrorComensal(services.MENSAJE_SIN_MESA, status_code=status.HTTP_404_NOT_FOUND, codigo='sin_mesa')
    return mesa


class BienvenidaView(VistaClientePublica):
    """GET bienvenida/?mesa=<qr>: variante de la pantalla, grupos activos y la sesión de este dispositivo"""

    def get(self, request):
        services.limpiar_sesiones_inactivas()
        mesa = services.buscar_mesa(request.query_params.get('mesa'))

        sesion = None
        token = leer_token(request)
        if token:
            sesion = SesionCliente.objects.filter(token_cookie=token).first()
            if sesion is not None:
                sesion = services.revalidar_sesion(sesion)
                # Mismo criterio que la autenticación: la cookie vencida se borra y no cuenta como sesión
                if services.cookie_vencida(sesion):
                    sesion = None

        if mesa is None:
            datos = {
                'variante': 'sin_mesa',
                'mensaje': services.mensaje_bienvenida('sin_mesa'),
                'mesa': None,
                'grupos': [],
                'sesion_actual': None,
            }
        else:
            variante = services.estado_bienvenida(mesa)
            actual = None
            if sesion is not None and sesion.mesa_id == mesa.pk and sesion.estado in ('activa', 'pagada'):
                actual = {'alias': sesion.alias, 'estado': sesion.estado}
            datos = {
                'variante': variante,
                'mensaje': services.mensaje_bienvenida(variante, mesa),
                'mesa': datos_mesa(mesa, request),
                'grupos': services.grupos_de_mesa(mesa) if variante == 'normal' else [],
                'sesion_actual': actual,
            }

        response = Response(datos)
        if token and (sesion is None or sesion.estado == 'cerrada'):
            borrar_cookie(response)
        return response


class EntrarView(VistaClientePublica):
    """POST entrar/ {mesa, nombre, grupo?} → sesión + cookie"""

    def post(self, request):
        datos = self.validar(EntrarSerializer, request.data)
        if not services.normalizar_alias(datos.get('nombre')):
            raise ErrorComensal('Escribe tu nombre para continuar', codigo='nombre_vacio')
        mesa = _mesa_o_404(datos.get('mesa'))
        sesion, union = services.entrar(mesa, datos.get('nombre'), datos.get('grupo'), leer_token(request))
        return _respuesta_sesion(sesion, union)


class ReconectarView(VistaClientePublica):
    """POST reconectar/ {mesa, nombre, codigo} → sesión recuperada con token nuevo + cookie"""

    def post(self, request):
        datos = self.validar(ReconectarSerializer, request.data)
        if not services.normalizar_alias(datos.get('nombre')):
            raise ErrorComensal('Escribe tu nombre para continuar', codigo='nombre_vacio')
        mesa = _mesa_o_404(datos.get('mesa'))
        sesion, union = services.reconectar(mesa, datos.get('nombre'), datos.get('codigo'))
        return _respuesta_sesion(sesion, union)


class SesionView(VistaCliente):
    """GET sesion/ (polling: no cuenta como actividad)"""
    metodos_polling = ('GET',)

    def get(self, request):
        return Response(datos_sesion(request.auth, request))


class UnionView(VistaCliente):
    """POST union/<id>/aceptar/ · union/<id>/rechazar/ (integrante activo del grupo destino)"""
    aceptar = True

    def post(self, request, solicitud_id):
        solicitud = services.resolver_union(request.auth, solicitud_id, self.aceptar)
        return Response({'solicitud': {'id': str(solicitud.id), 'estado': solicitud.estado}})


class UnionAceptarView(UnionView):
    aceptar = True


class UnionRechazarView(UnionView):
    aceptar = False


class MenuView(VistaCliente):
    """GET menu/"""

    def get(self, request):
        return Response(datos_menu(request.auth, request))


class PedidosView(VistaCliente):
    """GET pedidos/?alcance=mio|grupo (polling) · POST pedidos/ (crear)"""
    metodos_polling = ('GET',)

    def get(self, request):
        sesion = request.auth
        alcance = request.query_params.get('alcance') or 'mio'
        if alcance not in ('mio', 'grupo'):
            raise ErrorComensal('Alcance no válido: usa mio o grupo.', codigo='datos_invalidos')
        sesiones = [sesion]
        if alcance == 'grupo':
            sesiones = list({s.pk: s for s in [*sesion.sesiones_de_grupo(), sesion]}.values())
        return Response([pedido_cliente(p) for p in pedidos_de(sesiones)])

    def post(self, request):
        datos = self.validar(CrearPedidoSerializer, request.data)
        pedido = services.crear_pedido(request.auth, datos['items'], datos.get('nota') or '')
        pedido = pedidos_de([request.auth]).get(pk=pedido.pk)
        return Response(pedido_cliente(pedido), status=status.HTTP_201_CREATED)


class AlertasView(VistaCliente):
    """POST alertas/ {tipo: ayuda|personalizado, mensaje?}"""

    def post(self, request):
        datos = self.validar(AlertaSerializer, request.data)
        alerta = services.llamar_mesero(request.auth, datos['tipo'], datos.get('mensaje') or '')
        return Response(
            {
                'id': str(alerta.id),
                'tipo': alerta.tipo,
                'mensaje': alerta.mensaje,
                'created_at': fecha(alerta.created_at),
                'detail': 'Avisamos al personal. Enseguida te atienden.',
            },
            status=status.HTTP_201_CREATED,
        )


class CuentaView(VistaCliente):
    """GET cuenta/?tipo=individual|grupal · POST cuenta/ {tipo, metodo_preferido?, confirmar?}"""

    def get(self, request):
        tipo = request.query_params.get('tipo') or 'individual'
        if tipo not in ('individual', 'grupal'):
            raise ErrorComensal('Tipo de cuenta no válido: usa individual o grupal.', codigo='datos_invalidos')
        return Response(datos_cuenta(request.auth, tipo))

    def post(self, request):
        datos = self.validar(PedirCuentaSerializer, request.data)
        resultado, solicitud, sin_entregar = services.pedir_cuenta(
            request.auth, datos['tipo'], datos.get('metodo_preferido') or '', datos.get('confirmar', False)
        )
        if resultado == 'confirmar':
            return Response({
                'requiere_confirmacion': True,
                'sin_entregar': sin_entregar,
                'mensaje': f'Tienes {sin_entregar} pedido(s) sin entregar, ¿pedir la cuenta de todas formas?',
            })
        codigo = status.HTTP_201_CREATED if resultado == 'creada' else status.HTTP_200_OK
        return Response({'solicitud': datos_solicitud(solicitud)}, status=codigo)


class SalirView(VistaCliente):
    """POST salir/: pagada, o activa sin consumo abierto → cerrada (motivo salir) y borra la cookie"""
    permite_pagada = True

    def post(self, request):
        sesion = services.salir(request.auth)
        response = Response({'detail': '¡Gracias por tu visita!', 'mesa': sesion.qr_vigente()})
        return borrar_cookie(response)


class TicketView(VistaCliente):
    """GET ticket/: ticket de la cuenta que pagó esta sesión (404 si no está pagada)"""

    def get(self, request):
        ticket = datos_ticket(request.auth, request)
        if ticket is None:
            raise ErrorComensal(
                'Tu cuenta todavía no ha sido pagada.', status_code=status.HTTP_404_NOT_FOUND, codigo='sin_ticket'
            )
        return Response(ticket)
