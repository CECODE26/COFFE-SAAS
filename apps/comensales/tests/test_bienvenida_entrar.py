"""Flujos 1 y 2: escaneo, bienvenida y entrar a la mesa"""
import uuid

from rest_framework.test import APIClient

from apps.comensales.models import SesionCliente, SolicitudUnion
from apps.mesas.models import Mesa

from .base import (
    API_CLIENTE, COOKIE, MENSAJE_EN_CIERRE, MENSAJE_NO_DISPONIBLE, MENSAJE_RESERVADA, MENSAJE_SIN_MESA, PruebaQR,
    hace,
)


class BienvenidaTests(PruebaQR):
    """Variantes de la pantalla de bienvenida"""

    def test_sin_mesa_token_inexistente_o_mesa_desactivada(self):
        for qr in (None, '', 'token-que-no-existe'):
            r = self.bienvenida(qr)
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.data['variante'], 'sin_mesa')
            self.assertEqual(r.data['mensaje'], MENSAJE_SIN_MESA)
            self.assertIsNone(r.data['mesa'])
            self.assertEqual(r.data['grupos'], [])
            self.assertIsNone(r.data['sesion_actual'])

        Mesa.objects.filter(pk=self.mesa.pk).update(is_active=False)
        self.assertEqual(self.bienvenida(self.mesa.qr_code).data['variante'], 'sin_mesa')

        r = self.post_entrar(APIClient(), 'Ana', qr='token-que-no-existe')
        self.assertEqual((r.status_code, r.data['codigo']), (404, 'sin_mesa'))
        r = self.post_entrar(APIClient(), 'Ana')  # la mesa desactivada tampoco deja entrar
        self.assertEqual((r.status_code, r.data['codigo']), (404, 'sin_mesa'))

    def test_no_disponible_mesa_reservada(self):
        Mesa.objects.filter(pk=self.mesa.pk).update(status='reservada')
        r = self.bienvenida(self.mesa.qr_code)
        self.assertEqual(r.data['variante'], 'no_disponible')
        self.assertEqual(r.data['mensaje'], MENSAJE_RESERVADA)
        self.assertEqual(r.data['mesa']['numero'], 1)
        self.assertEqual(r.data['grupos'], [])

        r = self.post_entrar(APIClient(), 'Ana')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'no_disponible'))
        self.assertEqual(r.data['detail'], MENSAJE_RESERVADA)
        self.assertFalse(SesionCliente.objects.exists())

    def test_no_disponible_mesa_en_mantenimiento(self):
        Mesa.objects.filter(pk=self.mesa.pk).update(status='mantenimiento')
        r = self.bienvenida(self.mesa.qr_code)
        self.assertEqual((r.data['variante'], r.data['mensaje']), ('no_disponible', MENSAJE_NO_DISPONIBLE))
        r = self.post_entrar(APIClient(), 'Ana')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'no_disponible'))

    def test_no_disponible_local_inactivo(self):
        self.local.cafe.is_active = False
        self.local.cafe.save()
        r = self.bienvenida(self.mesa.qr_code)
        self.assertEqual((r.data['variante'], r.data['mensaje']), ('no_disponible', MENSAJE_NO_DISPONIBLE))
        r = self.post_entrar(APIClient(), 'Ana')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'no_disponible'))
        self.assertFalse(SesionCliente.objects.exists())

    def test_en_cierre_mesa_limpiando(self):
        Mesa.objects.filter(pk=self.mesa.pk).update(status='limpiando')
        r = self.bienvenida(self.mesa.qr_code)
        self.assertEqual((r.data['variante'], r.data['mensaje']), ('en_cierre', MENSAJE_EN_CIERRE))
        self.assertEqual(r.data['grupos'], [])

        r = self.post_entrar(APIClient(), 'Ana')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'en_cierre'))
        self.assertEqual(r.data['detail'], MENSAJE_EN_CIERRE)
        self.assertFalse(SesionCliente.objects.exists())

    def test_normal_lista_los_grupos_activos_en_orden_de_llegada(self):
        ana = self.entrar('Ana')
        carlos = self.entrar('Carlos')
        self.unir(ana, 'Beto')  # llega después de CARLOS pero su grupo es el de ANA

        r = self.bienvenida(self.mesa.qr_code)
        self.assertEqual(r.data['variante'], 'normal')
        self.assertEqual(r.data['mesa'], {
            'numero': 1, 'zona': 'Terraza', 'local': {'nombre': 'Café La Floresta', 'logo': None},
        })
        self.assertEqual(r.data['grupos'], [
            {'id': str(ana.id), 'nombres': ['ANA', 'BETO']},
            {'id': str(carlos.id), 'nombres': ['CARLOS']},
        ])
        self.assertIsNone(r.data['sesion_actual'])

        # Con la cookie del dispositivo se reconoce su sesión
        r = self.bienvenida(self.mesa.qr_code, client=ana.client)
        self.assertEqual(r.data['sesion_actual'], {'alias': 'ANA', 'estado': 'activa'})

    def test_bienvenida_no_lista_sesiones_cerradas_ni_de_otra_mesa(self):
        ana = self.entrar('Ana')
        self.entrar('Zoe', mesa=self.mesa2)
        self.assertEqual(ana.post('salir/').status_code, 200)
        r = self.bienvenida(self.mesa.qr_code)
        self.assertEqual(r.data['grupos'], [])


