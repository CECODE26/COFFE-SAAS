"""
Fotos de los productos de la carta.

procesar_imagen(archivo) valida y normaliza lo que sube el dueño (casi siempre una foto de celular):
  - máx. 5 MB y tiene que ser una imagen de verdad (Pillow la abre y la verifica; la extensión no basta);
  - tope de píxeles: 64 MP en JPEG (se decodifica ya reducida) y ~16 MP en PNG/WebP/GIF (se decodifican
    enteras: un PNG de un solo color de 8000×8000 pesa KB pero ocupa cientos de MB en RAM);
  - primero la reduce a máx. 1200 px de lado conservando la proporción (nunca la agranda), así solo hay
    una copia grande en memoria; después la endereza según la orientación EXIF y la pasa a sRGB/RGB
    (fondo blanco si trae transparencia); saca una miniatura de máx. 480 px; las dos en WebP calidad 80
    y SIN metadatos (EXIF con GPS, modelo del celular, XMP, perfil ICC...);
  - como mucho PROCESOS_A_LA_VEZ fotos a la vez por proceso del servidor.
aplicar_imagen(item, procesada) guarda los archivos con nombre aleatorio en default_storage (disco en
desarrollo, S3/R2 en producción) y borra los anteriores; quitar_imagen(item) los quita. Al borrar un
producto, la señal post_delete (apps.menu.signals) borra sus archivos.
"""
import io
import logging
import threading
import uuid
from dataclasses import dataclass

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from PIL import Image, ImageCms, ImageOps

logger = logging.getLogger(__name__)

MAX_BYTES = 5 * 1024 * 1024
# JPEG (y MPO) se decodifican ya reducidos con draft(): ~ foto de 8000x8000; más es un archivo raro o una "bomba"
MAX_PIXELES = 64_000_000
# PNG, WebP y GIF se decodifican a tamaño completo (hasta 4 bytes por píxel y, en WebP, varias copias):
# ~ 4096x4096 (entran las fotos de 12 y 16 MP de los celulares). Pico medido: ~150 MB PNG, ~260 MB WebP.
MAX_PIXELES_SIN_DRAFT = 16_800_000
FORMATOS_CON_DRAFT = ('JPEG', 'MPO')
LADO_MAX = 1200
LADO_MINIATURA = 480
CALIDAD_WEBP = 80
# Formatos que se aceptan (nunca EPS/PDF u otros que Pillow abre con programas externos).
# Las fotos MPO de algunos celulares entran por 'JPEG' (su lector las detecta).
FORMATOS = ['JPEG', 'PNG', 'WEBP', 'GIF']
# Solo se borran archivos dentro de esta carpeta del storage
CARPETA = 'menu_items/'

MENSAJE_NO_IMAGEN = 'El archivo no es una imagen válida. Sube una foto en JPG, PNG o WebP.'
MENSAJE_PIXELES = 'La imagen tiene demasiados píxeles. Sube una foto de máximo 8000 × 8000 px.'
MENSAJE_PIXELES_SIN_DRAFT = (
    'La imagen tiene demasiados píxeles. En PNG, WebP o GIF el máximo es 4000 × 4000 px: redúcela o súbela en JPG.'
)
MENSAJE_OCUPADO = 'Estamos procesando otras fotos. Intenta de nuevo en unos segundos.'

# Modos que se reducen bien con LANCZOS; el resto (paleta, 1 bit, 16 bits...) se convierte antes
MODOS_REDUCIBLES = ('RGB', 'RGBA', 'L', 'LA', 'CMYK')

# Fotos que se procesan a la vez en cada proceso del servidor (cada una puede ocupar ~100-300 MB un momento)
PROCESOS_A_LA_VEZ = 2
ESPERA_MAX_S = 30
_procesando = threading.BoundedSemaphore(PROCESOS_A_LA_VEZ)


class ImagenInvalida(Exception):
    """La foto no se puede usar; el mensaje se muestra tal cual al usuario"""


@dataclass
class ImagenProcesada:
    principal: bytes
    miniatura: bytes
    ancho: int
    alto: int


def _tamano(archivo):
    tamano = getattr(archivo, 'size', None)
    if tamano is None:
        archivo.seek(0, io.SEEK_END)
        tamano = archivo.tell()
    return tamano


def _abrir(archivo):
    """Abre y verifica la imagen; devuelve la imagen ya cargada (reabierta tras verify())"""
    try:
        archivo.seek(0)
        with Image.open(archivo, formats=FORMATOS) as prueba:
            prueba.verify()
        # verify() deja la imagen inutilizable: se vuelve a abrir
        archivo.seek(0)
        imagen = Image.open(archivo, formats=FORMATOS)
        # El tope se revisa con la cabecera, ANTES de decodificar los píxeles
        con_draft = imagen.format in FORMATOS_CON_DRAFT
        if imagen.width * imagen.height > (MAX_PIXELES if con_draft else MAX_PIXELES_SIN_DRAFT):
            raise ImagenInvalida(MENSAJE_PIXELES if con_draft else MENSAJE_PIXELES_SIN_DRAFT)
        # En JPEG decodifica ya reducida (a no menos de 1200 px): mucha menos memoria con fotos de 48 MP
        imagen.draft('RGB', (LADO_MAX, LADO_MAX))
        imagen.load()
        return imagen
    except ImagenInvalida:
        raise
    except Image.DecompressionBombError:
        raise ImagenInvalida(MENSAJE_PIXELES)
    except Exception:
        # Pillow lanza errores muy variados con archivos corruptos o que no son imágenes
        raise ImagenInvalida(MENSAJE_NO_IMAGEN)


