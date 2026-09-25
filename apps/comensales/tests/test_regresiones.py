"""Regresiones de los hallazgos de la revisión del flujo QR.

Cada clase reproduce un hallazgo: pedidos QR ya cobrados, mesas en cierre ocupadas a mano, mesas mixtas,
cookies de sesiones pagadas, reconexión con códigos raros, PATCH de pedidos, ítems cancelados, abuso por mesa,
QR regenerado, pedidos que apuntan a mesas ajenas, entradas malformadas, nombres invisibles, borrar mesas
con historial y QR predecibles del seed anterior.
"""
import importlib
from decimal import Decimal

from django.apps import apps as registro_apps
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from apps.comensales import antiabuso, services
from apps.comensales.models import AlertaMesero, SesionCliente
from apps.mesas.models import Mesa
from apps.pedidos.models import Order, OrderItem

from .base import (
    API_CLIENTE, API_MESAS, API_PEDIDOS, API_PERSONAL, COOKIE, XHR, PruebaQR, crear_cafeteria, crear_local,
    crear_mesa, crear_usuario, hace,
)

API_ITEMS = '/api/v1/pedidos/items/'


def pedido_del_personal(local, mesa, producto, cafeteria=None):
    """Pedido de mesa registrado por el personal (sin sesión QR), pendiente y sin pagar"""
    cafeteria = cafeteria or local.cafe
    pedido = Order.objects.create(
        tenant=cafeteria.tenant, cafeteria=cafeteria, order_type='mesa', mesa=mesa,
        created_by=local.camarero, status='pendiente',
    )
    OrderItem.objects.create(order=pedido, menu_item=producto, quantity=1, unit_price=producto.price)
    pedido.calculate_total()
    return pedido


# ---------------------------------------------------------------------------
# 1. Un pedido QR ya cobrado no se cancela (ni él ni sus ítems)
# ---------------------------------------------------------------------------

