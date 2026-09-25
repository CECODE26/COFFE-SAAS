"""Entrada (validación) y salida (JSON exacto del contrato) de la API de comensales"""
from collections import OrderedDict, defaultdict
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import serializers

from apps.menu.models import Category, MenuItem
from apps.pedidos.models import Order

from .models import AlertaMesero, SesionCliente, SolicitudPago, SolicitudUnion
from . import services

ESTADO_CLIENTE = {
    'pendiente': 'enviado',
    'confirmada': 'en_cocina',
    'preparando': 'preparando',
    'lista': 'listo',
    'entregada': 'entregado',
    'cancelada': 'cancelado',
}
METODOS = [c[0] for c in SolicitudPago.METODO_CHOICES]


# ---------------------------------------------------------------------------
# Entrada
# ---------------------------------------------------------------------------

def primer_error(errores):
    """Primer mensaje legible de los errores de un serializer (para 'detail')"""
    if isinstance(errores, dict):
        for valor in errores.values():
            mensaje = primer_error(valor)
            if mensaje:
                return mensaje
    elif isinstance(errores, (list, tuple)):
        for valor in errores:
            mensaje = primer_error(valor)
            if mensaje:
                return mensaje
    elif errores:
        return str(errores)
    return ''


class EntrarSerializer(serializers.Serializer):
    mesa = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='', max_length=255)
    nombre = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='', max_length=500)
    grupo = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None, max_length=64)


class ReconectarSerializer(serializers.Serializer):
    mesa = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='', max_length=255)
    nombre = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='', max_length=500)
    codigo = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='', max_length=10)


class LineaPedidoSerializer(serializers.Serializer):
    menu_item = serializers.UUIDField(error_messages={'invalid': 'Producto no válido.'})
    cantidad = serializers.IntegerField(
        min_value=1, max_value=20,
        error_messages={
            'min_value': 'La cantidad debe estar entre 1 y 20.',
            'max_value': 'La cantidad debe estar entre 1 y 20.',
            'invalid': 'La cantidad debe ser un número.',
        },
    )
    nota = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='', max_length=200)


class CrearPedidoSerializer(serializers.Serializer):
    items = LineaPedidoSerializer(many=True, allow_empty=False, error_messages={
        'empty': 'Tu pedido está vacío.', 'required': 'Tu pedido está vacío.', 'not_a_list': 'Tu pedido está vacío.',
    })
    nota = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='', max_length=500)

    def validate_items(self, value):
        if len(value) > 30:
            raise serializers.ValidationError('Un pedido puede tener hasta 30 productos distintos.')
        return value


class AlertaSerializer(serializers.Serializer):
    tipo = serializers.ChoiceField(
        choices=['ayuda', 'personalizado'], default='ayuda',
        error_messages={'invalid_choice': 'Tipo de aviso no válido.'},
    )
    mensaje = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default='', max_length=200,
        error_messages={'max_length': 'El mensaje puede tener hasta 200 caracteres.'},
    )

    def validate(self, attrs):
        attrs['mensaje'] = (attrs.get('mensaje') or '').strip()
        if attrs['tipo'] == 'personalizado' and not attrs['mensaje']:
            raise serializers.ValidationError({'mensaje': 'Escribe tu mensaje para el personal.'})
        return attrs


class PedirCuentaSerializer(serializers.Serializer):
    tipo = serializers.ChoiceField(
        choices=['individual', 'grupal'], default='individual',
        error_messages={'invalid_choice': 'Tipo de cuenta no válido: usa individual o grupal.'},
    )
    metodo_preferido = serializers.ChoiceField(
        choices=METODOS, required=False, allow_blank=True, allow_null=True, default='',
        error_messages={'invalid_choice': 'Método de pago no válido: usa efectivo, tarjeta o transferencia.'},
    )
    confirmar = serializers.BooleanField(required=False, default=False)


