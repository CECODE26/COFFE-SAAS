"""Forma exacta de las respuestas del contrato y casos borde de grupos, cookies y mesas"""
from datetime import timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auditoria.models import RegistroAuditoria
from apps.comensales import services
from apps.comensales.models import SesionCliente, SolicitudPago
from apps.pedidos.models import Order, OrderItem

from .base import API_CLIENTE, API_MESAS, API_PEDIDOS, API_PERSONAL, COOKIE, PruebaQR, hace


class FormaRespuestasClienteTests(PruebaQR):
    def setUp(self):
        super().setUp()
        self.ana = self.entrar('Ana')
        self.beto = self.unir(self.ana, 'Beto')
        self.pedido_de(self.ana.pedir((self.cappuccino, 1)))
        self.pedido_de(self.beto.pedir((self.sanduche, 1)))

    def test_sesion(self):
        r = self.beto.get('sesion/')
        self.assertEqual(set(r.data), {
            'id', 'alias', 'estado', 'es_fundador', 'grupo', 'mesa', 'union_pendiente', 'solicitudes_union',
            'cuenta_pendiente', 'ticket',
        })
        self.assertEqual(r.data['mesa'], {
            'numero': 1, 'zona': 'Terraza', 'local': {'nombre': 'Café La Floresta', 'logo': None},
            'qr': self.mesa.qr_code,
        })
        self.assertEqual(r.data['grupo'], {'id': str(self.ana.id), 'integrantes': ['ANA', 'BETO']})
        self.assertIsNone(r.data['cuenta_pendiente'])
        self.assertIsNone(r.data['ticket'])

        self.beto.pedir_cuenta('grupal', confirmar=True)
        cuenta = self.ana.get('sesion/').data['cuenta_pendiente']
        self.assertEqual(set(cuenta), {'id', 'tipo', 'total'})
        self.assertEqual((cuenta['tipo'], cuenta['total']), ('grupal', '8.40'))

    def test_pedidos(self):
        r = self.ana.get('pedidos/', {'alcance': 'grupo'})
        self.assertEqual(len(r.data), 2)
        pedido = r.data[0]
        self.assertTrue({
            'id', 'numero', 'estado', 'estado_cliente', 'alias', 'items', 'subtotal', 'iva', 'total', 'is_paid',
            'created_at',
        } <= set(pedido))
        self.assertEqual(set(pedido['items'][0]), {'nombre', 'cantidad', 'precio', 'nota'})
        self.assertEqual(
            (pedido['alias'], pedido['estado_cliente'], pedido['total'], pedido['is_paid']), ('ANA', 'enviado', '3.22', False)
        )
        self.assertEqual([p['alias'] for p in self.ana.get('pedidos/', {'alcance': 'mio'}).data], ['ANA'])
        self.assertEqual(self.ana.get('pedidos/', {'alcance': 'todos'}).status_code, 400)

    def test_cuenta(self):
        r = self.ana.get('cuenta/', {'tipo': 'grupal'})
        self.assertEqual(set(r.data), {
            'tipo', 'integrantes', 'subtotal', 'iva', 'total', 'sin_entregar', 'solicitud_pendiente',
        })
        self.assertEqual(set(r.data['integrantes'][0]), {'alias', 'pedidos', 'subtotal', 'iva', 'total'})
        self.assertEqual((r.data['subtotal'], r.data['iva'], r.data['total']), ('7.30', '1.10', '8.40'))
        self.assertEqual(r.data['sin_entregar'], 2)
        r = self.ana.get('cuenta/', {'tipo': 'individual'})
        self.assertEqual(([i['alias'] for i in r.data['integrantes']], r.data['total']), (['ANA'], '3.22'))

    def test_ticket(self):
        solicitud = self.beto.pedir_cuenta('grupal', confirmar=True, metodo='tarjeta').data['solicitud']
        self.cobrar({'metodo_pago': 'tarjeta', 'solicitud': solicitud['id']})
        r = self.ana.get('ticket/')
        self.assertTrue({
            'local', 'mesa', 'alias', 'fecha', 'items', 'subtotal', 'iva', 'total', 'metodo_pago', 'solicitud_id',
        } <= set(r.data))
        self.assertEqual(set(r.data['items'][0]), {'nombre', 'cantidad', 'precio', 'total'})
        # Consumo propio de ANA (2.80 + IVA); el grupo pagó 8.40 en total
        self.assertEqual((r.data['subtotal'], r.data['iva'], r.data['total']), ('2.80', '0.42', '3.22'))
        self.assertEqual(r.data['total_cobrado'], '8.40')
        self.assertEqual((r.data['alias'], r.data['metodo_pago']), ('ANA', 'tarjeta'))


