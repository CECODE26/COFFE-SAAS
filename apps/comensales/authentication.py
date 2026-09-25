from django.contrib.auth.models import AnonymousUser
from rest_framework.authentication import BaseAuthentication

from .cookies import leer_token
from .errores import ErrorComensal
from .models import SesionCliente


class SesionClienteAuthentication(BaseAuthentication):
    """Autenticación del comensal por la cookie httpOnly `coffe_comensal` (sin JWT ni sesión de Django).

    Deja la SesionCliente en `request.auth` y `request.user` = AnonymousUser. En cada request revalida
    la sesión (una vencida no revive por una acción tardía) y dispara la limpieza global.
    Sin cookie o token inválido → 401 sin_sesion; sesión cerrada → 401 sesion_cerrada y borra la cookie.
    """

    def authenticate(self, request):
        from .services import MENSAJE_SESION_CERRADA, cookie_vencida, limpiar_sesiones_inactivas, revalidar_sesion

        token = leer_token(request)
        if not token:
            raise ErrorComensal(
                'Escanea el QR de tu mesa para empezar.', status_code=401, codigo='sin_sesion'
            )
        sesion = (
            SesionCliente.objects.select_related('mesa__cafeteria', 'mesa__tenant')
            .filter(token_cookie=token)
            .first()
        )
        if sesion is None:
            raise ErrorComensal(
                'Escanea el QR de tu mesa para empezar.', status_code=401, codigo='sin_sesion', borrar_cookie=True
            )

        sesion = revalidar_sesion(sesion)
        limpiar_sesiones_inactivas()

        # Cookies de sesiones que ya no están activas se eliminan pasadas COMENSAL_COOKIE_HORAS desde que
        # dejaron de estarlo (ver services.cookie_vencida). `mesa` solo lleva el QR si la sesión lo conoce:
        # tras regenerar el QR, una cookie vieja no sirve para conseguir el nuevo.
        if sesion.estado == 'cerrada' or cookie_vencida(sesion):
            raise ErrorComensal(
                MENSAJE_SESION_CERRADA, status_code=401, codigo='sesion_cerrada', borrar_cookie=True,
                mesa=sesion.qr_vigente()
            )
        return (AnonymousUser(), sesion)

    def authenticate_header(self, request):
        # Con header, DRF responde 401 (y no 403) cuando falta la sesión
        return 'Cookie realm="comensal"'