class CobrarSerializer(serializers.Serializer):
    metodo_pago = serializers.ChoiceField(
        choices=METODOS,
        error_messages={
            'required': 'Debes indicar el método de pago: efectivo, tarjeta o transferencia.',
            'null': 'Debes indicar el método de pago: efectivo, tarjeta o transferencia.',
            'invalid_choice': 'Método de pago "{input}" no válido. Usa efectivo, tarjeta o transferencia.',
        },
    )
    solicitud = serializers.UUIDField(required=False, allow_null=True, default=None)
    sesiones = serializers.ListField(child=serializers.UUIDField(), required=False, allow_empty=True, default=list)


# ---------------------------------------------------------------------------
# Salida: utilidades
# ---------------------------------------------------------------------------

def dinero(valor):
    return f'{Decimal(valor or 0):.2f}'


def fecha(valor):
    return timezone.localtime(valor).isoformat() if valor else None


def url_archivo(request, archivo):
    """URL absoluta de un ImageField (None si no tiene archivo)"""
    if not archivo:
        return None
    try:
        url = archivo.url
    except ValueError:
        return None
    return request.build_absolute_uri(url) if request is not None else url


def datos_local(mesa, request, banner=False):
    cafeteria = mesa.cafeteria
    datos = {
        'nombre': cafeteria.name,
        'logo': url_archivo(request, cafeteria.logo) or url_archivo(request, mesa.tenant.logo),
    }
    if banner:
        datos['banner'] = url_archivo(request, cafeteria.banner)
    return datos


def datos_mesa(mesa, request, sesion=None):
    """{numero, zona, local}; con `sesion`, además `qr`: el QR vigente solo si esa sesión lo conoce (None si
    la mesa lo regeneró después de que entrara)"""
    datos = {'numero': mesa.number, 'zona': mesa.location, 'local': datos_local(mesa, request)}
    if sesion is not None:
        datos['qr'] = sesion.qr_vigente()
    return datos


def items_vigentes(pedido):
    """Ítems no cancelados del pedido (usa el prefetch items__menu_item). Un ítem cancelado no se cobra."""
    return [item for item in pedido.items.all() if item.status != 'cancelada']


def pedido_cliente(pedido):
    """Pedido como lo ve el comensal (necesita select_related('sesion_cliente') y prefetch items__menu_item)"""
    return {
        'id': str(pedido.id),
        'numero': pedido.order_number,
        'estado': pedido.status,
        'estado_cliente': ESTADO_CLIENTE.get(pedido.status, pedido.status),
        'alias': pedido.sesion_cliente.alias if pedido.sesion_cliente_id else pedido.customer_name,
        'items': [
            {
                'nombre': item.menu_item.name,
                'cantidad': item.quantity,
                'precio': dinero(item.get_unit_price()),
                'nota': item.notes,
            }
            for item in items_vigentes(pedido)
        ],
        'nota': pedido.notes,
        'subtotal': dinero(pedido.subtotal),
        'iva': dinero(pedido.tax),
        'total': dinero(pedido.total),
        'is_paid': pedido.is_paid,
        'created_at': fecha(pedido.created_at),
    }


def pedidos_de(sesiones):
    return (
        Order.objects.filter(sesion_cliente__in=sesiones)
        .select_related('sesion_cliente')
        .prefetch_related('items__menu_item')
        .order_by('created_at')
    )


def datos_solicitud(solicitud):
    """{id, tipo, total, metodo_preferido}: total vivo si está pendiente (puede haber pedidos nuevos)"""
    if solicitud.estado == 'pendiente':
        vivas = services.sesiones_de_solicitud(solicitud)
        total = services.totales(services.pedidos_por_cobrar(vivas))['total'] if vivas else Decimal('0')
    else:
        total = solicitud.total
    return {
        'id': str(solicitud.id),
        'tipo': solicitud.tipo,
        'total': dinero(total),
        'metodo_preferido': solicitud.metodo_preferido,
    }


# ---------------------------------------------------------------------------
# Salida: cliente
# ---------------------------------------------------------------------------

