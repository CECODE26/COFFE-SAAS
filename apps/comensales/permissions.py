from rest_framework.permissions import SAFE_METHODS, BasePermission

from .errores import ErrorComensal
from .models import SesionCliente


class ExigeXHR(BasePermission):
    """Anti-CSRF del cliente: los métodos no seguros exigen `X-Requested-With: XMLHttpRequest`.

    Un formulario de otro sitio no puede poner ese header, y un fetch de otro origen con él necesita
    pasar el preflight de CORS. Además las vistas del cliente solo aceptan JSON.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        if request.META.get('HTTP_X_REQUESTED_WITH') != 'XMLHttpRequest':
            raise ErrorComensal('Solicitud no permitida.', status_code=403, codigo='solicitud_no_permitida')
        return True


class TieneSesion(BasePermission):
    """El request trae una SesionCliente válida (la deja SesionClienteAuthentication en request.auth)"""

    def has_permission(self, request, view):
        return isinstance(request.auth, SesionCliente)


class SesionPuedeEscribir(BasePermission):
    """Una sesión 'pagada' es de solo lectura: escribir → 409 sesion_pagada.

    La vista puede permitirlo con `permite_pagada = True` (solo `salir`).
    """

    def has_permission(self, request, view):
        sesion = request.auth
        if request.method in SAFE_METHODS or not isinstance(sesion, SesionCliente):
            return True
        if sesion.estado == 'activa':
            return True
        if sesion.estado == 'pagada' and getattr(view, 'permite_pagada', False):
            return True
        raise ErrorComensal('Tu cuenta ya fue pagada.', status_code=409, codigo='sesion_pagada')


class EsPersonalDelLocal(BasePermission):
    """Personal que atiende mesas: staff del local (con cafetería), distribuidor_admin o super_admin.

    El alcance por local/tenant lo dan las vistas (mesas_del_usuario): fuera de él responden 404.
    """
    message = 'Solo el personal del local puede atender las mesas por QR.'
    ROLES_LOCAL = ['cafe_admin', 'gerente', 'camarero', 'cajero', 'cocinero']

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.role in ['super_admin', 'distribuidor_admin']:
            return True
        return user.role in self.ROLES_LOCAL and user.cafeteria_id is not None