class FormaRespuestasPersonalTests(PruebaQR):
    def test_detalle_de_mesa_y_alertas(self):
        ana = self.entrar('Ana')
        beto = self.entrar('Beto', grupo=ana.id)  # solicitud de unión pendiente
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        ana.pedir_cuenta('individual', confirmar=True, metodo='efectivo')
        beto.post('alertas/', {'tipo': 'personalizado', 'mensaje': 'Una silla para bebé'})

        r = self.personal().get(f'{API_PERSONAL}mesas/{self.mesa.pk}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(r.data), {'mesa', 'grupos', 'solicitudes_pago', 'solicitudes_union', 'alertas'})
        self.assertEqual(set(r.data['mesa']), {'id', 'numero', 'zona', 'estado', 'nota_cierre', 'qr_code'})
        grupo = r.data['grupos'][0]
        self.assertEqual(set(grupo), {'id', 'integrantes', 'por_cobrar'})
        self.assertTrue({
            'id', 'alias', 'estado', 'fecha_inicio', 'ultima_actividad', 'pedidos', 'por_cobrar',
        } <= set(grupo['integrantes'][0]))
        self.assertEqual((grupo['integrantes'][0]['pedidos'], grupo['por_cobrar']), (1, '3.22'))
        solicitud = r.data['solicitudes_pago'][0]
        self.assertTrue({
            'id', 'tipo', 'grupo', 'solicitada_por', 'metodo_preferido', 'total', 'created_at',
        } <= set(solicitud))
        self.assertEqual((solicitud['solicitada_por'], solicitud['metodo_preferido'], solicitud['total']),
                         ('ANA', 'efectivo', '3.22'))
        self.assertEqual(r.data['solicitudes_union'][0]['alias'], 'BETO')
        self.assertEqual(r.data['solicitudes_union'][0]['grupo_nombres'], ['ANA'])
        self.assertEqual({a['tipo'] for a in r.data['alertas']}, {'cuenta', 'personalizado'})
        self.assertEqual(set(r.data['alertas'][0]), {'id', 'tipo', 'mensaje', 'alias', 'created_at'})

        r = self.personal().get(f'{API_PERSONAL}alertas/', {'atendida': 'false'})
        self.assertEqual(len(r.data), 2)
        self.assertEqual(set(r.data[0]), {'id', 'tipo', 'mensaje', 'alias', 'mesa', 'created_at'})
        self.assertEqual(set(r.data[0]['mesa']), {'id', 'numero', 'zona'})

    def test_el_detalle_muestra_pagadas_no_cerradas(self):
        ana = self.entrar('Ana')
        self.entrar('Beto')
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(ana.id)]})
        r = self.personal().get(f'{API_PERSONAL}mesas/{self.mesa.pk}/')
        estados = {i['alias']: i['estado'] for g in r.data['grupos'] for i in g['integrantes']}
        self.assertEqual(estados, {'ANA': 'pagada', 'BETO': 'activa'})


