"""
Planes de las cafeterías. El plan es de cada local (el cliente que paga), no del distribuidor.

Catálogo único del backend. ESPEJO: frontend/src/config/site.js (PLANS: id, name y price). Si cambias un
código, un nombre o un precio aquí, cámbialo también allá (y al revés); la prueba
apps/cafeterias/tests/test_planes.py::CatalogoSincronizadoTests avisa si se desincronizan.

Precios mensuales por local, en dólares y SIN IVA (la factura suma el IVA aparte).
"""
from decimal import Decimal

IVA_PORCENTAJE = 15
IVA = Decimal(IVA_PORCENTAJE) / 100
NOTA_IVA = f'Precios en dólares, más IVA ({IVA_PORCENTAJE}%).'

# ESPEJO: PLAN_POR_DEFECTO de frontend/src/lib/planes.js (lo revisa la misma prueba)
PLAN_POR_DEFECTO = 'mensual'

# Orden = orden en que se muestran. facturacion_sri: incluida en el plan pero aún no disponible (próximamente).
PLANES = {
    'mensual': {'nombre': 'Mensual', 'precio_mensual': Decimal('70.00'), 'facturacion_sri': False},
    'pro': {'nombre': 'Mensual Pro', 'precio_mensual': Decimal('90.00'), 'facturacion_sri': True},
}

PLAN_CHOICES = [(codigo, datos['nombre']) for codigo, datos in PLANES.items()]

MENSAJE_PLAN_INVALIDO = 'Plan inválido: elige Mensual o Mensual Pro.'


def con_iva(monto):
    """Monto más IVA, redondeado a centavos"""
    return (monto * (1 + IVA)).quantize(Decimal('0.01'))


def info_plan(codigo):
    """
    Código, nombre y precio de un plan, listo para la API. Los montos van como texto con 2 decimales
    ("70.00"), igual que los DecimalField de DRF en el resto de la API.
    """
    if codigo not in PLANES:
        codigo = PLAN_POR_DEFECTO
    datos = PLANES[codigo]
    return {
        'codigo': codigo,
        'nombre': datos['nombre'],
        'precio_mensual': str(datos['precio_mensual']),
        'precio_con_iva': str(con_iva(datos['precio_mensual'])),
        'iva_porcentaje': IVA_PORCENTAJE,
        'facturacion_sri': datos['facturacion_sri'],
    }
