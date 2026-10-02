import mimetypes

from django.apps import AppConfig


class MenuConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.menu'
    verbose_name = 'Menú'

    def ready(self):
        # Las fotos de la carta se guardan en WebP: sin esto, las imágenes slim de Python lo sirven como
        # application/octet-stream (con nosniff) y el storage de S3/R2 no pondría el Content-Type correcto
        mimetypes.add_type('image/webp', '.webp')
        from . import signals  # noqa: F401
