"""Pedir la cuenta, sesión pagada (solo lectura), ticket por sesiones_cubiertas y salir"""
from decimal import Decimal

from apps.comensales.models import AlertaMesero, SesionCliente, SolicitudPago
from apps.pedidos.models import Order

from .base import COOKIE, PruebaQR


class PedirCuentaTests(PruebaQR):
    def test_pedidos_sin_entregar_requieren_confirmacion_y_la_solicitud_es_idempotente(self):
        ana = self.entrar('Ana')
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        entregado = self.pedido_de(ana.pedir((self.sanduche, 1)))
        Order.objects.filter(pk=entregado.pk).update(status='entregada')

        r = ana.pedir_cuenta('individual')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, {
            'requiere_confirmacion': True, 'sin_entregar': 1,
            'mensaje': 'Tienes 1 pedido(s) sin entregar, ¿pedir la cuenta de todas formas?',
        })
        self.assertFalse(SolicitudPago.objects.exists())

        r = ana.pedir_cuenta('individual', confirmar=True, metodo='tarjeta')
        self.assertEqual(r.status_code, 201)
        solicitud = SolicitudPago.objects.get()
        self.assertEqual(r.data['solicitud'], {
            'id': str(solicitud.pk), 'tipo': 'individual', 'total': '8.40', 'metodo_preferido': 'tarjeta',
        })
        alerta = AlertaMesero.objects.get(tipo='cuenta')
        self.assertEqual(alerta.mensaje, 'ANA pide la cuenta (individual) · Tarjeta')
        self.assertEqual(alerta.sesion_id, ana.id)

        # Idempotente: devuelve la misma pendiente (200) sin crear otra alerta
        r = ana.pedir_cuenta('individual', confirmar=True)
        self.assertEqual((r.status_code, r.data['solicitud']['id']), (200, str(solicitud.pk)))
        self.assertEqual(SolicitudPago.objects.count(), 1)
        self.assertEqual(AlertaMesero.objects.filter(tipo='cuenta').count(), 1)

        r = ana.get('cuenta/', {'tipo': 'individual'})
        self.assertEqual(r.data['solicitud_pendiente']['id'], str(solicitud.pk))
        self.assertEqual((r.data['total'], r.data['sin_entregar']), ('8.40', 1))
        self.assertEqual(ana.get('sesion/').data['cuenta_pendiente']['id'], str(solicitud.pk))

    def test_sin_consumo_400(self):
        ana = self.entrar('Ana')
        r = ana.pedir_cuenta('individual', confirmar=True)
        self.assertEqual(r.status_code, 400)
        pedido = self.pedido_de(ana.pedir((self.cappuccino, 1)))
        Order.objects.filter(pk=pedido.pk).update(status='cancelada')
        self.assertEqual(ana.pedir_cuenta('grupal', confirmar=True).status_code, 400)

    def test_cuenta_grupal_pendiente_es_una_por_grupo(self):
        ana = self.entrar('Ana')
        beto = self.unir(ana, 'Beto')
        self.pedido_de(beto.pedir((self.cappuccino, 1)))
        r1 = beto.pedir_cuenta('grupal', confirmar=True, metodo='efectivo')
        self.assertEqual(r1.status_code, 201)
        r2 = ana.pedir_cuenta('grupal', confirmar=True)
        self.assertEqual((r2.status_code, r2.data['solicitud']['id']), (200, r1.data['solicitud']['id']))
        solicitud = SolicitudPago.objects.get()
        self.assertEqual((solicitud.tipo, solicitud.grupo_id), ('grupal', ana.id))
        self.assertEqual(AlertaMesero.objects.get(tipo='cuenta').mensaje, 'BETO pide la cuenta (grupal) · Efectivo')


