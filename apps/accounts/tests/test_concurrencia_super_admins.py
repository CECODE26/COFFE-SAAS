"""Concurrencia real (hilos + conexiones propias): dos super admins que se eliminan o se desactivan
entre sí al mismo tiempo nunca dejan la plataforma sin ninguno activo"""
import threading
import time
from unittest import mock

from django.db import connection
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts import views
from apps.accounts.models import User

from .base import AJUSTES_PRUEBA, API_USERS, crear_usuario

ESPERA_MAXIMA = 10  # segundos


def _pid_actual():
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_backend_pid()')
        return cursor.fetchone()[0]


def _esta_esperando_un_bloqueo(pid):
    with connection.cursor() as cursor:
        cursor.execute('SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = %s AND NOT granted)', [pid])
        return cursor.fetchone()[0]


@override_settings(**AJUSTES_PRUEBA)
class SuperAdminsCruzadosTests(TransactionTestCase):

    def setUp(self):
        super().setUp()
        self.ana = crear_usuario('super_admin')
        self.beto = crear_usuario('super_admin')

    def peticion(self, quien, a_quien, accion):
        cliente = APIClient()
        cliente.force_authenticate(quien)
        if accion == 'eliminar':
            return cliente.delete(f'{API_USERS}{a_quien.pk}/')
        return cliente.post(f'{API_USERS}{a_quien.pk}/{accion}/', {}, format='json')

    def cruzar(self, primera, segunda):
        """La primera petición toma los bloqueos y espera (con la transacción abierta) a que la segunda quede
        bloqueada esperándola; recién entonces termina. Devuelve los códigos de respuesta de ambas."""
        bloqueos_tomados = threading.Event()
        segunda_pid = []
        real = views._bloquear_para_quitar
        hilo_primera = {}

        def bloquear_y_esperar(usuario):
            resultado = real(usuario)
            if threading.current_thread() is hilo_primera.get('hilo'):
                bloqueos_tomados.set()
                limite = time.monotonic() + ESPERA_MAXIMA
                while time.monotonic() < limite:
                    if segunda_pid and _esta_esperando_un_bloqueo(segunda_pid[0]):
                        break
                    time.sleep(0.02)
                else:
                    self.esperando_segunda = False
            return resultado

        codigos = {}
        errores = []

        def correr(nombre, args, antes=None):
            try:
                if antes:
                    antes()
                codigos[nombre] = self.peticion(*args).status_code
            except Exception as exc:  # se reporta en el hilo principal
                errores.append(exc)
            finally:
                connection.close()

        def antes_de_la_segunda():
            self.assertTrue(bloqueos_tomados.wait(ESPERA_MAXIMA), 'la primera petición no tomó los bloqueos')
            segunda_pid.append(_pid_actual())

        self.esperando_segunda = True
        with mock.patch.object(views, '_bloquear_para_quitar', side_effect=bloquear_y_esperar):
            uno = threading.Thread(target=correr, args=('primera', primera))
            dos = threading.Thread(target=correr, args=('segunda', segunda, antes_de_la_segunda))
            hilo_primera['hilo'] = uno
            uno.start()
            dos.start()
            uno.join(ESPERA_MAXIMA * 3)
            dos.join(ESPERA_MAXIMA * 3)
        if errores:
            raise errores[0]
        # Si la segunda nunca quedó esperando, la prueba no ejercitó la carrera
        self.assertTrue(self.esperando_segunda, 'la segunda petición no quedó esperando los bloqueos')
        return codigos['primera'], codigos['segunda']

    def activos(self):
        return User.objects.filter(role='super_admin', is_active=True).count()

    def test_eliminarse_mutuamente(self):
        codigos = self.cruzar((self.ana, self.beto, 'eliminar'), (self.beto, self.ana, 'eliminar'))
        self.assertEqual(codigos, (204, 400))
        self.assertEqual(list(User.objects.filter(role='super_admin').values_list('pk', flat=True)), [self.ana.pk])
        self.assertEqual(self.activos(), 1)

    def test_eliminar_mientras_el_otro_lo_desactiva(self):
        codigos = self.cruzar((self.ana, self.beto, 'eliminar'), (self.beto, self.ana, 'deactivate'))
        self.assertEqual(codigos, (204, 400))
        self.ana.refresh_from_db()
        self.assertTrue(self.ana.is_active)
        self.assertEqual(self.activos(), 1)

    def test_desactivarse_mutuamente(self):
        codigos = self.cruzar((self.ana, self.beto, 'deactivate'), (self.beto, self.ana, 'deactivate'))
        self.assertEqual(codigos, (200, 400))
        self.assertEqual(self.activos(), 1)

    def test_desactivar_una_cuenta_que_otro_esta_eliminando_no_la_revive(self):
        codigos = self.cruzar((self.ana, self.beto, 'eliminar'), (self.ana, self.beto, 'deactivate'))
        self.assertEqual(codigos, (204, 404))
        self.assertFalse(User.objects.filter(pk=self.beto.pk).exists())
