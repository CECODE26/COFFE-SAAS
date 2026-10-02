"""Anti-CSRF, solo JSON, menú sin costos y límites anti-abuso (429 con retry_after)"""
import json
from decimal import Decimal

from apps.comensales.models import AlertaMesero, SesionCliente, SolicitudPago
from apps.menu.models import Category, MenuItem
from apps.pedidos.models import Order

from .base import API_CLIENTE, PruebaQR, crear_local


class AntiCsrfTests(PruebaQR):
    def test_post_sin_x_requested_with_403(self):
        ana = self.entrar('Ana')
        pedido = {'items': [{'menu_item': str(self.cappuccino.pk), 'cantidad': 1}]}
        casos = [
            ('entrar/', {'mesa': self.mesa.qr_code, 'nombre': 'Beto'}),
            ('reconectar/', {'mesa': self.mesa.qr_code, 'nombre': 'Ana', 'codigo': '1234'}),
            ('pedidos/', pedido),
            ('alertas/', {'tipo': 'ayuda'}),
            ('cuenta/', {'tipo': 'individual', 'confirmar': True}),
            ('salir/', {}),
        ]
        for ruta, datos in casos:
            r = ana.post(ruta, datos, xhr=False)
            self.assertEqual(r.status_code, 403, ruta)
        self.assertEqual(SesionCliente.objects.count(), 1)
        self.assertEqual(ana.sesion.estado, 'activa')
        self.assertFalse(Order.objects.exists())
        self.assertFalse(AlertaMesero.objects.exists())

        # Con el header sí pasa
        self.assertEqual(ana.post('pedidos/', pedido).status_code, 201)

    def test_solo_acepta_json(self):
        ana = self.entrar('Ana')
        r = ana.client.post(
            API_CLIENTE + 'alertas/', {'tipo': 'ayuda'}, HTTP_X_REQUESTED_WITH='XMLHttpRequest'
        )  # multipart, como un formulario
        self.assertEqual(r.status_code, 415)
        self.assertFalse(AlertaMesero.objects.exists())


