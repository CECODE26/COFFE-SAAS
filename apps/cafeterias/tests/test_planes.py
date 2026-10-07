"""
Plan de cada cafetería (Mensual / Mensual Pro): por defecto, quién lo elige y lo cambia (super admin y el
distribuidor dueño; el resto solo lo ve), validación, auditoría, sin límites de locales, resumen por plan
para las estadísticas, migración sobre datos existentes y catálogo igual al de la landing.
"""
import re
from decimal import Decimal

from django.conf import settings
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import SimpleTestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext

from apps.accounts.tests.base import PruebaUsuarios, crear_cafeteria, crear_tenant, crear_usuario
from apps.auditoria.models import RegistroAuditoria
from apps.cafeterias.models import Cafeteria
from apps.cafeterias.planes import IVA_PORCENTAJE, PLAN_POR_DEFECTO, PLANES

API = '/api/v1/cafeterias/'
RESUMEN = f'{API}resumen_planes/'

INFO_MENSUAL = {
    'codigo': 'mensual', 'nombre': 'Mensual', 'precio_mensual': '70.00', 'precio_con_iva': '80.50',
    'iva_porcentaje': 15, 'facturacion_sri': False,
}
INFO_PRO = {
    'codigo': 'pro', 'nombre': 'Mensual Pro', 'precio_mensual': '90.00', 'precio_con_iva': '103.50',
    'iva_porcentaje': 15, 'facturacion_sri': True,
}
VALORES_INVALIDOS = ['platino', '', None, 'PRO', 'basic', 'free', ['pro'], {'codigo': 'pro'}, 3]


class PruebaPlanes(PruebaUsuarios):
    """Red propia: self.cafe y self.cafe2 (Mensual). Otra red: self.otro_cafe (Mensual)."""

    def datos_cafe(self, **extra):
        datos = dict(name='Café de Prueba Ficticio', city='Quito', address='Calle Ficticia 123')
        datos.update(extra)
        return datos

    def crear_cafe_api(self, usuario, **extra):
        return self.como(usuario).post(API, self.datos_cafe(**extra), format='json')

    def cambiar(self, usuario, cafe, formato='json', **datos):
        return self.como(usuario).patch(f'{API}{cafe.pk}/', datos, format=formato)

    def auditorias(self):
        return RegistroAuditoria.objects.filter(accion='cafeteria.cambiar_plan')


class PlanPorDefectoTests(PruebaPlanes):

    def test_el_modelo_arranca_en_mensual(self):
        self.assertEqual(PLAN_POR_DEFECTO, 'mensual')
        self.assertEqual(crear_cafeteria(self.tenant).plan, 'mensual')

    def test_crear_sin_plan_queda_en_mensual(self):
        r = self.crear_cafe_api(self.distribuidor)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data['plan'], 'mensual')
        self.assertEqual(r.data['plan_info'], INFO_MENSUAL)
        self.assertEqual(Cafeteria.objects.get(pk=r.data['id']).plan, 'mensual')

    def test_lista_y_detalle_muestran_codigo_nombre_y_precio(self):
        Cafeteria.objects.filter(pk=self.cafe.pk).update(plan='pro')
        r = self.como(self.distribuidor).get(API)
        self.assertEqual(r.status_code, 200, r.content)
        por_id = {c['id']: c for c in r.data['results']}
        self.assertEqual(por_id[str(self.cafe.pk)]['plan_info'], INFO_PRO)
        self.assertEqual(por_id[str(self.cafe2.pk)]['plan_info'], INFO_MENSUAL)

        r = self.como(self.super_admin).get(f'{API}{self.cafe.pk}/')
        self.assertEqual((r.data['plan'], r.data['plan_info']), ('pro', INFO_PRO))

    def test_admin_cafeteria_y_personal_ven_su_plan(self):
        Cafeteria.objects.filter(pk=self.cafe.pk).update(plan='pro')
        for usuario in [self.cafe_admin, self.gerente, self.camarero]:
            with self.subTest(rol=usuario.role):
                r = self.como(usuario).get(f'{API}{self.cafe.pk}/')
                self.assertEqual(r.status_code, 200, r.content)
                self.assertEqual(r.data['plan_info'], INFO_PRO)