def datos_sesion(sesion, request):
    """GET /cliente/sesion/ (polling)"""
    mesa = sesion.mesa
    limite_union = timezone.now() - timedelta(minutes=settings.COMENSAL_UNION_EXPIRA_MIN)
    activa = sesion.estado == 'activa'

    integrantes = [s.alias for s in sesion.sesiones_de_grupo().order_by('fecha_inicio')]
    if sesion.alias not in integrantes:
        integrantes.append(sesion.alias)

    union_pendiente = None
    solicitudes_union = []
    if activa:
        union = (
            SolicitudUnion.objects.filter(sesion=sesion, estado='pendiente', created_at__gte=limite_union)
            .select_related('grupo').order_by('-created_at').first()
        )
        if union is not None:
            nombres = [s.alias for s in union.grupo.sesiones_de_grupo().order_by('fecha_inicio')]
            if nombres:
                union_pendiente = {'id': str(union.id), 'nombres': nombres}
        solicitudes_union = [
            {'id': str(u.id), 'alias': u.sesion.alias, 'created_at': fecha(u.created_at)}
            for u in SolicitudUnion.objects.filter(
                grupo_id=sesion.grupo_key, estado='pendiente', created_at__gte=limite_union,
                sesion__estado='activa', sesion__mesa_id=sesion.mesa_id,
            ).select_related('sesion').order_by('created_at')
        ]

    cuenta = None
    if activa:
        pendientes = [
            s for s in (services.solicitud_pendiente(sesion, 'grupal'), services.solicitud_pendiente(sesion, 'individual'))
            if s is not None
        ]
        if pendientes:
            reciente = max(pendientes, key=lambda s: s.created_at)
            datos = datos_solicitud(reciente)
            cuenta = {'id': datos['id'], 'tipo': datos['tipo'], 'total': datos['total']}

    return {
        'id': str(sesion.id),
        'alias': sesion.alias,
        'estado': sesion.estado,
        'es_fundador': sesion.grupo_id is None,
        'grupo': {'id': str(sesion.grupo_key), 'integrantes': integrantes},
        'mesa': datos_mesa(mesa, request, sesion=sesion),
        'union_pendiente': union_pendiente,
        'solicitudes_union': solicitudes_union,
        'cuenta_pendiente': cuenta,
        'ticket': datos_ticket(sesion, request) if sesion.estado == 'pagada' else None,
    }


def datos_menu(sesion, request):
    """GET /cliente/menu/: categorías activas con ítems activos y disponibles. NUNCA costo ni margen."""
    mesa = sesion.mesa
    productos = (
        MenuItem.objects.filter(tenant_id=mesa.tenant_id, is_active=True, is_available=True)
        .filter(Q(category__isnull=True) | Q(category__is_active=True))
        .order_by('name')
    )
    por_categoria = defaultdict(list)
    for producto in productos:
        por_categoria[producto.category_id].append({
            'id': str(producto.id),
            'nombre': producto.name,
            'descripcion': producto.description,
            'precio': dinero(producto.price),
            'imagen': url_archivo(request, producto.image),
            'vegetariano': producto.is_vegetarian,
            'vegano': producto.is_vegan,
            'gluten': producto.has_gluten,
            'tiempo': producto.preparation_time,
        })

    categorias = [
        {'id': str(c.id), 'nombre': c.name, 'icono': c.icon, 'items': por_categoria[c.id]}
        for c in Category.objects.filter(tenant_id=mesa.tenant_id, is_active=True).order_by('order', 'name')
        if por_categoria.get(c.id)
    ]
    if por_categoria.get(None):
        categorias.append({'id': None, 'nombre': 'Otros', 'icono': '', 'items': por_categoria[None]})

    return {
        'local': datos_local(mesa, request, banner=True),
        'mesa': {'numero': mesa.number, 'zona': mesa.location},
        'categorias': categorias,
    }


