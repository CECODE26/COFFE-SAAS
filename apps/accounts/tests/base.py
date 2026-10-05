"""Datos mínimos para las pruebas de usuarios: quién crea a quién y quién gestiona a quién"""
import itertools

from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User
from apps.cafeterias.models import Cafeteria
from apps.tenants.models import Tenant

API_USERS = '/api/v1/auth/users/'

AJUSTES_PRUEBA = dict(
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'pruebas-usuarios',
        }
    },
)

_secuencia = itertools.count(1)


def crear_tenant(**extra):
    n = next(_secuencia)
    datos = dict(
        name=f'Cadena {n}', slug=f'cadena-{n}', email=f'cadena{n}@prueba.ec',
        ruc=f'170{n:07d}001', business_name=f'Cadena {n} S.A.', plan='basic', max_cafes=5, max_users=50,
    )
    datos.update(extra)
    return Tenant.objects.create(**datos)


def crear_cafeteria(tenant, nombre=None):
    n = next(_secuencia)
    return Cafeteria.objects.create(
        tenant=tenant, name=nombre or f'Café {n}', slug=f'cafe-{n}',
        address='Av. Amazonas y Naciones Unidas', city='Quito',
    )


def crear_usuario(rol, tenant=None, cafeteria=None):
    n = next(_secuencia)
    return User.objects.create_user(
        email=f'{rol}{n}@prueba.ec', password='clave-prueba-123', first_name=rol.title(),
        last_name=str(n), tenant=tenant, cafeteria=cafeteria, role=rol,
    )


@override_settings(**AJUSTES_PRUEBA)
class PruebaUsuarios(APITestCase):
    """
    Nuestra cadena (self.tenant) con dos locales (self.cafe y self.cafe2) y otra cadena (self.otro_cafe).
    Personal de cada rol en self.cafe, un camarero en self.cafe2 y otro en la otra cadena.
    """

    def setUp(self):
        super().setUp()
        self.tenant = crear_tenant()
        self.cafe = crear_cafeteria(self.tenant, 'Café La Floresta')
        self.cafe2 = crear_cafeteria(self.tenant, 'Café Cumbayá')
        self.otro_tenant = crear_tenant()
        self.otro_cafe = crear_cafeteria(self.otro_tenant, 'Café del Pacífico')

        self.super_admin = crear_usuario('super_admin')
        self.distribuidor = crear_usuario('distribuidor_admin', self.tenant)
        self.cafe_admin = crear_usuario('cafe_admin', self.tenant, self.cafe)
        self.gerente = crear_usuario('gerente', self.tenant, self.cafe)
        self.camarero = crear_usuario('camarero', self.tenant, self.cafe)
        self.cajero = crear_usuario('cajero', self.tenant, self.cafe)
        self.cocinero = crear_usuario('cocinero', self.tenant, self.cafe)
        self.usuario = crear_usuario('usuario', self.tenant)
        self.camarero_cafe2 = crear_usuario('camarero', self.tenant, self.cafe2)
        self.otro_distribuidor = crear_usuario('distribuidor_admin', self.otro_tenant)
        self.camarero_otro = crear_usuario('camarero', self.otro_tenant, self.otro_cafe)

    def como(self, usuario):
        client = APIClient()
        client.force_authenticate(usuario)
        return client

    def datos_usuario(self, rol, **extra):
        n = next(_secuencia)
        datos = dict(
            email=f'Nuevo{n}@Prueba.ec', first_name='Ana', last_name=f'Prueba {n}',
            password='clave-segura-123', password2='clave-segura-123', role=rol,
        )
        datos.update(extra)
        return datos

    def crear_usuario_api(self, creador, rol, **extra):
        return self.como(creador).post(API_USERS, self.datos_usuario(rol, **extra), format='json')
