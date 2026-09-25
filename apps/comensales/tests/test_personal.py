"""API del personal (JWT): alcance, detalle de mesa, cobrar, cerrar, "Mesa lista", tablero y mark_paid"""
from decimal import Decimal

from rest_framework.test import APIClient

from apps.auditoria.models import RegistroAuditoria
from apps.comensales.models import AlertaMesero, SesionCliente, SolicitudPago
from apps.pedidos.models import Order, OrderItem

from .base import (
    API_MESAS, API_PEDIDOS, API_PERSONAL, CLAVE, PruebaQR, crear_cafeteria, crear_local, crear_mesa, crear_usuario,
)


class AlcancePersonalTests(PruebaQR):
    def setUp(self):
        super().setUp()
        self.ana = self.entrar('Ana')
        self.pedido_de(self.ana.pedir((self.cappuccino, 1)))
        self.ana.post('alertas/', {'tipo': 'ayuda'})
        self.alerta = AlertaMesero.objects.get()
        otra_cafeteria = crear_cafeteria(self.local.tenant, 'Café Cumbayá')
        crear_mesa(otra_cafeteria, 1)
        self.cajero_otro_local = crear_usuario('cajero', self.local.tenant, otra_cafeteria)
        self.admin_otro_tenant = crear_local().distribuidor

    def rutas(self):
        base = f'{API_PERSONAL}mesas/{self.mesa.pk}/'
        return [
            ('get', base, None),
            ('post', base + 'cobrar/', {'metodo_pago': 'efectivo', 'sesiones': [str(self.ana.id)]}),
            ('post', base + 'cerrar/', None),
            ('post', f'{API_PERSONAL}sesiones/{self.ana.id}/codigo/', None),
            ('post', f'{API_PERSONAL}alertas/{self.alerta.pk}/atender/', None),
        ]

    def test_personal_de_otra_cafeteria_u_otro_tenant_recibe_404(self):
        for usuario in (self.cajero_otro_local, self.admin_otro_tenant):
            client = self.personal(usuario)
            for metodo, ruta, datos in self.rutas():
                r = getattr(client, metodo)(ruta, datos, format='json')
                self.assertEqual(r.status_code, 404, (usuario.role, ruta))
            self.assertEqual(client.get(f'{API_PERSONAL}resumen/').data, {})
            self.assertEqual(client.get(f'{API_PERSONAL}alertas/').data, [])
        # Nada cambió
        self.assertEqual(self.ana.sesion.estado, 'activa')
        self.assertFalse(self.ana.sesion.codigo_reconexion)
        self.assertFalse(AlertaMesero.objects.get().atendida)

    def test_sin_autenticar_401_y_clientes_403(self):
        r = APIClient().get(f'{API_PERSONAL}mesas/{self.mesa.pk}/')
        self.assertEqual(r.status_code, 401)
        cliente = crear_usuario('usuario', self.local.tenant)
        r = self.personal(cliente).get(f'{API_PERSONAL}mesas/{self.mesa.pk}/')
        self.assertEqual(r.status_code, 403)

    def test_distribuidor_y_personal_del_local_ven_la_mesa_con_jwt(self):
        # JWT real (login con email y contraseña), como el panel
        r = APIClient().post('/api/v1/auth/login/', {'email': self.local.camarero.email, 'password': CLAVE},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        r = client.get(f'{API_PERSONAL}mesas/{self.mesa.pk}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['mesa']['numero'], 1)
        self.assertEqual(r.data['mesa']['qr_code'], self.mesa.qr_code)
        self.assertEqual(r.data['grupos'][0]['integrantes'][0]['alias'], 'ANA')
        self.assertEqual(r.data['grupos'][0]['por_cobrar'], '3.22')
        self.assertEqual(r.data['alertas'][0]['alias'], 'ANA')

        r = self.personal(self.local.distribuidor).get(f'{API_PERSONAL}resumen/')
        self.assertEqual(r.data[str(self.mesa.pk)], {
            'personas': 1, 'por_cobrar': '3.22', 'solicitudes_pendientes': 0, 'alertas_pendientes': 1,
        })
        r = self.personal(self.local.distribuidor).get(f'{API_PERSONAL}alertas/')
        self.assertEqual(r.data[0]['mesa']['numero'], 1)


class CobrarTests(PruebaQR):
    def setUp(self):
        super().setUp()
        self.ana = self.entrar('Ana')
        self.beto = self.entrar('Beto')
        self.pedido_ana = self.pedido_de(self.ana.pedir((self.cappuccino, 1)))  # 3.22
        self.pedido_beto = self.pedido_de(self.beto.pedir((self.sanduche, 1)))  # 5.18

    def test_cobro_parcial_deja_la_mesa_ocupada_con_la_nota_y_el_ultimo_la_pasa_a_limpiando(self):
        r = self.cobrar({'metodo_pago': 'tarjeta', 'sesiones': [str(self.ana.id)]})
        self.assertEqual(r.status_code, 200, r.content)
        nota = 'Queda $5.18 sin cobrar (1 sesión(es) activa(s))'
        self.assertEqual(r.data['total_cobrado'], '3.22')
        self.assertEqual(r.data['mesa_estado'], 'ocupada')
        self.assertEqual(r.data['nota_cierre'], nota)
        self.assertEqual(r.data['sesiones'], [str(self.ana.id)])

        mesa = self.recargar_mesa()
        self.assertEqual((mesa.status, mesa.nota_cierre, mesa.guest_count), ('ocupada', nota, 1))
        self.pedido_ana.refresh_from_db()
        self.assertTrue(self.pedido_ana.is_paid)
        self.assertEqual(self.pedido_ana.payment_method, 'tarjeta')
        self.assertIsNotNone(self.pedido_ana.paid_at)
        self.assertEqual(self.ana.sesion.estado, 'pagada')
        self.assertIsNotNone(self.ana.sesion.pagada_at)
        alerta = AlertaMesero.objects.get(sesion__isnull=True)
        self.assertEqual((alerta.tipo, alerta.mensaje), ('personalizado', nota))
        solicitud = SolicitudPago.objects.get()
        self.assertEqual((solicitud.estado, solicitud.metodo_pago, solicitud.total), ('procesada', 'tarjeta', Decimal('3.22')))
        self.assertEqual(solicitud.procesada_por, self.local.cajero)

        detalle = self.personal().get(f'{API_PERSONAL}mesas/{self.mesa.pk}/').data
        self.assertEqual(detalle['mesa']['nota_cierre'], nota)
        self.assertEqual([a['mensaje'] for a in detalle['alertas']], [nota])

        # Último cobro: la mesa pasa a 'limpiando' (en cierre) sin nota
        r = self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(self.beto.id)]})
        self.assertEqual(r.data, {
            'total_cobrado': '5.18', 'mesa_estado': 'limpiando', 'nota_cierre': '',
            'sesiones': [str(self.beto.id)], 'solicitud': r.data['solicitud'],
        })
        mesa = self.recargar_mesa()
        self.assertEqual((mesa.status, mesa.nota_cierre, mesa.guest_count), ('limpiando', '', 0))
        self.assertEqual(RegistroAuditoria.objects.filter(accion='comensales.cobrar').count(), 2)
        self.assertFalse(Order.objects.filter(is_paid=False).exists())

    def test_cobro_total_por_solicitud_grupal(self):
        solicitud = self.beto.pedir_cuenta('individual', confirmar=True).data['solicitud']
        r = self.cobrar({'metodo_pago': 'transferencia', 'sesiones': [str(self.ana.id), str(self.beto.id)]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data['total_cobrado'], r.data['mesa_estado']), ('8.40', 'limpiando'))
        # La cuenta que había pedido BETO ya no queda pendiente
        self.assertFalse(SolicitudPago.objects.filter(pk=solicitud['id'], estado='pendiente').exists())
        self.assertEqual(SolicitudPago.objects.get(estado='procesada').tipo, 'grupal')

    def test_errores_de_cobro_400(self):
        casos = [
            {'sesiones': [str(self.ana.id)]},  # sin método
            {'metodo_pago': 'bitcoin', 'sesiones': [str(self.ana.id)]},
            {'metodo_pago': 'efectivo'},  # nada que cobrar
        ]
        for datos in casos:
            self.assertEqual(self.cobrar(datos).status_code, 400, datos)

        zoe = self.entrar('Zoe', mesa=self.mesa2)
        self.pedido_de(zoe.pedir((self.cappuccino, 1)))
        r = self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(self.ana.id), str(zoe.id)]})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data, {'error': 'Hay personas que no están en esta mesa.'})

        carla = self.entrar('Carla')  # sin consumo
        self.assertEqual(self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(carla.id)]}).status_code, 400)

        self.assertEqual(self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(self.ana.id)]}).status_code, 200)
        r = self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(self.ana.id)]})  # ya pagada
        self.assertEqual(r.status_code, 400)
        self.assertEqual(SolicitudPago.objects.filter(estado='procesada').count(), 1)

    def test_cerrar_mesa_con_consumo_400(self):
        r = self.personal().post(f'{API_PERSONAL}mesas/{self.mesa.pk}/cerrar/')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data, {'error': 'La mesa tiene consumo sin cobrar: cóbralo antes de cerrarla'})
        self.assertEqual(SesionCliente.objects.filter(estado='activa').count(), 2)

    def test_cerrar_mesa_sin_consumo(self):
        carla = self.entrar('Carla', mesa=self.mesa2)
        dani = self.entrar('Dani', mesa=self.mesa2)
        r = self.personal().post(f'{API_PERSONAL}mesas/{self.mesa2.pk}/cerrar/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.recargar_mesa(self.mesa2).status, 'disponible')
        for comensal in (carla, dani):
            self.assertEqual((comensal.sesion.estado, comensal.sesion.motivo_cierre), ('cerrada', 'mesero'))
        self.assertTrue(RegistroAuditoria.objects.filter(accion='comensales.cerrar_mesa').exists())
        r = carla.get('sesion/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sesion_cerrada'))

    def test_mesa_lista_cierra_las_pagadas_y_deja_la_mesa_disponible(self):
        # Con gente conectada, liberar la mesa se bloquea con el mensaje del contrato
        r = self.personal().post(f'{API_MESAS}{self.mesa.pk}/free/')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(
            r.data['error'],
            'La mesa 1 tiene 2 persona(s) conectadas por QR: cóbralas o ciérrala desde el detalle de la mesa.',
        )
        self.assertEqual(self.personal().post(f'{API_MESAS}{self.mesa.pk}/cleaning/').status_code, 400)

        self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(self.ana.id), str(self.beto.id)]})
        self.assertEqual(self.recargar_mesa().status, 'limpiando')
        self.assertEqual(self.bienvenida(self.mesa.qr_code).data['variante'], 'en_cierre')

        r = self.personal().post(f'{API_MESAS}{self.mesa.pk}/free/')
        self.assertEqual(r.status_code, 200, r.content)
        mesa = self.recargar_mesa()
        self.assertEqual((mesa.status, mesa.nota_cierre, mesa.guest_count), ('disponible', '', 0))
        for comensal in (self.ana, self.beto):
            self.assertEqual((comensal.sesion.estado, comensal.sesion.motivo_cierre), ('cerrada', 'mesa_lista'))
        r = self.ana.get('ticket/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sesion_cerrada'))

        # La mesa vuelve a recibir gente
        self.assertEqual(self.bienvenida(self.mesa.qr_code).data['variante'], 'normal')
        self.entrar('Ana')


