"""
Reglas de negocio de los pedidos por QR (comensales).

Otras apps importan estas funciones DENTRO de sus funciones (evita ciclos de importación):
normalizar_alias, estado_bienvenida, limpiar_sesiones_inactivas, revalidar_sesion,
liberar_mesa_si_corresponde, cobrar, cerrar_mesa, cerrar_sesiones_pagadas, sesiones_activas, resumen_mesas.

Orden de bloqueo (evita deadlocks): SIEMPRE la Mesa primero (select_for_update) y después
sesiones, solicitudes y pedidos de esa mesa.
"""
import logging
import secrets
import uuid
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.utils import timezone

from apps.auditoria.services import registrar
from apps.menu.models import MenuItem
from apps.mesas.models import Mesa
from apps.pedidos.models import Order, OrderItem

from . import antiabuso
from .errores import ErrorComensal
from .models import AlertaMesero, SesionCliente, SolicitudPago, SolicitudUnion, generar_token_cookie, limpiar_alias

logger = logging.getLogger(__name__)

CLAVE_LIMPIEZA = 'comensales:limpieza'
CERO = Decimal('0.00')
METODOS_PAGO = dict(SolicitudPago.METODO_CHOICES)
CODIGO_VALIDEZ_MIN = 5
CODIGO_MAX_INTENTOS = 5

MENSAJE_SIN_MESA = 'Escanea el QR de tu mesa'
MENSAJE_EN_CIERRE = 'Estamos preparando tu mesa. Pide ayuda al personal o intenta en unos minutos.'
MENSAJE_RESERVADA = 'Esta mesa está reservada. Pide al personal que te ubique.'
MENSAJE_NO_DISPONIBLE = 'Esta mesa no está disponible en este momento. Pide ayuda al personal.'
MENSAJE_NORMAL = 'Escribe tu nombre para ver el menú.'
MENSAJE_SESION_CERRADA = 'Tu sesión en la mesa terminó. Vuelve a entrar para seguir pidiendo.'


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def normalizar_alias(texto):
    """Nombre del comensal: sin espacios sobrantes ni caracteres invisibles, espacios dobles colapsados,
    MAYÚSCULAS, máx. 50. '' si no tiene ninguna letra ni dígito (ver models.limpiar_alias)."""
    return limpiar_alias(texto)


def sesiones_activas(mesa):
    """Sesiones activas (pueden pedir) de la mesa"""
    return SesionCliente.objects.filter(mesa=mesa, estado='activa')


def pedidos_de_mesa_abiertos(mesa):
    """Pedidos de tipo mesa abiertos (no pagados ni cancelados) de la mesa. Solo los de SU cafetería:
    un pedido de otro local que apunte a esta mesa no la bloquea."""
    return mesa.orders.filter(
        order_type='mesa', cafeteria_id=mesa.cafeteria_id, is_paid=False
    ).exclude(status='cancelada')


def pedidos_por_cobrar(sesiones):
    """Pedidos no pagados y no cancelados de esas sesiones (lista de sesiones, ids o queryset)"""
    return Order.objects.filter(sesion_cliente__in=sesiones, is_paid=False).exclude(status='cancelada')


def totales(pedidos):
    """{subtotal, iva, total} (Decimal) de un queryset de pedidos"""
    agg = pedidos.order_by().aggregate(subtotal=Sum('subtotal'), iva=Sum('tax'), total=Sum('total'))
    return {clave: (valor or CERO) for clave, valor in agg.items()}


def buscar_mesa(qr):
    """Mesa activa por su token QR (None si no viene, no existe o está desactivada)"""
    qr = str(qr or '').strip()
    # Un byte NUL (Postgres no lo admite) o un texto más largo que el campo no puede ser un QR: sin_mesa
    if not qr or '\x00' in qr or len(qr) > 255:
        return None
    return Mesa.objects.select_related('cafeteria', 'tenant').filter(qr_code=qr, is_active=True).first()


def _uuid_o_none(valor):
    try:
        return uuid.UUID(str(valor))
    except (TypeError, ValueError, AttributeError):
        return None


def _bloquear_mesa(mesa_id):
    """Fila de la mesa bloqueada hasta el fin de la transacción (select_for_update)"""
    return Mesa.objects.select_for_update().get(pk=mesa_id)


def _exigir_activa(sesion, mesa):
    """Dentro del bloqueo: la sesión debe seguir activa (pagada → 409, cerrada → 401 y borra la cookie)"""
    if sesion.estado == 'activa':
        return
    if sesion.estado == 'pagada':
        raise ErrorComensal('Tu cuenta ya fue pagada.', status_code=409, codigo='sesion_pagada')
    raise ErrorComensal(
        MENSAJE_SESION_CERRADA, status_code=401, codigo='sesion_cerrada', borrar_cookie=True,
        mesa=sesion.qr_vigente()
    )


def cookie_vencida(sesion, ahora=None):
    """¿La cookie de esta sesión ya no activa se debe borrar? Pasadas COMENSAL_COOKIE_HORAS desde que DEJÓ de
    estar activa (pagada_at / cerrada_at; nunca antes de fecha_inicio). Contar desde fecha_inicio cortaba el
    ticket en cuanto pagaba quien llevaba más de 2 h sentado."""
    if sesion.estado == 'activa':
        return False
    desde = max(t for t in (sesion.fecha_inicio, sesion.pagada_at, sesion.cerrada_at) if t)
    return desde < (ahora or timezone.now()) - timedelta(hours=settings.COMENSAL_COOKIE_HORAS)


def registrar_actividad(sesion):
    """Renueva ultima_actividad (no se llama en los endpoints de polling). Nunca revive una sesión no activa."""
    if sesion.estado != 'activa':
        return
    ahora = timezone.now()
    SesionCliente.objects.filter(pk=sesion.pk, estado='activa').update(ultima_actividad=ahora)
    sesion.ultima_actividad = ahora


# ---------------------------------------------------------------------------
# Bienvenida
# ---------------------------------------------------------------------------

def estado_bienvenida(mesa):
    """Variante de la bienvenida para una mesa ya encontrada y activa: 'normal' | 'en_cierre' | 'no_disponible'"""
    if not mesa.cafeteria.is_active or not mesa.tenant.is_active:
        return 'no_disponible'
    if mesa.status in ('reservada', 'mantenimiento'):
        return 'no_disponible'
    if mesa.status == 'limpiando':
        return 'en_cierre'
    # Pagos hechos y nadie activo: la mesa está por cerrarse. Salvo en una mesa mixta: si el personal tiene
    # un pedido de mesa abierto, esa gente sigue sentada y puede entrar por QR.
    if (
        not sesiones_activas(mesa).exists()
        and mesa.sesiones_cliente.filter(estado='pagada').exists()
        and not pedidos_de_mesa_abiertos(mesa).exists()
    ):
        return 'en_cierre'
    return 'normal'