def datos_cuenta(sesion, tipo):
    """GET /cliente/cuenta/: solo pedidos no cancelados y no pagados"""
    sesiones = services.sesiones_para_cuenta(sesion, tipo)
    pedidos = list(pedidos_de(sesiones).filter(is_paid=False).exclude(status='cancelada'))
    integrantes = []
    for integrante in sesiones:
        propios = [p for p in pedidos if p.sesion_cliente_id == integrante.pk]
        integrantes.append({
            'alias': integrante.alias,
            'pedidos': [pedido_cliente(p) for p in propios],
            'subtotal': dinero(sum((p.subtotal for p in propios), Decimal('0'))),
            'iva': dinero(sum((p.tax for p in propios), Decimal('0'))),
            'total': dinero(sum((p.total for p in propios), Decimal('0'))),
        })
    pendiente = services.solicitud_pendiente(sesion, tipo) if sesion.estado == 'activa' else None
    return {
        'tipo': tipo,
        'integrantes': integrantes,
        'subtotal': dinero(sum((p.subtotal for p in pedidos), Decimal('0'))),
        'iva': dinero(sum((p.tax for p in pedidos), Decimal('0'))),
        'total': dinero(sum((p.total for p in pedidos), Decimal('0'))),
        'sin_entregar': sum(1 for p in pedidos if p.status != 'entregada'),
        'solicitud_pendiente': datos_solicitud(pendiente) if pendiente is not None else None,
    }


def datos_ticket(sesion, request):
    """
    Ticket del consumo PROPIO de esta sesión. La cuenta cobrada se busca por sus sesiones_cubiertas
    (nunca "la última de la mesa"); si fue grupal, total_cobrado es lo que pagó todo el grupo.
    """
    if sesion.estado != 'pagada':
        return None
    solicitud = sesion.solicitudes_pago.filter(estado='procesada').order_by('-procesada_at').first()
    if solicitud is None:
        return None

    cubiertas = list(solicitud.sesiones_cubiertas.all().order_by('fecha_inicio'))
    pedidos = list(
        pedidos_de([sesion]).filter(is_paid=True).exclude(status='cancelada')
    )
    lineas = OrderedDict()
    for pedido in pedidos:
        for item in items_vigentes(pedido):
            precio = item.get_unit_price()
            clave = (item.menu_item_id, precio)
            linea = lineas.setdefault(clave, {'nombre': item.menu_item.name, 'cantidad': 0, 'precio': precio})
            linea['cantidad'] += item.quantity

    mesa = sesion.mesa
    cafeteria = mesa.cafeteria
    local = datos_local(mesa, request)
    local.update({
        'direccion': cafeteria.address,
        'telefono': cafeteria.phone,
        'ruc': cafeteria.ruc or mesa.tenant.ruc,
        'razon_social': mesa.tenant.business_name,
    })
    return {
        'local': local,
        'mesa': {'numero': mesa.number, 'zona': mesa.location},
        'alias': sesion.alias,
        'tipo': solicitud.tipo,
        'integrantes': [s.alias for s in cubiertas],
        'fecha': fecha(solicitud.procesada_at),
        'items': [
            {
                'nombre': linea['nombre'],
                'cantidad': linea['cantidad'],
                'precio': dinero(linea['precio']),
                'total': dinero(linea['precio'] * linea['cantidad']),
            }
            for linea in lineas.values()
        ],
        'pedidos': [p.order_number for p in pedidos],
        'subtotal': dinero(sum((p.subtotal for p in pedidos), Decimal('0'))),
        'iva': dinero(sum((p.tax for p in pedidos), Decimal('0'))),
        'total': dinero(sum((p.total for p in pedidos), Decimal('0'))),
        'total_cobrado': dinero(solicitud.total),
        'metodo_pago': solicitud.metodo_pago,
        'metodo_pago_nombre': services.METODOS_PAGO.get(solicitud.metodo_pago, solicitud.metodo_pago),
        'solicitud_id': str(solicitud.id),
    }


# ---------------------------------------------------------------------------
# Salida: personal
# ---------------------------------------------------------------------------