class PedidoQRCobradoTests(PruebaQR):
    def setUp(self):
        super().setUp()
        self.ana = self.entrar('Ana')
        self.cappuccino_ana = self.pedido_de(self.ana.pedir((self.cappuccino, 1)))  # 3.22
        self.sanduche_ana = self.pedido_de(self.ana.pedir((self.sanduche, 1)))  # 5.18
        self.assertEqual(self.ana.pedir_cuenta('individual', confirmar=True).status_code, 201)
        r = self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(self.ana.id)]})
        self.assertEqual((r.status_code, r.data['total_cobrado']), (200, '8.40'))

    def test_cancelar_un_pedido_qr_cobrado_400_y_el_ticket_sigue_cuadrando(self):
        r = self.personal(self.local.cocinero).post(f'{API_PEDIDOS}{self.sanduche_ana.pk}/cancel/')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('ya se cobró', r.data['error'])
        self.sanduche_ana.refresh_from_db()
        self.assertEqual((self.sanduche_ana.status, self.sanduche_ana.is_paid), ('pendiente', True))

        ticket = self.ana.get('ticket/').data
        suma = sum(Decimal(linea['total']) for linea in ticket['items'])
        self.assertEqual(suma, Decimal(ticket['subtotal']))
        self.assertEqual(ticket['total'], '8.40')

    def test_cancelar_un_item_de_un_pedido_qr_cobrado_400(self):
        item = self.sanduche_ana.items.get()
        r = self.personal().post(f'{API_ITEMS}{item.pk}/cancel/')
        self.assertEqual(r.status_code, 400, r.content)
        item.refresh_from_db()
        self.assertEqual(item.status, 'pendiente')
        # Tampoco se edita ni se borra el ítem de una cuenta ya cobrada
        r = self.personal().patch(f'{API_ITEMS}{item.pk}/', {'quantity': 5}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(self.personal().delete(f'{API_ITEMS}{item.pk}/').status_code, 400)
        self.assertEqual(OrderItem.objects.get(pk=item.pk).quantity, 1)

    def test_los_pedidos_qr_sin_cobrar_y_los_del_personal_se_siguen_cancelando(self):
        beto = self.entrar('Beto', mesa=self.mesa2)
        pedido_beto = self.pedido_de(beto.pedir((self.cappuccino, 1)))
        self.assertEqual(self.personal().post(f'{API_PEDIDOS}{pedido_beto.pk}/cancel/').status_code, 200)
        personal = pedido_del_personal(self.local, self.mesa2, self.sanduche)
        personal.mark_as_paid('efectivo')
        self.assertEqual(self.personal().post(f'{API_PEDIDOS}{personal.pk}/cancel/').status_code, 200)


# ---------------------------------------------------------------------------
# 2. Ocupar a mano una mesa en 'limpiando' cierra las pagadas; su vencimiento no libera la mesa
# ---------------------------------------------------------------------------

class OcuparMesaEnCierreTests(PruebaQR):
    def setUp(self):
        super().setUp()
        self.ana = self.entrar('Ana')
        self.pedido_de(self.ana.pedir((self.cappuccino, 1)))
        self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(self.ana.id)]})
        self.assertEqual(self.recargar_mesa().status, 'limpiando')

    def assert_mesa_ocupada_y_abierta_al_qr(self, guest_count):
        mesa = self.recargar_mesa()
        self.assertEqual((mesa.status, mesa.guest_count), ('ocupada', guest_count))
        self.assertEqual((self.ana.sesion.estado, self.ana.sesion.motivo_cierre), ('cerrada', 'mesa_lista'))
        self.assertEqual(self.bienvenida(self.mesa.qr_code).data['variante'], 'normal')
        self.entrar('Beto')

    def test_occupy_desde_limpiando_equivale_a_mesa_lista_mas_ocupar(self):
        r = self.personal(self.local.camarero).post(f'{API_MESAS}{self.mesa.pk}/occupy/', {'guest_count': 3})
        self.assertEqual(r.status_code, 200, r.content)
        self.assert_mesa_ocupada_y_abierta_al_qr(3)

    def test_change_status_a_ocupada_desde_limpiando_tambien_cierra_las_pagadas(self):
        r = self.personal(self.local.camarero).post(
            f'{API_MESAS}{self.mesa.pk}/change_status/', {'status': 'ocupada', 'guest_count': 2}, format='json'
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assert_mesa_ocupada_y_abierta_al_qr(2)

    def test_el_vencimiento_de_las_pagadas_no_cambia_el_estado_de_la_mesa(self):
        # Mesa ocupada a mano sin pasar por la API (p. ej. desde el admin) con una pagada viva
        Mesa.objects.filter(pk=self.mesa.pk).update(status='ocupada', guest_count=3)
        SesionCliente.objects.filter(pk=self.ana.id).update(pagada_at=hace(11))
        self.assertEqual(services.limpiar_sesiones_inactivas(forzar=True), 1)
        self.assertEqual(self.ana.sesion.motivo_cierre, 'expirada')
        mesa = self.recargar_mesa()
        self.assertEqual((mesa.status, mesa.guest_count), ('ocupada', 3))

    def test_el_vencimiento_por_revalidacion_tampoco_libera_la_mesa(self):
        Mesa.objects.filter(pk=self.mesa.pk).update(status='ocupada', guest_count=3)
        SesionCliente.objects.filter(pk=self.ana.id).update(pagada_at=hace(11))
        r = self.ana.get('sesion/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sesion_cerrada'))
        self.assertEqual(self.recargar_mesa().status, 'ocupada')


# ---------------------------------------------------------------------------
# 3. Mesa mixta: el último cobro QR no la pasa a 'limpiando' si el personal tiene un pedido abierto
# ---------------------------------------------------------------------------

