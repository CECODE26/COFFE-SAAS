"""Crear mesas desde el panel: local según el rol, QR generado, validaciones y máximo del local"""
from apps.auditoria.models import RegistroAuditoria
from apps.mesas.models import Mesa
from apps.mesas.serializers import MesaListSerializer

from .base import API_MESAS, PruebaMesas, crear_cafeteria, crear_mesa


class CrearMesaTests(PruebaMesas):

    def test_cafe_admin_crea_en_su_local_con_qr_nuevo(self):
        r = self.crear(
            self.cafe_admin, number=7, capacity=6, min_capacity=2, location='Terraza',
            description='Junto a la ventana', cafeteria=str(self.otro_cafe.pk),  # se ignora
        )
        self.assertEqual(r.status_code, 201, r.content)
        mesa = Mesa.objects.get(pk=r.data['id'])
        self.assertEqual(mesa.cafeteria, self.cafe)
        self.assertEqual(mesa.tenant, self.tenant)
        self.assertEqual((mesa.number, mesa.capacity, mesa.min_capacity), (7, 6, 2))
        self.assertEqual((mesa.location, mesa.description, mesa.slug), ('Terraza', 'Junto a la ventana', 'mesa-7'))
        self.assertTrue(mesa.is_active)
        self.assertEqual(mesa.status, 'disponible')

        # La respuesta trae lo mismo que la grilla de Mesas (MesaListSerializer)
        # (current_order_number no viene si la mesa no tiene pedido actual, igual que en el listado)
        self.assertEqual(set(r.data) | {'current_order_number'}, set(MesaListSerializer.Meta.fields))
        self.assertEqual(r.data['qr_code'], mesa.qr_code)
        self.assertEqual(r.data['cafeteria'], self.cafe.pk)
        self.assertEqual(r.data['cafeteria_name'], 'Café La Floresta')
        self.assertEqual(r.data['number'], 7)
        self.assertEqual(r.data['location'], 'Terraza')

        registro = RegistroAuditoria.objects.get(accion='mesa.crear')
        self.assertEqual((registro.usuario, registro.objeto_id), (self.cafe_admin, str(mesa.pk)))

    def test_el_qr_es_aleatorio_largo_y_no_se_acepta_del_cliente(self):
        r1 = self.crear(self.cafe_admin, number=8, qr_code='mesa-8-floresta')
        r2 = self.crear(self.cafe_admin, number=9)
        self.assertEqual((r1.status_code, r2.status_code), (201, 201))
        qr1, qr2 = r1.data['qr_code'], r2.data['qr_code']
        self.assertNotEqual(qr1, 'mesa-8-floresta')
        self.assertGreaterEqual(len(qr1), 22)
        self.assertGreaterEqual(len(qr2), 22)
        self.assertNotEqual(qr1, qr2)
        self.assertNotIn(r1.data['id'], qr1)
        self.assertNotIn(qr1, [m.qr_code for m in self.mesas])

    def test_la_mesa_nueva_ya_funciona_en_la_bienvenida_del_cliente(self):
        r = self.crear(self.gerente, number=10, location='Salón')
        self.assertEqual(r.status_code, 201, r.content)
        b = self.bienvenida(r.data['qr_code'])
        self.assertEqual(b.status_code, 200)
        self.assertEqual(b.data['variante'], 'normal')
        self.assertEqual(b.data['mesa']['numero'], 10)
        self.assertEqual(b.data['grupos'], [])
        # Y aparece en el listado del personal
        self.assertIn(r.data['id'], [m['id'] for m in self.listar(self.camarero)])

    def test_gerente_crea_en_su_local(self):
        r = self.crear(self.gerente, number=4)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Mesa.objects.get(pk=r.data['id']).cafeteria, self.cafe)

    def test_distribuidor_elige_un_local_de_su_cadena(self):
        r = self.crear(self.distribuidor, number=5, cafeteria=str(self.cafe2.pk))
        self.assertEqual(r.status_code, 201, r.content)
        mesa = Mesa.objects.get(pk=r.data['id'])
        self.assertEqual((mesa.cafeteria, mesa.tenant), (self.cafe2, self.tenant))

        # Sin local, con uno de otra cadena, inexistente o con formato inválido: 400 en 'cafeteria'
        for valor in (None, str(self.otro_cafe.pk), 'b1e2c3d4-0000-4000-8000-000000000000', 'no-es-uuid'):
            datos = {'number': 6}
            if valor is not None:
                datos['cafeteria'] = valor
            r = self.crear(self.distribuidor, **datos)
            self.assertEqual(r.status_code, 400, (valor, r.content))
            self.assertIn('cafeteria', r.data)
        self.assertFalse(Mesa.objects.filter(cafeteria=self.otro_cafe, number=6).exists())

    def test_super_admin_crea_en_cualquier_local_abierto(self):
        r = self.crear(self.super_admin, number=2, cafeteria=str(self.otro_cafe.pk))
        self.assertEqual(r.status_code, 201, r.content)
        mesa = Mesa.objects.get(pk=r.data['id'])
        self.assertEqual((mesa.cafeteria, mesa.tenant), (self.otro_cafe, self.otro_tenant))

        self.assertEqual(self.crear(self.super_admin, number=3).status_code, 400)

    def test_local_cerrado_no_admite_mesas_nuevas(self):
        cerrado = crear_cafeteria(self.tenant, 'Café Quicentro', is_active=False)
        r = self.crear(self.distribuidor, number=1, cafeteria=str(cerrado.pk))
        self.assertEqual(r.status_code, 400)
        self.assertIn('está cerrado', r.data['cafeteria'][0])

        r = self.crear(self.super_admin, number=1, cafeteria=str(cerrado.pk))
        self.assertEqual(r.status_code, 400)
        self.assertFalse(cerrado.mesas.exists())

    def test_numero_repetido_en_el_mismo_local(self):
        crear_mesa(self.cafe, 7)
        r = self.crear(self.cafe_admin, number=7)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['number'][0], 'Ya existe la mesa 7 en este local.')

        # También con una mesa desactivada (el número sigue ocupado)
        crear_mesa(self.cafe, 8, is_active=False)
        r = self.crear(self.cafe_admin, number=8)
        self.assertEqual(r.status_code, 400)
        self.assertIn('Ya existe la mesa 8 en este local (desactivada)', r.data['number'][0])

        # El mismo número en otro local sí se puede
        self.assertEqual(self.crear(self.distribuidor, number=7, cafeteria=str(self.cafe2.pk)).status_code, 201)

    def test_validaciones_de_numero_y_capacidad(self):
        casos = [
            ({'capacity': 4}, 'number'),
            ({'number': 0}, 'number'),
            ({'number': 'siete'}, 'number'),
            ({'number': 11, 'capacity': 0}, 'capacity'),
            ({'number': 11, 'capacity': 31}, 'capacity'),
            ({'number': 11, 'capacity': 4, 'min_capacity': 0}, 'min_capacity'),
            ({'number': 11, 'capacity': 4, 'min_capacity': 5}, 'min_capacity'),
            ({'number': 11, 'capacity': 1}, None),  # sin mínimo: 1
            ({'number': 12, 'capacity': 30, 'min_capacity': 30}, None),
        ]
        for datos, campo in casos:
            r = self.crear(self.cafe_admin, **datos)
            if campo is None:
                self.assertEqual(r.status_code, 201, (datos, r.content))
            else:
                self.assertEqual(r.status_code, 400, (datos, r.content))
                self.assertIn(campo, r.data, (datos, r.data))

        r = self.crear(self.cafe_admin, number=13, capacity=4, min_capacity=5)
        self.assertEqual(r.data['min_capacity'][0], 'La capacidad mínima (5) no puede ser mayor que la capacidad (4).')

        mesa = Mesa.objects.get(cafeteria=self.cafe, number=11)
        self.assertEqual((mesa.capacity, mesa.min_capacity), (1, 1))

    def test_no_hay_tope_de_mesas_por_local(self):
        # El administrador del negocio crea las mesas que quiera
        for numero in range(4, 40):
            self.assertEqual(self.crear(self.cafe_admin, number=numero).status_code, 201, numero)
        self.assertEqual(Mesa.objects.filter(cafeteria=self.cafe, is_active=True).count(), 39)

    def test_la_respuesta_aparece_en_el_listado_de_gestion(self):
        r = self.crear(self.distribuidor, number=20, cafeteria=str(self.cafe.pk), location='Patio')
        fila = next(m for m in self.listar(self.distribuidor) if m['id'] == r.data['id'])
        self.assertEqual(fila, r.data)
        self.assertEqual(self.como(self.camarero).get(f'{API_MESAS}{r.data["id"]}/').status_code, 200)
