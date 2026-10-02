"""Quién gestiona mesas (403 para el resto del personal) y alcance estricto (otro local/cadena → 404)"""
from apps.mesas.models import Mesa

from .base import API_MESAS, PruebaMesas, crear_usuario


class PermisosGestionTests(PruebaMesas):

    def test_camarero_cajero_y_cocinero_no_gestionan_mesas(self):
        for usuario in (self.camarero, self.cajero, self.cocinero):
            client = self.como(usuario)
            rol = usuario.role
            self.assertEqual(client.post(API_MESAS, {'number': 9}, format='json').status_code, 403, rol)
            self.assertEqual(client.patch(f'{API_MESAS}{self.mesa.pk}/', {'location': 'X'}, format='json').status_code, 403, rol)
            self.assertEqual(client.put(f'{API_MESAS}{self.mesa.pk}/', {'number': 1}, format='json').status_code, 403, rol)
            self.assertEqual(client.delete(f'{API_MESAS}{self.mesa.pk}/').status_code, 403, rol)
            self.assertEqual(client.post(f'{API_MESAS}{self.mesa.pk}/desactivar/').status_code, 403, rol)
            self.assertEqual(client.post(f'{API_MESAS}{self.mesa.pk}/reactivar/').status_code, 403, rol)
            self.assertEqual(client.post(f'{API_MESAS}{self.mesa.pk}/regenerar_qr/').status_code, 403, rol)
            self.assertEqual(client.get(f'{API_MESAS}siguiente_numero/').status_code, 403, rol)
            # Pero siguen viendo las mesas de su local
            self.assertEqual(client.get(API_MESAS).status_code, 200, rol)
        self.assertFalse(Mesa.objects.filter(number=9).exists())
        self.mesa.refresh_from_db()
        self.assertEqual((self.mesa.location, self.mesa.is_active), ('Terraza', True))

    def test_cliente_y_anonimo_no_gestionan_mesas(self):
        cliente = crear_usuario('usuario')
        self.assertEqual(self.crear(cliente, number=9).status_code, 403)
        from rest_framework.test import APIClient
        self.assertEqual(APIClient().post(API_MESAS, {'number': 9}, format='json').status_code, 401)


class AlcanceTests(PruebaMesas):

    def test_cafe_admin_y_gerente_solo_su_local(self):
        for usuario in (self.cafe_admin, self.gerente):
            self.assertEqual(self.editar(usuario, self.mesa_cafe2, location='X').status_code, 404)
            self.assertEqual(self.editar(usuario, self.mesa_otro, location='X').status_code, 404)
            self.assertEqual(self.accion(usuario, self.mesa_cafe2, 'desactivar').status_code, 404)
            self.assertEqual(self.accion(usuario, self.mesa_otro, 'reactivar').status_code, 404)
            self.assertEqual(self.como(usuario).delete(f'{API_MESAS}{self.mesa_cafe2.pk}/').status_code, 404)
            ids = {m['id'] for m in self.listar(usuario, incluir_inactivas=1)}
            self.assertEqual(ids, {str(m.pk) for m in self.mesas})
        self.mesa_cafe2.refresh_from_db()
        self.assertTrue(self.mesa_cafe2.is_active)

    def test_distribuidor_solo_su_cadena(self):
        self.assertEqual(self.editar(self.distribuidor, self.mesa_cafe2, location='Patio').status_code, 200)
        self.assertEqual(self.editar(self.distribuidor, self.mesa_otro, location='X').status_code, 404)
        self.assertEqual(self.accion(self.distribuidor, self.mesa_otro, 'desactivar').status_code, 404)
        self.assertEqual(self.como(self.distribuidor).delete(f'{API_MESAS}{self.mesa_otro.pk}/').status_code, 404)
        ids = {m['id'] for m in self.listar(self.distribuidor)}
        self.assertNotIn(str(self.mesa_otro.pk), ids)
        self.assertIn(str(self.mesa_cafe2.pk), ids)

    def test_super_admin_cualquier_local(self):
        self.assertEqual(self.editar(self.super_admin, self.mesa_otro, location='Patio').status_code, 200)
        self.assertEqual(self.accion(self.super_admin, self.mesa_otro, 'desactivar').status_code, 200)
        self.assertEqual(self.accion(self.super_admin, self.mesa_otro, 'reactivar').status_code, 200)

    def test_mesas_de_un_local_cerrado_no_se_gestionan(self):
        self.cafe2.is_active = False
        self.cafe2.save()
        self.assertEqual(self.editar(self.distribuidor, self.mesa_cafe2, location='X').status_code, 404)
        self.assertEqual(self.accion(self.distribuidor, self.mesa_cafe2, 'desactivar').status_code, 404)


class SiguienteNumeroTests(PruebaMesas):
    URL = f'{API_MESAS}siguiente_numero/'

    def test_cafe_admin_usa_su_local_y_cuenta_las_desactivadas(self):
        Mesa.objects.filter(pk=self.mesas[2].pk).update(is_active=False)  # la 3 desactivada
        r = self.como(self.cafe_admin).get(self.URL, {'cafeteria': str(self.otro_cafe.pk)})  # se ignora
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data, {
            'numero': 4, 'cafeteria': str(self.cafe.pk), 'cafeteria_name': 'Café La Floresta',
            'mesas_activas': 2,
        })
        self.assertEqual(self.como(self.gerente).get(self.URL).data['numero'], 4)

        # Con huecos: el mayor + 1
        self.crear(self.cafe_admin, number=10)
        self.assertEqual(self.como(self.cafe_admin).get(self.URL).data['numero'], 11)

    def test_distribuidor_indica_un_local_de_su_cadena(self):
        self.assertEqual(self.como(self.distribuidor).get(self.URL).status_code, 400)
        r = self.como(self.distribuidor).get(self.URL, {'cafeteria': str(self.cafe2.pk)})
        self.assertEqual((r.status_code, r.data['numero']), (200, 2))
        for valor in (str(self.otro_cafe.pk), 'no-es-uuid'):
            self.assertEqual(self.como(self.distribuidor).get(self.URL, {'cafeteria': valor}).status_code, 404, valor)

    def test_super_admin_cualquier_local_y_local_sin_mesas(self):
        from .base import crear_cafeteria
        nuevo = crear_cafeteria(self.otro_tenant, 'Café Nuevo')
        r = self.como(self.super_admin).get(self.URL, {'cafeteria': str(nuevo.pk)})
        self.assertEqual((r.data['numero'], r.data['mesas_activas']), (1, 0))
        self.crear(self.super_admin, number=1, cafeteria=str(nuevo.pk))
        r = self.como(self.super_admin).get(self.URL, {'cafeteria': str(nuevo.pk)})
        self.assertEqual((r.data['numero'], r.data['mesas_activas']), (2, 1))
