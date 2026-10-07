"""Alta de distribuidores desde la consola: sin plan ni límites, validaciones (RUC, nombre, email), slug y permisos"""
import itertools
from unittest import mock

from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User
from apps.cafeterias.models import Cafeteria
from apps.tenants.models import Tenant
from apps.tenants.serializers import TenantCreateSerializer, slug_disponible

API_TENANTS = '/api/v1/tenants/'
_secuencia = itertools.count(1)


@override_settings(CACHES={
    'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'pruebas-tenants'},
})
class CrearDistribuidorTests(APITestCase):

    def setUp(self):
        super().setUp()
        self.super_admin = User.objects.create_user(
            email='super@prueba.ec', password='clave-prueba-123', first_name='Super', last_name='Admin',
            role='super_admin',
        )
        self.existente = Tenant.objects.create(
            name='Andes Coffee Group', slug='andes-coffee-group', email='andes@prueba.ec',
            ruc='1790012345001', business_name='Andes Coffee Group S.A.',
        )

    def como(self, usuario):
        client = APIClient()
        client.force_authenticate(usuario)
        return client

    def datos(self, **extra):
        n = next(_secuencia)
        datos = dict(
            name=f'Cafés del Austro {n}', business_name=f'Cafés del Austro {n} Cía. Ltda.',
            ruc=f'01900{n:05d}001', email=f'Contacto{n}@Austro.EC', phone='072345678',
            city='Cuenca', address='Calle Larga 7-45',
        )
        datos.update(extra)
        return datos

    def crear(self, usuario=None, **extra):
        return self.como(usuario or self.super_admin).post(API_TENANTS, self.datos(**extra), format='json')

    # ----------------------------------------------------------------- creación (sin plan)

    def test_crea_sin_plan_ni_limites(self):
        r = self.crear(name='Cafés del Austro')
        self.assertEqual(r.status_code, 201, r.content)
        for campo in ['id', 'name', 'status', 'active_cafes_count', 'active_users_count']:
            self.assertIn(campo, r.data)
        # El plan es de cada cafetería: el distribuidor no lo tiene, ni topes de locales o usuarios
        for campo in ['plan', 'max_cafes', 'max_users', 'can_create_cafe', 'can_create_user']:
            self.assertNotIn(campo, r.data)
        self.assertEqual(r.data['status'], 'active')

        tenant = Tenant.objects.get(pk=r.data['id'])
        self.assertEqual(str(tenant.pk), str(r.data['id']))
        self.assertEqual(tenant.slug, 'cafes-del-austro')
        self.assertTrue(tenant.is_active)
        self.assertEqual(tenant.city, 'Cuenca')

    def test_plan_enviado_se_ignora(self):
        # Un cliente antiguo que todavía manda el plan (incluso uno que ya no existe) no rompe el alta
        for plan in ['pro', 'free', 'platino']:
            with self.subTest(plan=plan):
                r = self.crear(plan=plan)
                self.assertEqual(r.status_code, 201, r.content)
                self.assertNotIn('plan', r.data)

    def test_ya_no_existe_el_cambio_de_plan(self):
        tenant = Tenant.objects.get(pk=self.crear().data['id'])
        r = self.como(self.super_admin).post(f'{API_TENANTS}{tenant.pk}/upgrade_plan/', {'plan': 'pro'}, format='json')
        self.assertEqual(r.status_code, 404, r.content)

    def test_email_se_guarda_en_minusculas(self):
        r = self.crear(email='Ventas@CafesDelAustro.EC')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Tenant.objects.get(pk=r.data['id']).email, 'ventas@cafesdelaustro.ec')

    # ----------------------------------------------------------------- validaciones

    def test_obligatorios(self):
        r = self.como(self.super_admin).post(API_TENANTS, {}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(set(r.data), {'name', 'business_name', 'email', 'ruc'})
        self.assertEqual(str(r.data['name'][0]), 'Escribe el nombre comercial.')
        self.assertEqual(str(r.data['business_name'][0]), 'Escribe la razón social.')

    def test_email_invalido(self):
        r = self.crear(email='no-es-un-email')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(str(r.data['email'][0]), 'Escribe un email válido.')

    def test_ruc_debe_tener_13_digitos(self):
        for ruc in ['179001234500', '17900123450012', '17900A2345001', 'ABCDEFGHIJKLM', '1790-12345001']:
            with self.subTest(ruc=ruc):
                r = self.crear(ruc=ruc)
                self.assertEqual(r.status_code, 400, r.content)
                self.assertIn('13 dígitos', str(r.data['ruc']))
        self.assertEqual(Tenant.objects.count(), 1)

    def test_ruc_imposible_rechazado(self):
        casos = {
            '0000000000000': 'provincia',     # provincia 00
            '2590012345001': 'provincia',     # provincia 25
            '1770012345001': 'tercer dígito',  # tercer dígito 7
            '1780012345001': 'tercer dígito',  # tercer dígito 8
            '1790012345000': 'establecimiento',
        }
        for ruc, motivo in casos.items():
            with self.subTest(ruc=ruc):
                r = self.crear(ruc=ruc)
                self.assertEqual(r.status_code, 400, r.content)
                self.assertIn(motivo, str(r.data['ruc']))
        self.assertEqual(Tenant.objects.count(), 1)

    def test_ruc_de_persona_natural_entidad_publica_y_exterior(self):
        for ruc in ['1712345678001', '1760001550001', '3090012345001']:
            with self.subTest(ruc=ruc):
                r = self.crear(ruc=ruc)
                self.assertEqual(r.status_code, 201, r.content)

    def test_ruc_con_espacios_alrededor_se_acepta(self):
        r = self.crear(ruc=' 0190123456001 ')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Tenant.objects.get(pk=r.data['id']).ruc, '0190123456001')

    def test_ruc_repetido(self):
        r = self.crear(ruc='1790012345001')
        self.assertEqual(r.status_code, 400)
        self.assertIn('ya está registrado', str(r.data['ruc']))

    def test_nombre_repetido_con_otras_mayusculas(self):
        r = self.crear(name='ANDES coffee group')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Ya existe', str(r.data['name']))

    def test_nombre_repetido_con_espacios_alrededor(self):
        r = self.crear(name='  Andes Coffee Group  ')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Ya existe', str(r.data['name']))

    def test_choque_de_ruc_en_la_base_responde_400(self):
        # Simula dos altas simultáneas: la validación no ve el RUC, pero la base lo rechaza
        with mock.patch.object(TenantCreateSerializer, 'validate_ruc', lambda self, value: value):
            r = self.crear(ruc='1790012345001')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('ya está registrado', str(r.data['ruc']))
        self.assertEqual(Tenant.objects.count(), 1)

    def test_choque_de_slug_en_la_base_reintenta(self):
        # La primera vez el slug calculado ya está tomado (otra alta lo ganó): se recalcula
        real = slug_disponible
        intentos = iter(['andes-coffee-group'])
        with mock.patch('apps.tenants.serializers.slug_disponible', lambda nombre: next(intentos, None) or real(nombre)):
            r = self.crear(name='Cafés de Vilcabamba')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Tenant.objects.get(pk=r.data['id']).slug, 'cafes-de-vilcabamba')

    # ----------------------------------------------------------------- slug

    def test_slug_con_sufijo_si_choca(self):
        # "Andes Coffee-Group" es otro nombre pero da el mismo slug que el existente
        r = self.crear(name='Andes Coffee-Group')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Tenant.objects.get(pk=r.data['id']).slug, 'andes-coffee-group-2')

        r = self.crear(name='Andes Coffee Group!')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Tenant.objects.get(pk=r.data['id']).slug, 'andes-coffee-group-3')

    def test_slug_sin_letras_usa_distribuidor(self):
        r = self.crear(name='¡¡¡!!!')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Tenant.objects.get(pk=r.data['id']).slug, 'distribuidor')

    # ----------------------------------------------------------------- permisos

    def test_solo_super_admin_crea(self):
        cafe = Cafeteria.objects.create(
            tenant=self.existente, name='Café Andino', slug='cafe-andino', address='Av. 6 de Diciembre', city='Quito',
        )
        for rol, cafeteria in [('distribuidor_admin', None), ('cafe_admin', cafe), ('gerente', cafe), ('camarero', cafe)]:
            with self.subTest(rol=rol):
                usuario = User.objects.create_user(
                    email=f'{rol}@prueba.ec', password='clave-prueba-123', first_name=rol, last_name='Prueba',
                    role=rol, tenant=self.existente, cafeteria=cafeteria,
                )
                r = self.crear(usuario)
                self.assertEqual(r.status_code, 403, r.content)
        self.assertEqual(Tenant.objects.count(), 1)

    def test_sin_sesion(self):
        r = self.client.post(API_TENANTS, self.datos(), format='json')
        self.assertEqual(r.status_code, 401)