def mensaje_bienvenida(variante, mesa=None):
    if variante == 'sin_mesa':
        return MENSAJE_SIN_MESA
    if variante == 'en_cierre':
        return MENSAJE_EN_CIERRE
    if variante == 'no_disponible':
        if mesa is not None and mesa.status == 'reservada' and mesa.cafeteria.is_active and mesa.tenant.is_active:
            return MENSAJE_RESERVADA
        return MENSAJE_NO_DISPONIBLE
    return MENSAJE_NORMAL


def grupos_de_mesa(mesa):
    """Grupos con sesiones activas, en orden de llegada de la fundadora: [{id (fundadora), nombres}]"""
    activas = list(sesiones_activas(mesa).order_by('fecha_inicio'))
    por_grupo = defaultdict(list)
    for sesion in activas:
        por_grupo[sesion.grupo_key].append(sesion.alias)
    llegada = dict(
        SesionCliente.objects.filter(pk__in=list(por_grupo.keys())).values_list('pk', 'fecha_inicio')
    )
    claves = sorted(por_grupo.keys(), key=lambda k: (llegada.get(k) or timezone.now(), str(k)))
    return [{'id': str(k), 'nombres': por_grupo[k]} for k in claves]


# ---------------------------------------------------------------------------
# Vencimiento y limpieza
# ---------------------------------------------------------------------------

def _motivo_vencimiento(sesion, ahora):
    """Motivo por el que la sesión debe cerrarse ahora (None si sigue vigente)"""
    if sesion.estado == 'activa':
        limite = ahora - timedelta(minutes=settings.COMENSAL_INACTIVIDAD_MIN)
        # Una sesión CON pedidos (sin contar cancelados) nunca se cierra por tiempo
        if sesion.ultima_actividad < limite and not sesion.pedidos.exclude(status='cancelada').exists():
            return 'inactividad'
    elif sesion.estado == 'pagada':
        limite = ahora - timedelta(minutes=settings.COMENSAL_PAGADA_CIERRE_MIN)
        if sesion.pagada_at and sesion.pagada_at < limite:
            return 'expirada'
    return None


def _cerrar_sesion(sesion, motivo, ahora):
    """Cierra una sesión (ya bloqueada) y expira sus solicitudes de unión pendientes"""
    sesion.estado = 'cerrada'
    sesion.cerrada_at = ahora
    sesion.motivo_cierre = motivo
    sesion.save(update_fields=['estado', 'cerrada_at', 'motivo_cierre'])
    SolicitudUnion.objects.filter(sesion=sesion, estado='pendiente').update(estado='expirada', resuelta_at=ahora)


def _expirar_uniones(ahora, mesa=None):
    """Expira solicitudes de unión vencidas (COMENSAL_UNION_EXPIRA_MIN), de solicitantes que ya no están activos
    o hacia grupos sin integrantes activos (o cuya fundadora ya pertenece a otro grupo)"""
    limite = ahora - timedelta(minutes=settings.COMENSAL_UNION_EXPIRA_MIN)
    grupo_con_activas = SesionCliente.objects.filter(estado='activa').filter(
        Q(pk=OuterRef('grupo_id')) | Q(grupo_id=OuterRef('grupo_id'))
    )
    pendientes = SolicitudUnion.objects.filter(estado='pendiente')
    if mesa is not None:
        pendientes = pendientes.filter(sesion__mesa=mesa)
    vencidas = pendientes.annotate(grupo_vivo=Exists(grupo_con_activas)).filter(
        Q(created_at__lt=limite)
        | ~Q(sesion__estado='activa')
        | Q(grupo_vivo=False)
        | Q(grupo__grupo__isnull=False)
    )
    ids = list(vencidas.values_list('pk', flat=True))
    if not ids:
        return 0
    return SolicitudUnion.objects.filter(pk__in=ids, estado='pendiente').update(estado='expirada', resuelta_at=ahora)


def sesiones_de_solicitud(solicitud):
    """Sesiones ACTIVAS que cubre hoy una solicitud de pago pendiente (grupal = el grupo en este momento)"""
    if solicitud.tipo == 'grupal':
        return list(solicitud.grupo.sesiones_de_grupo().order_by('fecha_inicio'))
    if solicitud.solicitada_por_id is None:
        return []
    sesion = SesionCliente.objects.filter(pk=solicitud.solicitada_por_id, estado='activa').first()
    return [sesion] if sesion is not None else []


def _depurar_solicitudes_pendientes(mesa):
    """(Mesa bloqueada) Recalcula las cuentas pendientes; borra las que ya no cubren consumo de sesiones activas"""
    for solicitud in SolicitudPago.objects.select_for_update().filter(mesa=mesa, estado='pendiente'):
        vivas = sesiones_de_solicitud(solicitud)
        pedidos = pedidos_por_cobrar(vivas) if vivas else Order.objects.none()
        if not vivas or not pedidos.exists():
            solicitud.delete()
            continue
        suma = totales(pedidos)
        solicitud.subtotal, solicitud.iva, solicitud.total = suma['subtotal'], suma['iva'], suma['total']
        solicitud.save(update_fields=['subtotal', 'iva', 'total'])
        solicitud.sesiones_cubiertas.set(vivas)


def _nota_saldo(activas):
    """Nota de saldo: 'Queda $X sin cobrar (N sesión(es) activa(s))', X = no pagado de las activas"""
    pendiente = totales(pedidos_por_cobrar(activas))['total']
    return f'Queda ${pendiente:.2f} sin cobrar ({len(activas)} sesión(es) activa(s))'


def _refrescar_nota_cierre(mesa):
    """Si la mesa tiene la nota de un cobro parcial, la actualiza (cambió la gente o el consumo). No guarda."""
    if not mesa.nota_cierre:
        return False
    activas = list(sesiones_activas(mesa))
    nota = _nota_saldo(activas) if activas else ''
    if nota == mesa.nota_cierre:
        return False
    mesa.nota_cierre = nota
    return True


