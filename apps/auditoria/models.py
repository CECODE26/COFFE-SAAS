import uuid
from datetime import timedelta

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


def _plazo_legal():
    # LOPDP: el responsable debe atender la solicitud en 15 días
    return timezone.now() + timedelta(days=15)


class SolicitudDatos(models.Model):
    """Solicitud de ejercicio de derechos del titular (LOPDP Ecuador)"""

    TIPO_CHOICES = [
        ('acceso', 'Acceso'),
        ('rectificacion', 'Rectificación y actualización'),
        ('eliminacion', 'Eliminación'),
        ('oposicion', 'Oposición'),
        ('portabilidad', 'Portabilidad'),
        ('suspension', 'Suspensión del tratamiento'),
        ('decisiones_automatizadas', 'No ser objeto de decisiones automatizadas'),
        ('otro', 'Otra consulta'),
    ]

    RELACION_CHOICES = [
        ('cliente', 'Cliente de COFFE-SAAS (dueño o distribuidor)'),
        ('usuario', 'Usuario del sistema (personal de una cafetería)'),
        ('comensal', 'Cliente de una cafetería que usa COFFE-SAAS'),
        ('visitante', 'Visitante del sitio web'),
        ('otro', 'Otro'),
    ]

    ESTADO_CHOICES = [
        ('recibida', 'Recibida'),
        ('en_revision', 'En revisión'),
        ('completada', 'Completada'),
        ('rechazada', 'Rechazada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.CharField(_('Código'), max_length=20, unique=True, editable=False)

    tipo = models.CharField(_('Derecho'), max_length=30, choices=TIPO_CHOICES)
    relacion = models.CharField(_('Relación con COFFE-SAAS'), max_length=20, choices=RELACION_CHOICES)

    nombre = models.CharField(_('Nombre completo'), max_length=200)
    identificacion = models.CharField(_('Cédula / pasaporte'), max_length=20)
    email = models.EmailField(_('Email'))
    telefono = models.CharField(_('Teléfono'), max_length=30, blank=True)
    cafeteria = models.CharField(_('Cafetería relacionada'), max_length=200, blank=True)
    detalle = models.TextField(_('Detalle de la solicitud'))
    declaracion_veracidad = models.BooleanField(_('Declara que la información es veraz'), default=False)

    estado = models.CharField(_('Estado'), max_length=20, choices=ESTADO_CHOICES, default='recibida', db_index=True)
    respuesta = models.TextField(_('Respuesta al titular'), blank=True)

    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(_('Recibida'), auto_now_add=True)
    fecha_limite = models.DateTimeField(_('Fecha límite de respuesta'), default=_plazo_legal)
    resuelta_at = models.DateTimeField(_('Resuelta'), null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Solicitud de derechos de datos')
        verbose_name_plural = _('Solicitudes de derechos de datos')
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.codigo} · {self.get_tipo_display()} · {self.nombre}'

    def save(self, *args, **kwargs):
        if not self.codigo:
            year = timezone.now().year
            count = SolicitudDatos.objects.filter(created_at__year=year).count() + 1
            self.codigo = f'SD-{year}-{count:04d}'
            while SolicitudDatos.objects.filter(codigo=self.codigo).exists():
                count += 1
                self.codigo = f'SD-{year}-{count:04d}'
        if self.estado in ('completada', 'rechazada') and not self.resuelta_at:
            self.resuelta_at = timezone.now()
        super().save(*args, **kwargs)


class RegistroAuditoria(models.Model):
    """Bitácora de acciones sensibles (cobros, cierres de mesa, QR regenerados...). Usar services.registrar()"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # SET_NULL: el registro se conserva aunque se elimine el tenant o el usuario
    tenant = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='registros_auditoria'
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='registros_auditoria'
    )
    accion = models.CharField(_('Acción'), max_length=60, db_index=True)
    objeto_tipo = models.CharField(_('Tipo de objeto'), max_length=60, blank=True)
    objeto_id = models.CharField(_('Id del objeto'), max_length=64, blank=True)
    # DjangoJSONEncoder: admite Decimal, UUID y fechas en el detalle
    detalle = models.JSONField(_('Detalle'), default=dict, blank=True, encoder=DjangoJSONEncoder)
    created_at = models.DateTimeField(_('Fecha'), auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = _('Registro de auditoría')
        verbose_name_plural = _('Registros de auditoría')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'created_at']),
            models.Index(fields=['objeto_tipo', 'objeto_id']),
        ]

    def __str__(self):
        return f'{self.created_at:%Y-%m-%d %H:%M} · {self.accion} · {self.objeto_tipo} {self.objeto_id}'
