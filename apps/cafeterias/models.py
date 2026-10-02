import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from apps.tenants.models import Tenant


class Cafeteria(models.Model):
    """Cafetería/Local del Distribuidor"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='cafeterias',
        db_index=True
    )

    name = models.CharField(_('Nombre'), max_length=255)
    slug = models.SlugField(max_length=255)
    description = models.TextField(_('Descripción'), blank=True)

    # Location
    address = models.TextField(_('Dirección'))
    city = models.CharField(_('Ciudad'), max_length=100)
    postal_code = models.CharField(_('Código Postal'), max_length=20, blank=True)
    phone = models.CharField(_('Teléfono'), max_length=20, blank=True)
    email = models.EmailField(_('Email'), blank=True)

    # Business
    ruc = models.CharField(_('RUC Sucursal'), max_length=20, blank=True)
    registration_number = models.CharField(_('Número de Registro'), max_length=100, blank=True)

    # Capacity
    capacity = models.IntegerField(_('Capacidad de Personas'), default=50)

    # Settings
    open_time = models.TimeField(_('Hora de Apertura'), default='07:00')
    close_time = models.TimeField(_('Hora de Cierre'), default='22:00')

    # Media
    logo = models.ImageField(_('Logo'), upload_to='cafeterias/logos/', null=True, blank=True)
    banner = models.ImageField(_('Banner'), upload_to='cafeterias/banners/', null=True, blank=True)

    # Status
    is_active = models.BooleanField(_('Activo'), default=True)

    # Dates
    created_at = models.DateTimeField(_('Creado'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Actualizado'), auto_now=True)

    class Meta:
        verbose_name = _('Cafetería')
        verbose_name_plural = _('Cafeterías')
        unique_together = ('tenant', 'slug')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'is_active']),
            models.Index(fields=['tenant', 'slug']),
        ]

    def __str__(self):
        return self.name

    def get_active_users_count(self):
        return self.users.filter(is_active=True).count()

    def get_mesas_count(self):
        return self.mesas.filter(is_active=True).count()