def _tras_cambio_de_sesiones(mesa, ahora, liberar=True):
    """(Mesa bloqueada) Consecuencias de cerrar o cobrar sesiones de la mesa.

    liberar=False cuando solo vencieron sesiones 'pagada' (motivo expirada): eso NO cambia el estado de la
    mesa (decisión 2). Si no, una mesa que el personal volvió a ocupar a mano quedaría 'disponible'.
    """
    _expirar_uniones(ahora, mesa)
    _depurar_solicitudes_pendientes(mesa)
    if not liberar:
        return mesa.status
    return liberar_mesa_si_corresponde(mesa)


def liberar_mesa_si_corresponde(mesa):
    """(Con la mesa bloqueada) Ajusta la mesa a sus sesiones. Devuelve el estado final de la mesa.

    - Quedan activas: actualiza guest_count (y la nota de saldo si la mesa tiene una).
    - Ninguna activa y hay sesiones 'pagada' sin cerrar → 'limpiando' (mesa en cierre, decisión 2), salvo
      que el personal tenga un pedido de mesa abierto (mesa mixta): sigue como está, sin nota.
    - Ninguna activa ni pagada, mesa 'ocupada' y sin pedidos de mesa abiertos → 'disponible' (free()).
    """
    activas = sesiones_activas(mesa).count()
    if activas:
        campos = ['updated_at']
        if mesa.guest_count != activas:
            mesa.guest_count = activas
            campos.append('guest_count')
        if _refrescar_nota_cierre(mesa):
            campos.append('nota_cierre')
        if len(campos) > 1:
            mesa.save(update_fields=campos)
        return mesa.status

    # Mesa mixta: con un pedido de mesa abierto del personal la mesa sigue atendida (no pasa a cierre ni se libera)
    if not pedidos_de_mesa_abiertos(mesa).exists():
        if mesa.sesiones_cliente.filter(estado='pagada').exists():
            if mesa.status != 'limpiando' or mesa.nota_cierre or mesa.guest_count:
                mesa.status = 'limpiando'
                mesa.nota_cierre = ''
                mesa.guest_count = 0
                mesa.occupied_since = None
                mesa.save(update_fields=['status', 'nota_cierre', 'guest_count', 'occupied_since', 'updated_at'])
            return mesa.status
        if mesa.status == 'ocupada':
            mesa.free()
            return mesa.status

    if mesa.nota_cierre:
        mesa.nota_cierre = ''
        mesa.save(update_fields=['nota_cierre', 'updated_at'])
    return mesa.status


def limpiar_sesiones_inactivas(forzar=False):
    """Limpieza global (máx. 1 vez por minuto con un lock en caché). Devuelve cuántas sesiones cerró.

    Cierra activas SIN pedidos (no cancelados) inactivas más de COMENSAL_INACTIVIDAD_MIN (motivo inactividad),
    pagadas con más de COMENSAL_PAGADA_CIERRE_MIN (motivo expirada) y expira solicitudes de unión vencidas.
    Cada candidata se revalida con la mesa y la sesión bloqueadas antes de cerrarla.
    """
    if not forzar and not cache.add(CLAVE_LIMPIEZA, 1, 60):
        return 0

    ahora = timezone.now()
    limite_inactividad = ahora - timedelta(minutes=settings.COMENSAL_INACTIVIDAD_MIN)
    limite_pagada = ahora - timedelta(minutes=settings.COMENSAL_PAGADA_CIERRE_MIN)
    con_pedidos = Order.objects.filter(sesion_cliente=OuterRef('pk')).exclude(status='cancelada')

    inactivas = (
        SesionCliente.objects.filter(estado='activa', ultima_actividad__lt=limite_inactividad)
        .annotate(tiene_pedidos=Exists(con_pedidos))
        .filter(tiene_pedidos=False)
        .values_list('pk', 'mesa_id')
    )
    pagadas = SesionCliente.objects.filter(estado='pagada', pagada_at__lt=limite_pagada).values_list('pk', 'mesa_id')

    por_mesa = defaultdict(list)
    for pk, mesa_id in list(inactivas) + list(pagadas):
        por_mesa[mesa_id].append(pk)

    cerradas = 0
    for mesa_id, ids in por_mesa.items():
        try:
            with transaction.atomic():
                mesa = Mesa.objects.select_for_update().filter(pk=mesa_id).first()
                if mesa is None:
                    continue
                motivos = []
                for sesion in SesionCliente.objects.select_for_update().filter(pk__in=ids):
                    motivo = _motivo_vencimiento(sesion, ahora)
                    if motivo:
                        _cerrar_sesion(sesion, motivo, ahora)
                        motivos.append(motivo)
                if motivos:
                    # Si solo vencieron pagadas (expirada), el estado de la mesa no cambia
                    _tras_cambio_de_sesiones(mesa, ahora, liberar='inactividad' in motivos)
                cerradas += len(motivos)
        except Exception:  # la limpieza nunca debe tumbar el request que la disparó
            logger.exception('Error limpiando las sesiones QR de la mesa %s', mesa_id)

    try:
        _expirar_uniones(ahora)
    except Exception:
        logger.exception('Error expirando solicitudes de unión')
    return cerradas


def revalidar_sesion(sesion):
    """Aplica la regla de vencimiento solo a esta sesión (SIEMPRE, en cada request del cliente).

    Una sesión vencida se cierra aunque llegue una acción tardía: se evalúa ANTES de renovar la actividad.
    """
    ahora = timezone.now()
    if _motivo_vencimiento(sesion, ahora) is None:
        return sesion
    with transaction.atomic():
        mesa = _bloquear_mesa(sesion.mesa_id)
        bloqueada = SesionCliente.objects.select_for_update().get(pk=sesion.pk)
        motivo = _motivo_vencimiento(bloqueada, ahora)
        if motivo:
            _cerrar_sesion(bloqueada, motivo, ahora)
            _tras_cambio_de_sesiones(mesa, ahora, liberar=motivo == 'inactividad')
    for campo in ('estado', 'cerrada_at', 'motivo_cierre', 'ultima_actividad', 'pagada_at', 'grupo_id', 'alias'):
        setattr(sesion, campo, getattr(bloqueada, campo))
    return sesion


# ---------------------------------------------------------------------------
# Entrar, reconectar y grupos
# ---------------------------------------------------------------------------

def _resolver_grupo(mesa, grupo_id):
    """Fundadora real del grupo elegido (de ESTA mesa y con sesiones activas); None = funda su propio grupo"""
    grupo_id = _uuid_o_none(grupo_id) if grupo_id else None
    if grupo_id is None:
        return None
    elegida = SesionCliente.objects.filter(pk=grupo_id, mesa=mesa).first()
    if elegida is None:
        return None
    fundadora = elegida
    # Normaliza a la fundadora (máx. 2 saltos por si una fundadora antigua se unió a otro grupo)
    for _ in range(2):
        if fundadora.grupo_id is None:
            break
        siguiente = SesionCliente.objects.filter(pk=fundadora.grupo_id, mesa=mesa).first()
        if siguiente is None:
            break
        fundadora = siguiente
    if not fundadora.sesiones_de_grupo().exists():
        return None
    return fundadora