class MesaMixtaTests(PruebaQR):
    def test_ultimo_cobro_qr_con_pedido_del_personal_abierto_deja_la_mesa_ocupada(self):
        self.personal(self.local.camarero).post(f'{API_MESAS}{self.mesa.pk}/occupy/', {'guest_count': 2})
        del_personal = pedido_del_personal(self.local, self.mesa, self.sanduche)

        ana = self.entrar('Ana')
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        r = self.cobrar({'metodo_pago': 'tarjeta', 'sesiones': [str(ana.id)]})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.data['mesa_estado'], r.data['nota_cierre']), ('ocupada', ''))
        self.assertEqual(self.recargar_mesa().status, 'ocupada')
        self.assertEqual(ana.sesion.estado, 'pagada')
        self.assertEqual(ana.get('ticket/').status_code, 200)

        # La mesa sigue atendida: el resto de la mesa puede entrar por QR
        self.assertEqual(self.bienvenida(self.mesa.qr_code).data['variante'], 'normal')
        beto = self.entrar('Beto')
        self.assertEqual(beto.sesion.estado, 'activa')
        self.assertEqual(beto.post('salir/').status_code, 200)
        self.assertEqual(self.recargar_mesa().status, 'ocupada')

        # Cobrado el pedido del personal, "Mesa lista" cierra la pagada y libera la mesa
        r = self.personal().post(f'{API_PEDIDOS}{del_personal.pk}/mark_paid/', {'payment_method': 'efectivo'})
        self.assertEqual(r.status_code, 200)
        r = self.personal().post(f'{API_MESAS}{self.mesa.pk}/free/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.recargar_mesa().status, 'disponible')
        self.assertEqual((ana.sesion.estado, ana.sesion.motivo_cierre), ('cerrada', 'mesa_lista'))


# ---------------------------------------------------------------------------
# 4. Una sesión que empezó hace más de 2 h sigue viendo su ticket al pagar
# ---------------------------------------------------------------------------

class TicketDeSesionLargaTests(PruebaQR):
    def test_pagada_con_mas_de_2_horas_desde_el_inicio_ve_su_ticket(self):
        ana = self.entrar('Ana')
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        SesionCliente.objects.filter(pk=ana.id).update(fecha_inicio=hace(minutos=5, horas=2))
        self.assertEqual(self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(ana.id)]}).status_code, 200)

        r = ana.get('sesion/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.data['estado'], r.data['ticket']['total']), ('pagada', '3.22'))
        self.assertEqual(ana.get('ticket/').status_code, 200)
        r = self.bienvenida(self.mesa.qr_code, client=ana.client)
        self.assertEqual(r.data['sesion_actual'], {'alias': 'ANA', 'estado': 'pagada'})

    @override_settings(COMENSAL_PAGADA_CIERRE_MIN=600)
    def test_la_cookie_se_borra_2_horas_despues_de_dejar_de_estar_activa(self):
        ana = self.entrar('Ana')
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(ana.id)]})
        SesionCliente.objects.filter(pk=ana.id).update(fecha_inicio=hace(horas=4), pagada_at=hace(horas=2, minutos=1))
        r = ana.get('sesion/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sesion_cerrada'))
        self.assertEqual(r.cookies[COOKIE].value, '')
        # La bienvenida aplica el mismo criterio
        client = APIClient()
        client.cookies[COOKIE] = ana.sesion.token_cookie
        r = self.bienvenida(self.mesa.qr_code, client=client)
        self.assertIsNone(r.data['sesion_actual'])
        self.assertEqual(r.cookies[COOKIE].value, '')


# ---------------------------------------------------------------------------
# 5. reconectar con caracteres no ASCII: 400 codigo_invalido y el intento cuenta
# ---------------------------------------------------------------------------

class ReconectarCodigoRaroTests(PruebaQR):
    def test_codigo_no_ascii_es_un_intento_fallido_y_no_un_500(self):
        ana = self.entrar('Ana')
        r = self.personal().post(f'{API_PERSONAL}sesiones/{ana.id}/codigo/')
        codigo = r.data['codigo']
        for intento, raro in enumerate(('12ñ4', '１２３４', 'ñ'), start=1):
            r = APIClient().post(
                API_CLIENTE + 'reconectar/', {'mesa': self.mesa.qr_code, 'nombre': 'ana', 'codigo': raro},
                format='json', **XHR,
            )
            self.assertEqual(r.status_code, 400, r.content)
            self.assertEqual((r.data['codigo'], r.data['intentos_restantes']), ('codigo_invalido', 5 - intento))
        self.assertEqual(ana.sesion.codigo_intentos, 3)
        r = APIClient().post(
            API_CLIENTE + 'reconectar/', {'mesa': self.mesa.qr_code, 'nombre': 'ana', 'codigo': codigo},
            format='json', **XHR,
        )
        self.assertEqual(r.status_code, 200, r.content)


# ---------------------------------------------------------------------------
# 6. PATCH de pedidos: el estado solo cambia por el tablero y lo cobrado no se toca
# ---------------------------------------------------------------------------

