"""Acciones sobre un distribuidor: activar, desactivar, cambiar de plan y editar la ficha (solo super admin)"""
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User
from apps.cafeterias.models import Cafeteria
from apps.tenants.models import Tenant

API_TENANTS = '/api/v1/tenants/'


@override_settings(CACHES={
    'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'pruebas-tenants-acciones'},
})
class AccionesDistribuidorTests(APITestCase):

    def setUp(self):
        super().setUp()
        self.super_admin = self.usuario('super_admin')
        self.tenant = Tenant.objects.create(
            name='Andes Coffee Group', slug='andes-coffee-group', email='andes@prueba.ec',
            ruc='1790012345001', business_name='Andes Coffee Group S.A.', plan='basic', max_cafes=5, max_users=50,
        )
        self.otro = Tenant.objects.create(
            name='Café del Pacífico', slug='cafe-del-pacifico', email='pacifico@prueba.ec',
            ruc='0992345678001', business_name='Pacífico Cafés Cía. Ltda.', plan='pro', max_cafes=20, max_users=500,
        )
        self.cafe = Cafeteria.objects.create(
            tenant=self.tenant, name='Café Andino', slug='cafe-andino', address='Av. 6 de Diciembre', city='Quito',
        )

    def usuario(self, rol, tenant=None, cafeteria=None):
        return User.objects.create_user(
            email=f'{rol}{User.objects.count()}@prueba.ec', password='clave-prueba-123',
            first_name=rol.title(), last_name='Prueba', role=rol, tenant=tenant, cafeteria=cafeteria,
        )

    def como(self, usuario):
        client = APIClient()
        client.force_authenticate(usuario)
        return client

    def accion(self, usuario, nombre, tenant=None, **datos):
        tenant = tenant or self.tenant
        return self.como(usuario).post(f'{API_TENANTS}{tenant.pk}/{nombre}/', datos, format='json')

    # ----------------------------------------------------------------- permisos

    def test_solo_super_admin_activa_desactiva_y_cambia_plan(self):
        otros = {
            'distribuidor_admin': self.usuario('distribuidor_admin', self.tenant),
            'cafe_admin': self.usuario('cafe_admin', self.tenant, self.cafe),
            'gerente': self.usuario('gerente', self.tenant, self.cafe),
            'camarero': self.usuario('camarero', self.tenant, self.cafe),
        }
        self.tenant.is_active, self.tenant.status = False, 'suspended'
        self.tenant.save()
        for rol, usuario in otros.items():
            for nombre, datos in [('activate', {}), ('deactivate', {}), ('upgrade_plan', {'plan': 'enterprise'})]:
                with self.subTest(rol=rol, accion=nombre):
                    r = self.accion(usuario, nombre, **datos)
                    self.assertEqual(r.status_code, 403, r.content)
        self.tenant.refresh_from_db()
        self.assertEqual(
            (self.tenant.plan, self.tenant.max_cafes, self.tenant.status, self.tenant.is_active),
            ('basic', 5, 'suspended', False),
        )

    def test_distribuidor_no_edita_ni_borra_su_ficha(self):
        distribuidor = self.usuario('distribuidor_admin', self.tenant)
        url = f'{API_TENANTS}{self.tenant.pk}/'
        self.assertEqual(self.como(distribuidor).patch(url, {'status': 'active'}, format='json').status_code, 403)
        self.assertEqual(self.como(distribuidor).put(url, {'name': 'Otro'}, format='json').status_code, 403)
        self.assertEqual(self.como(distribuidor).delete(url).status_code, 403)
        self.assertTrue(Tenant.objects.filter(pk=self.tenant.pk, name='Andes Coffee Group').exists())

    def test_distribuidor_sigue_viendo_su_ficha(self):
        distribuidor = self.usuario('distribuidor_admin', self.tenant)
        r = self.como(distribuidor).get(f'{API_TENANTS}{self.tenant.pk}/')
        self.assertEqual(r.status_code, 200, r.content)
        r = self.como(distribuidor).get(f'{API_TENANTS}{self.otro.pk}/')
        self.assertEqual(r.status_code, 404)

    def test_super_admin_activa_y_desactiva(self):
        r = self.accion(self.super_admin, 'deactivate')
        self.assertEqual(r.status_code, 200, r.content)
        self.tenant.refresh_from_db()
        self.assertEqual((self.tenant.status, self.tenant.is_active), ('inactive', False))

        r = self.accion(self.super_admin, 'activate')
        self.assertEqual(r.status_code, 200, r.content)
        self.tenant.refresh_from_db()
        self.assertEqual((self.tenant.status, self.tenant.is_active), ('active', True))

    # ----------------------------------------------------------------- cambio de plan

    def test_cambio_de_plan_a_gratis_rechazado(self):
        r = self.accion(self.super_admin, 'upgrade_plan', plan='free')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('gratis', r.data['error'])
        self.tenant.refresh_from_db()
        self.assertEqual((self.tenant.plan, self.tenant.max_cafes), ('basic', 5))

    def test_cambio_de_plan_con_valores_raros(self):
        for datos in [{}, {'plan': ''}, {'plan': 'platino'}, {'plan': ['pro']}, {'plan': {'a': 'pro'}}, {'plan': 3}]:
            with self.subTest(datos=datos):
                r = self.accion(self.super_admin, 'upgrade_plan', **datos)
                self.assertEqual(r.status_code, 400, r.content)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.plan, 'basic')

    def test_bajar_de_plan_por_debajo_del_uso_avisa(self):
        for n in range(6):
            Cafeteria.objects.create(
                tenant=self.otro, name=f'Pacífico {n}', slug=f'pacifico-{n}', address='Malecón 2000', city='Guayaquil',
            )
        r = self.accion(self.super_admin, 'upgrade_plan', tenant=self.otro, plan='basic')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn('6 cafeterías activas', r.data['aviso'])
        self.otro.refresh_from_db()
        self.assertEqual((self.otro.plan, self.otro.max_cafes), ('basic', 5))

    def test_subir_de_plan_no_avisa(self):
        r = self.accion(self.super_admin, 'upgrade_plan', plan='pro')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(r.data['aviso'])

    # ----------------------------------------------------------------- edición de la ficha

    def editar(self, tenant=None, **datos):
        tenant = tenant or self.tenant
        return self.como(self.super_admin).patch(f'{API_TENANTS}{tenant.pk}/', datos, format='json')

    def test_plan_y_limites_no_se_editan_por_patch(self):
        r = self.editar(plan='free', max_cafes=1, max_users=10, city='Ambato')
        self.assertEqual(r.status_code, 200, r.content)
        self.tenant.refresh_from_db()
        self.assertEqual(
            (self.tenant.plan, self.tenant.max_cafes, self.tenant.max_users, self.tenant.city),
            ('basic', 5, 50, 'Ambato'),
        )

    def test_nombre_repetido_al_editar(self):
        for nombre in ['café del pacífico', '  Café del Pacífico ']:
            with self.subTest(nombre=nombre):
                r = self.editar(name=nombre)
                self.assertEqual(r.status_code, 400, r.content)
                self.assertIn('Ya existe', str(r.data['name']))

    def test_cambiar_mayusculas_del_propio_nombre(self):
        r = self.editar(name='ANDES Coffee Group')
        self.assertEqual(r.status_code, 200, r.content)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.name, 'ANDES Coffee Group')

    def test_estado_y_activo_van_juntos(self):
        r = self.editar(status='suspended')
        self.assertEqual(r.status_code, 200, r.content)
        self.tenant.refresh_from_db()
        self.assertEqual((self.tenant.status, self.tenant.is_active), ('suspended', False))

        r = self.editar(is_active=True)
        self.assertEqual(r.status_code, 200, r.content)
        self.tenant.refresh_from_db()
        self.assertEqual((self.tenant.status, self.tenant.is_active), ('active', True))

    # ----------------------------------------------------------------- valores por defecto del modelo

    def test_sin_plan_arranca_en_basico(self):
        tenant = Tenant.objects.create(
            name='Loja Tostadores', slug='loja-tostadores', email='loja@prueba.ec',
            ruc='1105678901001', business_name='Loja Tostadores Artesanales',
        )
        self.assertEqual((tenant.plan, tenant.max_cafes, tenant.max_users), ('basic', 5, 50))
