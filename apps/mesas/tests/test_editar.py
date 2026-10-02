"""Editar mesas (PATCH/PUT): campos permitidos, número único y lo que no se puede cambiar por aquí"""
from apps.auditoria.models import RegistroAuditoria
from apps.mesas.models import Mesa

from .base import API_MESAS, PruebaMesas, crear_mesa


class EditarMesaTests(PruebaMesas):

    def test_edita_numero_capacidad_zona_y_descripcion(self):
        r = self.editar(
            self.cafe_admin, self.mesa, number=15, capacity=8, min_capacity=3,
            location='Patio', description='Mesa larga',
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.mesa.refresh_from_db()
        self.assertEqual(
            (self.mesa.number, self.mesa.capacity, self.mesa.min_capacity, self.mesa.location, self.mesa.description),
            (15, 8, 3, 'Patio', 'Mesa larga')
        )
        self.assertEqual(self.mesa.slug, 'mesa-15')
        # Responde con la fila de la grilla
        self.assertEqual((r.data['id'], r.data['number'], r.data['cafeteria_name']), (str(self.mesa.pk), 15, 'Café La Floresta'))
        self.assertEqual(r.data['qr_code'], self.mesa.qr_code)

        registro = RegistroAuditoria.objects.get(accion='mesa.editar')
        self.assertEqual(registro.detalle['cambios']['number'], [1, 15])

    def test_gerente_y_distribuidor_tambien_editan(self):
        self.assertEqual(self.editar(self.gerente, self.mesa, location='Salón').status_code, 200)
        self.assertEqual(self.editar(self.distribuidor, self.mesa_cafe2, capacity=2, min_capacity=1).status_code, 200)
        self.assertEqual(self.editar(self.super_admin, self.mesa_otro, description='VIP').status_code, 200)
        self.mesa.refresh_from_db()
        self.assertEqual(self.mesa.location, 'Salón')

    def test_no_cambia_qr_tenant_ni_local(self):
        qr = self.mesa.qr_code
        r = self.editar(
            self.distribuidor, self.mesa, qr_code='otro-qr', cafeteria=str(self.cafe2.pk),
            tenant=str(self.otro_tenant.pk), status='ocupada', guest_count=3, location='Barra',
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.mesa.refresh_from_db()
        self.assertEqual(self.mesa.qr_code, qr)
        self.assertEqual((self.mesa.cafeteria, self.mesa.tenant), (self.cafe, self.tenant))
        self.assertEqual((self.mesa.status, self.mesa.guest_count), ('disponible', 0))
        self.assertEqual(self.mesa.location, 'Barra')

    def test_numero_repetido_al_editar(self):
        r = self.editar(self.cafe_admin, self.mesa, number=2)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['number'][0], 'Ya existe la mesa 2 en este local.')

        # Mantener su propio número no choca, y el número de otro local está libre
        self.assertEqual(self.editar(self.cafe_admin, self.mesa, number=1, location='Salón').status_code, 200)
        self.assertEqual(self.editar(self.distribuidor, self.mesa_cafe2, number=2).status_code, 200)

        crear_mesa(self.cafe, 9, is_active=False)
        r = self.editar(self.cafe_admin, self.mesa, number=9)
        self.assertIn('(desactivada)', r.data['number'][0])

    def test_capacidad_minima_con_los_valores_actuales(self):
        Mesa.objects.filter(pk=self.mesa.pk).update(capacity=4, min_capacity=3)
        r = self.editar(self.cafe_admin, self.mesa, capacity=2)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['min_capacity'][0], 'La capacidad mínima (3) no puede ser mayor que la capacidad (2).')
        self.assertEqual(self.editar(self.cafe_admin, self.mesa, capacity=31).status_code, 400)
        self.assertEqual(self.editar(self.cafe_admin, self.mesa, capacity=2, min_capacity=2).status_code, 200)

    def test_is_active_no_se_cambia_por_patch(self):
        r = self.editar(self.cafe_admin, self.mesa, is_active=False)
        self.assertEqual(r.status_code, 400)
        self.assertIn('desactivar', r.data['is_active'][0])
        self.mesa.refresh_from_db()
        self.assertTrue(self.mesa.is_active)
        # Enviar el mismo valor (un formulario completo) no molesta
        self.assertEqual(self.editar(self.cafe_admin, self.mesa, is_active=True, location='Barra').status_code, 200)

    def test_put_completo(self):
        r = self.como(self.cafe_admin).put(
            f'{API_MESAS}{self.mesa.pk}/',
            {'number': 21, 'capacity': 2, 'min_capacity': 1, 'location': '', 'description': ''},
            format='json'
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.mesa.refresh_from_db()
        self.assertEqual((self.mesa.number, self.mesa.location), (21, ''))

    def test_editar_una_mesa_desactivada(self):
        Mesa.objects.filter(pk=self.mesa.pk).update(is_active=False)
        self.assertEqual(self.editar(self.cafe_admin, self.mesa, location='Bodega').status_code, 200)