class ActualizarPedidoTests(PruebaQR):
    def setUp(self):
        super().setUp()
        self.ana = self.entrar('Ana')
        self.pedido = self.pedido_de(self.ana.pedir((self.cappuccino, 1)))  # 3.22

    def patch(self, datos, pedido=None):
        return self.personal().patch(f'{API_PEDIDOS}{(pedido or self.pedido).pk}/', datos, format='json')

    def test_patch_de_status_400(self):
        for estado in ('entregada', 'cancelada'):
            r = self.patch({'status': estado})
            self.assertEqual(r.status_code, 400, r.content)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.status, 'pendiente')
        # Los demás campos siguen editables
        r = self.patch({'kitchen_notes': 'Sin canela', 'status': 'pendiente'})
        self.assertEqual(r.status_code, 200, r.content)

    def test_descuento_y_metodo_de_pago_de_un_pedido_qr_cobrado_400(self):
        self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(self.ana.id)]})
        self.assertEqual(self.patch({'discount': '3.00'}).status_code, 400)
        self.assertEqual(self.patch({'payment_method': 'tarjeta'}).status_code, 400)
        r = self.personal().post(f'{API_PEDIDOS}{self.pedido.pk}/apply_discount/', {'discount': '3.00'})
        self.assertEqual(r.status_code, 400)
        self.pedido.refresh_from_db()
        self.assertEqual((self.pedido.total, self.pedido.payment_method), (Decimal('3.22'), 'efectivo'))
        self.assertEqual(self.ana.get('ticket/').data['total'], '3.22')

    def test_descuento_antes_de_cobrar_si_se_aplica_y_el_cobro_lo_respeta(self):
        r = self.patch({'discount': '0.22'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.patch({'discount': '-1'}).status_code, 400)
        self.assertEqual(self.patch({'payment_method': 'tarjeta'}).status_code, 400)  # QR: se elige al cobrar
        r = self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(self.ana.id)]})
        self.assertEqual(r.data['total_cobrado'], '3.00')


# ---------------------------------------------------------------------------
# 7. Un ítem cancelado no se cobra ni aparece en la cuenta ni en el ticket
# ---------------------------------------------------------------------------

class ItemCanceladoTests(PruebaQR):
    def test_cancelar_un_item_descuenta_su_precio_de_la_cuenta_y_del_ticket(self):
        ana = self.entrar('Ana')
        pedido = self.pedido_de(ana.pedir((self.cappuccino, 1), (self.sanduche, 1)))
        self.assertEqual(pedido.total, Decimal('8.40'))
        item = pedido.items.get(menu_item=self.sanduche)
        r = self.personal().post(f'{API_ITEMS}{item.pk}/cancel/')
        self.assertEqual(r.status_code, 200, r.content)

        pedido.refresh_from_db()
        self.assertEqual((pedido.subtotal, pedido.tax, pedido.total), (Decimal('2.80'), Decimal('0.42'), Decimal('3.22')))
        self.assertEqual(ana.get('cuenta/').data['total'], '3.22')
        self.assertEqual([i['nombre'] for i in ana.get('pedidos/').data[0]['items']], ['Cappuccino'])

        r = self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(ana.id)]})
        self.assertEqual(r.data['total_cobrado'], '3.22')
        ticket = ana.get('ticket/').data
        self.assertEqual([(i['nombre'], i['total']) for i in ticket['items']], [('Cappuccino', '2.80')])
        self.assertEqual((ticket['subtotal'], ticket['total']), ('2.80', '3.22'))


# ---------------------------------------------------------------------------
# 8. Límites anti-abuso por mesa (además de los de cada sesión)
# ---------------------------------------------------------------------------

