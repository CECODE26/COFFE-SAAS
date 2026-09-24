import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from apps.tenants.models import Tenant
from apps.cafeterias.models import Cafeteria
from apps.accounts.models import User


class Mesa(models.Model):
    """Mesa de la Cafetería"""

    STATUS_CHOICES = [
        ('disponible', 'Disponible'),
        ('ocupada', 'Ocupada'),
        ('reservada', 'Reservada'),
        ('limpiando', 'Limpiando'),
        ('mantenimiento', 'Mantenimiento'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='mesas',
        db_index=True
    )
    cafeteria = models.ForeignKey(
        Cafeteria,
        on_delete=models.CASCADE,
        related_name='mesas',
        db_index=True
    )

    # Mesa Info
    number = models.PositiveIntegerField(_('Número de Mesa'))
    slug = models.SlugField(max_length=50)
    description = models.TextField(_('Descripción'), blank=True, help_text="Ej: Ventana, Rincón, etc")

    # Capacity
    capacity = models.PositiveIntegerField(_('Capacidad'), default=4)
    min_capacity = models.PositiveIntegerField(_('Capacidad Mínima'), default=2)

    # QR Code
    qr_code = models.CharField(
        _('Código QR'),
        max_length=255,
        unique=True,
        db_index=True,
        help_text="Código único para identificar la mesa"
    )

    # Status
    status = models.CharField(
        _('Estado'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='disponible',
        db_index=True
    )

    # Current Session
    current_order = models.ForeignKey(
        'pedidos.Order',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mesa_actual',
        help_text="Pedido activo en la mesa"
    )

    guest_count = models.PositiveIntegerField(
        _('Número de Clientes'),
        default=0,
        help_text="Clientes actualmente en la mesa"
    )

    occupied_since = models.DateTimeField(
        _('Ocupada desde'),
        null=True,
        blank=True
    )

    # Settings
    is_active = models.BooleanField(_('Activo'), default=True)
    location = models.CharField(
        _('Ubicación'),
        max_length=100,
        blank=True,
        help_text="Ej: Piso 1, Sección A"
    )

    # Dates
    created_at = models.DateTimeField(_('Creado'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Actualizado'), auto_now=True)

    class Meta:
        verbose_name = _('Mesa')
        verbose_name_plural = _('Mesas')
        unique_together = ('cafeteria', 'number')
        ordering = ['number']
        indexes = [
            models.Index(fields=['cafeteria', 'status']),
            models.Index(fields=['cafeteria', 'number']),
            models.Index(fields=['qr_code']),
        ]

    def __str__(self):
        return f"Mesa {self.number} - {self.cafeteria.name} ({self.get_status_display()})"

    def occupy(self, guest_count=1):
        """Marcar mesa como ocupada"""
        self.status = 'ocupada'
        self.guest_count = guest_count
        self.occupied_since = timezone.now()
        self.save()

    def reserve(self):
        """Marcar mesa como reservada"""
        self.status = 'reservada'
        self.save()

    def free(self):
        """Liberar mesa"""
        self.status = 'disponible'
        self.guest_count = 0
        self.occupied_since = None
        self.current_order = None
        self.save()

    def cleaning(self):
        """Marcar como en limpieza"""
        self.status = 'limpiando'
        self.save()

    def maintenance(self):
        """Marcar como en mantenimiento"""
        self.status = 'mantenimiento'
        self.save()

    def get_occupied_time(self):
        """Obtener tiempo que lleva ocupada (en minutos)"""
        if self.occupied_since:
            delta = timezone.now() - self.occupied_since
            return int(delta.total_seconds() / 60)
        return 0

    def get_qr_data(self):
        """Obtener datos para generar QR"""
        return {
            'mesa_id': str(self.id),
            'qr_code': self.qr_code,
            'number': self.number,
            'cafeteria': str(self.cafeteria.id),
        }


class Reserva(models.Model):
    """Reserva de Mesa"""

    STATUS_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('confirmada', 'Confirmada'),
        ('cancelada', 'Cancelada'),
        ('completada', 'Completada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mesa = models.ForeignKey(
        Mesa,
        on_delete=models.CASCADE,
        related_name='reservas'
    )

    # Reservation Details
    customer_name = models.CharField(_('Nombre Cliente'), max_length=200)
    customer_phone = models.CharField(_('Teléfono'), max_length=20)
    customer_email = models.EmailField(_('Email'), blank=True)

    guest_count = models.PositiveIntegerField(_('Número de Clientes'))

    # Reservation Time
    reservation_date = models.DateField(_('Fecha de Reserva'))
    reservation_time = models.TimeField(_('Hora de Reserva'))

    # Status
    status = models.CharField(
        _('Estado'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='pendiente'
    )

    # Notes
    notes = models.TextField(_('Notas'), blank=True)

    # Timing
    created_at = models.DateTimeField(_('Creado'), auto_now_add=True)
    confirmed_at = models.DateTimeField(_('Confirmado en'), null=True, blank=True)
    completed_at = models.DateTimeField(_('Completado en'), null=True, blank=True)
    cancelled_at = models.DateTimeField(_('Cancelado en'), null=True, blank=True)
    updated_at = models.DateTimeField(_('Actualizado'), auto_now=True)

    class Meta:
        verbose_name = _('Reserva')
        verbose_name_plural = _('Reservas')
        ordering = ['reservation_date', 'reservation_time']
        indexes = [
            models.Index(fields=['mesa', 'status']),
            models.Index(fields=['reservation_date']),
        ]

    def __str__(self):
        return f"Reserva {self.customer_name} - Mesa {self.mesa.number} ({self.reservation_date})"

    def confirm(self):
        """Confirmar reserva"""
        if self.status == 'pendiente':
            self.status = 'confirmada'
            self.confirmed_at = timezone.now()
            self.save()

    def complete(self):
        """Marcar como completada"""
        self.status = 'completada'
        self.completed_at = timezone.now()
        self.save()

    def cancel(self):
        """Cancelar reserva"""
        if self.status != 'completada':
            self.status = 'cancelada'
            self.cancelled_at = timezone.now()
            self.save()

    def is_upcoming(self):
        """Verificar si la reserva es próxima (dentro de 30 minutos)"""
        from datetime import datetime, timedelta
        now = timezone.now()
        reservation_datetime = timezone.make_aware(
            datetime.combine(self.reservation_date, self.reservation_time)
        )
        return now <= reservation_datetime <= now + timedelta(minutes=30)