class MenuTests(PruebaQR):
    def test_menu_sin_costo_ni_margen(self):
        # Lo que no debe aparecer: inactivos, no disponibles, categorías inactivas y el menú de otro tenant
        MenuItem.objects.create(
            tenant=self.local.tenant, category=self.local.bebidas, name='Mocaccino', slug='mocaccino',
            price=Decimal('3.10'), cost=Decimal('1.00'), is_available=False,
        )
        MenuItem.objects.create(
            tenant=self.local.tenant, category=self.local.bebidas, name='Frappé', slug='frappe',
            price=Decimal('3.50'), cost=Decimal('1.00'), is_active=False,
        )
        oculta = Category.objects.create(tenant=self.local.tenant, name='Temporada', slug='temporada', is_active=False)
        MenuItem.objects.create(
            tenant=self.local.tenant, category=oculta, name='Colada morada', slug='colada',
            price=Decimal('2.00'), cost=Decimal('0.80'),
        )
        crear_local()  # otro distribuidor con su propio Cappuccino

        ana = self.entrar('Ana')
        r = ana.get('menu/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['local']['nombre'], 'Café La Floresta')
        self.assertIn('banner', r.data['local'])
        self.assertEqual(r.data['mesa'], {'numero': 1, 'zona': 'Terraza'})
        self.assertEqual([c['nombre'] for c in r.data['categorias']], ['Bebidas', 'Sánduches'])

        items = [item for c in r.data['categorias'] for item in c['items']]
        self.assertEqual([i['nombre'] for i in items], ['Cappuccino', 'Sánduche de pernil'])
        self.assertEqual(set(items[0]), {
            'id', 'nombre', 'descripcion', 'precio', 'imagen', 'miniatura', 'vegetariano', 'vegano', 'gluten', 'tiempo',
        })
        self.assertEqual(items[0]['precio'], '2.80')
        self.assertIsNone(items[0]['imagen'])
        self.assertIsNone(items[0]['miniatura'])
        self.assertEqual(set(r.data['categorias'][0]) - {'items'}, {'id', 'nombre', 'icono'})

        texto = json.dumps(r.data).lower()
        for prohibido in ('cost', 'costo', 'margen', 'margin', '0.90', '1.70'):
            self.assertNotIn(prohibido, texto)

    def test_no_se_pueden_pedir_productos_no_disponibles_o_de_otro_tenant(self):
        ana = self.entrar('Ana')
        ajeno = crear_local().cappuccino
        r = ana.pedir((ajeno, 1))
        self.assertEqual(r.status_code, 400)
        MenuItem.objects.filter(pk=self.sanduche.pk).update(is_available=False)
        r = ana.pedir((self.sanduche, 1))
        self.assertEqual(r.status_code, 400)
        self.assertIn('Sánduche de pernil', r.data['detail'])
        self.assertEqual(ana.pedir((self.cappuccino, 21)).status_code, 400)
        self.assertEqual(ana.post('pedidos/', {'items': []}).status_code, 400)
        self.assertFalse(Order.objects.exists())

    def test_pedido_por_qr_entra_como_pendiente_con_el_precio_del_menu(self):
        ana = self.entrar('Ana')
        r = ana.pedir((self.cappuccino, 2), (self.sanduche, 1), nota='Sin azúcar')
        pedido = self.pedido_de(r)
        self.assertEqual(r.data['estado'], 'pendiente')
        self.assertEqual(r.data['estado_cliente'], 'enviado')
        self.assertEqual(r.data['alias'], 'ANA')
        self.assertEqual((r.data['subtotal'], r.data['iva'], r.data['total']), ('10.10', '1.52', '11.62'))
        self.assertEqual(pedido.order_type, 'mesa')
        self.assertEqual((pedido.mesa_id, pedido.cafeteria_id), (self.mesa.pk, self.local.cafe.pk))
        self.assertEqual((pedido.sesion_cliente_id, pedido.customer_name), (ana.id, 'ANA'))
        self.assertIsNone(pedido.created_by)
        self.assertRegex(pedido.order_number, r'^PED-\d{8}-\d{4}$')
        self.assertEqual(
            sorted(pedido.items.values_list('unit_price', flat=True)), [Decimal('2.80'), Decimal('4.50')]
        )


class AntiAbusoTests(PruebaQR):
    def assert_429(self, r, retry_after=None):
        self.assertEqual(r.status_code, 429, r.content)
        self.assertGreater(r.data['retry_after'], 0)
        self.assertEqual(r['Retry-After'], str(r.data['retry_after']))
        self.assertEqual(r.data['detail'], f"Espera {r.data['retry_after']} s antes de volver a intentarlo.")
        if retry_after is not None:
            self.assertEqual(r.data['retry_after'], retry_after)

    def test_maximo_5_pedidos_en_60_segundos(self):
        ana = self.entrar('Ana')
        for _ in range(5):
            self.pedido_de(ana.pedir((self.cappuccino, 1)))
        r = ana.pedir((self.cappuccino, 1))
        self.assert_429(r)
        self.assertLessEqual(r.data['retry_after'], 60)
        self.assertEqual(Order.objects.count(), 5)
        # El límite es por sesión: otra persona de la mesa sí puede pedir
        self.pedido_de(self.entrar('Beto').pedir((self.cappuccino, 1)))

    def test_llamar_al_mesero_1_cada_30_s_y_max_3_sin_atender(self):
        ana = self.entrar('Ana')
        r = ana.post('alertas/', {'tipo': 'ayuda'})
        self.assertEqual(r.status_code, 201)
        self.assert_429(ana.post('alertas/', {'tipo': 'ayuda'}), 30)

        clave = f'comensales:limite:alerta:{ana.id}'
        from django.core.cache import cache
        for mensaje in ('Otra servilleta', 'Un vaso de agua'):
            cache.delete(clave)  # pasaron los 30 s
            self.assertEqual(ana.post('alertas/', {'tipo': 'personalizado', 'mensaje': mensaje}).status_code, 201)
        cache.delete(clave)
        self.assert_429(ana.post('alertas/', {'tipo': 'ayuda'}), 30)  # 3 sin atender
        self.assertEqual(AlertaMesero.objects.filter(sesion_id=ana.id).count(), 3)

        # Cuando el personal atiende una, puede volver a llamar
        alerta = AlertaMesero.objects.filter(sesion_id=ana.id).first()
        r = self.personal().post(f'/api/v1/comensales/alertas/{alerta.pk}/atender/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(ana.post('alertas/', {'tipo': 'ayuda'}).status_code, 201)

    def test_pedir_la_cuenta_1_nueva_cada_30_s(self):
        ana = self.entrar('Ana')
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        # Pedir confirmación no consume el límite
        for _ in range(3):
            self.assertTrue(ana.pedir_cuenta('individual').data['requiere_confirmacion'])
        self.assertEqual(ana.pedir_cuenta('individual', confirmar=True).status_code, 201)
        # Devolver la pendiente (idempotencia) tampoco
        for _ in range(3):
            self.assertEqual(ana.pedir_cuenta('individual', confirmar=True).status_code, 200)
        # Una solicitud NUEVA dentro de los 30 s → 429
        self.assert_429(ana.pedir_cuenta('grupal', confirmar=True))
        self.assertEqual(SolicitudPago.objects.count(), 1)