class AbusoPorMesaTests(PruebaQR):
    def assert_429(self, r):
        self.assertEqual(r.status_code, 429, r.content)
        self.assertGreater(r.data['retry_after'], 0)
        self.assertEqual(r['Retry-After'], str(r.data['retry_after']))

    def test_tope_de_sesiones_activas_por_mesa(self):
        tope = antiabuso.tope_sesiones_activas(self.mesa)
        self.assertEqual(tope, 8)  # capacidad 4 → 2 × 4
        for n in range(tope):
            self.entrar(f'Persona {n}')
        r = self.post_entrar(APIClient(), 'Intruso')
        self.assertEqual(r.status_code, 409, r.content)
        self.assertEqual(r.data['codigo'], 'mesa_llena')
        self.assertNotIn(COOKIE, r.cookies)
        self.assertEqual(services.sesiones_activas(self.mesa).count(), tope)
        # Otra mesa no se ve afectada
        self.entrar('Otra mesa', mesa=self.mesa2)

    def test_sesiones_nuevas_por_mesa_con_ventana_de_10_minutos(self):
        entraron = []
        for n in range(antiabuso.ENTRADAS_MESA_MAX):
            comensal = self.entrar(f'Persona {n}')
            entraron.append(comensal)
            if len(entraron) > 4:  # salir y volver a entrar no evita el límite
                self.assertEqual(entraron.pop(0).post('salir/').status_code, 200)
        self.assert_429(self.post_entrar(APIClient(), 'Una más'))
        # Re-escanear desde el mismo dispositivo no cuenta como sesión nueva
        r = self.post_entrar(entraron[-1].client, entraron[-1].sesion.alias)
        self.assertEqual(r.status_code, 200, r.content)

    def test_pedidos_por_mesa_en_60_segundos(self):
        por_sesion = antiabuso.PEDIDOS_MAX
        sesiones = antiabuso.PEDIDOS_MESA_MAX // por_sesion
        for n in range(sesiones):
            comensal = self.entrar(f'Persona {n}')
            for _ in range(por_sesion):
                self.pedido_de(comensal.pedir((self.cappuccino, 1)))
        self.assert_429(self.entrar('Otra').pedir((self.cappuccino, 1)))
        self.assertEqual(Order.objects.filter(mesa=self.mesa).count(), antiabuso.PEDIDOS_MESA_MAX)
        # En otra mesa se sigue pidiendo
        self.pedido_de(self.entrar('Zoe', mesa=self.mesa2).pedir((self.cappuccino, 1)))

    def test_alertas_sin_atender_por_mesa(self):
        for n in range(antiabuso.ALERTAS_MESA_SIN_ATENDER_MAX):
            self.assertEqual(self.entrar(f'Persona {n}').post('alertas/', {'tipo': 'ayuda'}).status_code, 201)
        self.assert_429(self.entrar('Otra').post('alertas/', {'tipo': 'ayuda'}))
        # Al atender una, la mesa puede volver a llamar
        alerta = AlertaMesero.objects.filter(mesa=self.mesa).first()
        self.personal().post(f'{API_PERSONAL}alertas/{alerta.pk}/atender/')
        cache.clear()
        self.assertEqual(self.entrar('Una más').post('alertas/', {'tipo': 'ayuda'}).status_code, 201)


# ---------------------------------------------------------------------------
# 9. Regenerar el QR corta el acceso: las cookies viejas no reciben el QR nuevo
# ---------------------------------------------------------------------------

class QRRegeneradoTests(PruebaQR):
    def regenerar(self):
        r = self.personal(self.local.cafe_admin).post(f'{API_MESAS}{self.mesa.pk}/regenerar_qr/')
        self.assertEqual(r.status_code, 200)
        return r.data['qr_code']

    def test_cookie_de_sesion_cerrada_no_recibe_el_qr_nuevo(self):
        ana = self.entrar('Ana')
        client_viejo = ana.client
        token = ana.token
        self.assertEqual(ana.post('salir/').data['mesa'], self.mesa.qr_code)
        nuevo = self.regenerar()
        client_viejo.cookies[COOKIE] = token
        r = client_viejo.get(API_CLIENTE + 'menu/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sesion_cerrada'))
        self.assertIsNone(r.data['mesa'])
        self.assertNotIn(nuevo, r.content.decode())

    def test_sesion_activa_anterior_sigue_pidiendo_pero_no_ve_el_qr_nuevo(self):
        beto = self.entrar('Beto')
        self.assertEqual(beto.get('sesion/').data['mesa']['qr'], self.mesa.qr_code)
        nuevo = self.regenerar()
        r = beto.get('sesion/')
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data['mesa']['qr'])
        self.pedido_de(beto.pedir((self.cappuccino, 1)))
        self.assertNotIn(nuevo, str(beto.get('sesion/').data))

        # Quien entra (o se reconecta) con el QR nuevo sí lo recibe
        self.recargar_mesa()
        carla = self.entrar('Carla')
        self.assertEqual(carla.get('sesion/').data['mesa']['qr'], nuevo)
        codigo = self.personal().post(f'{API_PERSONAL}sesiones/{beto.id}/codigo/').data['codigo']
        client = APIClient()
        r = client.post(API_CLIENTE + 'reconectar/', {'mesa': nuevo, 'nombre': 'Beto', 'codigo': codigo},
                        format='json', **XHR)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(client.get(API_CLIENTE + 'sesion/').data['mesa']['qr'], nuevo)

    def test_salir_despues_de_regenerar_no_devuelve_el_qr_nuevo(self):
        ana = self.entrar('Ana')
        self.regenerar()
        r = ana.post('salir/')
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data['mesa'])


