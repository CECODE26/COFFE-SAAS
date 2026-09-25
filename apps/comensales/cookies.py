"""Cookie httpOnly del comensal (coffe_comensal = token_cookie de su SesionCliente)"""
from django.conf import settings


def nombre_cookie():
    return settings.COMENSAL_COOKIE_NOMBRE


def leer_token(request):
    """Token de la cookie del request (cadena vacía si no hay)"""
    return (request.COOKIES.get(nombre_cookie()) or '').strip()


def poner_cookie(response, sesion):
    """Pone la cookie con la duración completa (entrar, reconectar y renovación deslizante)"""
    response.set_cookie(
        nombre_cookie(),
        sesion.token_cookie,
        max_age=settings.COMENSAL_COOKIE_HORAS * 3600,
        path='/',
        secure=settings.COMENSAL_COOKIE_SECURE,
        httponly=True,
        samesite='Lax',
    )
    return response


# Renovar = volver a ponerla con la duración completa (sliding)
renovar_cookie = poner_cookie


def borrar_cookie(response):
    response.delete_cookie(nombre_cookie(), path='/', samesite='Lax')
    return response
