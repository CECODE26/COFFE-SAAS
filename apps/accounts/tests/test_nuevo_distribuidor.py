"""
Nuevo usuario con rol Distribuidor: el super admin puede crear la empresa (nuevo_distribuidor) junto con
su cuenta, en una sola transacción, en lugar de elegir un distribuidor existente.
"""
from unittest import mock
from urllib.parse import urlencode

from apps.accounts.models import User
from apps.accounts.serializers import UserCreateSerializer
from apps.tenants.models import Tenant
from apps.tenants.serializers import NuevoDistribuidorSerializer

from .base import API_USERS, PruebaUsuarios, crear_tenant

API_TENANTS = '/api/v1/tenants/'
EMPRESA = 'Cafés del Austro'
# Sin JSON: DRF arma la empresa con las claves "nuevo_distribuidor.<campo>"
FORMATOS_FORMULARIO = ['multipart', 'urlencoded']


class NuevoDistribuidorTests(PruebaUsuarios):

    def empresa(self, **extra):
        datos = dict(name=EMPRESA, business_name='Cafés del Austro Cía. Ltda.', ruc='0190123456001')
        datos.update(extra)
        return datos

    def crear(self, creador=None, rol='distribuidor_admin', empresa=None, **extra):
        datos = self.datos_usuario(rol, phone='072345678', **extra)
        datos['nuevo_distribuidor'] = self.empresa() if empresa is None else empresa
        return self.como(creador or self.super_admin).post(API_USERS, datos, format='json')

    def assertNoCreoNada(self, tenants_antes, usuarios_antes):
        self.assertEqual(Tenant.objects.count(), tenants_antes)
        self.assertEqual(User.objects.count(), usuarios_antes)
        self.assertFalse(Tenant.objects.filter(name__iexact=EMPRESA).exists())

    def conteos(self):
        return Tenant.objects.count(), User.objects.count()

    # ------------------------------------------------------------------ alta conjunta

    def test_crea_la_empresa_y_su_cuenta_ligadas(self):
        r = self.crear()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertNotIn('nuevo_distribuidor', r.data)

        tenant = Tenant.objects.get(name=EMPRESA)
        cuenta = User.objects.get(pk=r.data['id'])
        self.assertEqual(r.data['tenant'], tenant.pk)
        self.assertEqual((cuenta.role, cuenta.tenant, cuenta.cafeteria), ('distribuidor_admin', tenant, None))
        self.assertFalse(cuenta.is_staff)
        self.assertFalse(cuenta.is_superuser)

        # Contacto de la empresa = el de la cuenta; plan y límites, los del modelo
        self.assertEqual(tenant.email, cuenta.email)
        self.assertTrue(tenant.email.islower())
        self.assertEqual(tenant.phone, '072345678')
        self.assertEqual((tenant.business_name, tenant.ruc), ('Cafés del Austro Cía. Ltda.', '0190123456001'))
        self.assertEqual(tenant.slug, 'cafes-del-austro')
        plan = Tenant._meta.get_field('plan').get_default()
        self.assertEqual(tenant.plan, plan)

    def test_email_y_telefono_propios_de_la_empresa(self):
        r = self.crear(empresa=self.empresa(email='Contacto@Austro.EC', phone='072000000'))
        self.assertEqual(r.status_code, 201, r.content)
        tenant = Tenant.objects.get(name=EMPRESA)
        self.assertEqual((tenant.email, tenant.phone), ('contacto@austro.ec', '072000000'))

    def test_slug_libre_con_sufijo(self):
        self.tenant.slug = 'cafes-del-austro'
        self.tenant.save()
        r = self.crear(empresa=self.empresa(name='Cafés del Austro!'))
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Tenant.objects.get(name='Cafés del Austro!').slug, 'cafes-del-austro-2')

    # ------------------------------------------------------- errores de la empresa, por campo

    def test_errores_de_la_empresa_en_su_campo_y_no_crea_nada(self):
        casos = [
            ({'ruc': '0000000000000'}, 'ruc', 'provincia'),
            ({'ruc': '01901234560'}, 'ruc', '13 dígitos'),
            ({'ruc': self.otro_tenant.ruc}, 'ruc', 'ya está registrado'),
            ({'name': f'  {self.tenant.name.upper()} '}, 'name', 'Ya existe'),
            ({'name': ''}, 'name', 'nombre comercial'),
            ({'business_name': ''}, 'business_name', 'razón social'),
        ]
        antes = self.conteos()
        for extra, campo, texto in casos:
            with self.subTest(campo=campo, extra=extra):
                r = self.crear(empresa=self.empresa(**extra))
                self.assertEqual(r.status_code, 400, r.content)
                self.assertIn(campo, r.data['nuevo_distribuidor'])
                self.assertIn(texto, str(r.data['nuevo_distribuidor'][campo]))
        self.assertNoCreoNada(*antes)

    def test_errores_de_la_empresa_y_de_la_cuenta_llegan_juntos(self):
        antes = self.conteos()
        r = self.crear(empresa=self.empresa(ruc='123'), email=self.camarero.email)
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('email', r.data)
        self.assertIn('ruc', r.data['nuevo_distribuidor'])
        self.assertNoCreoNada(*antes)

    # ---------------------------------------------- si falla la cuenta no queda la empresa

    def test_email_repetido_no_deja_empresa_huerfana(self):
        antes = self.conteos()
        r = self.crear(email=self.camarero.email.upper())
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('email', r.data)
        self.assertNoCreoNada(*antes)

    def test_contrasenas_distintas_no_crean_nada(self):
        antes = self.conteos()
        r = self.crear(password2='otra-clave-123')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('password2', r.data)
        self.assertNoCreoNada(*antes)

    def test_choque_de_email_en_la_base_revierte_la_empresa(self):
        # Dos altas con el mismo email a la vez: la validación pasa y la cuenta choca al guardarse.
        # En mayúsculas para que tampoco la frene el validador de unicidad del modelo (distingue
        # mayúsculas): así llega a create() y al IntegrityError de la base
        antes = self.conteos()
        with mock.patch.object(UserCreateSerializer, 'validate_email', lambda self, value: value.lower()):
            r = self.crear(email=self.camarero.email.upper())
        self.assertEqual(r.status_code, 400, r.content)
        # El mensaje propio de create(), no el genérico del validador del modelo
        self.assertIn('Este email ya está registrado.', str(r.data['email']))
        self.assertNoCreoNada(*antes)

    def test_choque_de_ruc_en_la_base_va_al_campo_de_la_empresa(self):
        # Dos altas con el mismo RUC a la vez: la validación pasa y la empresa choca al guardarse
        antes = self.conteos()
        with mock.patch.object(NuevoDistribuidorSerializer, 'validate_ruc', lambda self, value: value):
            r = self.crear(empresa=self.empresa(ruc=self.otro_tenant.ruc))
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('ya está registrado', str(r.data['nuevo_distribuidor']['ruc']))
        self.assertNoCreoNada(*antes)

    # ----------------------------------------------------------------- quién y cuándo

    def test_otros_creadores_no_crean_distribuidores(self):
        antes = self.conteos()
        casos = [
            (self.distribuidor, 'cafe_admin'),
            (self.distribuidor, 'distribuidor_admin'),
            (self.cafe_admin, 'camarero'),
        ]
        for creador, rol in casos:
            with self.subTest(creador=creador.role, rol=rol):
                # Con un RUC ya registrado: la respuesta no debe revelarlo
                r = self.crear(creador, rol, empresa=self.empresa(ruc=self.otro_tenant.ruc), cafeteria=str(self.cafe.pk))
                self.assertEqual(r.status_code, 400, r.content)
                self.assertIn('super administrador', str(r.data['nuevo_distribuidor']))
                self.assertNotIn('registrado', str(r.data))
        self.assertNoCreoNada(*antes)

    def test_solo_con_rol_distribuidor(self):
        antes = self.conteos()
        for rol in ['super_admin', 'cafe_admin', 'camarero', 'usuario']:
            with self.subTest(rol=rol):
                r = self.crear(rol=rol, cafeteria=str(self.cafe.pk))
                self.assertEqual(r.status_code, 400, r.content)
                self.assertIn('rol Distribuidor', str(r.data['nuevo_distribuidor']))
        self.assertNoCreoNada(*antes)

    def test_distribuidor_existente_y_nuevo_a_la_vez(self):
        antes = self.conteos()
        r = self.crear(tenant=str(self.otro_tenant.pk))
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('no ambos', str(r.data['non_field_errors']))
        self.assertNoCreoNada(*antes)

    # ------------------------------------- formularios HTML: la empresa en claves con punto

    def enviar_formulario(self, creador, formato, rol='distribuidor_admin', empresa=None, **extra):
        """Como un formulario HTML: la empresa llega en claves "nuevo_distribuidor.<campo>" (sin JSON)"""
        datos = self.datos_usuario(rol, **extra)
        for campo, valor in (self.empresa() if empresa is None else empresa).items():
            datos[f'nuevo_distribuidor.{campo}'] = valor
        cliente = self.como(creador)
        if formato == 'urlencoded':
            return cliente.post(API_USERS, urlencode(datos), content_type='application/x-www-form-urlencoded')
        return cliente.post(API_USERS, datos, format='multipart')

    def test_formulario_otros_creadores_no_crean_distribuidores(self):
        antes = self.conteos()
        casos = [
            (self.distribuidor, 'cafe_admin'),
            (self.distribuidor, 'distribuidor_admin'),
            (self.cafe_admin, 'camarero'),
        ]
        for formato in FORMATOS_FORMULARIO:
            for creador, rol in casos:
                with self.subTest(formato=formato, creador=creador.role, rol=rol):
                    # Con un RUC ya registrado: la respuesta no debe revelarlo
                    r = self.enviar_formulario(
                        creador, formato, rol, empresa=self.empresa(ruc=self.otro_tenant.ruc), cafeteria=str(self.cafe.pk),
                    )
                    self.assertEqual(r.status_code, 400, r.content)
                    self.assertIn('super administrador', str(r.data['nuevo_distribuidor']))
                    self.assertNotIn('registrado', str(r.data))
        self.assertNoCreoNada(*antes)

    def test_formulario_super_admin_con_otro_rol_o_con_distribuidor_existente(self):
        antes = self.conteos()
        casos = [
            (dict(rol='camarero', tenant=str(self.otro_tenant.pk), cafeteria=str(self.otro_cafe.pk)), 'rol Distribuidor'),
            (dict(rol='super_admin'), 'rol Distribuidor'),
            (dict(tenant=str(self.otro_tenant.pk)), 'no ambos'),
        ]
        for formato in FORMATOS_FORMULARIO:
            for extra, texto in casos:
                with self.subTest(formato=formato, extra=extra):
                    r = self.enviar_formulario(self.super_admin, formato, **extra)
                    self.assertEqual(r.status_code, 400, r.content)
                    self.assertIn(texto, str(r.data))
        self.assertNoCreoNada(*antes)

    def test_formulario_del_super_admin_crea_la_empresa(self):
        r = self.enviar_formulario(self.super_admin, 'multipart')
        self.assertEqual(r.status_code, 201, r.content)
        tenant = Tenant.objects.get(name=EMPRESA)
        self.assertEqual(User.objects.get(pk=r.data['id']).tenant, tenant)

    def test_segunda_barrera_en_validate(self):
        # Si la primera barrera (antes de validar) dejara pasar algo, validate() también lo frena
        antes = self.conteos()
        casos = [
            (self.distribuidor, 'cafe_admin', {}, 'super administrador'),
            (self.cafe_admin, 'camarero', {}, 'super administrador'),
            (self.super_admin, 'camarero', {'tenant': str(self.otro_tenant.pk)}, 'rol Distribuidor'),
            (self.super_admin, 'distribuidor_admin', {'tenant': str(self.otro_tenant.pk)}, 'no ambos'),
        ]
        with mock.patch.object(UserCreateSerializer, '_revisar_antes_de_validar', lambda self, data, creator: None):
            for creador, rol, extra, texto in casos:
                with self.subTest(creador=creador.role, rol=rol, extra=extra):
                    r = self.crear(creador, rol, cafeteria=str(self.otro_cafe.pk), **extra)
                    self.assertEqual(r.status_code, 400, r.content)
                    self.assertIn(texto, str(r.data))
        self.assertNoCreoNada(*antes)

    def test_sin_distribuidor_existente_ni_nuevo(self):
        antes = self.conteos()
        r = self.crear_usuario_api(self.super_admin, 'distribuidor_admin')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('crea uno nuevo', str(r.data['tenant']))
        self.assertEqual(self.conteos(), antes)

    # ------------------------------------------------------------- el flujo de siempre

    def test_con_distribuidor_existente_sigue_igual(self):
        for extra in [{}, {'nuevo_distribuidor': None}]:
            with self.subTest(extra=extra):
                tenants_antes = Tenant.objects.count()
                r = self.crear_usuario_api(
                    self.super_admin, 'distribuidor_admin', tenant=str(self.otro_tenant.pk), **extra,
                )
                self.assertEqual(r.status_code, 201, r.content)
                cuenta = User.objects.get(pk=r.data['id'])
                self.assertEqual((cuenta.role, cuenta.tenant), ('distribuidor_admin', self.otro_tenant))
                self.assertEqual(Tenant.objects.count(), tenants_antes)


