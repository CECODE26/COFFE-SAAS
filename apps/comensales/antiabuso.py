"""
Límites anti-abuso de los comensales, guardados en la caché (Redis si hay REDIS_URL).
Al pasarse: 429 {"detail": "Espera N s antes de volver a intentarlo.", "retry_after": N}
y header Retry-After: N (ver errores.error_limite).

Por sesión (claves por `sesion.id`):
- Crear pedido: máx. 5 en 60 s con ventana DESLIZANTE: se guarda la hora de cada pedido creado y solo cuentan
  los de los últimos 60 s; retry_after = segundos hasta que el más antiguo salga de la ventana.
- Llamar al mesero: 1 cada 30 s y máx. 3 alertas sin atender (ayuda/personalizado) de esa sesión (retry_after 30).
- Pedir la cuenta: 1 solicitud NUEVA cada 30 s. Devolver la pendiente (idempotencia) o pedir confirmación
  no consume el límite: services solo llama a registrar_cuenta cuando crea la solicitud.

Por mesa (claves por `mesa.id`): sin ellos, quien tenga el QR abre sesiones nuevas y multiplica los límites
de cada sesión (llenar CAJA de pedidos, alertas en ráfaga, ocupar los nombres de la mesa).
- Sesiones activas a la vez: máx. 2 × capacidad (mín. 8) → 409 {codigo: 'mesa_llena'}.
- Sesiones nuevas: máx. 12 en 10 min (ventana deslizante). Re-escanear desde el mismo dispositivo o
  reconectarse con el código del personal no cuenta.
- Pedidos: máx. 15 en 60 s (ventana deslizante) entre todas las sesiones de la mesa.
- Alertas sin atender (ayuda/personalizado) de comensales: máx. 6 por mesa (retry_after 30).
No hay límite por IP: en un local todos los clientes suelen salir por la misma IP pública (el Wi-Fi).

services llama a verificar_* antes de la acción y a registrar_* después, con la mesa bloqueada
(select_for_update): dos requests simultáneos de la misma mesa no se cuelan a la vez.
"""
import math
import time

from django.core.cache import cache

from .errores import ErrorComensal, error_limite

PEDIDOS_MAX = 5
PEDIDOS_VENTANA_S = 60
ALERTA_INTERVALO_S = 30
ALERTAS_SIN_ATENDER_MAX = 3
CUENTA_INTERVALO_S = 30

SESIONES_ACTIVAS_POR_ASIENTO = 2
SESIONES_ACTIVAS_MIN = 8
ENTRADAS_MESA_MAX = 12
ENTRADAS_MESA_VENTANA_S = 600
PEDIDOS_MESA_MAX = 15
PEDIDOS_MESA_VENTANA_S = 60
ALERTAS_MESA_SIN_ATENDER_MAX = 6

MENSAJE_MESA_LLENA = 'Esta mesa ya tiene demasiadas personas conectadas. Pide ayuda al personal.'


def _clave(tipo, sesion):
    return f'comensales:limite:{tipo}:{sesion.pk}'


def _clave_mesa(tipo, mesa):
    return f'comensales:limite:{tipo}:mesa:{mesa.pk}'


# ---------- Ventana deslizante (marcas de tiempo en la caché) ----------

def _marcas(clave, ventana, ahora):
    return [t for t in (cache.get(clave) or []) if ahora - t < ventana]


def _verificar_ventana(clave, maximo, ventana):
    ahora = time.time()
    marcas = _marcas(clave, ventana, ahora)
    if len(marcas) >= maximo:
        raise error_limite(math.ceil(ventana - (ahora - min(marcas))))


def _registrar_ventana(clave, ventana):
    ahora = time.time()
    marcas = _marcas(clave, ventana, ahora)
    marcas.append(ahora)
    cache.set(clave, marcas, ventana)


# ---------- Pedidos ----------

def verificar_pedido(sesion):
    _verificar_ventana(_clave('pedidos', sesion), PEDIDOS_MAX, PEDIDOS_VENTANA_S)


def registrar_pedido(sesion):
    _registrar_ventana(_clave('pedidos', sesion), PEDIDOS_VENTANA_S)


def verificar_pedido_mesa(mesa):
    _verificar_ventana(_clave_mesa('pedidos', mesa), PEDIDOS_MESA_MAX, PEDIDOS_MESA_VENTANA_S)


def registrar_pedido_mesa(mesa):
    _registrar_ventana(_clave_mesa('pedidos', mesa), PEDIDOS_MESA_VENTANA_S)


# ---------- Entrar (sesiones nuevas de la mesa) ----------

def tope_sesiones_activas(mesa):
    """Máximo de sesiones activas a la vez en la mesa: 2 × capacidad (mín. 8)"""
    return max(SESIONES_ACTIVAS_POR_ASIENTO * (mesa.capacity or 0), SESIONES_ACTIVAS_MIN)


def verificar_entrada_mesa(mesa, activas):
    """Antes de crear una sesión nueva: 409 mesa_llena si ya está el tope de activas; 429 si entraron
    demasiadas sesiones nuevas en los últimos 10 min"""
    if activas >= tope_sesiones_activas(mesa):
        raise ErrorComensal(MENSAJE_MESA_LLENA, status_code=409, codigo='mesa_llena')
    _verificar_ventana(_clave_mesa('entradas', mesa), ENTRADAS_MESA_MAX, ENTRADAS_MESA_VENTANA_S)


def registrar_entrada_mesa(mesa):
    _registrar_ventana(_clave_mesa('entradas', mesa), ENTRADAS_MESA_VENTANA_S)


# ---------- Intervalo mínimo entre acciones ----------

def _verificar_intervalo(tipo, sesion, intervalo):
    ultima = cache.get(_clave(tipo, sesion))
    if ultima is None:
        return
    transcurrido = time.time() - ultima
    if transcurrido < intervalo:
        raise error_limite(math.ceil(intervalo - transcurrido))


def _registrar_intervalo(tipo, sesion, intervalo):
    cache.set(_clave(tipo, sesion), time.time(), intervalo)


# ---------- Llamar al mesero ----------

def verificar_alerta(sesion):
    from .models import AlertaMesero

    sin_atender = AlertaMesero.objects.filter(
        sesion=sesion, atendida=False, tipo__in=['ayuda', 'personalizado']
    ).count()
    if sin_atender >= ALERTAS_SIN_ATENDER_MAX:
        raise error_limite(ALERTA_INTERVALO_S)
    _verificar_intervalo('alerta', sesion, ALERTA_INTERVALO_S)


def verificar_alertas_mesa(mesa):
    """Alertas de comensales sin atender en toda la mesa (las del sistema, sin sesión, no cuentan)"""
    from .models import AlertaMesero

    sin_atender = AlertaMesero.objects.filter(
        mesa=mesa, sesion__isnull=False, atendida=False, tipo__in=['ayuda', 'personalizado']
    ).count()
    if sin_atender >= ALERTAS_MESA_SIN_ATENDER_MAX:
        raise error_limite(ALERTA_INTERVALO_S)


def registrar_alerta(sesion):
    _registrar_intervalo('alerta', sesion, ALERTA_INTERVALO_S)


# ---------- Pedir la cuenta ----------

def verificar_cuenta(sesion):
    _verificar_intervalo('cuenta', sesion, CUENTA_INTERVALO_S)


def registrar_cuenta(sesion):
    _registrar_intervalo('cuenta', sesion, CUENTA_INTERVALO_S)
