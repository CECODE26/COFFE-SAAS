"""Datos y utilidades de las pruebas de la carta (apps.menu)"""
import io
import itertools
import shutil
import tempfile
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User
from apps.cafeterias.models import Cafeteria
from apps.menu.models import Category, MenuItem
from apps.tenants.models import Tenant

API_CATEGORIAS = '/api/v1/menu/categories/'
API_ITEMS = '/api/v1/menu/items/'
CLAVE = 'clave-prueba-123'

_secuencia = itertools.count(1)


def crear_tenant():
    n = next(_secuencia)
    return Tenant.objects.create(
        name=f'Carta {n}', slug=f'carta-{n}', email=f'carta{n}@prueba.ec',
        ruc=f'178{n:07d}001', business_name=f'Carta {n} S.A.',
    )


def crear_cafeteria(tenant):
    n = next(_secuencia)
    return Cafeteria.objects.create(
        tenant=tenant, name=f'Café {n}', slug=f'cafe-carta-{n}',
        address='Av. Amazonas y Colón', city='Quito', phone='022450000',
    )


def crear_usuario(rol, tenant=None, cafeteria=None):
    n = next(_secuencia)
    return User.objects.create_user(
        email=f'{rol}.carta{n}@prueba.ec', password=CLAVE, first_name=rol.title(), last_name=str(n),
        tenant=tenant, cafeteria=cafeteria, role=rol,
    )


def foto_jpeg(ancho=1600, alto=1200, orientacion=None, nombre='foto.jpg'):
    """JPEG de celular: con EXIF (marca del celular y, si se pide, orientación)"""
    imagen = Image.new('RGB', (ancho, alto), (170, 110, 60))
    # Mitad izquierda más clara: así se nota si la foto se giró
    imagen.paste((240, 220, 180), (0, 0, ancho // 2, alto))
    exif = Image.Exif()
    exif[0x010F] = 'CelularDePrueba'  # Make
    exif[0x0110] = 'Modelo X'  # Model
    if orientacion:
        exif[0x0112] = orientacion
    buffer = io.BytesIO()
    imagen.save(buffer, 'JPEG', quality=90, exif=exif.tobytes())
    return SimpleUploadedFile(nombre, buffer.getvalue(), content_type='image/jpeg')


def png_transparente(ancho=300, alto=200):
    imagen = Image.new('RGBA', (ancho, alto), (0, 0, 0, 0))
    buffer = io.BytesIO()
    imagen.save(buffer, 'PNG')
    return SimpleUploadedFile('logo.png', buffer.getvalue(), content_type='image/png')


class MediaTemporalMixin:
    """MEDIA_ROOT temporal por clase: las pruebas no ensucian media/"""

    @classmethod
    def setUpClass(cls):
        cls._media = tempfile.mkdtemp(prefix='menu-pruebas-')
        cls._ajuste_media = override_settings(MEDIA_ROOT=cls._media)
        cls._ajuste_media.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._ajuste_media.disable()
        shutil.rmtree(cls._media, ignore_errors=True)


class PruebaCarta(MediaTemporalMixin, APITestCase):
    """Un tenant con su carta y personal por rol, y otro tenant ajeno"""

    def setUp(self):
        super().setUp()
        self.tenant = crear_tenant()
        self.cafe = crear_cafeteria(self.tenant)
        self.bebidas = Category.objects.create(tenant=self.tenant, name='Bebidas', slug='bebidas', order=0)
        self.postres = Category.objects.create(tenant=self.tenant, name='Postres', slug='postres', order=1)
        self.cappuccino = MenuItem.objects.create(
            tenant=self.tenant, category=self.bebidas, name='Cappuccino', slug='cappuccino',
            price=Decimal('2.80'), cost=Decimal('0.90'),
        )
        self.agotado = MenuItem.objects.create(
            tenant=self.tenant, category=self.postres, name='Cheesecake', slug='cheesecake',
            price=Decimal('4.20'), cost=Decimal('1.50'), is_available=False,
        )
        self.usuarios = {
            rol: crear_usuario(rol, self.tenant, None if rol == 'distribuidor_admin' else self.cafe)
            for rol in ('distribuidor_admin', 'cafe_admin', 'gerente', 'camarero', 'cajero', 'cocinero')
        }
        self.usuarios['super_admin'] = crear_usuario('super_admin')

        self.otro_tenant = crear_tenant()
        self.otra_categoria = Category.objects.create(tenant=self.otro_tenant, name='Bebidas', slug='bebidas')
        self.ajeno = MenuItem.objects.create(
            tenant=self.otro_tenant, category=self.otra_categoria, name='Cappuccino', slug='cappuccino',
            price=Decimal('3.00'), cost=Decimal('1.00'),
        )
        self.otro_admin = crear_usuario('cafe_admin', self.otro_tenant, crear_cafeteria(self.otro_tenant))

    def como(self, rol_o_usuario):
        usuario = self.usuarios[rol_o_usuario] if isinstance(rol_o_usuario, str) else rol_o_usuario
        client = APIClient()
        client.force_authenticate(usuario)
        return client

    def item_url(self, item, accion=''):
        return f'{API_ITEMS}{item.pk}/{accion}'
