"""Desactivar/reactivar mesas (en vez de borrarlas) y borrar solo las que nunca se usaron"""
from datetime import timedelta

from django.utils import timezone

from apps.auditoria.models import RegistroAuditoria
from apps.comensales.models import SesionCliente
from apps.mesas.models import Mesa, Reserva
from apps.pedidos.models import Order

from .base import API_MESAS, PruebaMesas, crear_mesa


class DesactivarReactivarTests(PruebaMesas):

    def test_desactivar_saca_la_mesa_de_la_operacion_y_reactivar_la_devuelve(self):
        r = self.accion(self.cafe_admin, self.mesa, 'desactivar')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn('desactivada', r.data['message'])
        self.assertFalse(r.data['mesa']['is_active'])
        self.mesa.refresh_from_db()
        self.assertFalse(self.mesa.is_active)
        qr = self.mesa.qr_code

        # El QR ya no deja entrar y la mesa no aparece en los listados de operación
        self.assertEqual(self.bienvenida(qr).data['variante'], 'sin_mesa')
        self.assertNotIn(str(self.mesa.pk), [m['id'] for m in self.listar(self.cafe_admin)])
        self.assertEqual(self.como(self.camarero).get(f'{API_MESAS}stats/').data['total_mesas'], 2)
        r = self.como(self.camarero).get(f'{API_MESAS}by_qr/', {'qr_code': qr})
        self.assertEqual(r.status_code, 404)

        # Gestión la ve con ?incluir_inactivas=1; el resto del personal no (el parámetro se ignora)
        ids = [m['id'] for m in self.listar(self.gerente, incluir_inactivas=1)]
        self.assertIn(str(self.mesa.pk), ids)
        self.assertEqual(len(ids), 3)
        self.assertNotIn(str(self.mesa.pk), [m['id'] for m in self.listar(self.camarero, incluir_inactivas=1)])
        # El detalle sí la encuentra (para gestionarla)
        self.assertEqual(self.como(self.cafe_admin).get(f'{API_MESAS}{self.mesa.pk}/').status_code, 200)

        # No se puede ocupar ni cambiar de estado mientras está desactivada
        r = self.accion(self.camarero, self.mesa, 'occupy', {'guest_count': 2})
        self.assertEqual(r.status_code, 400)
        self.assertIn('desactivada', r.data['error'])
        r = self.accion(self.camarero, self.mesa, 'change_status', {'status': 'ocupada', 'guest_count': 2})
        self.assertEqual(r.status_code, 400)

        # Desactivar dos veces: 400 claro
        r = self.accion(self.cafe_admin, self.mesa, 'desactivar')
        self.assertEqual((r.status_code, r.data['error']), (400, 'La mesa 1 ya está desactivada.'))

        r = self.accion(self.gerente, self.mesa, 'reactivar')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.data['mesa']['is_active'])
        self.mesa.refresh_from_db()
        self.assertTrue(self.mesa.is_active)
        self.assertEqual(self.mesa.qr_code, qr)  # el mismo QR impreso vuelve a servir
        self.assertEqual(self.bienvenida(qr).data['variante'], 'normal')

        r = self.accion(self.gerente, self.mesa, 'reactivar')
        self.assertEqual((r.status_code, r.data['error']), (400, 'La mesa 1 ya está activa.'))

        acciones = set(RegistroAuditoria.objects.values_list('accion', flat=True))
        self.assertTrue({'mesa.desactivar', 'mesa.reactivar'} <= acciones)

    def test_reactivar_no_tiene_tope_de_mesas(self):
        # El negocio decide cuántas mesas tiene: reactivar nunca choca con un máximo
        self.accion(self.cafe_admin, self.mesa, 'desactivar')
        for numero in range(4, 30):
            self.assertEqual(self.crear(self.cafe_admin, number=numero).status_code, 201)

        r = self.accion(self.cafe_admin, self.mesa, 'reactivar')
        self.assertEqual(r.status_code, 200, r.content)
        self.mesa.refresh_from_db()
        self.assertTrue(self.mesa.is_active)

    def test_mesa_ocupada_no_se_desactiva(self):
        self.mesa.occupy(2)
        r = self.accion(self.cafe_admin, self.mesa, 'desactivar')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['error'], 'La mesa 1 está ocupada: libérala antes de desactivarla.')
        self.mesa.refresh_from_db()
        self.assertTrue(self.mesa.is_active)

    def test_mesa_con_gente_conectada_por_qr_no_se_desactiva(self):
        self.entrar_por_qr(self.mesa)
        # Aunque el personal no la haya marcado ocupada, la sesión activa bloquea
        Mesa.objects.filter(pk=self.mesa.pk).update(status='disponible')
        r = self.accion(self.cafe_admin, self.mesa, 'desactivar')
        self.assertEqual(r.status_code, 400)
        self.assertIn('1 persona(s) conectadas por QR', r.data['error'])
        self.mesa.refresh_from_db()
        self.assertTrue(self.mesa.is_active)

    def test_mesa_con_pedido_abierto_del_personal_no_se_desactiva(self):
        pedido = Order.objects.create(
            tenant=self.tenant, cafeteria=self.cafe, order_type='mesa', mesa=self.mesa, created_by=self.camarero
        )
        r = self.accion(self.distribuidor, self.mesa, 'desactivar')
        self.assertEqual(r.status_code, 400)
        self.assertIn(f'tiene el pedido {pedido.order_number} abierto', r.data['error'])

        # Cobrado ya no bloquea
        Order.objects.filter(pk=pedido.pk).update(is_paid=True)
        self.assertEqual(self.accion(self.distribuidor, self.mesa, 'desactivar').status_code, 200)

    def test_mesa_con_reservas_pendientes_no_se_desactiva(self):
        reserva = Reserva.objects.create(
            mesa=self.mesa, customer_name='Lucía Andrade', customer_phone='0991234567', guest_count=2,
            reservation_date=timezone.localdate() + timedelta(days=1), reservation_time='19:00',
        )
        r = self.accion(self.cafe_admin, self.mesa, 'desactivar')
        self.assertEqual(r.status_code, 400)
        self.assertIn('1 reserva(s) pendientes', r.data['error'])

        reserva.cancel()
        self.assertEqual(self.accion(self.cafe_admin, self.mesa, 'desactivar').status_code, 200)

    def test_desactivar_cierra_las_sesiones_ya_cobradas_y_deja_la_mesa_limpia(self):
        self.entrar_por_qr(self.mesa)
        SesionCliente.objects.filter(mesa=self.mesa).update(estado='pagada', pagada_at=timezone.now())
        Mesa.objects.filter(pk=self.mesa.pk).update(status='limpiando', nota_cierre='Queda $2.00 sin cobrar')

        r = self.accion(self.cafe_admin, self.mesa, 'desactivar')
        self.assertEqual(r.status_code, 200, r.content)
        self.mesa.refresh_from_db()
        self.assertEqual((self.mesa.status, self.mesa.nota_cierre, self.mesa.is_active), ('disponible', '', False))
        self.assertFalse(SesionCliente.objects.filter(mesa=self.mesa, estado='pagada').exists())

    def test_una_mesa_desactivada_no_se_puede_reservar(self):
        Mesa.objects.filter(pk=self.mesa.pk).update(is_active=False)
        r = self.como(self.cafe_admin).post('/api/v1/mesas/reservas/', {
            'mesa': str(self.mesa.pk), 'customer_name': 'Lucía', 'customer_phone': '0991234567',
            'guest_count': 2, 'reservation_date': str(timezone.localdate() + timedelta(days=1)),
            'reservation_time': '19:00',
        }, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('desactivada', r.data['mesa'][0])


class BorrarMesaTests(PruebaMesas):

    def test_mesa_sin_historial_se_borra(self):
        r = self.como(self.gerente).delete(f'{API_MESAS}{self.mesa.pk}/')
        self.assertEqual(r.status_code, 204)
        self.assertFalse(Mesa.objects.filter(pk=self.mesa.pk).exists())
        self.assertTrue(RegistroAuditoria.objects.filter(accion='mesa.borrar', objeto_id=str(self.mesa.pk)).exists())

    def test_mesa_con_pedidos_del_personal_no_se_borra(self):
        pedido = Order.objects.create(
            tenant=self.tenant, cafeteria=self.cafe, order_type='mesa', mesa=self.mesa, is_paid=True
        )
        r = self.como(self.cafe_admin).delete(f'{API_MESAS}{self.mesa.pk}/')
        self.assertEqual(r.status_code, 400)
        self.assertIn('desactívala en vez de borrarla', r.data['error'])
        pedido.refresh_from_db()
        self.assertEqual(pedido.mesa_id, self.mesa.pk)  # el historial no se pierde

    def test_mesa_con_sesiones_qr_o_reservas_no_se_borra(self):
        self.entrar_por_qr(self.mesa)
        r = self.como(self.distribuidor).delete(f'{API_MESAS}{self.mesa.pk}/')
        self.assertEqual(r.status_code, 400)
        self.assertIn('desactívala', r.data['error'])

        mesa = self.mesas[1]
        Reserva.objects.create(
            mesa=mesa, customer_name='Lucía', customer_phone='0991234567', guest_count=2,
            reservation_date=timezone.localdate() - timedelta(days=3), reservation_time='19:00', status='completada',
        )
        self.assertEqual(self.como(self.distribuidor).delete(f'{API_MESAS}{mesa.pk}/').status_code, 400)
        self.assertTrue(Reserva.objects.filter(mesa=mesa).exists())

    def test_mesa_ocupada_sin_historial_no_se_borra(self):
        mesa = crear_mesa(self.cafe, 9, status='ocupada', guest_count=2)
        r = self.como(self.cafe_admin).delete(f'{API_MESAS}{mesa.pk}/')
        self.assertEqual(r.status_code, 400)
        self.assertIn('ocupada', r.data['error'])