class PedidosPersonalTests(PruebaQR):
    def setUp(self):
        super().setUp()
        self.ana = self.entrar('Ana')
        self.pedido_qr = self.pedido_de(self.ana.pedir((self.cappuccino, 1), nota='Con canela'))
        # Pedido del personal en otra mesa
        self.pedido_personal = Order.objects.create(
            tenant=self.local.tenant, cafeteria=self.local.cafe, order_type='mesa', mesa=self.mesa2,
            created_by=self.local.camarero, status='pendiente',
        )
        OrderItem.objects.create(order=self.pedido_personal, menu_item=self.sanduche, quantity=1, unit_price=Decimal('4.50'))
        self.pedido_personal.calculate_total()

    def test_mark_paid_de_un_pedido_qr_400(self):
        r = self.personal().post(f'{API_PEDIDOS}{self.pedido_qr.pk}/mark_paid/', {'payment_method': 'efectivo'})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(
            r.data['error'], 'Este pedido se hizo por QR: cóbralo desde la cuenta de la mesa (Mesas → detalle).'
        )
        self.pedido_qr.refresh_from_db()
        self.assertFalse(self.pedido_qr.is_paid)
        # Los pedidos del personal se siguen cobrando como antes
        r = self.personal().post(f'{API_PEDIDOS}{self.pedido_personal.pk}/mark_paid/', {'payment_method': 'efectivo'})
        self.assertEqual(r.status_code, 200)

    def test_tablero_devuelve_origen_y_alias(self):
        r = self.personal(self.local.cocinero).get(f'{API_PEDIDOS}tablero/')
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.data, list)  # sin paginar
        por_id = {p['id']: p for p in r.data}
        qr = por_id[str(self.pedido_qr.pk)]
        self.assertEqual(
            (qr['origen'], qr['comensal_alias'], qr['mesa_numero'], qr['mesa_zona']), ('qr', 'ANA', 1, 'Terraza')
        )
        for campo in ('items', 'created_at', 'confirmed_at', 'updated_at', 'is_paid', 'status'):
            self.assertIn(campo, qr)
        self.assertEqual(qr['items'][0]['menu_item_name'], 'Cappuccino')
        personal = por_id[str(self.pedido_personal.pk)]
        self.assertEqual((personal['origen'], personal['comensal_alias'], personal['mesa_numero']), ('personal', None, 2))
        self.assertEqual([p['id'] for p in r.data], [str(self.pedido_qr.pk), str(self.pedido_personal.pk)])

        # El detalle y el listado también distinguen el origen
        r = self.personal().get(f'{API_PEDIDOS}{self.pedido_qr.pk}/')
        self.assertEqual((r.data['origen'], r.data['comensal_alias']), ('qr', 'ANA'))
        r = self.personal().get(API_PEDIDOS)
        self.assertEqual({p['origen'] for p in r.data['results']}, {'qr', 'personal'})

    def test_el_cliente_ve_en_vivo_el_avance_del_tablero(self):
        caja = self.personal(self.local.cajero)
        cocina = self.personal(self.local.cocinero)
        pasos = [
            (None, None, 'pendiente', 'enviado'),
            (caja, 'confirm', 'confirmada', 'en_cocina'),
            (cocina, 'send_to_kitchen', 'preparando', 'preparando'),
            (cocina, 'mark_ready', 'lista', 'listo'),
            (caja, 'complete', 'entregada', 'entregado'),
        ]
        for client, accion, estado, estado_cliente in pasos:
            if client is not None:
                r = client.post(f'{API_PEDIDOS}{self.pedido_qr.pk}/{accion}/')
                self.assertEqual(r.status_code, 200, (accion, r.content))
            pedido = self.ana.get('pedidos/').data[0]
            self.assertEqual((pedido['estado'], pedido['estado_cliente']), (estado, estado_cliente))

        # Cancelado se ve como 'cancelado'
        otro = self.pedido_de(self.ana.pedir((self.sanduche, 1)))
        self.assertEqual(caja.post(f'{API_PEDIDOS}{otro.pk}/cancel/').status_code, 200)
        self.assertEqual(self.ana.get('pedidos/').data[1]['estado_cliente'], 'cancelado')
        # Una entregada ya no se cancela
        self.assertEqual(caja.post(f'{API_PEDIDOS}{self.pedido_qr.pk}/cancel/').status_code, 400)

    def test_el_tablero_de_otro_distribuidor_no_ve_estos_pedidos(self):
        otro = crear_local()
        r = self.personal(otro.cajero).get(f'{API_PEDIDOS}tablero/')
        self.assertEqual(r.data, [])