def _tiene_integrantes_activos(sesion):
    """¿Es fundadora de un grupo con OTRAS sesiones activas?"""
    return sesion.grupo_id is None and SesionCliente.objects.filter(
        grupo_id=sesion.pk, estado='activa'
    ).exclude(pk=sesion.pk).exists()


def _solicitar_union(sesion, destino, ahora):
    """Crea (o mantiene) la única solicitud pendiente de la sesión hacia el grupo destino"""
    if _tiene_integrantes_activos(sesion):
        raise ErrorComensal(
            'Ya tienes personas en tu grupo: no puedes unirte a otro.', codigo='grupo_con_integrantes'
        )
    pendiente = SolicitudUnion.objects.select_for_update().filter(sesion=sesion, estado='pendiente').first()
    if pendiente is not None:
        if pendiente.grupo_id == destino.pk:
            return pendiente
        # Solo una pendiente por solicitante: la nueva elección reemplaza a la anterior
        pendiente.estado = 'expirada'
        pendiente.resuelta_at = ahora
        pendiente.save(update_fields=['estado', 'resuelta_at'])
    return SolicitudUnion.objects.create(sesion=sesion, grupo=destino, created_at=ahora)


def _error_nombre_en_uso(nombre):
    return ErrorComensal(
        'Ese nombre ya está siendo usado en esta mesa', status_code=409, codigo='nombre_en_uso',
        nombre=' '.join(str(nombre or '').split())[:50]
    )


def entrar(mesa, nombre, grupo_id=None, token_actual=''):
    """Entra a la mesa (o reutiliza la sesión activa del mismo dispositivo). Devuelve (sesion, union_pendiente)."""
    alias = normalizar_alias(nombre)
    if not alias:
        raise ErrorComensal('Escribe tu nombre para continuar', codigo='nombre_vacio')

    limpiar_sesiones_inactivas()

    previa = None
    if token_actual:
        previa = SesionCliente.objects.filter(token_cookie=token_actual).first()
        if previa is not None:
            previa = revalidar_sesion(previa)

    # Mismo dispositivo que vuelve a escanear: se reutiliza su sesión activa en esta mesa
    if previa is not None and previa.estado == 'activa' and previa.mesa_id == mesa.pk:
        resultado = _reingresar(mesa, previa, alias, nombre, grupo_id)
        if resultado is not None:
            return resultado

    sesion, union = _entrar_nueva(mesa, alias, nombre, grupo_id)

    # Cambió de mesa con el mismo dispositivo: la sesión anterior se suelta si no pidió nada
    if previa is not None and previa.estado == 'activa' and previa.mesa_id != mesa.pk:
        _soltar_sesion_anterior(previa)
    return sesion, union


def _reingresar(mesa, sesion, alias, nombre, grupo_id):
    ahora = timezone.now()
    with transaction.atomic():
        mesa = _bloquear_mesa(mesa.pk)
        sesion = SesionCliente.objects.select_for_update().get(pk=sesion.pk)
        if sesion.estado != 'activa':
            return None  # se cerró en el camino: entra como nueva
        if estado_bienvenida(mesa) == 'no_disponible':
            raise ErrorComensal(mensaje_bienvenida('no_disponible', mesa), status_code=409, codigo='no_disponible')
        if alias != sesion.alias:
            if sesiones_activas(mesa).filter(alias__iexact=alias).exclude(pk=sesion.pk).exists():
                raise _error_nombre_en_uso(nombre)
            sesion.alias = alias
        sesion.ultima_actividad = ahora
        sesion.qr_entrada = mesa.qr_code  # volvió a escanear el QR vigente
        sesion.save(update_fields=['alias', 'ultima_actividad', 'qr_entrada'])

        destino = _resolver_grupo(mesa, grupo_id)
        if destino is not None and destino.pk != sesion.grupo_key:
            _solicitar_union(sesion, destino, ahora)
        union = SolicitudUnion.objects.filter(sesion=sesion, estado='pendiente').exists()
    return sesion, union


def _entrar_nueva(mesa, alias, nombre, grupo_id):
    ahora = timezone.now()
    with transaction.atomic():
        # El lock de la mesa es obligatorio: serializa entradas simultáneas con el mismo nombre
        mesa = _bloquear_mesa(mesa.pk)
        variante = estado_bienvenida(mesa)
        if variante != 'normal':
            raise ErrorComensal(mensaje_bienvenida(variante, mesa), status_code=409, codigo=variante)
        # Límites por mesa: sin ellos, crear sesiones nuevas multiplica los límites de cada sesión
        antiabuso.verificar_entrada_mesa(mesa, sesiones_activas(mesa).count())
        if sesiones_activas(mesa).filter(alias__iexact=alias).exists():
            raise _error_nombre_en_uso(nombre)

        destino = _resolver_grupo(mesa, grupo_id)
        # Aprobación sin bloqueo: siempre nace como grupo propio y puede pedir de inmediato
        sesion = SesionCliente.objects.create(
            tenant_id=mesa.tenant_id, mesa=mesa, alias=alias, fecha_inicio=ahora, ultima_actividad=ahora,
            qr_entrada=mesa.qr_code,
        )
        antiabuso.registrar_entrada_mesa(mesa)
        union = False
        if destino is not None:
            SolicitudUnion.objects.create(sesion=sesion, grupo=destino, created_at=ahora)
            union = True

        if mesa.status == 'disponible' or not mesa.occupied_since:
            mesa.occupied_since = ahora
        mesa.status = 'ocupada'
        mesa.guest_count = sesiones_activas(mesa).count()
        _refrescar_nota_cierre(mesa)
        mesa.save(update_fields=['status', 'occupied_since', 'guest_count', 'nota_cierre', 'updated_at'])
    return sesion, union


def _soltar_sesion_anterior(sesion):
    """Cierra (motivo salir) la sesión activa de otra mesa del mismo dispositivo si no tiene pedidos"""
    ahora = timezone.now()
    with transaction.atomic():
        mesa = _bloquear_mesa(sesion.mesa_id)
        bloqueada = SesionCliente.objects.select_for_update().get(pk=sesion.pk)
        if bloqueada.estado != 'activa' or bloqueada.pedidos.exclude(status='cancelada').exists():
            return
        _cerrar_sesion(bloqueada, 'salir', ahora)
        _tras_cambio_de_sesiones(mesa, ahora)


