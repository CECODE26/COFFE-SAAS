import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from apps.tenants.models import Tenant


class Category(models.Model):
    """Categoría de Items del Menú"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='menu_categories',
        db_index=True
    )
    name = models.CharField(_('Nombre'), max_length=100)
    slug = models.SlugField(max_length=100)
    description = models.TextField(_('Descripción'), blank=True)
    icon = models.CharField(_('Icono'), max_length=50, blank=True, help_text="emoji o nombre de icono")
    order = models.PositiveIntegerField(_('Orden'), default=0)
    is_active = models.BooleanField(_('Activo'), default=True)

    created_at = models.DateTimeField(_('Creado'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Actualizado'), auto_now=True)

    class Meta:
        verbose_name = _('Categoría')
        verbose_name_plural = _('Categorías')
        unique_together = ('tenant', 'slug')
        ordering = ['order', 'name']
        indexes = [
            models.Index(fields=['tenant', 'is_active']),
        ]

    def __str__(self):
        return self.name


class MenuItem(models.Model):
    """Item del Menú - Producto"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='menu_items',
        db_index=True
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        related_name='items',
        null=True,
        blank=True
    )

    name = models.CharField(_('Nombre'), max_length=200)
    slug = models.SlugField(max_length=200)
    description = models.TextField(_('Descripción'), blank=True)

    price = models.DecimalField(_('Precio'), max_digits=10, decimal_places=2)
    cost = models.DecimalField(_('Costo'), max_digits=10, decimal_places=2, default=0)

    # Foto procesada por apps.menu.imagenes (WebP sin EXIF, máx. 1200 px) y su miniatura (máx. 480 px).
    # No asignar a mano: usar imagenes.aplicar_imagen() / quitar_imagen(), que borran los archivos anteriores.
    image = models.ImageField(_('Imagen'), upload_to='menu_items/', null=True, blank=True)
    image_thumb = models.ImageField(_('Miniatura'), upload_to='menu_items/miniaturas/', null=True, blank=True)

    # Availability
    is_available = models.BooleanField(_('Disponible'), default=True)
    is_active = models.BooleanField(_('Activo'), default=True)

    preparation_time = models.PositiveIntegerField(
        _('Tiempo de Preparación (minutos)'),
        default=5
    )

    # Allergens & Dietary
    is_vegetarian = models.BooleanField(_('Vegetariano'), default=False)
    is_vegan = models.BooleanField(_('Vegano'), default=False)
    has_gluten = models.BooleanField(_('Contiene Gluten'), default=False)

    created_at = models.DateTimeField(_('Creado'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Actualizado'), auto_now=True)

    class Meta:
        verbose_name = _('Item del Menú')
        verbose_name_plural = _('Items del Menú')
        unique_together = ('tenant', 'slug')
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['tenant', 'is_active']),
            models.Index(fields=['tenant', 'category']),
        ]

    def __str__(self):
        return f"{self.name} (${self.price})"

    def get_profit_margin(self):
        """Calcular margen de ganancia"""
        if not self.cost or not self.price:
            return 0
        return ((self.price - self.cost) / self.price) * 100
