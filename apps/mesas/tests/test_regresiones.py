"""
Regresiones de la revisión de mesas: reservas solo dentro del alcance del usuario, filtro «Desactivadas»
(?solo_inactivas=1), mensaje al no poder borrar y regenerar el QR de otra cadena.
"""
from datetime import timedelta

from django.utils import timezone

from apps.mesas.models import Mesa, Reserva

from .base import API_MESAS, API_RESERVAS, PruebaMesas, crear_mesa, crear_usuario


class ReservasAlcanceTests(PruebaMesas):
    def reservar(self, usuario, mesa, **extra):
        datos = {
            'mesa': str(mesa.pk), 'customer_name': 'Lucía', 'customer_phone': '0991234567', 'guest_count': 2,
            'reservation_date': str(timezone.localdate() + timedelta(days=1)), 'reservation_time': '19:00',
            **extra,
        }
        return self.como(usuario).post(API_RESERVAS, datos, format='json')

    def test_nadie_reserva_mesas_de_otra_cadena(self):
        otro_admin = crear_usuario('cafe_admin', self.otro_tenant, self.otro_cafe)
        otro_camarero = crear_usuario('camarero', self.otro_tenant, self.otro_cafe)
        otro_distribuidor = crear_usuario('distribuidor_admin', self.otro_tenant)
        for usuario in (otro_admin, otro_camarero, otro_distribuidor):
            r = self.reservar(usuario, self.mesa)
            self.assertEqual(r.status_code, 400, usuario.role)
            self.assertIn('mesa', r.data)
        self.assertFalse(Reserva.objects.filter(mesa=self.mesa).exists())
        # Así, reservas ajenas no pueden bloquear desactivar ni borrar la mesa
        self.assertEqual(self.accion(self.cafe_admin, self.mesa, 'desactivar').status_code, 200)

    def test_el_personal_solo_reserva_en_su_local(self):
        self.assertEqual(self.reservar(self.camarero, self.mesa).status_code, 201)
        self.assertEqual(self.reservar(self.camarero, self.mesa_cafe2, reservation_time='12:00').status_code, 400)
        r = self.reservar(self.cafe_admin, self.mesas[1])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Reserva.objects.get(mesa=self.mesas[1]).status, 'confirmada')
        # El distribuidor, en cualquier local de su cadena; el super_admin, en cualquiera
        self.assertEqual(self.reservar(self.distribuidor, self.mesa_cafe2).status_code, 201)
        self.assertEqual(self.reservar(self.super_admin, self.mesa_otro).status_code, 201)

    def test_clientes_y_locales_cerrados_no_reservan(self):
        cliente = crear_usuario('usuario')
        self.assertEqual(self.reservar(cliente, self.mesa).status_code, 403)
        self.cafe2.is_active = False
        self.cafe2.save()
        self.assertEqual(self.reservar(self.distribuidor, self.mesa_cafe2).status_code, 400)
        self.assertFalse(Reserva.objects.exists())


class SoloInactivasTests(PruebaMesas):
    def test_solo_inactivas_trae_solo_las_desactivadas_de_su_alcance(self):
        Mesa.objects.filter(pk__in=[self.mesas[2].pk, self.mesa_cafe2.pk, self.mesa_otro.pk]).update(is_active=False)
        ids = {m['id'] for m in self.listar(self.cafe_admin, solo_inactivas=1)}
        self.assertEqual(ids, {str(self.mesas[2].pk)})
        ids = {m['id'] for m in self.listar(self.distribuidor, solo_inactivas='true')}
        self.assertEqual(ids, {str(self.mesas[2].pk), str(self.mesa_cafe2.pk)})
        # Para quien no gestiona mesas el parámetro se ignora (solo ve las activas)
        ids = {m['id'] for m in self.listar(self.camarero, solo_inactivas=1)}
        self.assertEqual(ids, {str(self.mesas[0].pk), str(self.mesas[1].pk)})


class BorrarYQrTests(PruebaMesas):
    def test_el_mensaje_dice_que_historial_tiene_la_mesa(self):
        self.entrar_por_qr(self.mesa)
        r = self.como(self.cafe_admin).delete(f'{API_MESAS}{self.mesa.pk}/')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(
            r.data['error'],
            'La mesa 1 ya tuvo clientes por QR: desactívala en vez de borrarla (así no se pierde ese historial).',
        )
        mesa = self.mesas[1]
        Reserva.objects.create(
            mesa=mesa, customer_name='Lucía', customer_phone='0991234567', guest_count=2,
            reservation_date=timezone.localdate() - timedelta(days=2), reservation_time='19:00', status='completada',
        )
        r = self.como(self.cafe_admin).delete(f'{API_MESAS}{mesa.pk}/')
        self.assertIn('ya tuvo reservas: desactívala', r.data['error'])

    def test_regenerar_qr_de_otra_cadena_da_404(self):
        antes = self.mesa_otro.qr_code
        for usuario in (self.cafe_admin, self.gerente, self.distribuidor):
            r = self.como(usuario).post(f'{API_MESAS}{self.mesa_otro.pk}/regenerar_qr/')
            self.assertEqual(r.status_code, 404, usuario.role)
        otra = crear_mesa(self.cafe2, 5)
        self.assertEqual(self.como(self.gerente).post(f'{API_MESAS}{otra.pk}/regenerar_qr/').status_code, 404)
        self.mesa_otro.refresh_from_db()
        self.assertEqual(self.mesa_otro.qr_code, antes)
