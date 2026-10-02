"""
Quién puede tocar la carta (decisión del dueño):
  - gestionar productos y categorías (crear, editar, borrar, fotos, orden): super_admin, distribuidor_admin, cafe_admin;
  - marcar un producto Agotado/Disponible: además el gerente;
  - el resto del personal solo la lee (sin costo ni margen).
El alcance (su tenant) lo dan los get_queryset de las vistas: fuera de él, get_object() da 404.
Ocultar una categoría la saca de la carta que se sirve: sus productos no salen a los clientes ni al personal
(solo quien gestiona la carta los ve, para administrarlos).
"""
from django.db.models import Q
from rest_framework.permissions import BasePermission

ROLES_GESTION = ('super_admin', 'distribuidor_admin', 'cafe_admin')
ROLES_DISPONIBILIDAD = ROLES_GESTION + ('gerente',)


def _con_rol(user, roles):
    if not (user and user.is_authenticated and user.role in roles):
        return False
    # Fuera de la plataforma, sin tenant no hay carta que tocar
    return user.role == 'super_admin' or user.tenant_id is not None


def gestiona_carta(user):
    return _con_rol(user, ROLES_GESTION)


def cambia_disponibilidad(user):
    return _con_rol(user, ROLES_DISPONIBILIDAD)


class PuedeGestionarCarta(BasePermission):
    message = 'Solo el dueño o el administrador pueden modificar la carta.'

    def has_permission(self, request, view):
        return gestiona_carta(request.user)


class PuedeCambiarDisponibilidad(BasePermission):
    message = 'Solo el dueño, el administrador o el gerente pueden marcar productos como agotados.'

    def has_permission(self, request, view):
        return cambia_disponibilidad(request.user)


def categorias_visibles(user, queryset):
    """Quien gestiona la carta ve también las categorías ocultas; el resto, solo las activas"""
    return queryset if gestiona_carta(user) else queryset.filter(is_active=True)


def items_visibles(user, queryset):
    """
    Quien gestiona la carta ve todo (también desactivados y los de categorías ocultas); el gerente, los activos
    aunque estén agotados (para volver a marcarlos disponibles); el resto del personal, solo lo que se puede pedir.
    Los productos de una categoría oculta no salen a nadie más (tampoco para tomar pedidos).
    """
    if gestiona_carta(user):
        return queryset
    queryset = queryset.filter(Q(category__isnull=True) | Q(category__is_active=True))
    if cambia_disponibilidad(user):
        return queryset.filter(is_active=True)
    return queryset.filter(is_active=True, is_available=True)