class ElegirPlanAlCrearTests(PruebaPlanes):

    def test_super_admin_elige_el_plan(self):
        r = self.crear_cafe_api(self.super_admin, tenant=str(self.otro_tenant.pk), plan='pro')
        self.assertEqual(r.status_code, 201, r.content)
        cafe = Cafeteria.objects.get(pk=r.data['id'])
        self.assertEqual((cafe.tenant, cafe.plan), (self.otro_tenant, 'pro'))
        self.assertEqual(r.data['plan_info'], INFO_PRO)

    def test_distribuidor_elige_el_plan_en_su_red(self):
        r = self.crear_cafe_api(self.distribuidor, plan='pro', tenant=str(self.otro_tenant.pk))
        self.assertEqual(r.status_code, 201, r.content)
        cafe = Cafeteria.objects.get(pk=r.data['id'])
        self.assertEqual((cafe.tenant, cafe.plan), (self.tenant, 'pro'))

    def test_plan_invalido_al_crear_da_400(self):
        for valor in VALORES_INVALIDOS:
            with self.subTest(valor=valor):
                antes = Cafeteria.objects.count()
                r = self.crear_cafe_api(self.super_admin, tenant=str(self.tenant.pk), plan=valor)
                self.assertEqual(r.status_code, 400, r.content)
                self.assertIn('Mensual o Mensual Pro', str(r.data['plan']))
                self.assertEqual(Cafeteria.objects.count(), antes)

    def test_admin_cafeteria_no_crea_cafeterias(self):
        r = self.crear_cafe_api(self.cafe_admin, plan='pro')
        self.assertEqual(r.status_code, 403, r.content)

    def test_sin_limite_de_cafeterias_para_el_distribuidor(self):
        # Antes el plan Básico del distribuidor cortaba en 5 locales activos; ya no hay tope
        for n in range(6):
            with self.subTest(n=n):
                r = self.crear_cafe_api(self.distribuidor, name=f'Café Ficticio {n}')
                self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Cafeteria.objects.filter(tenant=self.tenant, is_active=True).count(), 8)


