from django.db.models.signals import post_delete
from django.dispatch import receiver

from .imagenes import borrar_archivos
from .models import MenuItem


@receiver(post_delete, sender=MenuItem)
def borrar_fotos_del_producto(sender, instance, **kwargs):
    """Al borrar un producto (también en cascada o con queryset.delete()) se borran sus fotos del storage"""
    borrar_archivos(instance.image.name, instance.image_thumb.name)
