"""Quién crea a quién: super_admin cualquier rol, distribuidor solo Admin Cafetería y este solo su personal"""
from apps.accounts.models import User
from apps.accounts.serializers import UserCreateSerializer

from .base import PruebaUsuarios, crear_usuario

PERSONAL = ['gerente', 'camarero', 'cajero', 'cocinero']
TODOS_LOS_ROLES = [r for r, _ in User.ROLE_CHOICES]


def crear_en_lote(tenant, cafeteria, cuantos):
    """Muchas cuentas de una vez (sin calcular contraseñas, que es lo lento)"""
    User.objects.bulk_create([
        User(
            email=f'lote{n}-{tenant.slug}@prueba.ec', first_name='Lote', last_name=str(n),
            role='camarero', tenant=tenant, cafeteria=cafeteria, password='!',
        )
        for n in range(cuantos)
    ])


class RolesAsignablesTests(PruebaUsuarios):

    def test_tabla_de_roles_por_creador(self):
        self.assertEqual(UserCreateSerializer.ASSIGNABLE_ROLES['super_admin'], TODOS_LOS_ROLES)
        self.assertEqual(UserCreateSerializer.ASSIGNABLE_ROLES['distribuidor_admin'], ['cafe_admin'])
        self.assertEqual(UserCreateSerializer.ASSIGNABLE_ROLES['cafe_admin'], PERSONAL)
        self.assertEqual(set(UserCreateSerializer.ASSIGNABLE_ROLES), {'super_admin', 'distribuidor_admin', 'cafe_admin'})


class SuperAdminCreaTests(PruebaUsuarios):

    def test_crea_distribuidor_admin_en_el_tenant_elegido(self):
        r = self.crear_usuario_api(self.super_admin, 'distribuidor_admin', tenant=str(self.otro_tenant.pk))
        self.assertEqual(r.status_code, 201, r.content)
        nuevo = User.objects.get(pk=r.data['id'])
        self.assertEqual((nuevo.role, nuevo.tenant, nuevo.cafeteria), ('distribuidor_admin', self.otro_tenant, None))
        self.assertTrue(nuevo.email.islower())

    def test_crea_personal_de_cualquier_rol(self):
        for rol in ['cafe_admin', *PERSONAL]:
            with self.subTest(rol=rol):
                r = self.crear_usuario_api(
                    self.super_admin, rol, tenant=str(self.tenant.pk), cafeteria=str(self.cafe2.pk),
                )
                self.assertEqual(r.status_code, 201, r.content)
                nuevo = User.objects.get(pk=r.data['id'])
                self.assertEqual((nuevo.role, nuevo.tenant, nuevo.cafeteria), (rol, self.tenant, self.cafe2))

    def test_crea_otro_super_admin_sin_tenant(self):
        r = self.crear_usuario_api(self.super_admin, 'super_admin', tenant=str(self.tenant.pk))
        self.assertEqual(r.status_code, 201, r.content)
        nuevo = User.objects.get(pk=r.data['id'])
        self.assertIsNone(nuevo.tenant)
        self.assertTrue(nuevo.is_superuser)

    def test_rol_de_distribuidor_sin_tenant_pide_elegirlo(self):
        r = self.crear_usuario_api(self.super_admin, 'distribuidor_admin')
        self.assertEqual(r.status_code, 400)
        self.assertIn('tenant', r.data)