class CambiarPlanTests(PruebaPlanes):

    def test_super_admin_cambia_el_plan_de_cualquier_cafeteria(self):
        r = self.cambiar(self.super_admin, self.otro_cafe, plan='pro')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['plan_info'], INFO_PRO)
        self.otro_cafe.refresh_from_db()
        self.assertEqual(self.otro_cafe.plan, 'pro')

    def test_distribuidor_cambia_el_plan_en_su_red(self):
        r = self.cambiar(self.distribuidor, self.cafe2, plan='pro')
        self.assertEqual(r.status_code, 200, r.content)
        self.cafe2.refresh_from_db()
        self.assertEqual(self.cafe2.plan, 'pro')

    def test_distribuidor_no_toca_cafeterias_de_otra_red(self):
        r = self.cambiar(self.distribuidor, self.otro_cafe, plan='pro')
        self.assertEqual(r.status_code, 404, r.content)
        self.otro_cafe.refresh_from_db()
        self.assertEqual(self.otro_cafe.plan, 'mensual')

    def test_admin_cafeteria_no_cambia_su_plan(self):
        for formato in ['json', 'multipart']:
            with self.subTest(formato=formato):
                r = self.cambiar(self.cafe_admin, self.cafe, formato=formato, plan='pro')
                self.assertEqual(r.status_code, 403, r.content)
                self.assertIn('plan', str(r.data['detail']))
        self.cafe.refresh_from_db()
        self.assertEqual(self.cafe.plan, 'mensual')
        self.assertFalse(self.auditorias().exists())

    def test_admin_cafeteria_puede_reenviar_el_mismo_plan_al_editar_su_ficha(self):
        # Un formulario que manda la ficha completa (con el plan que ya tiene) no debe fallar
        r = self.cambiar(self.cafe_admin, self.cafe, plan='mensual', city='Cumbayá')
        self.assertEqual(r.status_code, 200, r.content)
        self.cafe.refresh_from_db()
        self.assertEqual((self.cafe.plan, self.cafe.city), ('mensual', 'Cumbayá'))
        self.assertFalse(self.auditorias().exists())

    def test_admin_cafeteria_edita_su_ficha_sin_plan(self):
        r = self.cambiar(self.cafe_admin, self.cafe, city='Tumbaco')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['plan'], 'mensual')

    def test_el_resto_del_personal_no_edita(self):
        for usuario in [self.gerente, self.camarero, self.cajero, self.cocinero]:
            with self.subTest(rol=usuario.role):
                r = self.cambiar(usuario, self.cafe, plan='pro')
                self.assertEqual(r.status_code, 403, r.content)
        self.cafe.refresh_from_db()
        self.assertEqual(self.cafe.plan, 'mensual')

    def test_plan_invalido_al_editar_da_400(self):
        for valor in VALORES_INVALIDOS:
            with self.subTest(valor=valor):
                r = self.cambiar(self.super_admin, self.cafe, plan=valor)
                self.assertEqual(r.status_code, 400, r.content)
                self.assertIn('Mensual o Mensual Pro', str(r.data['plan']))
        self.cafe.refresh_from_db()
        self.assertEqual(self.cafe.plan, 'mensual')
        self.assertFalse(self.auditorias().exists())


class AuditoriaCambioDePlanTests(PruebaPlanes):

    def test_registra_plan_anterior_y_nuevo(self):
        r = self.cambiar(self.distribuidor, self.cafe, plan='pro')
        self.assertEqual(r.status_code, 200, r.content)
        registro = self.auditorias().get()
        self.assertEqual(registro.usuario, self.distribuidor)
        self.assertEqual(registro.tenant, self.tenant)
        self.assertEqual((registro.objeto_tipo, registro.objeto_id), ('cafeterias.Cafeteria', str(self.cafe.pk)))
        self.assertEqual(registro.detalle['antes'], 'mensual')
        self.assertEqual(registro.detalle['despues'], 'pro')
        self.assertEqual(registro.detalle['antes_nombre'], 'Mensual')
        self.assertEqual(registro.detalle['despues_nombre'], 'Mensual Pro')
        self.assertEqual(registro.detalle['nombre'], self.cafe.name)

        # Y de vuelta, con quien lo hizo esta vez
        self.cambiar(self.super_admin, self.cafe, plan='mensual')
        ultimo = self.auditorias().order_by('-created_at').first()
        self.assertEqual(self.auditorias().count(), 2)
        self.assertEqual((ultimo.usuario, ultimo.detalle['antes'], ultimo.detalle['despues']), (self.super_admin, 'pro', 'mensual'))

    def test_sin_cambio_de_plan_no_se_registra(self):
        self.cambiar(self.super_admin, self.cafe, plan='mensual')
        self.cambiar(self.distribuidor, self.cafe, city='Cumbayá')
        self.assertFalse(self.auditorias().exists())