def alerta_personal(alerta, con_mesa=False):
    datos = {
        'id': str(alerta.id),
        'tipo': alerta.tipo,
        'mensaje': alerta.mensaje,
        'alias': alerta.sesion.alias if alerta.sesion_id else None,
        'created_at': fecha(alerta.created_at),
    }
    if con_mesa:
        datos['mesa'] = {'id': str(alerta.mesa_id), 'numero': alerta.mesa.number, 'zona': alerta.mesa.location}
    return datos


def detalle_mesa_personal(mesa):
    """GET /comensales/mesas/<id>/: grupos con sesiones activas o pagadas (no cerradas), cuentas, uniones y alertas"""
    sesiones = list(
        SesionCliente.objects.filter(mesa=mesa, estado__in=['activa', 'pagada']).order_by('fecha_inicio')
    )
    estadisticas = {
        fila['sesion_cliente_id']: fila
        for fila in Order.objects.filter(sesion_cliente__in=sesiones).exclude(status='cancelada')
        .values('sesion_cliente_id')
        .annotate(n=Count('id'), por_cobrar=Sum('total', filter=Q(is_paid=False)))
        .order_by()
    }

    grupos = OrderedDict()
    for sesion in sesiones:
        grupo = grupos.setdefault(sesion.grupo_key, {'id': str(sesion.grupo_key), 'integrantes': [], 'por_cobrar': Decimal('0')})
        fila = estadisticas.get(sesion.pk, {})
        por_cobrar = fila.get('por_cobrar') or Decimal('0')
        grupo['integrantes'].append({
            'id': str(sesion.id),
            'alias': sesion.alias,
            'estado': sesion.estado,
            'fecha_inicio': fecha(sesion.fecha_inicio),
            'ultima_actividad': fecha(sesion.ultima_actividad),
            'pedidos': fila.get('n', 0),
            'por_cobrar': dinero(por_cobrar),
        })
        grupo['por_cobrar'] += por_cobrar
    for grupo in grupos.values():
        grupo['por_cobrar'] = dinero(grupo['por_cobrar'])

    solicitudes_pago = []
    for solicitud in (
        SolicitudPago.objects.filter(mesa=mesa, estado='pendiente')
        .select_related('solicitada_por', 'grupo').order_by('created_at')
    ):
        vivas = services.sesiones_de_solicitud(solicitud)
        total = services.totales(services.pedidos_por_cobrar(vivas))['total'] if vivas else Decimal('0')
        solicitudes_pago.append({
            'id': str(solicitud.id),
            'tipo': solicitud.tipo,
            'grupo': str(solicitud.grupo_id),
            'solicitada_por': solicitud.solicitada_por.alias if solicitud.solicitada_por_id else None,
            'metodo_preferido': solicitud.metodo_preferido,
            'total': dinero(total),
            'created_at': fecha(solicitud.created_at),
            'sesiones': [str(s.id) for s in vivas],
            'integrantes': [s.alias for s in vivas],
        })

    limite_union = timezone.now() - timedelta(minutes=settings.COMENSAL_UNION_EXPIRA_MIN)
    solicitudes_union = []
    for union in (
        SolicitudUnion.objects.filter(
            sesion__mesa=mesa, estado='pendiente', created_at__gte=limite_union, sesion__estado='activa'
        ).select_related('sesion', 'grupo').order_by('created_at')
    ):
        solicitudes_union.append({
            'id': str(union.id),
            'alias': union.sesion.alias,
            'grupo_nombres': [s.alias for s in union.grupo.sesiones_de_grupo().order_by('fecha_inicio')],
            'created_at': fecha(union.created_at),
        })

    alertas = [
        alerta_personal(a)
        for a in AlertaMesero.objects.filter(mesa=mesa, atendida=False).select_related('sesion').order_by('created_at')
    ]

    return {
        'mesa': {
            'id': str(mesa.id),
            'numero': mesa.number,
            'zona': mesa.location,
            'estado': mesa.status,
            'nota_cierre': mesa.nota_cierre,
            'qr_code': mesa.qr_code,
        },
        'grupos': list(grupos.values()),
        'solicitudes_pago': solicitudes_pago,
        'solicitudes_union': solicitudes_union,
        'alertas': alertas,
    }