class GruposBordeTests(PruebaQR):
    def test_cobrar_una_cuenta_grupal_cubre_al_grupo_en_ese_momento(self):
        ana = self.entrar('Ana')
        beto = self.unir(ana, 'Beto')
        self.pedido_de(beto.pedir((self.cappuccino, 1)))
        solicitud = beto.pedir_cuenta('grupal', confirmar=True).data['solicitud']
        self.assertEqual(solicitud['total'], '3.22')

        # DANI se une y pide DESPUÉS de que BETO pidió la cuenta grupal
        dani = self.unir(ana, 'Dani')
        self.pedido_de(dani.pedir((self.sanduche, 1)))
        self.assertEqual(ana.get('sesion/').data['cuenta_pendiente']['total'], '8.40')

        r = self.cobrar({'metodo_pago': 'efectivo', 'solicitud': solicitud['id']})
        self.assertEqual((r.status_code, r.data['total_cobrado']), (200, '8.40'))
        cubiertas = set(SolicitudPago.objects.get(pk=solicitud['id']).sesiones_cubiertas.values_list('pk', flat=True))
        self.assertEqual(cubiertas, {ana.id, beto.id, dani.id})
        self.assertEqual(dani.get('ticket/').data['solicitud_id'], solicitud['id'])

    def test_solicitud_de_otra_mesa_no_se_cobra(self):
        zoe = self.entrar('Zoe', mesa=self.mesa2)
        self.pedido_de(zoe.pedir((self.cappuccino, 1)))
        solicitud = zoe.pedir_cuenta('individual', confirmar=True).data['solicitud']
        self.entrar('Ana')
        r = self.cobrar({'metodo_pago': 'efectivo', 'solicitud': solicitud['id']})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(SolicitudPago.objects.get(pk=solicitud['id']).estado, 'pendiente')

    def test_si_la_fundadora_se_va_el_grupo_sigue_y_acepta_nuevos(self):
        ana = self.entrar('Ana')
        beto = self.unir(ana, 'Beto')
        self.assertEqual(ana.post('salir/').status_code, 200)

        r = self.bienvenida(self.mesa.qr_code)
        self.assertEqual(r.data['grupos'], [{'id': str(ana.id), 'nombres': ['BETO']}])
        carla = self.entrar('Carla', grupo=beto.id)
        solicitud = carla.sesion.solicitudes_union.get(estado='pendiente')
        self.assertEqual(carla.get('sesion/').data['union_pendiente']['nombres'], ['BETO'])
        self.assertEqual(beto.post(f'union/{solicitud.pk}/aceptar/').status_code, 200)
        self.assertEqual(
            [i['alias'] for i in carla.get('cuenta/', {'tipo': 'grupal'}).data['integrantes']], ['BETO', 'CARLA']
        )


class CookieYAuthTests(PruebaQR):
    @override_settings(COMENSAL_COOKIE_SECURE=True)
    def test_cookie_secure_segun_el_ajuste(self):
        r = self.post_entrar(APIClient(), 'Ana')
        self.assertTrue(r.cookies[COOKIE]['secure'])

    def test_bienvenida_borra_la_cookie_de_una_sesion_cerrada(self):
        ana = self.entrar('Ana')
        self.envejecer(ana, 16)
        r = self.bienvenida(self.mesa.qr_code, client=ana.client)
        self.assertEqual(r.cookies[COOKIE].value, '')
        self.assertIsNone(r.data['sesion_actual'])

    def test_las_rutas_del_cliente_no_aceptan_jwt(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.local.cajero).access_token}')
        self.assertEqual(client.get(f'{API_PERSONAL}resumen/').status_code, 200)  # el JWT es válido
        r = client.get(API_CLIENTE + 'menu/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sin_sesion'))