class ResumenPlanesTests(PruebaPlanes):
    """
    Activas = local abierto de un distribuidor activo. Escenario:
      nuestra red:  cafe (Pro), cafe2 (Mensual), cerrada (Pro, no cuenta)
      otra red:     otro_cafe (Mensual), otro_pro (Pro)
      red inactiva: suspendida (Pro, abierta pero su distribuidor no opera: no cuenta)
    """

    def setUp(self):
        super().setUp()
        Cafeteria.objects.filter(pk=self.cafe.pk).update(plan='pro')
        cerrada = crear_cafeteria(self.tenant, 'Café Cerrado Ficticio')
        Cafeteria.objects.filter(pk=cerrada.pk).update(plan='pro', is_active=False)
        otro_pro = crear_cafeteria(self.otro_tenant, 'Café Pro Ficticio')
        Cafeteria.objects.filter(pk=otro_pro.pk).update(plan='pro')
        red_inactiva = crear_tenant(is_active=False, status='suspended')
        suspendida = crear_cafeteria(red_inactiva, 'Café Suspendido Ficticio')
        Cafeteria.objects.filter(pk=suspendida.pk).update(plan='pro')

    def resumen(self, usuario):
        r = self.como(usuario).get(RESUMEN)
        self.assertEqual(r.status_code, 200, r.content)
        return r.data

    @staticmethod
    def por_plan(datos):
        return {p['codigo']: (p['cafeterias_activas'], p['ingreso_mensual']) for p in datos['planes']}

    def test_super_admin_ve_toda_la_plataforma(self):
        datos = self.resumen(self.super_admin)
        self.assertEqual(self.por_plan(datos), {'mensual': (2, '140.00'), 'pro': (2, '180.00')})
        self.assertEqual(datos['cafeterias_activas'], 4)
        self.assertEqual(datos['ingreso_mensual'], '320.00')
        self.assertEqual(datos['ingreso_mensual_con_iva'], '368.00')
        self.assertEqual(datos['iva_porcentaje'], 15)
        self.assertIn('más IVA', datos['nota'])
        # Cada plan trae su nombre y precio, en el orden del catálogo
        self.assertEqual([p['nombre'] for p in datos['planes']], ['Mensual', 'Mensual Pro'])
        self.assertEqual([p['precio_mensual'] for p in datos['planes']], ['70.00', '90.00'])

    def test_distribuidor_solo_ve_su_red(self):
        datos = self.resumen(self.distribuidor)
        self.assertEqual(self.por_plan(datos), {'mensual': (1, '70.00'), 'pro': (1, '90.00')})
        self.assertEqual(datos['ingreso_mensual'], '160.00')

        datos = self.resumen(self.otro_distribuidor)
        self.assertEqual(self.por_plan(datos), {'mensual': (1, '70.00'), 'pro': (1, '90.00')})

    def test_distribuidor_nuevo_sin_cafeterias(self):
        nueva_red = crear_tenant()
        datos = self.resumen(crear_usuario('distribuidor_admin', nueva_red))
        self.assertEqual(self.por_plan(datos), {'mensual': (0, '0.00'), 'pro': (0, '0.00')})
        self.assertEqual((datos['cafeterias_activas'], datos['ingreso_mensual']), (0, '0.00'))

    def test_admin_cafeteria_y_personal_no_lo_ven(self):
        for usuario in [self.cafe_admin, self.gerente, self.camarero, self.usuario]:
            with self.subTest(rol=usuario.role):
                r = self.como(usuario).get(RESUMEN)
                self.assertEqual(r.status_code, 403, r.content)

    def test_una_sola_consulta_sin_importar_cuantas_cafeterias(self):
        cliente = self.como(self.super_admin)
        with CaptureQueriesContext(connection) as pocas:
            cliente.get(RESUMEN)
        for n in range(15):
            crear_cafeteria(self.tenant if n % 2 else self.otro_tenant, f'Café Extra Ficticio {n}')
        with CaptureQueriesContext(connection) as muchas:
            datos = cliente.get(RESUMEN).data
        self.assertEqual(len(muchas), len(pocas))
        self.assertEqual(datos['cafeterias_activas'], 19)

    def test_la_lista_trae_el_plan_de_cada_cafeteria(self):
        # plan_info sale del catálogo (planes.py), no de otra tabla
        datos = self.como(self.super_admin).get(API).data['results']
        self.assertTrue(all('plan_info' in c and 'plan' in c for c in datos))