class SesionPagadaTests(PruebaQR):
    def setUp(self):
        super().setUp()
        self.ana = self.entrar('Ana')
        self.beto = self.entrar('Beto')
        self.pedido_de(self.ana.pedir((self.cappuccino, 1)))
        self.pedido_de(self.beto.pedir((self.cappuccino, 1)))
        r = self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(self.ana.id)]})
        self.assertEqual(r.status_code, 200)

    def test_sesion_pagada_no_puede_pedir_ni_volver_a_pedir_la_cuenta(self):
        pagada = {'codigo': 'sesion_pagada', 'detail': 'Tu cuenta ya fue pagada.'}
        r = self.ana.pedir((self.cappuccino, 1))
        self.assertEqual((r.status_code, r.data), (409, pagada))
        for tipo in ('individual', 'grupal'):
            r = self.ana.pedir_cuenta(tipo, confirmar=True)
            self.assertEqual((r.status_code, r.data), (409, pagada))
        r = self.ana.post('alertas/', {'tipo': 'ayuda'})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(Order.objects.filter(sesion_cliente_id=self.ana.id).count(), 1)
        self.assertFalse(SolicitudPago.objects.filter(estado='pendiente').exists())

    def test_sesion_pagada_puede_leer_y_ver_su_ticket(self):
        for ruta in ('menu/', 'pedidos/', 'cuenta/', 'sesion/', 'ticket/'):
            self.assertEqual(self.ana.get(ruta).status_code, 200, ruta)
        r = self.ana.get('sesion/')
        self.assertEqual(r.data['estado'], 'pagada')
        self.assertEqual(r.data['ticket']['total'], '3.22')
        self.assertTrue(self.ana.get('pedidos/').data[0]['is_paid'])
        # BETO (activo) todavía no tiene ticket
        r = self.beto.get('ticket/')
        self.assertEqual((r.status_code, r.data['codigo']), (404, 'sin_ticket'))

    def test_salir_pagada_cierra_y_borra_la_cookie(self):
        r = self.ana.post('salir/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.cookies[COOKIE].value, '')
        self.assertEqual((self.ana.sesion.estado, self.ana.sesion.motivo_cierre), ('cerrada', 'salir'))
        self.assertEqual(self.ana.get('sesion/').status_code, 401)

    def test_salir_con_la_cuenta_abierta_409(self):
        r = self.beto.post('salir/')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'cuenta_abierta'))
        self.assertEqual(self.beto.sesion.estado, 'activa')

    def test_salir_sin_pedidos_libera_la_mesa_si_era_el_ultimo(self):
        carla = self.entrar('Carla', mesa=self.mesa2)
        r = carla.post('salir/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.recargar_mesa(self.mesa2).status, 'disponible')


class TicketDosGruposTests(PruebaQR):
    """Defecto 3: el ticket se busca por las sesiones_cubiertas de la sesión, no por 'la última de la mesa'"""

    def test_cada_grupo_ve_el_ticket_de_su_propio_pago(self):
        ana = self.entrar('Ana')
        beto = self.unir(ana, 'Beto')
        carlos = self.entrar('Carlos')
        diego = self.unir(carlos, 'Diego')
        for comensal, producto, cantidad in (
            (ana, self.cappuccino, 1), (beto, self.sanduche, 1), (carlos, self.cappuccino, 2), (diego, self.sanduche, 1),
        ):
            pedido = self.pedido_de(comensal.pedir((producto, cantidad)))
            Order.objects.filter(pk=pedido.pk).update(status='entregada')

        sol1 = beto.pedir_cuenta('grupal', metodo='tarjeta').data['solicitud']
        sol2 = carlos.pedir_cuenta('grupal', metodo='efectivo').data['solicitud']
        self.assertEqual((sol1['total'], sol2['total']), ('8.40', '11.62'))

        # Se cobra primero el grupo de ANA y después el de CARLOS (el último de la mesa)
        r = self.cobrar({'metodo_pago': 'tarjeta', 'solicitud': sol1['id']})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['nota_cierre'], 'Queda $11.62 sin cobrar (2 sesión(es) activa(s))')
        r = self.cobrar({'metodo_pago': 'efectivo', 'solicitud': sol2['id']})
        self.assertEqual((r.status_code, r.data['mesa_estado']), (200, 'limpiando'))

        # Cada uno ve SU consumo; total_cobrado es lo que pagó su grupo (nunca el del otro grupo)
        esperado = {
            ana.id: (sol1['id'], 'tarjeta', '3.22', '8.40', {'Cappuccino': 1}),
            beto.id: (sol1['id'], 'tarjeta', '5.18', '8.40', {'Sánduche de pernil': 1}),
            carlos.id: (sol2['id'], 'efectivo', '6.44', '11.62', {'Cappuccino': 2}),
            diego.id: (sol2['id'], 'efectivo', '5.18', '11.62', {'Sánduche de pernil': 1}),
        }
        for comensal in (ana, beto, carlos, diego):
            solicitud_id, metodo, total, cobrado, items = esperado[comensal.id]
            r = comensal.get('ticket/')
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.data['solicitud_id'], solicitud_id)
            self.assertEqual(r.data['metodo_pago'], metodo)
            self.assertEqual(r.data['total'], total)
            self.assertEqual(r.data['total_cobrado'], cobrado)
            self.assertEqual(r.data['alias'], comensal.sesion.alias)
            self.assertEqual({i['nombre']: i['cantidad'] for i in r.data['items']}, items)
            # El polling de la sesión trae el mismo ticket
            self.assertEqual(comensal.get('sesion/').data['ticket']['solicitud_id'], solicitud_id)

        self.assertEqual(
            set(SolicitudPago.objects.get(pk=sol1['id']).sesiones_cubiertas.values_list('pk', flat=True)),
            {ana.id, beto.id},
        )
        self.assertEqual(SolicitudPago.objects.get(pk=sol2['id']).total, Decimal('11.62'))
        self.assertEqual(SesionCliente.objects.filter(estado='pagada').count(), 4)