class MesasYTableroTests(PruebaQR):
    def test_qr_aleatorio_y_regenerar_qr(self):
        self.assertGreaterEqual(len(self.mesa.qr_code), 20)
        self.assertNotIn(str(self.mesa.pk), self.mesa.qr_code)
        self.assertNotEqual(self.mesa.qr_code, self.mesa2.qr_code)

        r = self.personal(self.local.cajero).get(API_MESAS)
        fila = next(m for m in r.data['results'] if m['id'] == str(self.mesa.pk))
        self.assertEqual((fila['qr_code'], fila['nota_cierre']), (self.mesa.qr_code, ''))

        viejo = self.mesa.qr_code
        self.assertEqual(self.personal(self.local.camarero).post(f'{API_MESAS}{self.mesa.pk}/regenerar_qr/').status_code, 403)
        r = self.personal(self.local.cafe_admin).post(f'{API_MESAS}{self.mesa.pk}/regenerar_qr/')
        self.assertEqual(r.status_code, 200)
        nuevo = self.recargar_mesa().qr_code
        self.assertNotEqual(nuevo, viejo)
        self.assertEqual(r.data['qr_code'], nuevo)
        # El QR impreso anterior deja de servir
        self.assertEqual(self.bienvenida(viejo).data['variante'], 'sin_mesa')
        self.assertEqual(self.bienvenida(nuevo).data['variante'], 'normal')
        registro = RegistroAuditoria.objects.get(accion='mesa.regenerar_qr')
        self.assertNotIn(viejo, str(registro.detalle))

    def test_liberar_o_cambiar_estado_con_gente_conectada_se_bloquea(self):
        self.entrar('Ana')
        for ruta, datos in (('maintenance/', None), ('change_status/', {'status': 'disponible'})):
            r = self.personal().post(f'{API_MESAS}{self.mesa.pk}/{ruta}', datos, format='json')
            self.assertEqual(r.status_code, 400, ruta)
            self.assertIn('1 persona(s) conectadas por QR', r.data['error'])
        self.assertEqual(self.recargar_mesa().status, 'ocupada')

    def test_tablero_incluye_entregados_de_hoy_y_no_los_cancelados(self):
        ana = self.entrar('Ana')
        entregado = self.pedido_de(ana.pedir((self.cappuccino, 1)))
        cancelado = self.pedido_de(ana.pedir((self.cappuccino, 1)))
        antiguo = self.pedido_de(ana.pedir((self.cappuccino, 1)))
        Order.objects.filter(pk=entregado.pk).update(status='entregada', completed_at=timezone.now())
        Order.objects.filter(pk=cancelado.pk).update(status='cancelada')
        Order.objects.filter(pk=antiguo.pk).update(status='entregada', completed_at=timezone.now() - timedelta(days=2))
        ids = [p['id'] for p in self.personal().get(f'{API_PEDIDOS}tablero/').data]
        self.assertEqual(ids, [str(entregado.pk)])


class PedidoDelPersonalTests(PruebaQR):
    def test_salir_no_libera_una_mesa_con_un_pedido_del_personal_abierto(self):
        pedido = Order.objects.create(
            tenant=self.local.tenant, cafeteria=self.local.cafe, order_type='mesa', mesa=self.mesa,
            created_by=self.local.camarero,
        )
        self.mesa.occupy(2)
        ana = self.entrar('Ana')
        mesa = self.recargar_mesa()
        self.assertEqual((mesa.status, mesa.guest_count), ('ocupada', 1))
        self.assertEqual(ana.post('salir/').status_code, 200)
        self.assertEqual(self.recargar_mesa().status, 'ocupada')
        # Y el bloqueo del personal sigue avisando del pedido abierto
        r = self.personal().post(f'{API_MESAS}{self.mesa.pk}/free/')
        self.assertEqual(r.status_code, 400)
        self.assertIn(pedido.order_number, r.data['error'])


class LimpiezaPagadasTests(PruebaQR):
    def test_la_limpieza_global_cierra_pagadas_vencidas(self):
        ana = self.entrar('Ana')
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(ana.id)]})
        SesionCliente.objects.filter(pk=ana.id).update(pagada_at=hace(11))
        self.assertEqual(services.limpiar_sesiones_inactivas(forzar=True), 1)
        self.assertEqual((ana.sesion.estado, ana.sesion.motivo_cierre), ('cerrada', 'expirada'))
        self.assertEqual(self.recargar_mesa().status, 'limpiando')
        self.assertEqual(OrderItem.objects.filter(order__sesion_cliente_id=ana.id).count(), 1)