class CatalogoSincronizadoTests(SimpleTestCase):
    """apps/cafeterias/planes.py, frontend/src/config/site.js (PLANS) y lib/planes.js deben decir lo mismo"""

    def test_mismos_planes_nombres_y_precios_que_la_landing(self):
        ruta = settings.BASE_DIR / 'frontend' / 'src' / 'config' / 'site.js'
        if not ruta.exists():
            self.skipTest('El frontend no está en esta imagen')
        texto = ruta.read_text(encoding='utf-8')
        landing = {
            codigo: (nombre, Decimal(precio))
            for codigo, nombre, precio in re.findall(
                r"id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*price:\s*(\d+(?:\.\d+)?)", texto
            )
        }
        backend = {codigo: (datos['nombre'], datos['precio_mensual']) for codigo, datos in PLANES.items()}
        self.assertEqual(landing, backend)
        self.assertIn(f'IVA ({IVA_PORCENTAJE}%)', texto)

    def test_mismo_plan_por_defecto_en_el_formulario(self):
        # El formulario de alta propone el mismo plan que el backend pone si no se envía ninguno
        ruta = settings.BASE_DIR / 'frontend' / 'src' / 'lib' / 'planes.js'
        if not ruta.exists():
            self.skipTest('El frontend no está en esta imagen')
        encontrado = re.search(r"PLAN_POR_DEFECTO\s*=\s*'([^']+)'", ruta.read_text(encoding='utf-8'))
        self.assertIsNotNone(encontrado, 'frontend/src/lib/planes.js debe declarar PLAN_POR_DEFECTO')
        self.assertEqual(encontrado.group(1), PLAN_POR_DEFECTO)


class MigracionPlanTests(TransactionTestCase):
    """Las migraciones se aplican limpias sobre una base con datos (distribuidores con plan y cafeterías)"""

    ANTES = [('cafeterias', '0002_quitar_max_tables'), ('tenants', '0002_plan_basico_por_defecto')]

    def columnas(self, tabla):
        with connection.cursor() as cursor:
            return {c.name for c in connection.introspection.get_table_description(cursor, tabla)}

    def test_cafeterias_existentes_quedan_en_mensual_y_el_distribuidor_pierde_el_plan(self):
        executor = MigrationExecutor(connection)
        despues = executor.loader.graph.leaf_nodes()
        try:
            executor.migrate(self.ANTES)
            viejas = executor.loader.project_state(self.ANTES).apps
            Tenant = viejas.get_model('tenants', 'Tenant')
            CafeteriaVieja = viejas.get_model('cafeterias', 'Cafeteria')
            tenant = Tenant.objects.create(
                name='Red Ficticia', slug='red-ficticia', email='red@prueba.ec', ruc='1790000000001',
                business_name='Red Ficticia S.A.', plan='enterprise', max_cafes=999, max_users=9999,
            )
            for n in range(2):
                CafeteriaVieja.objects.create(
                    tenant=tenant, name=f'Café Viejo {n}', slug=f'cafe-viejo-{n}', address='Calle 1', city='Quito',
                )
            self.assertTrue({'plan', 'subscription_expires_at'} <= self.columnas('tenants_tenant'))
            self.assertNotIn('plan', self.columnas('cafeterias_cafeteria'))
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(despues)

        nuevas = executor.loader.project_state(despues).apps
        CafeteriaNueva = nuevas.get_model('cafeterias', 'Cafeteria')
        self.assertEqual(
            sorted(CafeteriaNueva.objects.values_list('plan', flat=True)), ['mensual', 'mensual']
        )
        self.assertTrue(
            {'plan', 'max_cafes', 'max_users', 'subscription_expires_at'}.isdisjoint(self.columnas('tenants_tenant'))
        )
        self.assertIn('plan', self.columnas('cafeterias_cafeteria'))