# ---------------------------------------------------------------------------
# 10. El personal no crea pedidos en mesas ni con productos de otro local u otro distribuidor
# ---------------------------------------------------------------------------

class PedidoEnMesaAjenaTests(PruebaQR):
    def crear_pedido(self, usuario, mesa, producto, **headers):
        datos = {
            'order_type': 'mesa', 'mesa': str(mesa.pk),
            'items': [{'menu_item': str(producto.pk), 'quantity': 1}],
        }
        return self.personal(usuario).post(API_PEDIDOS, datos, format='json', **headers)

    def test_mesa_o_producto_de_otro_tenant_400(self):
        otro = crear_local()
        r = self.crear_pedido(otro.camarero, self.mesa, otro.cappuccino, HTTP_X_TENANT_ID=str(self.local.tenant.pk))
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('mesa', r.data)
        r = self.crear_pedido(self.local.camarero, self.mesa, otro.cappuccino)
        self.assertEqual(r.status_code, 400, r.content)
        self.assertFalse(Order.objects.exists())

    def test_mesa_de_otra_cafeteria_del_mismo_tenant_400(self):
        otra = crear_cafeteria(self.local.tenant, 'Café Cumbayá')
        camarero_otro = crear_usuario('camarero', self.local.tenant, otra)
        r = self.crear_pedido(camarero_otro, self.mesa, self.cappuccino)
        self.assertEqual(r.status_code, 400, r.content)
        self.assertFalse(Order.objects.exists())

    def test_sin_x_tenant_id_el_pedido_toma_el_distribuidor_del_usuario(self):
        r = self.crear_pedido(self.local.camarero, self.mesa, self.cappuccino)
        self.assertEqual(r.status_code, 201, r.content)
        pedido = Order.objects.get()
        self.assertEqual((pedido.tenant_id, pedido.cafeteria_id), (self.local.tenant.pk, self.local.cafe.pk))

    def test_un_pedido_ajeno_colgado_de_la_mesa_no_la_bloquea(self):
        otro = crear_local()
        otra_mesa = crear_mesa(otro.cafe, 9)
        ajeno = pedido_del_personal(otro, otra_mesa, otro.cappuccino)
        Order.objects.filter(pk=ajeno.pk).update(mesa=self.mesa)  # dato heredado de antes de la validación

        ana = self.entrar('Ana')
        self.assertEqual(ana.post('salir/').status_code, 200)
        self.assertEqual(self.recargar_mesa().status, 'disponible')
        self.entrar('Beto')
        r = self.personal().post(f'{API_PERSONAL}mesas/{self.mesa.pk}/cerrar/')
        self.assertEqual(r.status_code, 200, r.content)
        self.personal().post(f'{API_MESAS}{self.mesa.pk}/occupy/', {'guest_count': 2})
        self.assertEqual(self.personal().post(f'{API_MESAS}{self.mesa.pk}/free/').status_code, 200)


# ---------------------------------------------------------------------------
# 11. Entradas malformadas en rutas públicas: nunca 500
# ---------------------------------------------------------------------------

