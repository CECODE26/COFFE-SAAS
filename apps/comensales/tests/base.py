"""Datos mínimos y utilidades compartidas por las pruebas del flujo de pedidos por QR"""
import itertools
import uuid
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User
from apps.cafeterias.models import Cafeteria
from apps.comensales.models import SesionCliente
from apps.comensales.services import CLAVE_LIMPIEZA
from apps.menu.models import Category, MenuItem
from apps.mesas.models import Mesa
from apps.pedidos.models import Order
from apps.tenants.models import Tenant

XHR = {'HTTP_X_REQUESTED_WITH': 'XMLHttpRequest'}
COOKIE = 'coffe_comensal'
CLAVE = 'clave-prueba-123'

API_CLIENTE = '/api/v1/cliente/'
API_PERSONAL = '/api/v1/comensales/'
API_MESAS = '/api/v1/mesas/mesas/'
API_PEDIDOS = '/api/v1/pedidos/orders/'

MENSAJE_SIN_MESA = 'Escanea el QR de tu mesa'
MENSAJE_EN_CIERRE = 'Estamos preparando tu mesa. Pide ayuda al personal o intenta en unos minutos.'
MENSAJE_RESERVADA = 'Esta mesa está reservada. Pide al personal que te ubique.'
MENSAJE_NO_DISPONIBLE = 'Esta mesa no está disponible en este momento. Pide ayuda al personal.'

# Caché en memoria (aísla los límites anti-abuso y el lock de limpieza) y tiempos fijos del contrato,
# para que las pruebas no dependan de las variables de entorno del contenedor
AJUSTES_PRUEBA = dict(
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'pruebas-comensales',
        }
    },
    COMENSAL_INACTIVIDAD_MIN=15,
    COMENSAL_COOKIE_HORAS=2,
    COMENSAL_PAGADA_CIERRE_MIN=10,
    COMENSAL_UNION_EXPIRA_MIN=5,
    COMENSAL_COOKIE_NOMBRE=COOKIE,
)

_secuencia = itertools.count(1)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def crear_tenant():
    n = next(_secuencia)
    return Tenant.objects.create(
        name=f'Distribuidor {n}', slug=f'distribuidor-{n}', email=f'distribuidor{n}@prueba.ec',
        ruc=f'179{n:07d}001', business_name=f'Distribuidor {n} S.A.',
    )


def crear_cafeteria(tenant, nombre=None):
    n = next(_secuencia)
    return Cafeteria.objects.create(
        tenant=tenant, name=nombre or f'Café {n}', slug=f'cafe-{n}',
        address='Av. 12 de Octubre y Coruña', city='Quito', phone='022450000',
    )


def crear_mesa(cafeteria, numero, zona='Terraza', **extra):
    return Mesa.objects.create(
        tenant=cafeteria.tenant, cafeteria=cafeteria, number=numero, slug=f'mesa-{numero}',
        location=zona, **extra
    )


def crear_usuario(rol, tenant=None, cafeteria=None):
    n = next(_secuencia)
    return User.objects.create_user(
        email=f'{rol}{n}@prueba.ec', password=CLAVE, first_name=rol.replace('_', ' ').title(),
        last_name=str(n), tenant=tenant, cafeteria=cafeteria, role=rol,
    )


def crear_local(num_mesas=4):
    """Distribuidor con un local abierto, mesas, un menú mínimo y personal por rol"""
    tenant = crear_tenant()
    cafe = crear_cafeteria(tenant, 'Café La Floresta')
    mesas = [crear_mesa(cafe, n, 'Terraza' if n % 2 else 'Salón') for n in range(1, num_mesas + 1)]
    bebidas = Category.objects.create(tenant=tenant, name='Bebidas', slug='bebidas', icon='coffee', order=1)
    comida = Category.objects.create(tenant=tenant, name='Sánduches', slug='sanduches', icon='sandwich', order=2)
    cappuccino = MenuItem.objects.create(
        tenant=tenant, category=bebidas, name='Cappuccino', slug='cappuccino', description='Espresso y leche',
        price=Decimal('2.80'), cost=Decimal('0.90'), preparation_time=5, is_vegetarian=True,
    )
    sanduche = MenuItem.objects.create(
        tenant=tenant, category=comida, name='Sánduche de pernil', slug='sanduche-pernil',
        description='Pan de la casa', price=Decimal('4.50'), cost=Decimal('1.70'), preparation_time=10,
        has_gluten=True,
    )
    return SimpleNamespace(
        tenant=tenant, cafe=cafe, mesas=mesas, mesa=mesas[0], bebidas=bebidas, comida=comida,
        cappuccino=cappuccino, sanduche=sanduche,
        cajero=crear_usuario('cajero', tenant, cafe),
        camarero=crear_usuario('camarero', tenant, cafe),
        cocinero=crear_usuario('cocinero', tenant, cafe),
        cafe_admin=crear_usuario('cafe_admin', tenant, cafe),
        distribuidor=crear_usuario('distribuidor_admin', tenant),
    )


