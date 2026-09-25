"""Concurrencia real (hilos + conexiones propias): lock de la mesa al entrar y order_number sin colisiones"""
import threading
import time
from decimal import Decimal
from unittest import mock

from django.db import connection, transaction
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient

from apps.comensales.models import SesionCliente
from apps.pedidos.models import Order

from .base import AJUSTES_PRUEBA, COOKIE, FlujoQRMixin, PruebaQR


def en_paralelo(funciones, timeout=30):
    """Ejecuta cada función en su hilo, arrancando todas a la vez (threading.Barrier).

    Cada hilo usa su propia conexión a la BD y la cierra al terminar. Devuelve los resultados en orden.
    """
    barrera = threading.Barrier(len(funciones), timeout=timeout)
    resultados = [None] * len(funciones)
    errores = []

    def correr(indice, funcion):
        try:
            barrera.wait()
            resultados[indice] = funcion()
        except Exception as exc:  # se reporta en el hilo principal
            errores.append(exc)
        finally:
            connection.close()

    hilos = [threading.Thread(target=correr, args=(i, f)) for i, f in enumerate(funciones)]
    for hilo in hilos:
        hilo.start()
    for hilo in hilos:
        hilo.join(timeout)
    if errores:
        raise errores[0]
    return resultados


@override_settings(**AJUSTES_PRUEBA)
class EntrarConcurrenteTests(FlujoQRMixin, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.preparar_local()

    def test_dos_personas_escanean_a_la_vez_con_el_mismo_nombre_solo_una_entra(self):
        clientes = [APIClient(), APIClient()]

        def entrar(client):
            return lambda: self.post_entrar(client, 'Diego')

        respuestas = en_paralelo([entrar(c) for c in clientes])
        codigos = sorted(r.status_code for r in respuestas)
        self.assertEqual(codigos, [200, 409])
        rechazada = next(r for r in respuestas if r.status_code == 409)
        self.assertEqual(rechazada.data['codigo'], 'nombre_en_uso')
        self.assertNotIn(COOKIE, rechazada.cookies)
        self.assertEqual(SesionCliente.objects.filter(mesa=self.mesa).count(), 1)
        mesa = self.recargar_mesa()
        self.assertEqual((mesa.status, mesa.guest_count), ('ocupada', 1))

    def test_order_number_no_colisiona_con_pedidos_por_qr_concurrentes(self):
        # Una persona en cada mesa: el lock de la mesa no los serializa, solo el índice único
        comensales = [self.entrar(f'Persona {n}', mesa=mesa) for n, mesa in enumerate(self.local.mesas)]

        def pedir(comensal):
            return lambda: comensal.pedir((self.cappuccino, 1))

        respuestas = en_paralelo([pedir(c) for c in comensales])
        self.assertEqual([r.status_code for r in respuestas], [201] * len(comensales))
        numeros = list(Order.objects.values_list('order_number', flat=True))
        self.assertEqual(len(numeros), len(comensales))
        self.assertEqual(len(set(numeros)), len(numeros))

    def test_order_number_reintenta_si_otra_transaccion_tomo_el_mismo_numero(self):
        """Todas calculan el mismo número a la vez; el índice único rechaza a las demás y reintentan"""
        cantidad = 4

        def crear():
            with transaction.atomic():
                pedido = Order.objects.create(
                    tenant=self.local.tenant, cafeteria=self.local.cafe, order_type='takeaway',
                    customer_name='Mostrador',
                )
                time.sleep(0.3)  # la transacción sigue abierta: las otras chocan contra el mismo número
            return pedido.order_number

        # Espía: cuántas veces se calculó el siguiente número (más llamadas que pedidos = hubo reintentos)
        calcular = Order._ultimo_numero_del_dia
        with mock.patch.object(Order, '_ultimo_numero_del_dia', side_effect=calcular) as espia:
            numeros = en_paralelo([crear] * cantidad)
        self.assertGreater(espia.call_count, cantidad)
        self.assertEqual(len(set(numeros)), cantidad)
        prefijo = numeros[0][:-4]
        self.assertEqual(sorted(numeros), [f'{prefijo}{n:04d}' for n in range(1, cantidad + 1)])
        self.assertEqual(Order.objects.count(), cantidad)


@override_settings(**AJUSTES_PRUEBA)
class CobroConcurrenteTests(FlujoQRMixin, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.preparar_local()

    def test_un_pedido_nuevo_durante_el_cobro_nunca_queda_sin_pagar_en_una_sesion_pagada(self):
        for vuelta in range(3):
            ana = self.entrar(f'Ana {vuelta}')
            self.pedido_de(ana.pedir((self.cappuccino, 1)))
            respuestas = en_paralelo([
                lambda: self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(ana.id)]}),
                lambda: ana.pedir((self.sanduche, 1)),
            ])
            cobro, pedido = respuestas
            self.assertEqual(cobro.status_code, 200)
            self.assertIn(pedido.status_code, (201, 409))
            if pedido.status_code == 409:
                self.assertEqual(pedido.data['codigo'], 'sesion_pagada')
            self.assertEqual(ana.sesion.estado, 'pagada')
            self.assertFalse(Order.objects.filter(sesion_cliente_id=ana.id, is_paid=False).exists())
            # Se deja la mesa lista para la siguiente vuelta
            self.assertEqual(self.personal().post(f'/api/v1/mesas/mesas/{self.mesa.pk}/free/').status_code, 200)


class OrderNumberTests(PruebaQR):
    def test_colision_simulada_reintenta_dentro_de_un_savepoint(self):
        primero = Order.objects.create(tenant=self.local.tenant, cafeteria=self.local.cafe, order_type='takeaway')
        self.assertTrue(primero.order_number.endswith('-0001'))
        # Un cálculo desactualizado propone otra vez el 0001: el índice único lo rechaza y se reintenta
        with mock.patch.object(Order, '_ultimo_numero_del_dia', return_value=0):
            with transaction.atomic():
                segundo = Order.objects.create(
                    tenant=self.local.tenant, cafeteria=self.local.cafe, order_type='takeaway', total=Decimal('1.00'),
                )
        self.assertTrue(segundo.order_number.endswith('-0002'))
        self.assertEqual(Order.objects.count(), 2)
