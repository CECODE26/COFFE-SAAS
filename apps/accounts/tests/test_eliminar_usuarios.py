"""Solo el super admin elimina cuentas; los pedidos, cobros y registros del eliminado se conservan"""
import uuid
from decimal import Decimal

from django.contrib import admin

from apps.accounts.models import User
from apps.auditoria.admin import RegistroAuditoriaAdmin
from apps.auditoria.models import RegistroAuditoria
from apps.comensales.models import AlertaMesero, SesionCliente, SolicitudPago
from apps.mesas.models import Mesa
from apps.pedidos.models import Order

from .base import API_USERS, PruebaUsuarios, crear_usuario


class EliminarUsuarioTests(PruebaUsuarios):

    def eliminar(self, quien, a_quien):
        pk = a_quien.pk if isinstance(a_quien, User) else a_quien
        return self.como(quien).delete(f'{API_USERS}{pk}/')

    def test_super_admin_elimina_a_otro_y_queda_en_auditoria(self):
        r = self.eliminar(self.super_admin, self.camarero)
        self.assertEqual(r.status_code, 204, getattr(r, 'data', r.content))
        self.assertFalse(User.objects.filter(pk=self.camarero.pk).exists())

        registro = RegistroAuditoria.objects.get(accion='usuario.eliminar')
        self.assertEqual(registro.usuario, self.super_admin)
        self.assertEqual(registro.objeto_tipo, 'accounts.User')
        self.assertEqual(registro.objeto_id, str(self.camarero.pk))
        self.assertEqual(registro.tenant_id, self.tenant.pk)
        self.assertEqual(registro.detalle['email'], self.camarero.email)
        self.assertEqual(registro.detalle['nombre'], self.camarero.get_full_name())
        self.assertEqual(registro.detalle['rol'], 'camarero')
        self.assertEqual(registro.detalle['tenant'], self.tenant.name)
        self.assertEqual(registro.detalle['cafeteria'], self.cafe.name)

    def test_super_admin_elimina_un_super_admin_creado_por_error(self):
        equivocado = crear_usuario('super_admin')
        self.assertEqual(self.eliminar(self.super_admin, equivocado).status_code, 204)
        self.assertFalse(User.objects.filter(pk=equivocado.pk).exists())
        registro = RegistroAuditoria.objects.get(accion='usuario.eliminar')
        self.assertIsNone(registro.detalle['tenant'])
        self.assertIsNone(registro.detalle['cafeteria'])

    def test_sus_pedidos_cobros_alertas_y_auditoria_se_conservan(self):
        mesa = Mesa.objects.create(tenant=self.tenant, cafeteria=self.cafe, number=1, slug='mesa-1')
        sesion = SesionCliente.objects.create(tenant=self.tenant, mesa=mesa, alias='Ana')
        pedido = Order.objects.create(
            tenant=self.tenant, cafeteria=self.cafe, order_type='mesa', mesa=mesa, created_by=self.camarero
        )
        cobro = SolicitudPago.objects.create(
            tenant=self.tenant, mesa=mesa, grupo=sesion, total=Decimal('4.50'),
            estado='procesada', metodo_pago='efectivo', procesada_por=self.camarero,
        )
        alerta = AlertaMesero.objects.create(
            tenant=self.tenant, mesa=mesa, sesion=sesion, atendida=True, atendida_por=self.camarero
        )
        bitacora = RegistroAuditoria.objects.create(
            tenant=self.tenant, usuario=self.camarero, accion='pedido.cobrar', objeto_tipo='pedidos.Order',
            objeto_id=str(pedido.pk), detalle={'total': '4.50'},
        )
        ajena = RegistroAuditoria.objects.create(tenant=self.tenant, usuario=self.cajero, accion='pedido.cobrar')

        self.assertEqual(self.eliminar(self.super_admin, self.camarero).status_code, 204)

        for objeto, campo in [(pedido, 'created_by'), (cobro, 'procesada_por'),
                              (alerta, 'atendida_por'), (bitacora, 'usuario')]:
            with self.subTest(modelo=objeto._meta.label):
                objeto.refresh_from_db()  # sigue existiendo
                self.assertIsNone(getattr(objeto, f'{campo}_id'))
        self.assertEqual(cobro.total, Decimal('4.50'))
        self.assertTrue(Mesa.objects.filter(pk=mesa.pk).exists())

        # La auditoría no pierde quién lo hizo: no se confunde con un comensal o el sistema
        self.assertEqual(bitacora.detalle['total'], '4.50')
        self.assertEqual(bitacora.detalle['usuario_eliminado'], {
            'id': str(self.camarero.pk), 'email': self.camarero.email,
            'nombre': self.camarero.get_full_name(), 'rol': 'camarero',
        })
        ajena.refresh_from_db()
        self.assertNotIn('usuario_eliminado', ajena.detalle)
        self.assertEqual(
            RegistroAuditoriaAdmin(RegistroAuditoria, admin.site).autor(bitacora),
            f'{self.camarero.email} (cuenta eliminada)',
        )

        # El registro del borrado dice cuántos registros quedaron sin su nombre
        eliminacion = RegistroAuditoria.objects.get(accion='usuario.eliminar')
        self.assertEqual(eliminacion.detalle['registros_sin_autor'], {
            'pedidos.Order': 1, 'comensales.SolicitudPago': 1,
            'comensales.AlertaMesero': 1, 'auditoria.RegistroAuditoria': 1,
        })

    def test_una_cuenta_sin_actividad_no_deja_registros_sin_autor(self):
        self.assertEqual(self.eliminar(self.super_admin, self.cocinero).status_code, 204)
        eliminacion = RegistroAuditoria.objects.get(accion='usuario.eliminar')
        self.assertEqual(eliminacion.detalle['registros_sin_autor'], {})
        self.assertNotIn('usuario_eliminado', eliminacion.detalle)

    def test_no_puede_eliminarse_a_si_mismo(self):
        r = self.eliminar(self.super_admin, self.super_admin)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['detail'], 'No puedes eliminar tu propia cuenta.')
        self.assertTrue(User.objects.filter(pk=self.super_admin.pk).exists())
        self.assertFalse(RegistroAuditoria.objects.filter(accion='usuario.eliminar').exists())

    def test_no_elimina_al_ultimo_super_admin_activo(self):
        # Con JWT un super admin inactivo no entra; force_authenticate permite probar la red de seguridad
        self.super_admin.is_active = False
        self.super_admin.save(update_fields=['is_active'])
        unico_activo = crear_usuario('super_admin')

        r = self.eliminar(self.super_admin, unico_activo)
        self.assertEqual(r.status_code, 400)
        self.assertIn('último super administrador activo', r.data['detail'])
        self.assertTrue(User.objects.filter(pk=unico_activo.pk).exists())
        self.assertFalse(RegistroAuditoria.objects.filter(accion='usuario.eliminar').exists())

    def test_elimina_un_super_admin_si_queda_otro_activo(self):
        self.super_admin.is_active = False
        self.super_admin.save(update_fields=['is_active'])
        objetivo = crear_usuario('super_admin')
        crear_usuario('super_admin')  # otro activo

        self.assertEqual(self.eliminar(self.super_admin, objetivo).status_code, 204)
        self.assertFalse(User.objects.filter(pk=objetivo.pk).exists())

    def test_elimina_un_super_admin_inactivo(self):
        inactivo = crear_usuario('super_admin')
        inactivo.is_active = False
        inactivo.save(update_fields=['is_active'])
        self.assertEqual(self.eliminar(self.super_admin, inactivo).status_code, 204)

    def test_los_demas_roles_reciben_403(self):
        casos = [
            (self.distribuidor, self.camarero),       # alguien de su red
            (self.cafe_admin, self.camarero),         # su propio personal
            (self.camarero, self.cajero),
            (self.distribuidor, self.distribuidor),   # ni siquiera a sí mismos
            (self.cafe_admin, self.cafe_admin),
        ]
        for quien, a_quien in casos:
            with self.subTest(quien=quien.role, a_quien=a_quien.email):
                r = self.eliminar(quien, a_quien)
                self.assertEqual(r.status_code, 403, r.data)
                self.assertTrue(User.objects.filter(pk=a_quien.pk).exists())
        self.assertFalse(RegistroAuditoria.objects.filter(accion='usuario.eliminar').exists())

    def test_sin_sesion_401(self):
        r = self.client.delete(f'{API_USERS}{self.camarero.pk}/')
        self.assertEqual(r.status_code, 401)

    def test_id_inexistente_404(self):
        self.assertEqual(self.eliminar(self.super_admin, uuid.uuid4()).status_code, 404)

    def test_activar_y_desactivar_siguen_igual(self):
        # Eliminar no cambia las reglas de CanManageUser
        r = self.como(self.distribuidor).post(f'{API_USERS}{self.camarero.pk}/deactivate/', {}, format='json')
        self.assertEqual(r.status_code, 200)
        r = self.como(self.cafe_admin).post(f'{API_USERS}{self.camarero.pk}/activate/', {}, format='json')
        self.assertEqual(r.status_code, 200)
        r = self.como(self.super_admin).post(f'{API_USERS}{self.super_admin.pk}/deactivate/', {}, format='json')
        self.assertEqual(r.status_code, 403)
