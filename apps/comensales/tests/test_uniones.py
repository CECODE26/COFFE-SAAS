"""Unirse a un grupo: aprobación sin bloqueo (decisión 1 del dueño)"""
from decimal import Decimal

from apps.comensales import services
from apps.comensales.models import SesionCliente, SolicitudUnion

from .base import PruebaQR, hace


class UnionTests(PruebaQR):
    def setUp(self):
        super().setUp()
        self.ana = self.entrar('Ana')
        self.pedido_de(self.ana.pedir((self.cappuccino, 1)))  # 3.22
        # BETO elige "Vengo con ANA": entra al instante como grupo propio y puede pedir
        self.beto = self.entrar('Beto', grupo=self.ana.id)
        self.pedido_de(self.beto.pedir((self.sanduche, 1)))  # 5.18
        self.solicitud = SolicitudUnion.objects.get(sesion_id=self.beto.id)

    def test_solicitud_pendiente_visible_para_ambos(self):
        self.assertEqual(self.solicitud.estado, 'pendiente')
        self.assertEqual(self.solicitud.grupo_id, self.ana.id)
        self.assertIsNone(self.beto.sesion.grupo_id)

        r = self.beto.get('sesion/')
        self.assertEqual(r.data['union_pendiente'], {'id': str(self.solicitud.pk), 'nombres': ['ANA']})
        self.assertTrue(r.data['es_fundador'])
        r = self.ana.get('sesion/')
        self.assertEqual(len(r.data['solicitudes_union']), 1)
        self.assertEqual(r.data['solicitudes_union'][0]['id'], str(self.solicitud.pk))
        self.assertEqual(r.data['solicitudes_union'][0]['alias'], 'BETO')

    def test_aceptar_mueve_al_grupo_y_la_cuenta_grupal_incluye_sus_pedidos(self):
        r = self.ana.get('cuenta/', {'tipo': 'grupal'})
        self.assertEqual(r.data['total'], '3.22')

        r = self.ana.post(f'union/{self.solicitud.pk}/aceptar/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['solicitud'], {'id': str(self.solicitud.pk), 'estado': 'aceptada'})
        self.assertEqual(self.beto.sesion.grupo_id, self.ana.id)
        solicitud = SolicitudUnion.objects.get(pk=self.solicitud.pk)
        self.assertEqual(solicitud.resuelta_por_id, self.ana.id)
        self.assertIsNotNone(solicitud.resuelta_at)

        # La cuenta grupal (de ANA o de BETO) incluye los pedidos de ambos
        for comensal in (self.ana, self.beto):
            r = comensal.get('cuenta/', {'tipo': 'grupal'})
            self.assertEqual([i['alias'] for i in r.data['integrantes']], ['ANA', 'BETO'])
            self.assertEqual(r.data['total'], '8.40')
        r = self.beto.get('pedidos/', {'alcance': 'grupo'})
        self.assertEqual(sorted(p['alias'] for p in r.data), ['ANA', 'BETO'])
        r = self.beto.get('sesion/')
        self.assertEqual(r.data['grupo'], {'id': str(self.ana.id), 'integrantes': ['ANA', 'BETO']})
        self.assertFalse(r.data['es_fundador'])
        self.assertIsNone(r.data['union_pendiente'])

        # Aceptar otra vez → 409
        r = self.ana.post(f'union/{self.solicitud.pk}/aceptar/')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'union_resuelta'))

    def test_rechazar_deja_la_cuenta_aparte(self):
        r = self.ana.post(f'union/{self.solicitud.pk}/rechazar/')
        self.assertEqual((r.status_code, r.data['solicitud']['estado']), (200, 'rechazada'))
        self.assertIsNone(self.beto.sesion.grupo_id)
        self.assertEqual(self.ana.get('cuenta/', {'tipo': 'grupal'}).data['total'], '3.22')
        self.assertEqual(self.beto.get('cuenta/', {'tipo': 'grupal'}).data['total'], '5.18')
        self.assertIsNone(self.beto.get('sesion/').data['union_pendiente'])
        r = self.ana.post(f'union/{self.solicitud.pk}/aceptar/')
        self.assertEqual(r.status_code, 409)

    def test_expira_a_los_cinco_minutos_sin_respuesta(self):
        SolicitudUnion.objects.filter(pk=self.solicitud.pk).update(created_at=hace(6))
        # Ya no se muestra a ninguno de los dos
        self.assertIsNone(self.beto.get('sesion/').data['union_pendiente'])
        self.assertEqual(self.ana.get('sesion/').data['solicitudes_union'], [])

        r = self.ana.post(f'union/{self.solicitud.pk}/aceptar/')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'union_resuelta'))
        self.assertEqual(SolicitudUnion.objects.get(pk=self.solicitud.pk).estado, 'expirada')
        self.assertIsNone(self.beto.sesion.grupo_id)

    def test_la_limpieza_global_expira_las_solicitudes_vencidas(self):
        SolicitudUnion.objects.filter(pk=self.solicitud.pk).update(created_at=hace(6))
        services.limpiar_sesiones_inactivas(forzar=True)
        self.assertEqual(SolicitudUnion.objects.get(pk=self.solicitud.pk).estado, 'expirada')

    def test_solo_un_integrante_activo_del_grupo_destino_puede_resolver(self):
        carlos = self.entrar('Carlos')
        # Alguien de otro grupo o el propio solicitante → 404
        r = carlos.post(f'union/{self.solicitud.pk}/aceptar/')
        self.assertEqual((r.status_code, r.data['codigo']), (404, 'no_encontrada'))
        r = self.beto.post(f'union/{self.solicitud.pk}/aceptar/')
        self.assertEqual(r.status_code, 404)
        # Alguien de otra mesa → 404
        zoe = self.entrar('Zoe', mesa=self.mesa2)
        self.assertEqual(zoe.post(f'union/{self.solicitud.pk}/rechazar/').status_code, 404)
        self.assertEqual(SolicitudUnion.objects.get(pk=self.solicitud.pk).estado, 'pendiente')

        # Un integrante activo que no es la fundadora sí puede
        dani = self.unir(self.ana, 'Dani')
        r = dani.post(f'union/{self.solicitud.pk}/aceptar/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.beto.sesion.grupo_id, self.ana.id)

    def test_integrante_pagado_no_puede_resolver(self):
        dani = self.unir(self.ana, 'Dani')
        self.pedido_de(dani.pedir((self.cappuccino, 1)))
        r = self.cobrar({'metodo_pago': 'efectivo', 'sesiones': [str(dani.id)]})
        self.assertEqual(r.status_code, 200)
        r = dani.post(f'union/{self.solicitud.pk}/aceptar/')
        self.assertEqual((r.status_code, r.data['codigo']), (409, 'sesion_pagada'))

    def test_solo_una_solicitud_pendiente_por_solicitante(self):
        carlos = self.entrar('Carlos')
        # BETO vuelve a escanear y ahora elige a CARLOS: la nueva reemplaza a la anterior
        r = self.post_entrar(self.beto.client, 'Beto', grupo=carlos.id)
        self.assertEqual((r.status_code, r.data['union_pendiente']), (200, True))
        pendientes = SolicitudUnion.objects.filter(sesion_id=self.beto.id, estado='pendiente')
        self.assertEqual(list(pendientes.values_list('grupo_id', flat=True)), [carlos.id])
        self.assertEqual(SolicitudUnion.objects.get(pk=self.solicitud.pk).estado, 'expirada')

    def test_cuenta_grupal_nunca_incluye_pedidos_de_otro_grupo(self):
        self.ana.post(f'union/{self.solicitud.pk}/aceptar/')
        carlos = self.entrar('Carlos')
        self.pedido_de(carlos.pedir((self.cappuccino, 5)))
        for comensal in (self.ana, self.beto):
            r = comensal.get('cuenta/', {'tipo': 'grupal'})
            self.assertEqual(r.data['total'], '8.40')
            self.assertNotIn('CARLOS', [i['alias'] for i in r.data['integrantes']])

        r = self.beto.pedir_cuenta('grupal', confirmar=True)
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['solicitud']['total'], '8.40')
        solicitud = SesionCliente.objects.get(pk=self.ana.id).solicitudes_pago.get()
        self.assertEqual(set(solicitud.sesiones_cubiertas.values_list('pk', flat=True)), {self.ana.id, self.beto.id})
        self.assertEqual(solicitud.total, Decimal('8.40'))
        self.assertEqual(carlos.get('cuenta/', {'tipo': 'grupal'}).data['total'], '16.10')