def _reducir(imagen, lado):
    """
    Reduce a máx. `lado` px sin agrandar, ANTES de enderezar o convertir colores: así la foto a tamaño
    completo no se copia varias veces. El recuadro es cuadrado, así que reducir antes de girar da lo mismo.
    """
    if imagen.mode not in MODOS_REDUCIBLES:
        transparente = imagen.mode in ('PA', 'La', 'RGBa') or 'transparency' in imagen.info
        imagen = imagen.convert('RGBA' if transparente else 'RGB')
    imagen.thumbnail((lado, lado), Image.Resampling.LANCZOS)
    return imagen


def _enderezar(imagen):
    """Gira la foto según la orientación EXIF del celular (sin copiarla si no hace falta girarla)"""
    try:
        ImageOps.exif_transpose(imagen, in_place=True)
    except Exception:
        pass  # EXIF dañado: se usa tal cual
    return imagen


def _a_srgb(imagen):
    """Fotos con perfil de color (p. ej. Display P3 de iPhone) -> sRGB, para que no se vean apagadas"""
    icc = imagen.info.get('icc_profile')
    if not icc or imagen.mode not in ('RGB', 'CMYK'):
        return imagen
    try:
        return ImageCms.profileToProfile(
            imagen, io.BytesIO(icc), ImageCms.createProfile('sRGB'), outputMode='RGB'
        )
    except Exception:
        return imagen


def _a_rgb(imagen):
    if imagen.mode in ('RGBA', 'LA', 'PA') or (imagen.mode == 'P' and 'transparency' in imagen.info):
        imagen = imagen.convert('RGBA')
        fondo = Image.new('RGB', imagen.size, (255, 255, 255))
        fondo.paste(imagen, mask=imagen.getchannel('A'))
        return fondo
    if imagen.mode != 'RGB':
        return imagen.convert('RGB')
    return imagen


def _webp(imagen):
    imagen.info = {}  # sin EXIF, XMP ni perfil: solo los píxeles
    buffer = io.BytesIO()
    imagen.save(buffer, format='WEBP', quality=CALIDAD_WEBP, method=4, exif=b'')
    return buffer.getvalue()


def procesar_imagen(archivo):
    """Valida y normaliza la foto subida. Lanza ImagenInvalida (mensaje para el usuario) si no sirve."""
    tamano = _tamano(archivo)
    if not tamano:
        raise ImagenInvalida('El archivo está vacío.')
    if tamano > MAX_BYTES:
        raise ImagenInvalida(f'La imagen pesa {tamano / 1024 / 1024:.1f} MB; el máximo es 5 MB.')

    # Pocas fotos a la vez: varias subidas simultáneas no agotan la memoria del servidor
    if not _procesando.acquire(timeout=ESPERA_MAX_S):
        raise ImagenInvalida(MENSAJE_OCUPADO)
    try:
        imagen = _abrir(archivo)
        try:
            imagen = _a_rgb(_a_srgb(_enderezar(_reducir(imagen, LADO_MAX))))
            miniatura = imagen.copy()
            miniatura.thumbnail((LADO_MINIATURA, LADO_MINIATURA), Image.Resampling.LANCZOS)
            return ImagenProcesada(
                principal=_webp(imagen), miniatura=_webp(miniatura), ancho=imagen.width, alto=imagen.height,
            )
        except Exception:
            logger.exception('No se pudo procesar una imagen de la carta')
            raise ImagenInvalida(MENSAJE_NO_IMAGEN)
    finally:
        _procesando.release()


def borrar_archivos(*nombres):
    """Borra archivos del storage cuando la transacción se confirma (si se revierte, siguen en su sitio)"""
    nombres = [n for n in nombres if n and n.startswith(CARPETA)]
    if not nombres:
        return

    def _borrar():
        for nombre in nombres:
            try:
                default_storage.delete(nombre)
            except Exception:
                logger.warning('No se pudo borrar el archivo %s', nombre, exc_info=True)

    transaction.on_commit(_borrar)


def aplicar_imagen(item, procesada):
    """Guarda la foto (y su miniatura) en el producto y borra las anteriores"""
    anteriores = (item.image.name, item.image_thumb.name)
    nombre = f'{uuid.uuid4().hex}.webp'
    item.image.save(nombre, ContentFile(procesada.principal), save=False)
    item.image_thumb.save(nombre, ContentFile(procesada.miniatura), save=False)
    try:
        item.save(update_fields=['image', 'image_thumb', 'updated_at'])
    except Exception:
        # No quedan archivos huérfanos si falla el guardado
        for archivo in (item.image.name, item.image_thumb.name):
            default_storage.delete(archivo)
        raise
    borrar_archivos(*anteriores)


def quitar_imagen(item):
    anteriores = (item.image.name, item.image_thumb.name)
    item.image = None
    item.image_thumb = None
    item.save(update_fields=['image', 'image_thumb', 'updated_at'])
    borrar_archivos(*anteriores)