class DistribuidorCreaTests(PruebaUsuarios):

    def test_crea_admin_cafeteria_en_su_red(self):
        r = self.crear_usuario_api(
            self.distribuidor, 'cafe_admin', cafeteria=str(self.cafe2.pk),
            tenant=str(self.otro_tenant.pk),  # se ignora: va a su propio tenant
        )
        self.assertEqual(r.status_code, 201, r.content)
        nuevo = User.objects.get(pk=r.data['id'])
        self.assertEqual((nuevo.role, nuevo.tenant, nuevo.cafeteria), ('cafe_admin', self.tenant, self.cafe2))

    def test_camarero_da_400_con_mensaje_claro(self):
        r = self.crear_usuario_api(self.distribuidor, 'camarero', cafeteria=str(self.cafe.pk))
        self.assertEqual(r.status_code, 400)
        self.assertIn('Admin Cafetería', str(r.data['role']))

    def test_ningun_otro_rol(self):
        for rol in [r for r in TODOS_LOS_ROLES if r != 'cafe_admin']:
            with self.subTest(rol=rol):
                antes = User.objects.count()
                r = self.crear_usuario_api(self.distribuidor, rol, cafeteria=str(self.cafe.pk))
                self.assertEqual(r.status_code, 400, r.content)
                self.assertIn('role', r.data)
                self.assertEqual(User.objects.count(), antes)

    def test_sin_rol_no_crea_usuario_basico(self):
        datos = self.datos_usuario('cafe_admin')
        datos.pop('role')
        r = self.como(self.distribuidor).post('/api/v1/auth/users/', datos, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('role', r.data)

    def test_admin_cafeteria_necesita_un_local(self):
        r = self.crear_usuario_api(self.distribuidor, 'cafe_admin')
        self.assertEqual(r.status_code, 400)
        self.assertIn('cafeteria', r.data)

    def test_no_puede_usar_un_local_de_otra_cadena(self):
        r = self.crear_usuario_api(self.distribuidor, 'cafe_admin', cafeteria=str(self.otro_cafe.pk))
        self.assertEqual(r.status_code, 400)
        self.assertIn('cafeteria', r.data)

    def test_sin_limite_de_usuarios(self):
        # El distribuidor ya no tiene plan ni tope de usuarios (antes, el plan Básico cortaba en 50)
        crear_en_lote(self.tenant, self.cafe, 60)
        r = self.crear_usuario_api(self.distribuidor, 'cafe_admin', cafeteria=str(self.cafe.pk))
        self.assertEqual(r.status_code, 201, r.content)


class AdminCafeteriaCreaTests(PruebaUsuarios):

    def test_crea_su_personal_en_su_local(self):
        for rol in PERSONAL:
            with self.subTest(rol=rol):
                r = self.crear_usuario_api(self.cafe_admin, rol)
                self.assertEqual(r.status_code, 201, r.content)
                nuevo = User.objects.get(pk=r.data['id'])
                self.assertEqual((nuevo.role, nuevo.tenant, nuevo.cafeteria), (rol, self.tenant, self.cafe))
                self.assertFalse(nuevo.is_staff)

    def test_no_puede_crear_en_otra_cafeteria(self):
        # Lo que mande el cliente (otro local de su cadena, otra cadena) se ignora: queda en su local
        for cafe, tenant in [(self.cafe2, self.tenant), (self.otro_cafe, self.otro_tenant)]:
            with self.subTest(cafe=cafe.name):
                r = self.crear_usuario_api(
                    self.cafe_admin, 'camarero', cafeteria=str(cafe.pk), tenant=str(tenant.pk),
                )
                self.assertEqual(r.status_code, 201, r.content)
                nuevo = User.objects.get(pk=r.data['id'])
                self.assertEqual((nuevo.tenant, nuevo.cafeteria), (self.tenant, self.cafe))

    def test_local_inexistente_tambien_se_ignora(self):
        r = self.crear_usuario_api(
            self.cafe_admin, 'cocinero', cafeteria='00000000-0000-0000-0000-000000000000', tenant='no-existe',
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(User.objects.get(pk=r.data['id']).cafeteria, self.cafe)

    def test_roles_fuera_de_su_lista(self):
        for rol in ['super_admin', 'distribuidor_admin', 'cafe_admin', 'usuario']:
            with self.subTest(rol=rol):
                antes = User.objects.count()
                r = self.crear_usuario_api(self.cafe_admin, rol)
                self.assertEqual(r.status_code, 400, r.content)
                self.assertIn('role', r.data)
                self.assertEqual(User.objects.count(), antes)

    def test_sin_cafeteria_asignada_no_crea(self):
        sin_local = crear_usuario('cafe_admin', self.tenant)
        r = self.crear_usuario_api(sin_local, 'camarero')
        self.assertEqual(r.status_code, 403)

    def test_sin_limite_de_usuarios(self):
        crear_en_lote(self.tenant, self.cafe, 60)
        r = self.crear_usuario_api(self.cafe_admin, 'camarero')
        self.assertEqual(r.status_code, 201, r.content)


class OtrosRolesNoCreanTests(PruebaUsuarios):

    def test_403_para_el_resto(self):
        for creador in [self.gerente, self.camarero, self.cajero, self.cocinero, self.usuario]:
            with self.subTest(rol=creador.role):
                r = self.crear_usuario_api(creador, 'camarero', cafeteria=str(self.cafe.pk))
                self.assertEqual(r.status_code, 403, r.content)

    def test_sin_sesion(self):
        r = self.client.post('/api/v1/auth/users/', self.datos_usuario('camarero'), format='json')
        self.assertEqual(r.status_code, 401)
