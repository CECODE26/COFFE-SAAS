"""/auth/register/ ya no es un registro público: solo el super admin da de alta un distribuidor con su admin"""
from django.core.cache import cache

from apps.accounts.models import User
from apps.tenants.models import Tenant

from .base import PruebaUsuarios

API_REGISTRO = '/api/v1/auth/register/'


class RegistroDistribuidorTests(PruebaUsuarios):

    def setUp(self):
        super().setUp()
        cache.clear()  # el límite de intentos de registro vive en la caché

    def datos(self, **extra):
        datos = dict(
            email='Admin@CafesDelAustro.EC', password='clave-segura-123', password2='clave-segura-123',
            distribuidor_name='Cafés del Austro', ruc='0190123456001', business_name='Cafés del Austro Cía. Ltda.',
            first_name='Rosa', last_name='Peña', phone='072345678',
        )
        datos.update(extra)
        return datos

    def registrar(self, usuario=None, **extra):
        client = self.como(usuario) if usuario else self.client
        return client.post(API_REGISTRO, self.datos(**extra), format='json')

    def test_sin_sesion_no_hay_registro_publico(self):
        r = self.registrar()
        self.assertEqual(r.status_code, 401, r.content)
        self.assertFalse(Tenant.objects.filter(name='Cafés del Austro').exists())

    def test_otros_roles_no_registran(self):
        for usuario in [self.distribuidor, self.cafe_admin, self.camarero]:
            with self.subTest(rol=usuario.role):
                r = self.registrar(usuario)
                self.assertEqual(r.status_code, 403, r.content)
        self.assertFalse(Tenant.objects.filter(name='Cafés del Austro').exists())

    def test_super_admin_crea_distribuidor_y_su_admin(self):
        r = self.registrar(self.super_admin)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertNotIn('access', r.data['data'])
        self.assertNotIn('refresh', r.data['data'])

        tenant = Tenant.objects.get(name='Cafés del Austro')
        self.assertNotIn('plan', r.data['data']['tenant'])
        self.assertEqual(tenant.slug, 'cafes-del-austro')
        self.assertEqual(tenant.email, 'admin@cafesdelaustro.ec')

        admin = User.objects.get(email='admin@cafesdelaustro.ec')
        self.assertEqual((admin.role, admin.tenant_id), ('distribuidor_admin', tenant.pk))
        self.assertFalse(admin.is_staff)
        self.assertFalse(admin.is_superuser)

    def test_mismas_reglas_que_la_consola(self):
        casos = [
            ({'ruc': '0000000000000'}, 'ruc', 'provincia'),
            ({'ruc': '01901234560'}, 'ruc', '13 dígitos'),
            ({'distribuidor_name': self.tenant.name.upper()}, 'distribuidor_name', 'Ya existe'),
        ]
        for extra, campo, texto in casos:
            with self.subTest(campo=campo, extra=extra):
                cache.clear()
                r = self.registrar(self.super_admin, **extra)
                self.assertEqual(r.status_code, 400, r.content)
                self.assertIn(texto, str(r.data[campo]))
        self.assertFalse(User.objects.filter(email='admin@cafesdelaustro.ec').exists())

    def test_plan_enviado_se_ignora(self):
        # El distribuidor ya no tiene plan: si un cliente antiguo lo manda, no molesta ni se guarda
        r = self.registrar(self.super_admin, plan='free')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(Tenant.objects.filter(name='Cafés del Austro').exists())

    def test_slug_libre_con_sufijo(self):
        # Otro nombre que da el mismo slug que una cadena existente: antes terminaba en 500
        self.tenant.slug = 'cafes-del-austro'
        self.tenant.save()
        r = self.registrar(self.super_admin, distribuidor_name='Cafés del Austro!')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Tenant.objects.get(name='Cafés del Austro!').slug, 'cafes-del-austro-2')

    def test_email_repetido_no_deja_distribuidor_huerfano(self):
        r = self.registrar(self.super_admin, email=self.camarero.email.upper())
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('email', r.data)
        self.assertFalse(Tenant.objects.filter(name='Cafés del Austro').exists())
