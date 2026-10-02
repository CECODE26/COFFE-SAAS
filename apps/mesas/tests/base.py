"""Datos mínimos para las pruebas de gestión de mesas (crear, editar, desactivar, borrar)"""
import itertools

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User
from apps.cafeterias.models import Cafeteria
from apps.mesas.models import Mesa
from apps.tenants.models import Tenant

API_MESAS = '/api/v1/mesas/mesas/'
API_RESERVAS = '/api/v1/mesas/reservas/'
API_CLIENTE = '/api/v1/cliente/'
XHR = {'HTTP_X_REQUESTED_WITH': 'XMLHttpRequest'}

# Caché en memoria (límites anti-abuso y lock de limpieza del flujo QR) y tiempos fijos
AJUSTES_PRUEBA = dict(
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'pruebas-mesas',
        }
    },
    COMENSAL_INACTIVIDAD_MIN=15,
    COMENSAL_COOKIE_HORAS=2,
    COMENSAL_PAGADA_CIERRE_MIN=10,
    COMENSAL_UNION_EXPIRA_MIN=5,
    COMENSAL_COOKIE_NOMBRE='coffe_comensal',
)

_secuencia = itertools.count(1)


def crear_tenant():
    n = next(_secuencia)
    return Tenant.objects.create(
        name=f'Cadena {n}', slug=f'cadena-{n}', email=f'cadena{n}@prueba.ec',
        ruc=f'180{n:07d}001', business_name=f'Cadena {n} S.A.',
    )


def crear_cafeteria(tenant, nombre=None, **extra):
    n = next(_secuencia)
    return Cafeteria.objects.create(
        tenant=tenant, name=nombre or f'Café {n}', slug=f'cafe-{n}',
        address='Av. Amazonas y Naciones Unidas', city='Quito', **extra
    )


def crear_mesa(cafeteria, numero, **extra):
    return Mesa.objects.create(
        tenant=cafeteria.tenant, cafeteria=cafeteria, number=numero, slug=f'mesa-{numero}', **extra
    )


def crear_usuario(rol, tenant=None, cafeteria=None):
    n = next(_secuencia)
    return User.objects.create_user(
        email=f'{rol}{n}@prueba.ec', password='clave-prueba-123', first_name=rol.title(),
        last_name=str(n), tenant=tenant, cafeteria=cafeteria, role=rol,
    )


@override_settings(**AJUSTES_PRUEBA)
class PruebaMesas(APITestCase):
    """
    Dos cadenas: la nuestra (self.tenant) con dos locales (self.cafe con mesas 1-3 y self.cafe2 con la 1)
    y otra cadena (self.otro_cafe con la mesa 1). Personal de cada rol en self.cafe.
    """

    def setUp(self):
        super().setUp()
        cache.clear()
        self.tenant = crear_tenant()
        self.cafe = crear_cafeteria(self.tenant, 'Café La Floresta')
        self.cafe2 = crear_cafeteria(self.tenant, 'Café Cumbayá')
        self.mesas = [crear_mesa(self.cafe, n, location='Terraza') for n in (1, 2, 3)]
        self.mesa = self.mesas[0]
        self.mesa_cafe2 = crear_mesa(self.cafe2, 1)

        self.otro_tenant = crear_tenant()
        self.otro_cafe = crear_cafeteria(self.otro_tenant, 'Café del Pacífico')
        self.mesa_otro = crear_mesa(self.otro_cafe, 1)

        self.cafe_admin = crear_usuario('cafe_admin', self.tenant, self.cafe)
        self.gerente = crear_usuario('gerente', self.tenant, self.cafe)
        self.camarero = crear_usuario('camarero', self.tenant, self.cafe)
        self.cajero = crear_usuario('cajero', self.tenant, self.cafe)
        self.cocinero = crear_usuario('cocinero', self.tenant, self.cafe)
        self.distribuidor = crear_usuario('distribuidor_admin', self.tenant)
        self.super_admin = crear_usuario('super_admin')

    def como(self, usuario):
        client = APIClient()
        client.force_authenticate(usuario)
        return client

    def crear(self, usuario, **datos):
        return self.como(usuario).post(API_MESAS, datos, format='json')

    def editar(self, usuario, mesa, **datos):
        return self.como(usuario).patch(f'{API_MESAS}{mesa.pk}/', datos, format='json')

    def accion(self, usuario, mesa, nombre, datos=None):
        return self.como(usuario).post(f'{API_MESAS}{mesa.pk}/{nombre}/', datos or {}, format='json')

    def listar(self, usuario, **params):
        r = self.como(usuario).get(API_MESAS, {'page_size': 500, **params})
        self.assertEqual(r.status_code, 200, r.content)
        return r.data['results']

    def bienvenida(self, qr):
        return APIClient().get(API_CLIENTE + 'bienvenida/', {'mesa': qr})

    def entrar_por_qr(self, mesa, nombre='Ana'):
        r = APIClient().post(API_CLIENTE + 'entrar/', {'mesa': mesa.qr_code, 'nombre': nombre}, format='json', **XHR)
        self.assertEqual(r.status_code, 200, r.content)
        return r
