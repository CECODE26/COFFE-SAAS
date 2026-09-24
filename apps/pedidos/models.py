import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from decimal import Decimal
from apps.tenants.models import Tenant
from apps.cafeterias.models import Cafeteria
from apps.accounts.models import User
from apps.menu.models import MenuItem


class Order(models.Model):
    """Pedido de Cafetería"""

    STATUS_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('confirmada', 'Confirmada'),
        ('preparando', 'Preparando'),
        ('lista', 'Lista'),
        ('entregada', 'Entregada'),
        ('cancelada', 'Cancelada'),
    ]

    PAYMENT_METHOD_CHOICES = [
        ('efectivo', 'Efectivo'),
        ('tarjeta', 'Tarjeta'),
        ('transferencia', 'Transferencia'),
        ('pendiente', 'Pendiente'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='orders',
        db_index=True
    )
    cafeteria = models.ForeignKey(
        Cafeteria,
        on_delete=models.CASCADE,
        related_name='orders',
        db_index=True
    )

    # Order Details
    order_number = models.CharField(_('Número de Pedido'), max_length=20, unique=True, db_index=True)

    # User who created the order
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='orders_created',
        limit_choices_to={'role__in': ['camarero', 'cajero', 'cafe_admin']}
    )

    # Order Type
    ORDER_TYPE_CHOICES = [
        ('mesa', 'Para Mesa'),
        ('delivery', 'Delivery'),
        ('takeaway', 'Para Llevar'),
        ('escritorio', 'Escritorio'),
    ]
    order_type = models.CharField(
        _('Tipo de Pedido'),
        max_length=20,
        choices=ORDER_TYPE_CHOICES,
        default='mesa'
    )

    # Mesa (if order_type is 'mesa')
    mesa = models.ForeignKey(
        'mesas.Mesa',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders'
    )

    # Customer info
    customer_name = models.CharField(_('Nombre Cliente'), max_length=200, blank=True)
    customer_phone = models.CharField(_('Teléfono Cliente'), max_length=20, blank=True)
    customer_address = models.TextField(_('Dirección Delivery'), blank=True)

    # Status
    status = models.CharField(
        _('Estado'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='pendiente',
        db_index=True
    )

    # Amounts
    subtotal = models.DecimalField(_('Subtotal'), max_digits=12, decimal_places=2, default=0)
    tax = models.DecimalField(_('Impuesto'), max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(_('Descuento'), max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(_('Total'), max_digits=12, decimal_places=2, default=0)

    # Payment
    payment_method = models.CharField(
        _('Método de Pago'),
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default='pendiente'
    )
    is_paid = models.BooleanField(_('Pagado'), default=False)
    paid_at = models.DateTimeField(_('Pagado en'), null=True, blank=True)

    # Notes
    notes = models.TextField(_('Notas/Observaciones'), blank=True)
    kitchen_notes = models.TextField(_('Notas Cocina'), blank=True)

    # Dates
    created_at = models.DateTimeField(_('Creado'), auto_now_add=True)
    confirmed_at = models.DateTimeField(_('Confirmado en'), null=True, blank=True)
    completed_at = models.DateTimeField(_('Completado en'), null=True, blank=True)
    updated_at = models.DateTimeField(_('Actualizado'), auto_now=True)

    class Meta:
        verbose_name = _('Pedido')
        verbose_name_plural = _('Pedidos')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'cafeteria', 'status']),
            models.Index(fields=['tenant', 'created_at']),
            models.Index(fields=['cafeteria', 'status', 'created_at']),
            models.Index(fields=['order_number']),
        ]

    def __str__(self):
        return f"Pedido {self.order_number} - {self.get_status_display()}"

    def save(self, *args, **kwargs):
        if not self.order_number:
            # Generar número de pedido
            today = timezone.now().strftime('%Y%m%d')
            count = Order.objects.filter(
                cafeteria=self.cafeteria,
                created_at__date=timezone.now().date()
            ).count()
            self.order_number = f"PED-{today}-{count + 1:04d}"

        super().save(*args, **kwargs)

    def calculate_total(self):
        """Recalcular total del pedido"""
        self.subtotal = sum(
            item.get_total_price() for item in self.items.all()
        )
        self.tax = self.subtotal * Decimal('0.12')  # 12% IVA Ecuador
        self.total = self.subtotal + self.tax - self.discount
        self.save()

    def confirm(self):
        """Confirmar pedido"""
        if self.status == 'pendiente':
            self.status = 'confirmada'
            self.confirmed_at = timezone.now()
            self.save()

    def complete(self):
        """Completar pedido"""
        if self.status in ['preparando', 'lista']:
            self.status = 'entregada'
            self.completed_at = timezone.now()
            self.save()

    def cancel(self):
        """Cancelar pedido"""
        if self.status not in ['entregada', 'cancelada']:
            self.status = 'cancelada'
            self.save()

    def mark_as_paid(self, payment_method='efectivo'):
        """Marcar como pagado"""
        self.is_paid = True
        self.paid_at = timezone.now()
        self.payment_method = payment_method
        self.save()

    def get_pending_items(self):
        """Obtener items pendientes de preparación"""
        return self.items.filter(status='pendiente')

    def get_ready_items(self):
        """Obtener items listos"""
        return self.items.filter(status='lista')


class OrderItem(models.Model):
    """Item dentro de un Pedido"""

    ITEM_STATUS_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('preparando', 'Preparando'),
        ('lista', 'Lista'),
        ('entregada', 'Entregada'),
        ('cancelada', 'Cancelada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='items'
    )
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.PROTECT,
        related_name='order_items'
    )

    # Quantity and Price
    quantity = models.PositiveIntegerField(_('Cantidad'), default=1)
    unit_price = models.DecimalField(
        _('Precio Unitario'),
        max_digits=10,
        decimal_places=2
    )
    special_price = models.DecimalField(
        _('Precio Especial'),
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Si aplica precio diferente al menú"
    )

    # Status
    status = models.CharField(
        _('Estado'),
        max_length=20,
        choices=ITEM_STATUS_CHOICES,
        default='pendiente',
        db_index=True
    )

    # Notes
    notes = models.TextField(_('Notas del Item'), blank=True, help_text="Ej: Sin picante, extra hielo")

    # Dates
    created_at = models.DateTimeField(_('Creado'), auto_now_add=True)
    completed_at = models.DateTimeField(_('Completado en'), null=True, blank=True)
    updated_at = models.DateTimeField(_('Actualizado'), auto_now=True)

    class Meta:
        verbose_name = _('Item del Pedido')
        verbose_name_plural = _('Items del Pedido')
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['order', 'status']),
        ]

    def __str__(self):
        return f"{self.menu_item.name} x{self.quantity}"

    def get_unit_price(self):
        """Obtener precio unitario (especial o menú)"""
        return self.special_price or self.unit_price

    def get_total_price(self):
        """Obtener precio total del item"""
        return self.get_unit_price() * self.quantity

    def mark_as_ready(self):
        """Marcar item como listo"""
        if self.status == 'preparando':
            self.status = 'lista'
            self.save()

    def mark_as_completed(self):
        """Marcar item como completado"""
        if self.status == 'lista':
            self.status = 'entregada'
            self.completed_at = timezone.now()
            self.save()