def reconectar(mesa, nombre, codigo):
    """Recupera la sesión con el código de 4 dígitos que da el personal. Token NUEVO (la cookie anterior deja
    de valer). Devuelve (sesion, union_pendiente)."""
    alias = normalizar_alias(nombre)
    if not alias:
        raise ErrorComensal('Escribe tu nombre para continuar', codigo='nombre_vacio')
    codigo = str(codigo or '').strip()
    limpiar_sesiones_inactivas()

    ahora = timezone.now()
    error = None
    with transaction.atomic():
        mesa = _bloquear_mesa(mesa.pk)
        sesion = (
            SesionCliente.objects.select_for_update()
            .filter(mesa=mesa, alias__iexact=alias, estado__in=['activa', 'pagada'])
            .exclude(codigo_reconexion='')
            .order_by('-fecha_inicio')
            .first()
        )
        if sesion is None:
            error = _error_codigo('Ese código no es válido. Pide uno nuevo al personal.', 0)
        elif not sesion.codigo_expira_at or sesion.codigo_expira_at < ahora:
            _anular_codigo(sesion)
            error = _error_codigo('El código venció. Pide uno nuevo al personal.', 0)
        # En bytes: compare_digest con str no ASCII ('ñ', dígitos de ancho completo) lanza TypeError
        elif not secrets.compare_digest(sesion.codigo_reconexion.encode(), codigo.encode()):
            sesion.codigo_intentos += 1
            restantes = max(0, CODIGO_MAX_INTENTOS - sesion.codigo_intentos)
            if restantes == 0:
                _anular_codigo(sesion)
                error = _error_codigo('Superaste los intentos. Pide un código nuevo al personal.', 0)
            else:
                sesion.save(update_fields=['codigo_intentos'])
                error = _error_codigo('Ese código no es correcto.', restantes)
        else:
            sesion.token_cookie = generar_token_cookie()
            sesion.codigo_reconexion = ''
            sesion.codigo_expira_at = None
            sesion.codigo_intentos = 0
            sesion.qr_entrada = mesa.qr_code  # se reconectó con el QR vigente
            campos = ['token_cookie', 'codigo_reconexion', 'codigo_expira_at', 'codigo_intentos', 'qr_entrada']
            if sesion.estado == 'activa':
                sesion.ultima_actividad = ahora
                campos.append('ultima_actividad')
            sesion.save(update_fields=campos)
            registrar(None, 'comensales.reconectar', sesion, mesa=mesa.number, alias=sesion.alias)
    # Los intentos fallidos quedan guardados: el error se lanza fuera de la transacción
    if error is not None:
        raise error
    union = SolicitudUnion.objects.filter(sesion=sesion, estado='pendiente').exists()
    return sesion, union


def _anular_codigo(sesion):
    sesion.codigo_reconexion = ''
    sesion.codigo_expira_at = None
    sesion.codigo_intentos = 0
    sesion.save(update_fields=['codigo_reconexion', 'codigo_expira_at', 'codigo_intentos'])


def _error_codigo(mensaje, restantes):
    return ErrorComensal(mensaje, codigo='codigo_invalido', intentos_restantes=restantes)


def generar_codigo_reconexion(sesion, usuario):
    """El personal genera un código de 4 dígitos (5 min, máx. 5 intentos) para una sesión activa o pagada"""
    ahora = timezone.now()
    with transaction.atomic():
        mesa = _bloquear_mesa(sesion.mesa_id)
        sesion = SesionCliente.objects.select_for_update().get(pk=sesion.pk)
        if sesion.estado not in ('activa', 'pagada'):
            raise ErrorComensal('Esta persona ya no está en la mesa: pídele que vuelva a escanear el QR.')
        sesion.codigo_reconexion = f'{secrets.randbelow(10000):04d}'
        sesion.codigo_expira_at = ahora + timedelta(minutes=CODIGO_VALIDEZ_MIN)
        sesion.codigo_intentos = 0
        campos = ['codigo_reconexion', 'codigo_expira_at', 'codigo_intentos']
        if sesion.estado == 'activa':
            # Que no se cierre por inactividad mientras la persona escribe el código
            sesion.ultima_actividad = ahora
            campos.append('ultima_actividad')
        sesion.save(update_fields=campos)
        registrar(usuario, 'comensales.codigo_reconexion', sesion, mesa=mesa.number, alias=sesion.alias)
    return sesion


def resolver_union(sesion, solicitud_id, aceptar):
    """Un integrante ACTIVO del grupo destino acepta o rechaza la solicitud. 404 si no le corresponde."""
    ahora = timezone.now()
    error = None
    with transaction.atomic():
        mesa = _bloquear_mesa(sesion.mesa_id)
        yo = SesionCliente.objects.select_for_update().get(pk=sesion.pk)
        _exigir_activa(yo, mesa)
        solicitud = (
            SolicitudUnion.objects.select_for_update(of=('self',))
            .filter(pk=solicitud_id, grupo__mesa=mesa)
            .first()
        )
        no_encontrada = ErrorComensal('No encontramos esa solicitud.', status_code=404, codigo='no_encontrada')
        if solicitud is None:
            raise no_encontrada
        destino_id = solicitud.grupo_id
        es_del_grupo = SesionCliente.objects.filter(mesa=mesa, estado='activa', pk=yo.pk).filter(
            Q(pk=destino_id) | Q(grupo_id=destino_id)
        ).exists()
        if not es_del_grupo:
            raise no_encontrada
        if solicitud.estado != 'pendiente':
            raise ErrorComensal(
                'Esta solicitud ya fue respondida o venció.', status_code=409, codigo='union_resuelta'
            )

        solicitante = SesionCliente.objects.select_for_update().get(pk=solicitud.sesion_id)
        limite = ahora - timedelta(minutes=settings.COMENSAL_UNION_EXPIRA_MIN)
        vencida = (
            solicitud.created_at < limite
            or solicitante.estado != 'activa'
            or (aceptar and _tiene_integrantes_activos(solicitante))
        )
        if vencida:
            solicitud.estado = 'expirada'
            solicitud.resuelta_at = ahora
            solicitud.save(update_fields=['estado', 'resuelta_at'])
            error = ErrorComensal(
                'Esta solicitud ya no está vigente.', status_code=409, codigo='union_resuelta'
            )
        else:
            if aceptar:
                solicitante.grupo_id = destino_id
                solicitante.save(update_fields=['grupo'])
                # Ya no es fundadora: lo que iba hacia su grupo propio deja de valer
                SolicitudUnion.objects.filter(grupo=solicitante, estado='pendiente').update(
                    estado='expirada', resuelta_at=ahora
                )
                SolicitudPago.objects.filter(estado='pendiente', tipo='grupal', grupo=solicitante).delete()
            solicitud.estado = 'aceptada' if aceptar else 'rechazada'
            solicitud.resuelta_at = ahora
            solicitud.resuelta_por = yo
            solicitud.save(update_fields=['estado', 'resuelta_at', 'resuelta_por'])
    if error is not None:
        raise error
    return solicitud


