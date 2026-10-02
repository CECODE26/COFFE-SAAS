"""
Regresiones de la revisión de la carta: categorías ocultas, auditoría, tope de subida, límites de píxeles,
metadatos de las fotos y alcance (IDOR) de las fotos de otro tenant.
"""
import io
import os
from decimal import Decimal
from unittest import mock

from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image, ImageCms

from apps.auditoria.models import RegistroAuditoria
from apps.comensales.tests.base import PruebaQR
from apps.menu import imagenes
from apps.menu.imagenes import (
    MAX_PIXELES_SIN_DRAFT, MENSAJE_PIXELES, MENSAJE_PIXELES_SIN_DRAFT, aplicar_imagen, procesar_imagen,
)
from apps.menu.models import MenuItem

from .base import API_CATEGORIAS, API_ITEMS, MediaTemporalMixin, PruebaCarta, foto_jpeg


def archivos_en_media():
    """Archivos que hay en el MEDIA_ROOT temporal de la prueba"""
    raiz = default_storage.location
    return sorted(os.path.join(d, f) for d, _, fs in os.walk(raiz) for f in fs)


class CategoriaOcultaTests(PruebaCarta):
    def setUp(self):
        super().setUp()
        self.brownie = MenuItem.objects.create(
            tenant=self.tenant, category=self.postres, name='Brownie', slug='brownie', price=Decimal('2.50'),
        )
        self.postres.is_active = False
        self.postres.save()

    def ids(self, rol, ruta=API_ITEMS):
        datos = self.como(rol).get(ruta).data
        filas = datos['results'] if isinstance(datos, dict) else datos
        return {fila['id'] for fila in filas}

    def test_sus_productos_no_salen_para_tomar_pedidos(self):
        for rol in ('camarero', 'cajero', 'cocinero', 'gerente'):
            self.assertNotIn(str(self.brownie.pk), self.ids(rol), rol)
            self.assertNotIn(str(self.brownie.pk), self.ids(rol, f'{API_ITEMS}available/'), rol)
            self.assertEqual(self.como(rol).get(self.item_url(self.brownie)).status_code, 404, rol)
        self.assertEqual(self.como('camarero').get(f'{API_ITEMS}stats/').data['total_items'], 1)
        # Gestión sí los ve (para administrarlos) y el gerente no puede tocar su disponibilidad
        self.assertIn(str(self.brownie.pk), self.ids('cafe_admin'))
        r = self.como('gerente').post(self.item_url(self.brownie, 'disponibilidad/'), {'is_available': False}, format='json')
        self.assertEqual(r.status_code, 404)

    def test_borrar_una_categoria_oculta_no_publica_sus_productos(self):
        r = self.como('cafe_admin').delete(f'{API_CATEGORIAS}{self.postres.pk}/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.data['productos_sin_categoria'], r.data['productos_desactivados']), (2, 2))
        self.assertIn('desactivados', r.data['detail'])
        for item in (self.brownie, self.agotado):
            item.refresh_from_db()
            self.assertIsNone(item.category_id)
            self.assertFalse(item.is_active)
        # No aparecen en la carta del personal (tampoco en «Sin categoría»)
        grupos = self.como('camarero').get(f'{API_ITEMS}by_category/').data
        self.assertEqual([g['category']['name'] for g in grupos], ['Bebidas'])
        registro = RegistroAuditoria.objects.get(accion='menu.categoria.eliminar')
        self.assertEqual((registro.detalle['productos'], registro.detalle['desactivados']), (2, 2))

    def test_borrar_una_categoria_visible_deja_sus_productos_activos(self):
        r = self.como('cafe_admin').delete(f'{API_CATEGORIAS}{self.bebidas.pk}/')
        self.assertEqual((r.data['productos_sin_categoria'], r.data['productos_desactivados']), (1, 0))
        self.cappuccino.refresh_from_db()
        self.assertTrue(self.cappuccino.is_active)
        self.assertIn(str(self.cappuccino.pk), self.ids('camarero'))


class CategoriaOcultaClienteTests(MediaTemporalMixin, PruebaQR):
    def test_la_carta_del_cliente_no_muestra_los_productos_de_una_categoria_oculta_borrada(self):
        self.local.comida.is_active = False
        self.local.comida.save()
        admin = self.personal(self.local.cafe_admin)
        self.assertEqual(admin.delete(f'{API_CATEGORIAS}{self.local.comida.pk}/').status_code, 200)
        r = self.entrar('Ana').get('menu/')
        nombres = [i['nombre'] for c in r.data['categorias'] for i in c['items']]
        self.assertEqual(nombres, ['Cappuccino'])
        self.assertNotIn('Otros', [c['nombre'] for c in r.data['categorias']])


class EdicionYAuditoriaTests(PruebaCarta):
    def test_editar_solo_la_descripcion_no_toca_la_disponibilidad(self):
        # El gerente lo marcó agotado; el admin edita solo la descripción (PATCH parcial)
        r = self.como('cafe_admin').patch(self.item_url(self.agotado), {'description': 'Con frutos rojos'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.agotado.refresh_from_db()
        self.assertFalse(self.agotado.is_available)
        self.assertEqual(self.agotado.description, 'Con frutos rojos')

    def test_se_auditan_costo_activacion_y_visibilidad_de_categorias(self):
        client = self.como('cafe_admin')
        client.patch(self.item_url(self.cappuccino), {'cost': '1.10'}, format='json')
        client.patch(self.item_url(self.cappuccino), {'is_active': False}, format='json')
        client.patch(self.item_url(self.cappuccino), {'is_active': True}, format='json')
        client.patch(f'{API_CATEGORIAS}{self.postres.pk}/', {'is_active': False}, format='json')
        client.patch(f'{API_CATEGORIAS}{self.postres.pk}/', {'is_active': True}, format='json')
        # Guardar sin cambios no registra nada
        client.patch(self.item_url(self.cappuccino), {'cost': '1.10', 'is_active': True}, format='json')
        client.patch(f'{API_CATEGORIAS}{self.postres.pk}/', {'is_active': True}, format='json')

        acciones = list(RegistroAuditoria.objects.order_by('created_at').values_list('accion', flat=True))
        self.assertEqual(acciones, [
            'menu.producto.costo', 'menu.producto.desactivar', 'menu.producto.reactivar',
            'menu.categoria.ocultar', 'menu.categoria.mostrar',
        ])
        costo = RegistroAuditoria.objects.get(accion='menu.producto.costo')
        self.assertEqual((costo.detalle['antes'], costo.detalle['despues']), ('0.90', '1.10'))

    def test_disponibilidad_con_un_cuerpo_que_no_es_objeto_da_400(self):
        for cuerpo in ([1, 2], 'true', 5):
            r = self.como('gerente').post(self.item_url(self.cappuccino, 'disponibilidad/'), cuerpo, format='json')
            self.assertEqual(r.status_code, 400, cuerpo)
        self.cappuccino.refresh_from_db()
        self.assertTrue(self.cappuccino.is_available)
        # Sin cuerpo sigue alternando (contrato documentado)
        r = self.como('gerente').post(self.item_url(self.cappuccino, 'disponibilidad/'))
        self.assertEqual((r.status_code, r.data['is_available']), (200, False))


class SubidaRevisionTests(PruebaCarta):
    def subir(self, archivo, item=None, rol='cafe_admin'):
        return self.como(rol).post(self.item_url(item or self.cappuccino, 'imagen/'), {'image': archivo}, format='multipart')

    def test_una_peticion_demasiado_grande_se_rechaza_antes_de_leer_el_archivo(self):
        enorme = SimpleUploadedFile('enorme.jpg', b'\xff' * (7 * 1024 * 1024), content_type='image/jpeg')
        antes = archivos_en_media()
        with mock.patch('apps.menu.views.procesar_imagen') as en_vista, \
                mock.patch('apps.menu.serializers.procesar_imagen') as en_serializer:
            r = self.subir(enorme)
            self.assertEqual(r.status_code, 400)
            self.assertIn('el máximo es 5 MB', str(r.data['image'][0]))
            # Crear y editar con foto también
            for metodo, url in (('post', API_ITEMS), ('patch', self.item_url(self.cappuccino))):
                enorme.seek(0)
                r = getattr(self.como('cafe_admin'), metodo)(
                    url, {'name': 'Pan', 'price': '1', 'image': enorme}, format='multipart'
                )
                self.assertEqual(r.status_code, 400, metodo)
                self.assertIn('image', r.data)
            en_vista.assert_not_called()
            en_serializer.assert_not_called()
        self.assertFalse(MenuItem.objects.filter(name='Pan').exists())
        self.cappuccino.refresh_from_db()
        self.assertEqual(self.cappuccino.name, 'Cappuccino')
        self.assertEqual(archivos_en_media(), antes)

    def test_la_foto_de_otro_tenant_no_se_toca(self):
        aplicar_imagen(self.ajeno, procesar_imagen(foto_jpeg()))
        foto = self.ajeno.image.name
        for rol in ('cafe_admin', 'distribuidor_admin', 'gerente'):
            self.assertEqual(self.subir(foto_jpeg(), item=self.ajeno, rol=rol).status_code, 404 if rol != 'gerente' else 403)
            r = self.como(rol).delete(self.item_url(self.ajeno, 'imagen/'))
            self.assertEqual(r.status_code, 404 if rol != 'gerente' else 403, rol)
        self.ajeno.refresh_from_db()
        self.assertEqual(self.ajeno.image.name, foto)
        self.assertTrue(default_storage.exists(foto))

    def test_png_webp_o_gif_con_demasiados_pixeles_se_rechazan_sin_decodificarlos(self):
        lado = int(MAX_PIXELES_SIN_DRAFT ** 0.5) + 50  # ~4150 px: pesa pocos KB, ocuparía ~70 MB en RAM
        for formato, modo in (('PNG', '1'), ('GIF', 'L'), ('WEBP', 'RGB')):
            buffer = io.BytesIO()
            Image.new(modo, (lado, lado)).save(buffer, formato)
            with mock.patch.object(Image.Image, 'load', side_effect=AssertionError('no debe decodificarse')):
                r = self.subir(SimpleUploadedFile(f'grande.{formato.lower()}', buffer.getvalue()))
            self.assertEqual(r.status_code, 400, formato)
            self.assertEqual(str(r.data['image'][0]), MENSAJE_PIXELES_SIN_DRAFT, formato)
        # Una PNG de ~16 MP sí entra (fotos de celular en PNG)
        buffer = io.BytesIO()
        Image.new('RGB', (4000, 4000), (200, 120, 40)).save(buffer, 'PNG')
        r = self.subir(SimpleUploadedFile('ok.png', buffer.getvalue()))
        self.assertEqual(r.status_code, 200, r.content)

    def test_jpeg_con_demasiados_pixeles_se_rechaza(self):
        # Tope bajo solo en la prueba: así no hace falta generar una foto de 64 MP
        with mock.patch.object(imagenes, 'MAX_PIXELES', 1000 * 1000):
            r = self.subir(foto_jpeg(1600, 1200))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(str(r.data['image'][0]), MENSAJE_PIXELES)
        self.cappuccino.refresh_from_db()
        self.assertFalse(self.cappuccino.image)

    def test_la_foto_guardada_no_trae_gps_xmp_ni_perfil_de_color(self):
        exif = Image.Exif()
        exif[0x010F] = 'CelularDePrueba'
        exif[0x8825] = {1: 'S', 2: (0.0, 13.0, 5.0), 3: 'W', 4: (78.0, 29.0, 12.0)}  # GPS: Quito
        icc = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
        buffer = io.BytesIO()
        Image.new('RGB', (900, 600), (120, 80, 40)).save(
            buffer, 'WEBP', exif=exif.tobytes(), icc_profile=icc, xmp=b'<x:xmpmeta>Casa de Ana</x:xmpmeta>',
        )
        original = Image.open(io.BytesIO(buffer.getvalue()))
        self.assertTrue({'exif', 'icc_profile', 'xmp'} <= set(original.info))  # la prueba sí trae metadatos

        r = self.subir(SimpleUploadedFile('foto.webp', buffer.getvalue(), content_type='image/webp'))
        self.assertEqual(r.status_code, 200, r.content)
        self.cappuccino.refresh_from_db()
        for nombre in (self.cappuccino.image.name, self.cappuccino.image_thumb.name):
            with default_storage.open(nombre) as archivo:
                datos = archivo.read()
            guardada = Image.open(io.BytesIO(datos))
            self.assertEqual(dict(guardada.getexif()), {})
            for clave in ('exif', 'icc_profile', 'xmp'):
                self.assertFalse(guardada.info.get(clave), clave)
            self.assertNotIn(b'Casa de Ana', datos)
            self.assertNotIn(b'CelularDePrueba', datos)