class CuentasDeCadaDistribuidorTests(PruebaUsuarios):
    """La lista de distribuidores dice cuántas cuentas Distribuidor tiene cada uno (para marcar "sin cuenta")"""

    def test_admins_count_en_la_lista(self):
        sin_cuenta = crear_tenant()
        inactiva = User.objects.get(pk=self.otro_distribuidor.pk)
        inactiva.is_active = False
        inactiva.save()

        r = self.como(self.super_admin).get(API_TENANTS, {'page_size': 100})
        self.assertEqual(r.status_code, 200, r.content)
        filas = r.data['results'] if isinstance(r.data, dict) else r.data
        conteo = {fila['id']: fila['admins_count'] for fila in filas}
        self.assertEqual(conteo[str(self.tenant.pk)], 1)
        self.assertEqual(conteo[str(self.otro_tenant.pk)], 1)  # cuenta inactiva: sigue teniendo cuenta
        self.assertEqual(conteo[str(sin_cuenta.pk)], 0)

    def test_la_cuenta_nueva_cuenta(self):
        datos = self.datos_usuario('distribuidor_admin')
        datos['nuevo_distribuidor'] = dict(name=EMPRESA, business_name='Cafés del Austro Cía. Ltda.', ruc='0190123456001')
        self.assertEqual(self.como(self.super_admin).post(API_USERS, datos, format='json').status_code, 201)

        r = self.como(self.super_admin).get(API_TENANTS, {'search': EMPRESA})
        filas = r.data['results'] if isinstance(r.data, dict) else r.data
        self.assertEqual([(f['name'], f['admins_count']) for f in filas], [(EMPRESA, 1)])