# ---------------------------------------------------------------------------
# Pedidos, alertas, cuenta y salir (cliente)
# ---------------------------------------------------------------------------

def _producto_disponible(producto):
    return (
        producto.is_active and producto.is_available
        and (producto.category_id is None or producto.category.is_active)
    )


def crear_pedido(sesion, lineas, nota=''):
    """Pedido del comensal: entra como 'pendiente' (columna CAJA del tablero). lineas = [{menu_item, cantidad, nota}]"""
    ids = {linea['menu_item'] for linea in lineas}
    productos = {
        p.pk: p for p in MenuItem.objects.filter(pk__in=ids, tenant_id=sesion.tenant_id).select_related('category')
    }
    for linea in lineas:
        producto = productos.get(linea['menu_item'])
        if producto is None:
            raise ErrorComensal(
                'Uno de los productos de tu pedido ya no está en el menú. Actualiza el carrito.',
                codigo='producto_no_disponible', menu_item=str(linea['menu_item'])
            )
        if not _producto_disponible(producto):
            raise ErrorComensal(
                f'{producto.name} ya no está disponible. Quítalo del carrito para continuar.',
                codigo='producto_no_disponible', menu_item=str(producto.pk), nombre=producto.name
            )

    with transaction.atomic():
        mesa = _bloquear_mesa(sesion.mesa_id)
        bloqueada = SesionCliente.objects.select_for_update().get(pk=sesion.pk)
        _exigir_activa(bloqueada, mesa)
        antiabuso.verificar_pedido(bloqueada)
        antiabuso.verificar_pedido_mesa(mesa)

        pedido = Order.objects.create(
            tenant_id=mesa.tenant_id,
            cafeteria_id=mesa.cafeteria_id,
            order_type='mesa',
            mesa=mesa,
            sesion_cliente=bloqueada,
            customer_name=bloqueada.alias,
            status='pendiente',
            notes=nota or '',
        )
        for linea in lineas:
            producto = productos[linea['menu_item']]
            OrderItem.objects.create(
                order=pedido,
                menu_item=producto,
                quantity=linea['cantidad'],
                unit_price=producto.price,
                notes=linea.get('nota') or '',
            )
        pedido.calculate_total()
        antiabuso.registrar_pedido(bloqueada)
        antiabuso.registrar_pedido_mesa(mesa)
        if _refrescar_nota_cierre(mesa):
            mesa.save(update_fields=['nota_cierre', 'updated_at'])
    return pedido


def llamar_mesero(sesion, tipo, mensaje=''):
    """Alerta 'ayuda' o 'personalizado' de la sesión al personal (con límites anti-abuso)"""
    with transaction.atomic():
        mesa = _bloquear_mesa(sesion.mesa_id)
        bloqueada = SesionCliente.objects.select_for_update().get(pk=sesion.pk)
        _exigir_activa(bloqueada, mesa)
        antiabuso.verificar_alerta(bloqueada)
        antiabuso.verificar_alertas_mesa(mesa)
        texto = (mensaje or '').strip()
        if not texto and tipo == 'ayuda':
            texto = f'{bloqueada.alias} llama al mesero'
        alerta = AlertaMesero.objects.create(
            tenant_id=mesa.tenant_id, mesa=mesa, sesion=bloqueada, tipo=tipo, mensaje=texto
        )
        antiabuso.registrar_alerta(bloqueada)
    return alerta


def sesiones_para_cuenta(sesion, tipo):
    """individual = solo yo; grupal = mi grupo (activas) + yo"""
    if tipo == 'individual':
        return [sesion]
    grupo = list(sesion.sesiones_de_grupo().order_by('fecha_inicio'))
    if all(s.pk != sesion.pk for s in grupo):
        grupo.append(sesion)
    return grupo


def solicitud_pendiente(sesion, tipo):
    """Cuenta pendiente del mismo tipo: la individual que pidió esta sesión o la grupal de su grupo"""
    pendientes = SolicitudPago.objects.filter(mesa_id=sesion.mesa_id, estado='pendiente', tipo=tipo)
    if tipo == 'individual':
        pendientes = pendientes.filter(solicitada_por=sesion)
    else:
        pendientes = pendientes.filter(grupo_id=sesion.grupo_key)
    return pendientes.order_by('-created_at').first()


def pedir_cuenta(sesion, tipo, metodo_preferido='', confirmar=False):
    """Pide la cuenta. Devuelve (resultado, solicitud, sin_entregar) con resultado:
    'creada' (201), 'existente' (200, idempotente) o 'confirmar' (200, requiere_confirmacion).
    Solo 'creada' consume el límite de 1 solicitud cada 30 s."""
    ahora = timezone.now()
    with transaction.atomic():
        mesa = _bloquear_mesa(sesion.mesa_id)
        bloqueada = SesionCliente.objects.select_for_update().get(pk=sesion.pk)
        _exigir_activa(bloqueada, mesa)

        sesiones = sesiones_para_cuenta(bloqueada, tipo)
        pedidos = pedidos_por_cobrar(sesiones)
        if not pedidos.exists():
            detalle = (
                'Todavía no tienes consumo por cobrar.' if tipo == 'individual'
                else 'Tu grupo todavía no tiene consumo por cobrar.'
            )
            raise ErrorComensal(detalle, codigo='sin_consumo')

        existente = solicitud_pendiente(bloqueada, tipo)
        if existente is not None:
            if metodo_preferido and existente.metodo_preferido != metodo_preferido:
                existente.metodo_preferido = metodo_preferido
                existente.save(update_fields=['metodo_preferido'])
            return 'existente', existente, 0

        sin_entregar = pedidos.exclude(status='entregada').count()
        if sin_entregar and not confirmar:
            return 'confirmar', None, sin_entregar

        antiabuso.verificar_cuenta(bloqueada)
        suma = totales(pedidos)
        solicitud = SolicitudPago.objects.create(
            tenant_id=mesa.tenant_id,
            mesa=mesa,
            tipo=tipo,
            grupo_id=bloqueada.grupo_key,
            solicitada_por=bloqueada,
            subtotal=suma['subtotal'],
            iva=suma['iva'],
            total=suma['total'],
            metodo_preferido=metodo_preferido or '',
            created_at=ahora,
        )
        solicitud.sesiones_cubiertas.set(sesiones)
        metodo = f' · {METODOS_PAGO[metodo_preferido]}' if metodo_preferido else ''
        AlertaMesero.objects.create(
            tenant_id=mesa.tenant_id, mesa=mesa, sesion=bloqueada, tipo='cuenta',
            mensaje=f'{bloqueada.alias} pide la cuenta ({tipo}){metodo}', created_at=ahora
        )
        antiabuso.registrar_cuenta(bloqueada)
    return 'creada', solicitud, sin_entregar


