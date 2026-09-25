"""Recuperación de cookie perdida con el código de reconexión que da el personal (decisión 4)"""
from rest_framework.test import APIClient

from apps.auditoria.models import RegistroAuditoria
from apps.comensales.models import SesionCliente

from .base import API_CLIENTE, API_PERSONAL, COOKIE, XHR, PruebaQR, crear_cafeteria, crear_usuario, hace


class ReconexionTests(PruebaQR):
    def setUp(self):
        super().setUp()
        self.ana = self.entrar('Ana')
        self.token_viejo = self.ana.token

    def generar_codigo(self, usuario=None):
        r = self.personal(usuario).post(f'{API_PERSONAL}sesiones/{self.ana.id}/codigo/')
        self.assertEqual(r.status_code, 200, r.content)
        return r

    def reconectar(self, codigo, nombre='ana', client=None, xhr=True):
        client = client or APIClient()
        datos = {'mesa': self.mesa.qr_code, 'nombre': nombre, 'codigo': codigo}
        return client.post(API_CLIENTE + 'reconectar/', datos, format='json', **(XHR if xhr else {}))

    @staticmethod
    def otro_codigo(codigo):
        return f'{(int(codigo) + 1) % 10000:04d}'

    def test_codigo_correcto_da_token_nuevo_y_la_cookie_vieja_deja_de_valer(self):
        r = self.generar_codigo()
        codigo = r.data['codigo']
        self.assertRegex(codigo, r'^\d{4}$')
        self.assertEqual(r.data['alias'], 'ANA')
        self.assertIsNotNone(r.data['expira_at'])
        self.assertTrue(RegistroAuditoria.objects.filter(accion='comensales.codigo_reconexion').exists())

        nuevo = APIClient()
        r = self.reconectar(codigo, client=nuevo)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data, {
            'sesion': {'id': str(self.ana.id), 'alias': 'ANA', 'estado': 'activa'}, 'union_pendiente': False,
        })
        token_nuevo = r.cookies[COOKIE].value
        self.assertNotEqual(token_nuevo, self.token_viejo)
        self.assertEqual(self.ana.sesion.token_cookie, token_nuevo)
        self.assertTrue(r.cookies[COOKIE]['httponly'])

        # El dispositivo nuevo sigue con la misma sesión; la cookie anterior ya no sirve
        self.assertEqual(nuevo.get(API_CLIENTE + 'sesion/').data['id'], str(self.ana.id))
        r = self.ana.get('sesion/')
        self.assertEqual((r.status_code, r.data['codigo']), (401, 'sin_sesion'))

        # El código es de un solo uso
        r = self.reconectar(codigo)
        self.assertEqual((r.status_code, r.data['codigo']), (400, 'codigo_invalido'))

    def test_cinco_fallos_anulan_el_codigo(self):
        codigo = self.generar_codigo().data['codigo']
        malo = self.otro_codigo(codigo)
        for restantes in (4, 3, 2, 1):
            r = self.reconectar(malo)
            self.assertEqual(r.status_code, 400)
            self.assertEqual((r.data['codigo'], r.data['intentos_restantes']), ('codigo_invalido', restantes))
        r = self.reconectar(malo)
        self.assertEqual((r.status_code, r.data['intentos_restantes']), (400, 0))
        self.assertEqual(self.ana.sesion.codigo_reconexion, '')

        # Ya ni el código correcto sirve: hay que pedir uno nuevo
        r = self.reconectar(codigo)
        self.assertEqual((r.status_code, r.data['codigo']), (400, 'codigo_invalido'))
        self.assertEqual(self.ana.sesion.token_cookie, self.token_viejo)

        codigo = self.generar_codigo().data['codigo']
        self.assertEqual(self.reconectar(codigo).status_code, 200)

    def test_codigo_vencido_o_de_otro_nombre_no_sirve(self):
        codigo = self.generar_codigo().data['codigo']
        self.assertEqual(self.reconectar(codigo, nombre='Beto').status_code, 400)
        SesionCliente.objects.filter(pk=self.ana.id).update(codigo_expira_at=hace(1))
        r = self.reconectar(codigo)
        self.assertEqual((r.status_code, r.data['codigo']), (400, 'codigo_invalido'))

    def test_reconectar_exige_x_requested_with(self):
        codigo = self.generar_codigo().data['codigo']
        self.assertEqual(self.reconectar(codigo, xhr=False).status_code, 403)

    def test_personal_de_otra_cafeteria_no_genera_codigos(self):
        otro_local = crear_cafeteria(self.local.tenant, 'Café Cumbayá')
        ajeno = crear_usuario('cajero', self.local.tenant, otro_local)
        r = self.personal(ajeno).post(f'{API_PERSONAL}sesiones/{self.ana.id}/codigo/')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(self.ana.sesion.codigo_reconexion, '')

    def test_no_se_genera_codigo_para_una_sesion_cerrada(self):
        self.assertEqual(self.ana.post('salir/').status_code, 200)
        r = self.personal().post(f'{API_PERSONAL}sesiones/{self.ana.id}/codigo/')
        self.assertEqual(r.status_code, 400)
