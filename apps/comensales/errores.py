from rest_framework import status
from rest_framework.exceptions import APIException


class ErrorComensal(APIException):
    """Error de negocio del flujo QR con cuerpo JSON exacto del contrato.

    Las vistas del cliente responden `{"codigo": ..., "detail": ..., **extra}`;
    las del personal, `{"error": ..., **extra}`. Hereda de APIException para que DRF lo trate
    como un error de autenticación limpio cuando lo lanza SesionClienteAuthentication.
    """
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'No pudimos completar la acción.'

    def __init__(self, detail=None, status_code=None, codigo=None, borrar_cookie=False, headers=None, **extra):
        mensaje = detail or self.default_detail
        super().__init__(mensaje)
        self.mensaje = str(mensaje)
        if status_code is not None:
            self.status_code = status_code
        self.codigo = codigo
        self.borrar_cookie = borrar_cookie
        self.headers = headers or {}
        self.extra = extra

    def datos_cliente(self):
        datos = {}
        if self.codigo:
            datos['codigo'] = self.codigo
        datos['detail'] = self.mensaje
        datos.update(self.extra)
        return datos

    def datos_personal(self):
        return {'error': self.mensaje, **self.extra}


def error_limite(segundos):
    """429 anti-abuso: retry_after en el JSON y en el header Retry-After"""
    segundos = max(1, int(segundos))
    return ErrorComensal(
        f'Espera {segundos} s antes de volver a intentarlo.',
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={'Retry-After': str(segundos)},
        retry_after=segundos,
    )