class EntrarTests(PruebaQR):
    """POST /cliente/entrar/"""

    def test_nombre_vacio_400(self):
        for nombre in ('', '    ', None):
            client = APIClient()
            datos = {'mesa': self.mesa.qr_code}
            if nombre is not None:
                datos['nombre'] = nombre
            r = client.post(API_CLIENTE + 'entrar/', datos, format='json', HTTP_X_REQUESTED_WITH='XMLHttpRequest')
            self.assertEqual(r.status_code, 400)
            self.assertEqual(r.data, {'codigo': 'nombre_vacio', 'detail': 'Escribe tu nombre para continuar'})
            self.assertNotIn(COOKIE, r.cookies)
        self.assertFalse(SesionCliente.objects.exists())

    def test_entrar_normaliza_el_nombre_pone_la_cookie_y_ocupa_la_mesa(self):
        client = APIClient()
        r = self.post_entrar(client, '  ana    maría ')
        self.assertEqual(r.status_code, 200)
        sesion = SesionCliente.objects.get()
        self.assertEqual(r.data, {
            'sesion': {'id': str(sesion.id), 'alias': 'ANA MARÍA', 'estado': 'activa'},
            'union_pendiente': False,
        })
        cookie = r.cookies[COOKIE]
        self.assertEqual(cookie.value, sesion.token_cookie)
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['samesite'], 'Lax')
        self.assertEqual(int(cookie['max-age']), 2 * 3600)
        self.assertEqual(cookie['path'], '/')
        self.assertGreaterEqual(len(sesion.token_cookie), 32)

        mesa = self.recargar_mesa()
        self.assertEqual((mesa.status, mesa.guest_count), ('ocupada', 1))
        self.assertIsNotNone(mesa.occupied_since)

        self.entrar('Beto')
        self.assertEqual(self.recargar_mesa().guest_count, 2)

    def test_nombre_en_uso_409_conservando_lo_escrito(self):
        self.entrar('Ana')
        r = self.post_entrar(APIClient(), 'ana')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data, {
            'codigo': 'nombre_en_uso', 'detail': 'Ese nombre ya está siendo usado en esta mesa', 'nombre': 'ana',
        })
        r = self.post_entrar(APIClient(), '  Ana  ')
        self.assertEqual((r.status_code, r.data['nombre']), (409, 'Ana'))
        self.assertEqual(SesionCliente.objects.filter(mesa=self.mesa).count(), 1)

        # El mismo nombre sí sirve en otra mesa
        self.entrar('Ana', mesa=self.mesa2)

    def test_el_nombre_se_libera_cuando_la_sesion_ya_no_esta_activa(self):
        ana = self.entrar('Ana')
        self.assertEqual(ana.post('salir/').status_code, 200)
        otra = self.entrar('ANA')
        self.assertNotEqual(otra.id, ana.id)

    def test_reescanear_desde_el_mismo_dispositivo_reutiliza_la_sesion(self):
        ana = self.entrar('Ana')
        r = self.post_entrar(ana.client, 'Ana')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['sesion']['id'], str(ana.id))
        self.assertEqual(SesionCliente.objects.filter(mesa=self.mesa).count(), 1)
        self.assertEqual(self.recargar_mesa().guest_count, 1)

        # Si cambió el nombre, se renombra la misma sesión (validando que no esté en uso)
        r = self.post_entrar(ana.client, 'Ana María')
        self.assertEqual((r.data['sesion']['id'], r.data['sesion']['alias']), (str(ana.id), 'ANA MARÍA'))
        self.entrar('Beto')
        r = self.post_entrar(ana.client, 'beto')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'nombre_en_uso'))
        self.assertEqual(ana.sesion.alias, 'ANA MARÍA')
        self.assertEqual(SesionCliente.objects.filter(mesa=self.mesa).count(), 2)

    def test_grupo_de_otra_mesa_o_sin_activas_crea_grupo_propio(self):
        zoe = self.entrar('Zoe', mesa=self.mesa2)
        r = self.post_entrar(APIClient(), 'Ana', grupo=zoe.id)
        self.assertEqual((r.status_code, r.data['union_pendiente']), (200, False))
        ana = SesionCliente.objects.get(pk=r.data['sesion']['id'])
        self.assertIsNone(ana.grupo_id)
        self.assertFalse(SolicitudUnion.objects.exists())

        # Grupo sin sesiones activas (la fundadora ya salió)
        beto = self.entrar('Beto')
        self.assertEqual(beto.post('salir/').status_code, 200)
        r = self.post_entrar(APIClient(), 'Carla', grupo=beto.id)
        self.assertEqual((r.status_code, r.data['union_pendiente']), (200, False))
        self.assertFalse(SolicitudUnion.objects.exists())

        # Valores inválidos o que no existen → grupo propio
        for grupo in ('no-es-un-uuid', uuid.uuid4(), ''):
            r = self.post_entrar(APIClient(), f'Persona {len(str(grupo))}', grupo=grupo)
            self.assertEqual((r.status_code, r.data['union_pendiente']), (200, False))
        self.assertFalse(SolicitudUnion.objects.exists())
        self.assertFalse(SesionCliente.objects.filter(grupo__isnull=False).exists())

    def test_elegir_a_un_miembro_normaliza_a_la_fundadora(self):
        ana = self.entrar('Ana')
        beto = self.unir(ana, 'Beto')
        self.assertEqual(beto.sesion.grupo_id, ana.id)

        r = self.post_entrar(APIClient(), 'Carla', grupo=beto.id)
        self.assertTrue(r.data['union_pendiente'])
        solicitud = SolicitudUnion.objects.get(sesion_id=r.data['sesion']['id'])
        self.assertEqual(solicitud.grupo_id, ana.id)
        # Aprobación sin bloqueo: entra al instante como grupo propio
        self.assertIsNone(SesionCliente.objects.get(pk=r.data['sesion']['id']).grupo_id)

    def test_fundador_con_integrantes_no_puede_pedir_unirse_a_otro_grupo(self):
        ana = self.entrar('Ana')
        self.unir(ana, 'Beto')
        carlos = self.entrar('Carlos')
        r = self.post_entrar(ana.client, 'Ana', grupo=carlos.id)
        self.assertEqual(r.status_code, 400)
        self.assertFalse(SolicitudUnion.objects.filter(sesion_id=ana.id, estado='pendiente').exists())

    def test_con_la_mesa_en_cierre_no_entra_nadie(self):
        ana = self.entrar('Ana')
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        r = self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(ana.id)]})
        self.assertEqual((r.status_code, r.data['mesa_estado']), (200, 'limpiando'))

        self.assertEqual(self.bienvenida(self.mesa.qr_code).data['variante'], 'en_cierre')
        r = self.post_entrar(APIClient(), 'Beto')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'en_cierre'))
        # Tampoco el mismo dispositivo de la sesión pagada
        r = self.post_entrar(ana.client, 'Ana')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'en_cierre'))

    def test_sesiones_pagadas_sin_activas_es_en_cierre_aunque_la_mesa_siga_ocupada(self):
        ana = self.entrar('Ana')
        SesionCliente.objects.filter(pk=ana.id).update(estado='pagada', pagada_at=hace(1))
        self.assertEqual(self.recargar_mesa().status, 'ocupada')
        self.assertEqual(self.bienvenida(self.mesa.qr_code).data['variante'], 'en_cierre')
        r = self.post_entrar(APIClient(), 'Beto')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'en_cierre'))

    def test_con_pagos_parciales_y_alguien_activo_si_entra(self):
        ana = self.entrar('Ana')
        self.entrar('Beto')
        self.pedido_de(ana.pedir((self.cappuccino, 1)))
        r = self.cobrar({'metodo_pago': 'tarjeta', 'sesiones': [str(ana.id)]})
        self.assertEqual(r.data['mesa_estado'], 'ocupada')

        self.assertEqual(self.bienvenida(self.mesa.qr_code).data['variante'], 'normal')
        carla = self.entrar('Carla')
        self.assertEqual(carla.sesion.estado, 'activa')
        # Solo cuentan los nombres de sesiones activas: ANA (pagada) puede repetirse
        self.entrar('Ana')
