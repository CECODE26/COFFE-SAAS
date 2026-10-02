"""Fotos de productos: validación, procesado (WebP, tamaño, EXIF), reemplazo/borrado y carta pública"""
import io
import json
import os

from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.comensales.tests.base import PruebaQR
from apps.menu.imagenes import MAX_BYTES, MENSAJE_NO_IMAGEN, aplicar_imagen, procesar_imagen
from apps.menu.models import MenuItem

from .base import API_ITEMS, MediaTemporalMixin, PruebaCarta, foto_jpeg, png_transparente


def abrir(nombre):
    with default_storage.open(nombre) as archivo:
        imagen = Image.open(io.BytesIO(archivo.read()))
        imagen.load()
    return imagen


class SubidaTests(PruebaCarta):
    def subir(self, archivo, item=None, rol='cafe_admin'):
        return self.como(rol).post(
            self.item_url(item or self.cappuccino, 'imagen/'), {'image': archivo}, format='multipart'
        )

    def recargar(self):
        self.cappuccino.refresh_from_db()
        return self.cappuccino

    def test_foto_valida_genera_webp_reducida_y_miniatura_sin_exif(self):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.subir(foto_jpeg(4000, 3000))
        self.assertEqual(r.status_code, 200, r.content)
        item = self.recargar()
        self.assertTrue(r.data['image'].startswith('http://testserver/media/menu_items/'))
        self.assertTrue(r.data['image'].endswith('.webp'))
        self.assertTrue(r.data['image_thumb'].startswith('http://testserver/media/menu_items/miniaturas/'))
        self.assertNotIn('foto', item.image.name)  # nombre aleatorio, no el del archivo subido

        foto, mini = abrir(item.image.name), abrir(item.image_thumb.name)
        self.assertEqual((foto.format, foto.size), ('WEBP', (1200, 900)))
        self.assertEqual((mini.format, mini.size), ('WEBP', (480, 360)))
        for imagen in (foto, mini):
            self.assertEqual(dict(imagen.getexif()), {})
            self.assertNotIn('exif', imagen.info)
            self.assertEqual(imagen.mode, 'RGB')

    def test_endereza_la_foto_del_celular_y_no_agranda(self):
        self.subir(foto_jpeg(1600, 1200, orientacion=6))  # celular en vertical
        foto = abrir(self.recargar().image.name)
        self.assertEqual(foto.size, (900, 1200))
        arriba, abajo = foto.getpixel((450, 100)), foto.getpixel((450, 1100))
        self.assertGreater(sum(arriba), sum(abajo))  # la mitad clara (izquierda) quedó arriba

        self.subir(foto_jpeg(800, 600))
        item = self.recargar()
        self.assertEqual(abrir(item.image.name).size, (800, 600))
        self.assertEqual(abrir(item.image_thumb.name).size, (480, 360))

    def test_png_transparente_queda_con_fondo_blanco(self):
        r = self.subir(png_transparente())
        self.assertEqual(r.status_code, 200, r.content)
        foto = abrir(self.recargar().image.name)
        self.assertEqual(foto.mode, 'RGB')
        self.assertTrue(all(canal >= 250 for canal in foto.getpixel((10, 10))))

    def test_archivos_que_no_son_imagen_o_muy_pesados_dan_400(self):
        buena = foto_jpeg().read()
        casos = [
            SimpleUploadedFile('foto.jpg', b'esto no es una imagen, es texto', content_type='image/jpeg'),
            SimpleUploadedFile('foto.jpg', buena[: len(buena) // 2], content_type='image/jpeg'),  # cortada
            SimpleUploadedFile('dibujo.svg', b'<svg xmlns="http://www.w3.org/2000/svg"/>', content_type='image/svg+xml'),
        ]
        for archivo in casos:
            r = self.subir(archivo)
            self.assertEqual(r.status_code, 400, archivo.name)
            self.assertEqual(str(r.data['image'][0]), MENSAJE_NO_IMAGEN)

        r = self.subir(SimpleUploadedFile('grande.jpg', b'\xff' * (MAX_BYTES + 1), content_type='image/jpeg'))
        self.assertEqual(r.status_code, 400)
        self.assertIn('el máximo es 5 MB', str(r.data['image'][0]))

        r = self.como('cafe_admin').post(self.item_url(self.cappuccino, 'imagen/'), {}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(self.recargar().image)

    def test_reemplazar_y_quitar_borra_los_archivos_anteriores(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.subir(foto_jpeg())
        item = self.recargar()
        viejos = (item.image.name, item.image_thumb.name)
        self.assertTrue(all(default_storage.exists(n) for n in viejos))

        # Un archivo inválido no toca la foto actual
        with self.captureOnCommitCallbacks(execute=True):
            self.subir(SimpleUploadedFile('x.jpg', b'nada', content_type='image/jpeg'))
        self.assertEqual(self.recargar().image.name, viejos[0])

        with self.captureOnCommitCallbacks(execute=True):
            r = self.subir(foto_jpeg(900, 900))
        self.assertEqual(r.status_code, 200)
        item = self.recargar()
        nuevos = (item.image.name, item.image_thumb.name)
        self.assertFalse(any(default_storage.exists(n) for n in viejos))
        self.assertTrue(all(default_storage.exists(n) for n in nuevos))

        with self.captureOnCommitCallbacks(execute=True):
            r = self.como('cafe_admin').delete(self.item_url(self.cappuccino, 'imagen/'))
        self.assertEqual((r.status_code, r.data['image'], r.data['image_thumb']), (200, None, None))
        item = self.recargar()
        self.assertFalse(item.image or item.image_thumb)
        self.assertFalse(any(default_storage.exists(n) for n in nuevos))

    def test_crear_con_foto_en_multipart_y_borrar_el_producto_borra_sus_archivos(self):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.como('cafe_admin').post(API_ITEMS, {
                'name': 'Tostada de aguacate', 'price': '6.50', 'category': str(self.bebidas.pk),
                'is_vegetarian': 'true', 'image': foto_jpeg(),
            }, format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.data['image'].endswith('.webp'))
        item = MenuItem.objects.get(pk=r.data['id'])
        self.assertTrue(item.is_vegetarian and item.is_available)
        archivos = (item.image.name, item.image_thumb.name)
        self.assertTrue(all(default_storage.exists(n) for n in archivos))

        # Editar con otra foto por PATCH multipart también reemplaza
        with self.captureOnCommitCallbacks(execute=True):
            r = self.como('cafe_admin').patch(
                f'{API_ITEMS}{item.pk}/', {'image': foto_jpeg(700, 700)}, format='multipart'
            )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(any(default_storage.exists(n) for n in archivos))
        item.refresh_from_db()
        archivos = (item.image.name, item.image_thumb.name)

        with self.captureOnCommitCallbacks(execute=True):
            r = self.como('cafe_admin').delete(f'{API_ITEMS}{item.pk}/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(any(default_storage.exists(n) for n in archivos))

    def test_crear_con_foto_falsa_no_crea_el_producto(self):
        r = self.como('cafe_admin').post(API_ITEMS, {
            'name': 'Pan de yuca', 'price': '1.90',
            'image': SimpleUploadedFile('pan.jpg', b'no soy una foto', content_type='image/jpeg'),
        }, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('image', r.data)
        self.assertFalse(MenuItem.objects.filter(name='Pan de yuca').exists())

    def test_foto_pesada_que_django_guarda_en_archivo_temporal(self):
        # > 2.5 MB (FILE_UPLOAD_MAX_MEMORY_SIZE) y < 5 MB: llega como TemporaryUploadedFile
        ruido = Image.frombytes('RGB', (2400, 1600), os.urandom(2400 * 1600 * 3))
        buffer = io.BytesIO()
        ruido.save(buffer, 'JPEG', quality=90)
        self.assertTrue(2.5 * 1024 * 1024 < buffer.tell() < MAX_BYTES)
        r = self.subir(SimpleUploadedFile('ruido.jpg', buffer.getvalue(), content_type='image/jpeg'))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(abrir(self.recargar().image.name).size, (1200, 800))

    def test_stats_cuenta_productos_con_foto(self):
        self.subir(foto_jpeg())
        self.assertEqual(self.como('cafe_admin').get(f'{API_ITEMS}stats/').data['items_with_image'], 1)


class CartaClienteTests(MediaTemporalMixin, PruebaQR):
    def test_carta_publica_trae_miniatura_y_no_el_costo(self):
        aplicar_imagen(self.cappuccino, procesar_imagen(foto_jpeg()))
        r = self.entrar('Ana').get('menu/')
        self.assertEqual(r.status_code, 200)
        productos = {i['nombre']: i for c in r.data['categorias'] for i in c['items']}
        cappuccino = productos['Cappuccino']
        self.assertTrue(cappuccino['imagen'].startswith('http://testserver/media/menu_items/'))
        self.assertTrue(cappuccino['miniatura'].startswith('http://testserver/media/menu_items/miniaturas/'))
        self.assertIsNone(productos['Sánduche de pernil']['miniatura'])
        texto = json.dumps(r.data).lower()
        for prohibido in ('cost', 'costo', 'margen', 'margin', '0.90', '1.70'):
            self.assertNotIn(prohibido, texto)