def salir(sesion):
    """Cierra la sesión (motivo salir). Solo si está pagada o activa sin consumo abierto."""
    ahora = timezone.now()
    with transaction.atomic():
        mesa = _bloquear_mesa(sesion.mesa_id)
        bloqueada = SesionCliente.objects.select_for_update().get(pk=sesion.pk)
        if bloqueada.estado == 'activa' and pedidos_por_cobrar([bloqueada]).exists():
            raise ErrorComensal(
                'Tienes consumo sin pagar: pide la cuenta antes de salir.', status_code=409, codigo='cuenta_abierta'
            )
        if bloqueada.estado in ('activa', 'pagada'):
            _cerrar_sesion(bloqueada, 'salir', ahora)
            _tras_cambio_de_sesiones(mesa, ahora)
    sesion.estado = bloqueada.estado
    sesion.cerrada_at = bloqueada.cerrada_at
    sesion.motivo_cierre = bloqueada.motivo_cierre
    return sesion


# ---------------------------------------------------------------------------
# Personal: cobrar, cerrar y resumen
# ---------------------------------------------------------------------------

def _atender_alertas(alertas, usuario, ahora):
    return alertas.filter(atendida=False).update(
        atendida=True, atendida_at=ahora,
        atendida_por=usuario if getattr(usuario, 'is_authenticated', False) else None
    )


def cobrar(mesa, usuario, metodo_pago, solicitud=None, sesiones=None):
    """Cobra una cuenta de la mesa (transacción + mesa bloqueada).

    - Con `solicitud` grupal: cubre las sesiones de su grupo EN ESTE MOMENTO.
    - Sin solicitud: crea una SolicitudPago ya procesada con las `sesiones` dadas (grupal si son varias).
    Marca pagados los pedidos, las sesiones pasan a 'pagada'. Sin activas → mesa 'limpiando';
    con activas → nota_cierre "Queda $X sin cobrar (N sesión(es) activa(s))" + alerta al personal.
    Devuelve {total_cobrado, mesa_estado, nota_cierre, sesiones: [ids]}.
    """
    if metodo_pago not in METODOS_PAGO:
        raise ErrorComensal('Método de pago no válido. Usa efectivo, tarjeta o transferencia.')
    ahora = timezone.now()
    with transaction.atomic():
        mesa = _bloquear_mesa(mesa.pk)

        if solicitud is not None:
            solicitud_id = getattr(solicitud, 'pk', solicitud)
            solicitud = SolicitudPago.objects.select_for_update().filter(pk=solicitud_id).first()
            if solicitud is None or solicitud.mesa_id != mesa.pk:
                raise ErrorComensal('Esa solicitud de cuenta no es de esta mesa.')
            if solicitud.estado != 'pendiente':
                raise ErrorComensal('Esa cuenta ya fue cobrada.')
            cubiertas = sesiones_de_solicitud(solicitud)
        else:
            ids = []
            for valor in sesiones or []:
                pk = getattr(valor, 'pk', None) or _uuid_o_none(valor)
                if pk is None:
                    raise ErrorComensal('Hay personas que no están en esta mesa.')
                if pk not in ids:
                    ids.append(pk)
            if not ids:
                raise ErrorComensal('Indica qué cuenta o qué personas vas a cobrar.')
            cubiertas = list(SesionCliente.objects.filter(pk__in=ids))
            if len(cubiertas) != len(ids) or any(s.mesa_id != mesa.pk for s in cubiertas):
                raise ErrorComensal('Hay personas que no están en esta mesa.')
            sin_cuenta = [s.alias for s in cubiertas if s.estado != 'activa']
            if sin_cuenta:
                raise ErrorComensal(f'{", ".join(sin_cuenta)} ya no tiene una cuenta abierta en esta mesa.')

        cubiertas = list(
            SesionCliente.objects.select_for_update()
            .filter(pk__in=[s.pk for s in cubiertas], mesa=mesa, estado='activa')
            .order_by('fecha_inicio')
        )
        if not cubiertas:
            raise ErrorComensal('No hay nada que cobrar en esta cuenta.')
        ids_pedidos = list(pedidos_por_cobrar(cubiertas).select_for_update().values_list('pk', flat=True))
        if not ids_pedidos:
            raise ErrorComensal('No hay consumo por cobrar en esta cuenta.')

        pedidos = Order.objects.filter(pk__in=ids_pedidos)
        suma = totales(pedidos)
        numeros = list(pedidos.order_by('created_at').values_list('order_number', flat=True))
        pedidos.update(is_paid=True, paid_at=ahora, payment_method=metodo_pago, updated_at=ahora)
        ids_sesiones = [s.pk for s in cubiertas]
        SesionCliente.objects.filter(pk__in=ids_sesiones).update(estado='pagada', pagada_at=ahora)
        SolicitudUnion.objects.filter(sesion_id__in=ids_sesiones, estado='pendiente').update(
            estado='expirada', resuelta_at=ahora
        )

        if solicitud is None:
            solicitud = SolicitudPago(
                tenant_id=mesa.tenant_id,
                mesa=mesa,
                tipo='grupal' if len(cubiertas) > 1 else 'individual',
                grupo_id=cubiertas[0].grupo_key,
                solicitada_por=None,
                created_at=ahora,
            )
        solicitud.subtotal, solicitud.iva, solicitud.total = suma['subtotal'], suma['iva'], suma['total']
        solicitud.metodo_pago = metodo_pago
        solicitud.estado = 'procesada'
        solicitud.procesada_at = ahora
        solicitud.procesada_por = usuario if getattr(usuario, 'is_authenticated', False) else None
        solicitud.save()
        solicitud.sesiones_cubiertas.set(ids_sesiones)

        # "Pide la cuenta" de quienes ya pagaron y avisos de saldo anteriores quedan atendidos
        _atender_alertas(AlertaMesero.objects.filter(sesion_id__in=ids_sesiones, tipo='cuenta'), usuario, ahora)
        _atender_alertas(
            AlertaMesero.objects.filter(mesa=mesa, sesion__isnull=True, tipo='personalizado'), usuario, ahora
        )

        _expirar_uniones(ahora, mesa)
        _depurar_solicitudes_pendientes(mesa)
        restantes = list(sesiones_activas(mesa))
        if restantes:
            nota = _nota_saldo(restantes)
            mesa.nota_cierre = nota
            mesa.guest_count = len(restantes)
            mesa.save(update_fields=['nota_cierre', 'guest_count', 'updated_at'])
            AlertaMesero.objects.create(
                tenant_id=mesa.tenant_id, mesa=mesa, sesion=None, tipo='personalizado', mensaje=nota, created_at=ahora
            )
        else:
            liberar_mesa_si_corresponde(mesa)

        registrar(
            usuario, 'comensales.cobrar', mesa,
            mesa=mesa.number, solicitud=solicitud.pk, tipo=solicitud.tipo, metodo_pago=metodo_pago,
            subtotal=suma['subtotal'], iva=suma['iva'], total=suma['total'],
            sesiones=[s.alias for s in cubiertas], pedidos=numeros, mesa_estado=mesa.status,
        )

    return {
        'total_cobrado': f"{suma['total']:.2f}",
        'mesa_estado': mesa.status,
        'nota_cierre': mesa.nota_cierre,
        'sesiones': [str(pk) for pk in ids_sesiones],
        'solicitud': str(solicitud.pk),
    }


