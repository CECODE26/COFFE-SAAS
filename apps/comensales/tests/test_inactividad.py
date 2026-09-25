"""Inactividad, vencimiento de sesiones pagadas, cookies viejas y endpoints de polling"""
from datetime import timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.comensales import services
from apps.comensales.models import SesionCliente
from apps.pedidos.models import Order

from .base import COOKIE, PruebaQR, hace


class InactividadTests(PruebaQR):
    def test_sesion_sin_pedidos_se_cierra_a_los_15_min_y_libera_la_mesa(self):
        ana = self.entrar('Ana')
        self.assertEqual(self.recargar_mesa().status, 'ocupada')

        # A los 14 minutos sigue activa
        self.envejecer(ana, 14)
        self.permitir_limpieza_global()
        self.bienvenida(self.mesa.qr_code)  # la bienvenida (siguiente escaneo) dispara la limpieza
        self.assertEqual(ana.sesion.estado, 'activa')

        self.envejecer(ana, 16)
        self.permitir_limpieza_global()
        r = self.bienvenida(self.mesa.qr_code)
        self.assertEqual(r.data['grupos'], [])
        sesion = ana.sesion
        self.assertEqual((sesion.estado, sesion.motivo_cierre), ('cerrada', 'inactividad'))
        mesa = self.recargar_mesa()
        self.assertEqual((mesa.status, mesa.guest_count, mesa.nota_cierre), ('disponible', 0, ''))

        # Su navegador vuelve a bienvenida: 401 sesion_cerrada con la mesa y la cookie borrada
        r = ana.get('sesion/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sesion_cerrada'))
        self.assertEqual(r.data['mesa'], self.mesa.qr_code)
        self.assertEqual(r.cookies[COOKIE].value, '')

    def test_con_otra_persona_activa_no_libera_la_mesa(self):
        ana = self.entrar('Ana')
        self.entrar('Beto')
        self.envejecer(ana, 16)
        self.assertEqual(services.limpiar_sesiones_inactivas(forzar=True), 1)
        self.assertEqual(ana.sesion.estado, 'cerrada')
        mesa = self.recargar_mesa()
        self.assertEqual((mesa.status, mesa.guest_count), ('ocupada', 1))

    def test_sesion_con_pedidos_nunca_se_cierra_por_inactividad(self):
        ana = self.entrar('Ana')
        pedido = self.pedido_de(ana.pedir((self.cappuccino, 1)))
        Order.objects.filter(pk=pedido.pk).update(status='entregada')
        self.envejecer(ana, 180)
        self.assertEqual(services.limpiar_sesiones_inactivas(forzar=True), 0)
        # Ni la limpieza global ni su propio request (revalidación) la cierran
        r = ana.get('menu/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(ana.sesion.estado, 'activa')
        self.assertEqual(self.recargar_mesa().status, 'ocupada')

    def test_pedidos_cancelados_no_cuentan_como_consumo(self):
        ana = self.entrar('Ana')
        pedido = self.pedido_de(ana.pedir((self.cappuccino, 1)))
        Order.objects.filter(pk=pedido.pk).update(status='cancelada')
        self.envejecer(ana, 16)
        self.assertEqual(services.limpiar_sesiones_inactivas(forzar=True), 1)
        self.assertEqual(ana.sesion.motivo_cierre, 'inactividad')
        self.assertEqual(self.recargar_mesa().status, 'disponible')

    def test_una_accion_tardia_no_revive_una_sesion_vencida(self):
        """Con el reloj adelantado 16 min (mock de timezone.now) la revalidación cierra la sesión"""
        ana = self.entrar('Ana')
        futuro = timezone.now() + timedelta(minutes=16)
        with mock.patch('django.utils.timezone.now', return_value=futuro):
            r = ana.post('alertas/', {'tipo': 'ayuda'})
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sesion_cerrada'))
        self.assertEqual(r.cookies[COOKIE].value, '')
        sesion = ana.sesion
        self.assertEqual((sesion.estado, sesion.motivo_cierre), ('cerrada', 'inactividad'))
        self.assertFalse(sesion.alertas.exists())
        self.assertEqual(self.recargar_mesa().status, 'disponible')

    def test_la_limpieza_global_corre_maximo_una_vez_por_minuto(self):
        ana = self.entrar('Ana')  # entrar ya tomó el lock de este minuto
        self.envejecer(ana, 16)
        self.assertEqual(services.limpiar_sesiones_inactivas(), 0)
        self.assertEqual(ana.sesion.estado, 'activa')
        self.permitir_limpieza_global()
        self.assertEqual(services.limpiar_sesiones_inactivas(), 1)

    def test_la_limpieza_la_dispara_el_panel_del_personal(self):
        ana = self.entrar('Ana')
        self.envejecer(ana, 16)
        self.permitir_limpieza_global()
        r = self.personal().get('/api/v1/comensales/resumen/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, {})
        self.assertEqual(ana.sesion.estado, 'cerrada')

    def test_pagada_se_cierra_a_los_10_min_sin_cambiar_el_estado_de_la_mesa(self):
        ana = self.entrar('Ana')
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(ana.id)]})
        self.assertEqual(self.recargar_mesa().status, 'limpiando')

        SesionCliente.objects.filter(pk=ana.id).update(pagada_at=hace(9))
        self.assertEqual(ana.get('ticket/').status_code, 200)

        SesionCliente.objects.filter(pk=ana.id).update(pagada_at=hace(11))
        r = ana.get('sesion/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sesion_cerrada'))
        self.assertEqual((ana.sesion.estado, ana.sesion.motivo_cierre), ('cerrada', 'expirada'))
        self.assertEqual(self.recargar_mesa().status, 'limpiando')

    @override_settings(COMENSAL_PAGADA_CIERRE_MIN=600)
    def test_cookie_de_sesion_no_activa_con_mas_de_2_horas_se_borra(self):
        """Las 2 h cuentan desde que dejó de estar activa (pagada_at), no desde fecha_inicio: si no, quien
        llevaba más de 2 h sentado perdía el ticket en cuanto pagaba (ver test_regresiones)"""
        ana = self.entrar('Ana')
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        self.entrar('Beto')
        self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(ana.id)]})
        SesionCliente.objects.filter(pk=ana.id).update(fecha_inicio=hace(horas=3))
        self.assertEqual(ana.get('sesion/').status_code, 200)
        SesionCliente.objects.filter(pk=ana.id).update(pagada_at=hace(horas=2, minutos=1))
        r = ana.get('sesion/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sesion_cerrada'))
        self.assertEqual(r.cookies[COOKIE].value, '')


class PollingTests(PruebaQR):
    def test_los_endpoints_de_polling_no_renuevan_ultima_actividad(self):
        ana = self.entrar('Ana')
        antes = hace(5)
        SesionCliente.objects.filter(pk=ana.id).update(ultima_actividad=antes)

        r = ana.get('sesion/')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn(COOKIE, r.cookies)  # tampoco renueva la cookie
        r = ana.get('pedidos/', {'alcance': 'grupo'})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn(COOKIE, r.cookies)
        ana.get('pedidos/')
        self.assertEqual(ana.sesion.ultima_actividad, antes)

        # Cualquier otra request sí cuenta como actividad y renueva la cookie (sliding)
        r = ana.get('menu/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.cookies[COOKIE].value, ana.sesion.token_cookie)
        self.assertEqual(int(r.cookies[COOKIE]['max-age']), 7200)
        self.assertGreater(ana.sesion.ultima_actividad, antes)

    def test_sin_cookie_o_token_invalido_401_sin_sesion(self):
        r = APIClient().get('/api/v1/cliente/sesion/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sin_sesion'))
        client = APIClient()
        client.cookies[COOKIE] = 'token-inventado'
        r = client.get('/api/v1/cliente/menu/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sin_sesion'))