def hace(minutos=0, horas=0):
    return timezone.now() - timedelta(minutes=minutos, hours=horas)


# ---------------------------------------------------------------------------
# Comensal: un navegador (APIClient con su cookie) sentado en una mesa
# ---------------------------------------------------------------------------

class Comensal:
    def __init__(self, client, sesion_id):
        self.client = client
        self.id = uuid.UUID(str(sesion_id))

    @property
    def sesion(self):
        return SesionCliente.objects.get(pk=self.id)

    @property
    def token(self):
        return self.client.cookies[COOKIE].value

    def get(self, ruta, params=None):
        return self.client.get(API_CLIENTE + ruta, params or {})

    def post(self, ruta, datos=None, xhr=True):
        return self.client.post(API_CLIENTE + ruta, datos or {}, format='json', **(XHR if xhr else {}))

    def pedir(self, *lineas, nota=''):
        """lineas: (producto, cantidad)"""
        datos = {'items': [{'menu_item': str(p.pk), 'cantidad': c} for p, c in lineas]}
        if nota:
            datos['nota'] = nota
        return self.post('pedidos/', datos)

    def pedir_cuenta(self, tipo='individual', confirmar=False, metodo=''):
        datos = {'tipo': tipo, 'confirmar': confirmar}
        if metodo:
            datos['metodo_preferido'] = metodo
        return self.post('cuenta/', datos)


# ---------------------------------------------------------------------------
# Base de las pruebas
# ---------------------------------------------------------------------------

class FlujoQRMixin:
    """Atajos para las pruebas: entrar por la API, pedir, envejecer sesiones, clientes del personal"""

    def preparar_local(self):
        cache.clear()
        self.local = crear_local()
        self.mesa = self.local.mesa
        self.mesa2 = self.local.mesas[1]
        self.cappuccino = self.local.cappuccino
        self.sanduche = self.local.sanduche

    # ---- cliente ----

    def post_entrar(self, client, nombre, mesa=None, grupo=None, qr=None):
        datos = {'mesa': qr if qr is not None else (mesa or self.mesa).qr_code, 'nombre': nombre}
        if grupo is not None:
            datos['grupo'] = str(grupo)
        return client.post(API_CLIENTE + 'entrar/', datos, format='json', **XHR)

    def entrar(self, nombre, mesa=None, grupo=None, client=None):
        client = client or APIClient()
        r = self.post_entrar(client, nombre, mesa=mesa, grupo=grupo)
        self.assertEqual(r.status_code, 200, r.content)
        return Comensal(client, r.data['sesion']['id'])

    def bienvenida(self, qr=None, client=None):
        client = client or APIClient()
        return client.get(API_CLIENTE + 'bienvenida/', {} if qr is None else {'mesa': qr})

    def pedido_de(self, response):
        self.assertEqual(response.status_code, 201, response.content)
        return Order.objects.get(pk=response.data['id'])

    def unir(self, fundadora, nombre, mesa=None):
        """Entra eligiendo el grupo de `fundadora` y ella acepta la solicitud"""
        nuevo = self.entrar(nombre, mesa=mesa, grupo=fundadora.id)
        solicitud = nuevo.sesion.solicitudes_union.get(estado='pendiente')
        r = fundadora.post(f'union/{solicitud.pk}/aceptar/')
        self.assertEqual(r.status_code, 200, r.content)
        return nuevo

    # ---- tiempo ----

    def envejecer(self, comensal, minutos):
        """Última actividad hace `minutos` (inactividad sin tocar el reloj)"""
        SesionCliente.objects.filter(pk=comensal.id).update(ultima_actividad=hace(minutos))

    def permitir_limpieza_global(self):
        """La limpieza global corre máx. 1 vez por minuto: se suelta el lock para la próxima llamada"""
        cache.delete(CLAVE_LIMPIEZA)

    # ---- personal ----

    def personal(self, usuario=None):
        client = APIClient()
        client.force_authenticate(usuario or self.local.cajero)
        return client

    def cobrar(self, datos, usuario=None, mesa=None):
        return self.personal(usuario).post(
            f'{API_PERSONAL}mesas/{(mesa or self.mesa).pk}/cobrar/', datos, format='json'
        )

    def recargar_mesa(self, mesa=None):
        mesa = mesa or self.mesa
        mesa.refresh_from_db()
        return mesa


@override_settings(**AJUSTES_PRUEBA)
class PruebaQR(FlujoQRMixin, APITestCase):
    """APITestCase con un local listo (self.local, self.mesa, self.mesa2, self.cappuccino, self.sanduche)"""

    def setUp(self):
        super().setUp()
        self.preparar_local()