def cerrar_mesa(mesa, usuario):
    """Cierre manual del personal (mesas sin consumo): cierra todas las sesiones y libera la mesa"""
    ahora = timezone.now()
    with transaction.atomic():
        mesa = _bloquear_mesa(mesa.pk)
        activas = list(sesiones_activas(mesa))
        if activas and pedidos_por_cobrar(activas).exists():
            raise ErrorComensal('La mesa tiene consumo sin cobrar: cóbralo antes de cerrarla')
        abierto = pedidos_de_mesa_abiertos(mesa).order_by('created_at').first()
        if abierto is not None:
            raise ErrorComensal(
                f'La mesa {mesa.number} tiene el pedido {abierto.order_number} abierto: '
                f'cóbralo o cancélalo antes de cerrarla.'
            )

        sesiones = list(SesionCliente.objects.select_for_update().filter(mesa=mesa, estado__in=['activa', 'pagada']))
        for sesion in sesiones:
            _cerrar_sesion(sesion, 'mesero', ahora)
        SolicitudUnion.objects.filter(sesion__mesa=mesa, estado='pendiente').update(
            estado='expirada', resuelta_at=ahora
        )
        _depurar_solicitudes_pendientes(mesa)
        _atender_alertas(AlertaMesero.objects.filter(mesa=mesa), usuario, ahora)

        estado_anterior = mesa.status
        if mesa.status in ('reservada', 'mantenimiento'):
            # No se pisa una reserva ni un mantenimiento: solo se limpia la nota
            if mesa.nota_cierre:
                mesa.nota_cierre = ''
                mesa.save(update_fields=['nota_cierre', 'updated_at'])
        else:
            mesa.free()

        registrar(
            usuario, 'comensales.cerrar_mesa', mesa,
            mesa=mesa.number, estado_anterior=estado_anterior, sesiones=[s.alias for s in sesiones],
        )
    return {'mesa_estado': mesa.status, 'sesiones_cerradas': len(sesiones)}


def cerrar_sesiones_pagadas(mesa):
    """Mesa lista: las sesiones 'pagada' de la mesa pasan a 'cerrada' (motivo mesa_lista). Devuelve cuántas."""
    ahora = timezone.now()
    with transaction.atomic():
        ids = list(
            SesionCliente.objects.select_for_update().filter(mesa=mesa, estado='pagada').values_list('pk', flat=True)
        )
        if not ids:
            return 0
        cerradas = SesionCliente.objects.filter(pk__in=ids, estado='pagada').update(
            estado='cerrada', cerrada_at=ahora, motivo_cierre='mesa_lista'
        )
        SolicitudUnion.objects.filter(sesion_id__in=ids, estado='pendiente').update(
            estado='expirada', resuelta_at=ahora
        )
        # La mesa vuelve a empezar: avisos de gente que ya no está (o del sistema) dejan de estar pendientes
        _atender_alertas(
            AlertaMesero.objects.filter(mesa=mesa).filter(Q(sesion__isnull=True) | ~Q(sesion__estado='activa')),
            None, ahora
        )
    return cerradas


def resumen_mesas(cafeterias_qs):
    """{mesa_id: {personas, total_pendiente, solicitudes_pendientes, alertas_pendientes}} (solo mesas con algo)"""
    resumen = defaultdict(lambda: {
        'personas': 0, 'total_pendiente': CERO, 'solicitudes_pendientes': 0, 'alertas_pendientes': 0
    })

    personas = (
        SesionCliente.objects.filter(estado='activa', mesa__cafeteria__in=cafeterias_qs)
        .values('mesa_id').annotate(n=Count('id')).order_by()
    )
    for fila in personas:
        resumen[fila['mesa_id']]['personas'] = fila['n']

    pendientes = (
        Order.objects.filter(
            sesion_cliente__estado='activa', sesion_cliente__mesa__cafeteria__in=cafeterias_qs, is_paid=False
        )
        .exclude(status='cancelada')
        .values('sesion_cliente__mesa_id').annotate(total_pendiente=Sum('total')).order_by()
    )
    for fila in pendientes:
        resumen[fila['sesion_cliente__mesa_id']]['total_pendiente'] = fila['total_pendiente'] or CERO

    solicitudes = (
        SolicitudPago.objects.filter(estado='pendiente', mesa__cafeteria__in=cafeterias_qs)
        .values('mesa_id').annotate(n=Count('id')).order_by()
    )
    for fila in solicitudes:
        resumen[fila['mesa_id']]['solicitudes_pendientes'] = fila['n']

    alertas = (
        AlertaMesero.objects.filter(atendida=False, mesa__cafeteria__in=cafeterias_qs)
        .values('mesa_id').annotate(n=Count('id')).order_by()
    )
    for fila in alertas:
        resumen[fila['mesa_id']]['alertas_pendientes'] = fila['n']

    return dict(resumen)