class EntradasMalformadasTests(PruebaQR):
    def test_bienvenida_con_byte_nul_o_qr_enorme_da_sin_mesa(self):
        for qr in ('\x00', 'abc\x00def', 'x' * 300):
            r = self.bienvenida(qr)
            self.assertEqual(r.status_code, 200, repr(qr))
            self.assertEqual(r.data['variante'], 'sin_mesa')

    def test_tenant_id_malformado_no_da_500(self):
        r = APIClient().get(API_CLIENTE + 'bienvenida/', {'mesa': self.mesa.qr_code, 'tenant_id': 'abc'})
        self.assertEqual(r.status_code, 403)
        r = APIClient().get(API_CLIENTE + 'bienvenida/', HTTP_X_TENANT_ID='no-es-un-uuid')
        self.assertEqual(r.status_code, 403)


# ---------------------------------------------------------------------------
# 12. Nombres con caracteres invisibles o de ancho completo
# ---------------------------------------------------------------------------

class NombresInvisiblesTests(PruebaQR):
    def test_normalizar_alias_quita_invisibles_y_unifica_ancho(self):
        casos = {
            'ana​': 'ANA',
            '﻿Ana‍ María ': 'ANA MARÍA',
            'ＡＮＡ': 'ANA',
            'ana\tmaría': 'ANA MARÍA',
            'anaㅤ': 'ANA',
            '​​': '',
            '⠀': '',
            '...': '',
        }
        for texto, esperado in casos.items():
            self.assertEqual(services.normalizar_alias(texto), esperado, repr(texto))

    def test_no_se_puede_entrar_con_un_nombre_que_se_ve_igual_a_otro_o_invisible(self):
        self.entrar('Reva')
        for nombre in ('REVA​', 'ＲＥＶＡ', '​Reva'):
            r = self.post_entrar(APIClient(), nombre)
            self.assertEqual((r.status_code, r.data['codigo']), (409, 'nombre_en_uso'), repr(nombre))
        r = self.post_entrar(APIClient(), '​​')
        self.assertEqual((r.status_code, r.data['codigo']), (400, 'nombre_vacio'))
        self.assertEqual([g['nombres'] for g in self.bienvenida(self.mesa.qr_code).data['grupos']], [['REVA']])


# ---------------------------------------------------------------------------
# 13. Borrar una mesa con historial QR: 400 claro (no 500)
# ---------------------------------------------------------------------------

class BorrarMesaTests(PruebaQR):
    def test_mesa_con_sesiones_qr_no_se_borra(self):
        ana = self.entrar('Ana')
        ana.post('salir/')
        r = self.personal(self.local.distribuidor).delete(f'{API_MESAS}{self.mesa.pk}/')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('desactívala', r.data['error'])
        self.assertTrue(Mesa.objects.filter(pk=self.mesa.pk).exists())
        # Una mesa sin historial sí se borra
        r = self.personal(self.local.distribuidor).delete(f'{API_MESAS}{self.mesa2.pk}/')
        self.assertEqual(r.status_code, 204)


# ---------------------------------------------------------------------------
# 14. La migración regenera los QR predecibles del seed anterior
# ---------------------------------------------------------------------------

class MigracionQRPredeciblesTests(PruebaQR):
    def test_regenera_solo_los_qr_con_el_formato_del_seed_anterior(self):
        migracion = importlib.import_module('apps.mesas.migrations.0004_regenerar_qr_predecibles')
        predecibles = ['abcdef12-M01', '0f1e2d3c-M20']
        for mesa, qr in zip(self.local.mesas, predecibles):
            Mesa.objects.filter(pk=mesa.pk).update(qr_code=qr)
        aleatorio = '6f1c7a52-2d8e-4c37-9a3b-1f0e5d2c8b71'  # uuid4 de la API anterior: no es predecible
        Mesa.objects.filter(pk=self.local.mesas[2].pk).update(qr_code=aleatorio)
        intacto = self.local.mesas[3].qr_code

        migracion.regenerar_qr_predecibles(registro_apps, None)

        codigos = list(Mesa.objects.filter(pk__in=[m.pk for m in self.local.mesas]).order_by('number')
                       .values_list('qr_code', flat=True))
        for viejo, nuevo in zip(predecibles, codigos[:2]):
            self.assertNotEqual(nuevo, viejo)
            self.assertEqual(len(nuevo), 22)
        self.assertEqual(codigos[2:], [aleatorio, intacto])
