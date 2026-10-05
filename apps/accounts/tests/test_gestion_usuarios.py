"""El admin de cafetería lista, edita, activa y desactiva solo al personal de su local"""
from rest_framework.test import APIRequestFactory

from apps.accounts.permissions import CanManageUser, IsOwnUser

from .base import API_USERS, PruebaUsuarios, crear_usuario


class ListadoTests(PruebaUsuarios):

    def ids(self, usuario):
        r = self.como(usuario).get(API_USERS, {'page_size': 500})
        self.assertEqual(r.status_code, 200, r.content)
        return {u['id'] for u in r.data['results']}

    def test_cafe_admin_ve_solo_su_cafeteria(self):
        esperados = {str(u.pk) for u in [self.cafe_admin, self.gerente, self.camarero, self.cajero, self.cocinero]}
        self.assertEqual(self.ids(self.cafe_admin), esperados)

    def test_distribuidor_ve_toda_su_red(self):
        vistos = self.ids(self.distribuidor)
        self.assertIn(str(self.camarero_cafe2.pk), vistos)
        self.assertIn(str(self.cafe_admin.pk), vistos)
        self.assertNotIn(str(self.camarero_otro.pk), vistos)


class EdicionTests(PruebaUsuarios):

    def editar(self, quien, a_quien, **datos):
        return self.como(quien).patch(f'{API_USERS}{a_quien.pk}/', datos, format='json')

    def test_cafe_admin_edita_a_su_personal(self):
        r = self.editar(self.cafe_admin, self.camarero, first_name='Lucía', phone='0991234567')
        self.assertEqual(r.status_code, 200, r.content)
        self.camarero.refresh_from_db()
        self.assertEqual((self.camarero.first_name, self.camarero.phone), ('Lucía', '0991234567'))

    def test_cafe_admin_edita_su_perfil(self):
        r = self.editar(self.cafe_admin, self.cafe_admin, first_name='Marta')
        self.assertEqual(r.status_code, 200, r.content)

    def test_cafe_admin_no_edita_otro_local_ni_otra_cadena(self):
        for otro in [self.camarero_cafe2, self.camarero_otro, self.distribuidor]:
            with self.subTest(usuario=otro.email):
                self.assertEqual(self.editar(self.cafe_admin, otro, first_name='X').status_code, 404)

    def test_cafe_admin_no_edita_a_otro_admin_de_su_local(self):
        colega = crear_usuario('cafe_admin', self.tenant, self.cafe)
        self.assertEqual(self.editar(self.cafe_admin, colega, first_name='X').status_code, 403)

    def test_personal_no_edita_a_compañeros(self):
        self.assertEqual(self.editar(self.camarero, self.cajero, first_name='X').status_code, 403)
        self.assertEqual(self.editar(self.camarero, self.camarero, first_name='Yo').status_code, 200)


