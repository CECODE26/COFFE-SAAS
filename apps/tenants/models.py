import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _


# Límites de cada plan. Los usan la creación del distribuidor, el cambio de plan y los datos demo.
LIMITES_POR_PLAN = {
    'free': {'max_cafes': 1, 'max_users': 10},
    'basic': {'max_cafes': 5, 'max_users': 50},
    'pro': {'max_cafes': 20, 'max_users': 500},
    'enterprise': {'max_cafes': 999, 'max_users': 9999},
}

# Planes que se venden hoy (el negocio no tiene plan gratis; 'free' queda solo por datos antiguos)
PLANES_DE_PAGO = ('basic', 'pro', 'enterprise')


class Tenant(models.Model):
    """Distribuidor de cafeterías - Multi-tenant container"""

    PLAN_CHOICES = [
        ('free', 'Plan Gratis'),
        ('basic', 'Plan Básico'),
        ('pro', 'Plan Profesional'),
        ('enterprise', 'Plan Empresa'),
    ]

    STATUS_CHOICES = [
        ('active', 'Activo'),
        ('inactive', 'Inactivo'),
        ('suspended', 'Suspendido'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(_('Nombre'), max_length=255, unique=True)
    slug = models.SlugField(unique=True, db_index=True)
    description = models.TextField(_('Descripción'), blank=True)

    # Contact Info
    email = models.EmailField(_('Email'))
    phone = models.CharField(_('Teléfono'), max_length=20, blank=True)
    address = models.TextField(_('Dirección'), blank=True)
    city = models.CharField(_('Ciudad'), max_length=100, blank=True)

    # Business Info
    ruc = models.CharField(_('RUC'), max_length=20, unique=True, db_index=True)
    business_name = models.CharField(_('Razón Social'), max_length=255)
    website = models.URLField(blank=True)
    logo = models.ImageField(_('Logo'), upload_to='tenants/logos/', null=True, blank=True)

    # Plan & Billing
    # Sin plan gratis: lo que se cree sin indicar plan (admin de Django, scripts) arranca en Básico
    plan = models.CharField(_('Plan'), max_length=20, choices=PLAN_CHOICES, default='basic')
    max_cafes = models.IntegerField(_('Máximo de Cafeterías'), default=LIMITES_POR_PLAN['basic']['max_cafes'])
    max_users = models.IntegerField(_('Máximo de Usuarios'), default=LIMITES_POR_PLAN['basic']['max_users'])

    # Status
    status = models.CharField(_('Estado'), max_length=20, choices=STATUS_CHOICES, default='active')
    is_active = models.BooleanField(_('Activo'), default=True)

    # Dates
    created_at = models.DateTimeField(_('Creado'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Actualizado'), auto_now=True)
    subscription_expires_at = models.DateTimeField(_('Suscripción Vence'), null=True, blank=True)

    class Meta:
        verbose_name = _('Distribuidor')
        verbose_name_plural = _('Distribuidores')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['slug']),
            models.Index(fields=['status']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return self.name

    def get_active_cafes_count(self):
        return self.cafeterias.filter(is_active=True).count()

    def get_active_users_count(self):
        from apps.accounts.models import User
        return User.objects.filter(tenant=self, is_active=True).count()

    def can_create_cafe(self):
        return self.get_active_cafes_count() < self.max_cafes

    def can_create_user(self):
        from apps.accounts.models import User
        return User.objects.filter(tenant=self).count() < self.max_users