class ActivarDesactivarTests(PruebaUsuarios):

    def accion(self, quien, a_quien, nombre):
        return self.como(quien).post(f'{API_USERS}{a_quien.pk}/{nombre}/', {}, format='json')

    def test_cafe_admin_desactiva_y_activa_a_su_personal(self):
        for empleado in [self.gerente, self.camarero, self.cajero, self.cocinero]:
            with self.subTest(rol=empleado.role):
                self.assertEqual(self.accion(self.cafe_admin, empleado, 'deactivate').status_code, 200)
                empleado.refresh_from_db()
                self.assertFalse(empleado.is_active)
                self.assertEqual(self.accion(self.cafe_admin, empleado, 'activate').status_code, 200)
                empleado.refresh_from_db()
                self.assertTrue(empleado.is_active)

    def test_cafe_admin_no_toca_otros_locales(self):
        for otro in [self.camarero_cafe2, self.camarero_otro]:
            with self.subTest(usuario=otro.email):
                self.assertEqual(self.accion(self.cafe_admin, otro, 'deactivate').status_code, 404)
                otro.refresh_from_db()
                self.assertTrue(otro.is_active)

    def test_cafe_admin_no_se_desactiva_ni_a_otro_admin(self):
        colega = crear_usuario('cafe_admin', self.tenant, self.cafe)
        for objetivo in [self.cafe_admin, colega]:
            with self.subTest(usuario=objetivo.email):
                self.assertEqual(self.accion(self.cafe_admin, objetivo, 'deactivate').status_code, 403)

    def test_distribuidor_gestiona_su_red_y_no_otra(self):
        self.assertEqual(self.accion(self.distribuidor, self.camarero_cafe2, 'deactivate').status_code, 200)
        self.assertEqual(self.accion(self.distribuidor, self.camarero_otro, 'deactivate').status_code, 404)

    def test_nadie_se_desactiva_a_si_mismo(self):
        for quien in [self.super_admin, self.distribuidor]:
            with self.subTest(rol=quien.role):
                r = self.accion(quien, quien, 'deactivate')
                self.assertEqual(r.status_code, 403, r.content)
                quien.refresh_from_db()
                self.assertTrue(quien.is_active)

    def test_super_admin_gestiona_a_cualquiera(self):
        self.assertEqual(self.accion(self.super_admin, self.camarero_otro, 'deactivate').status_code, 200)
        self.assertEqual(self.accion(self.super_admin, self.camarero_otro, 'activate').status_code, 200)

    def test_personal_no_desactiva(self):
        for quien in [self.gerente, self.camarero, self.cajero, self.cocinero]:
            with self.subTest(rol=quien.role):
                self.assertEqual(self.accion(quien, self.camarero, 'deactivate').status_code, 403)

    def test_no_desactiva_al_ultimo_super_admin_activo(self):
        # Con JWT un super admin inactivo no entra; force_authenticate permite probar la regla
        self.super_admin.is_active = False
        self.super_admin.save(update_fields=['is_active'])
        unico_activo = crear_usuario('super_admin')

        r = self.accion(self.super_admin, unico_activo, 'deactivate')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('último super administrador activo', r.data['detail'])
        unico_activo.refresh_from_db()
        self.assertTrue(unico_activo.is_active)

    def test_desactiva_un_super_admin_si_queda_otro_activo(self):
        otro = crear_usuario('super_admin')
        self.assertEqual(self.accion(self.super_admin, otro, 'deactivate').status_code, 200)
        otro.refresh_from_db()
        self.assertFalse(otro.is_active)
        self.assertEqual(self.accion(self.super_admin, otro, 'activate').status_code, 200)


class DistribuidorSinTenantTests(PruebaUsuarios):
    """Un distribuidor_admin sin tenant (solo se puede crear desde el /admin) no tiene red que gestionar"""

    def setUp(self):
        super().setUp()
        self.sin_tenant = crear_usuario('distribuidor_admin')
        self.huerfano = crear_usuario('usuario')  # otra cuenta sin tenant

    def test_no_lista_ni_ve_a_otros(self):
        cliente = self.como(self.sin_tenant)
        self.assertEqual(cliente.get(API_USERS).status_code, 403)  # IsTenantMember
        r = cliente.patch(f'{API_USERS}{self.sin_tenant.pk}/', {'first_name': 'Pablo'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

    def test_no_toca_a_super_admins_ni_cuentas_sin_tenant(self):
        cliente = self.como(self.sin_tenant)
        for objetivo in [self.super_admin, self.huerfano]:
            with self.subTest(usuario=objetivo.email):
                r = cliente.post(f'{API_USERS}{objetivo.pk}/deactivate/', {}, format='json')
                self.assertEqual(r.status_code, 404, r.content)
                r = cliente.patch(f'{API_USERS}{objetivo.pk}/', {'first_name': 'X'}, format='json')
                self.assertEqual(r.status_code, 404, r.content)
                objetivo.refresh_from_db()
                self.assertTrue(objetivo.is_active)
                self.assertNotEqual(objetivo.first_name, 'X')

    def test_permisos_sin_tenant_aunque_la_cuenta_quede_al_alcance(self):
        # Defensa en profundidad: aunque get_queryset cambie, None == None no da permiso
        peticion = APIRequestFactory().post('/')
        peticion.user = self.sin_tenant
        for objetivo in [self.super_admin, self.huerfano]:
            with self.subTest(usuario=objetivo.email):
                self.assertFalse(CanManageUser().has_object_permission(peticion, None, objetivo))
                self.assertFalse(IsOwnUser().has_object_permission(peticion, None, objetivo))
        self.assertTrue(IsOwnUser().has_object_permission(peticion, None, self.sin_tenant))
