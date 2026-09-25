import secrets
import unicodedata
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.tenants.models import Tenant

# Caracteres que se ven en blanco pero no son espacios para str.split() (relleno Hangul, Braille en blanco)
_EN_BLANCO = {'ᅟ', 'ᅠ', 'ㅤ', 'ﾠ', '⠀'}


def generar_token_cookie():
    """Token aleatorio y no adivinable para la cookie del comensal"""
    return secrets.token_urlsafe(32)


def limpiar_alias(texto):
    """Nombre del comensal normalizado: NFKC (el ancho completo 'ＡＮＡ' queda 'ANA'), sin caracteres invisibles
    ni de control (ancho cero, BOM, etc.), espacios colapsados, MAYÚSCULAS y máx. 50.

    Si no queda ninguna letra ni dígito devuelve '' (el nombre cuenta como vacío)."""
    texto = unicodedata.normalize('NFKC', str(texto or ''))
    texto = ''.join(' ' if c in _EN_BLANCO else c for c in texto)
    palabras = (''.join(c for c in palabra if unicodedata.category(c)[0] != 'C') for palabra in texto.split())
    alias = ' '.join(p for p in palabras if p).upper()[:50].strip()
    return alias if any(c.isalnum() for c in alias) else ''


class SesionCliente(models.Model):
    """Persona sentada en una mesa que pide desde su celular (sin cuenta ni contraseña)"""

    ESTADO_CHOICES = [
        ('activa', 'Activa'),
        ('pagada', 'Pagada'),
        ('cerrada', 'Cerrada'),
    ]

    MOTIVO_CIERRE_CHOICES = [
        ('inactividad', 'Inactividad'),
        ('salir', 'Salió'),
        ('mesero', 'Cerrada por el personal'),
        ('mesa_lista', 'Mesa lista'),
        ('expirada', 'Expirada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='sesiones_cliente',
        db_index=True
    )
    # PROTECT: una mesa con sesiones no se puede borrar
    mesa = models.ForeignKey(
        'mesas.Mesa',
        on_delete=models.PROTECT,
        related_name='sesiones_cliente'
    )

    alias = models.CharField(_('Nombre'), max_length=50)
    # QR con el que entró (o con el que se reconectó). Si la mesa regeneró su QR después, a esta sesión
    # no se le devuelve el QR nuevo (regenerar el QR corta el acceso a quien tenga una cookie vieja)
    qr_entrada = models.CharField(_('QR con el que entró'), max_length=255, blank=True, default='')
    token_cookie = models.CharField(
        _('Token de la cookie'),
        max_length=64,
        unique=True,
        db_index=True,
        default=generar_token_cookie,
        editable=False
    )
    estado = models.CharField(
        _('Estado'),
        max_length=10,
        choices=ESTADO_CHOICES,
        default='activa',
        db_index=True
    )

    # Apunta a la sesión FUNDADORA del grupo; null = esta sesión funda su propio grupo
    grupo = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='miembros'
    )

    fecha_inicio = models.DateTimeField(_('Inicio'), default=timezone.now)
    ultima_actividad = models.DateTimeField(_('Última actividad'), default=timezone.now, db_index=True)
    pagada_at = models.DateTimeField(_('Pagada en'), null=True, blank=True)
    cerrada_at = models.DateTimeField(_('Cerrada en'), null=True, blank=True)
    motivo_cierre = models.CharField(
        _('Motivo de cierre'),
        max_length=20,
        choices=MOTIVO_CIERRE_CHOICES,
        blank=True
    )

    # Recuperación de cookie perdida (código que da el personal)
    codigo_reconexion = models.CharField(_('Código de reconexión'), max_length=4, blank=True)
    codigo_expira_at = models.DateTimeField(_('Código expira en'), null=True, blank=True)
    codigo_intentos = models.PositiveSmallIntegerField(_('Intentos del código'), default=0)

    class Meta:
        verbose_name = _('Sesión de cliente')
        verbose_name_plural = _('Sesiones de clientes')
        ordering = ['fecha_inicio']
        indexes = [
            models.Index(fields=['mesa', 'estado']),
        ]

    def __str__(self):
        return f"{self.alias} · Mesa {self.mesa.number} ({self.get_estado_display()})"

    def save(self, *args, **kwargs):
        # Red de seguridad: el alias siempre se guarda normalizado (sin invisibles, MAYÚSCULAS, máx. 50)
        self.alias = limpiar_alias(self.alias)
        super().save(*args, **kwargs)

    @property
    def grupo_key(self):
        """Id de la fundadora del grupo (la propia sesión si funda su grupo)"""
        return self.grupo_id or self.id

    def qr_vigente(self):
        """QR actual de la mesa solo si esta sesión lo conoce (entró o se reconectó con él); si la mesa
        regeneró su QR después, None: una cookie vieja no debe servir para conseguir el QR nuevo."""
        qr = self.mesa.qr_code
        return qr if self.qr_entrada and self.qr_entrada == qr else None

    def sesiones_de_grupo(self):
        """Sesiones ACTIVAS de la misma mesa que pertenecen a mi grupo (fundadora incluida)"""
        key = self.grupo_key
        return SesionCliente.objects.filter(
            mesa_id=self.mesa_id,
            estado='activa',
        ).filter(Q(id=key) | Q(grupo_id=key))


class SolicitudUnion(models.Model):
    """Pedido de una sesión para unirse al grupo de otra (aprobación sin bloqueo)"""

    ESTADO_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('aceptada', 'Aceptada'),
        ('rechazada', 'Rechazada'),
        ('expirada', 'Expirada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Solicitante
    sesion = models.ForeignKey(
        SesionCliente,
        on_delete=models.CASCADE,
        related_name='solicitudes_union'
    )
    # Fundadora del grupo destino
    grupo = models.ForeignKey(
        SesionCliente,
        on_delete=models.CASCADE,
        related_name='solicitudes_recibidas'
    )
    estado = models.CharField(
        _('Estado'),
        max_length=10,
        choices=ESTADO_CHOICES,
        default='pendiente',
        db_index=True
    )
    created_at = models.DateTimeField(_('Creada'), default=timezone.now)
    resuelta_at = models.DateTimeField(_('Resuelta en'), null=True, blank=True)
    resuelta_por = models.ForeignKey(
        SesionCliente,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+'
    )

    class Meta:
        verbose_name = _('Solicitud para unirse')
        verbose_name_plural = _('Solicitudes para unirse')
        ordering = ['created_at']

    def __str__(self):
        return f"{self.sesion.alias} → grupo de {self.grupo.alias} ({self.get_estado_display()})"


class SolicitudPago(models.Model):
    """Cuenta pedida por un comensal (individual o de su grupo) o cobro hecho por el personal"""

    TIPO_CHOICES = [
        ('individual', 'Individual'),
        ('grupal', 'Grupal'),
    ]

    METODO_CHOICES = [
        ('efectivo', 'Efectivo'),
        ('tarjeta', 'Tarjeta'),
        ('transferencia', 'Transferencia'),
    ]

    ESTADO_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('procesada', 'Procesada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='solicitudes_pago',
        db_index=True
    )
    mesa = models.ForeignKey(
        'mesas.Mesa',
        on_delete=models.PROTECT,
        related_name='solicitudes_pago'
    )
    tipo = models.CharField(_('Tipo'), max_length=10, choices=TIPO_CHOICES, default='individual')
    # Fundadora del grupo al que corresponde la cuenta
    grupo = models.ForeignKey(
        SesionCliente,
        on_delete=models.PROTECT,
        related_name='solicitudes_pago_grupo'
    )
    # null si la crea el personal al cobrar
    solicitada_por = models.ForeignKey(
        SesionCliente,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+'
    )
    sesiones_cubiertas = models.ManyToManyField(
        SesionCliente,
        related_name='solicitudes_pago',
        blank=True
    )

    subtotal = models.DecimalField(_('Subtotal'), max_digits=12, decimal_places=2, default=0)
    iva = models.DecimalField(_('IVA'), max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(_('Total'), max_digits=12, decimal_places=2, default=0)

    metodo_preferido = models.CharField(
        _('Método preferido'),
        max_length=20,
        choices=METODO_CHOICES,
        blank=True
    )
    # Método real, al procesar el cobro
    metodo_pago = models.CharField(_('Método de pago'), max_length=20, blank=True)

    estado = models.CharField(
        _('Estado'),
        max_length=10,
        choices=ESTADO_CHOICES,
        default='pendiente',
        db_index=True
    )
    created_at = models.DateTimeField(_('Creada'), default=timezone.now)
    procesada_at = models.DateTimeField(_('Procesada en'), null=True, blank=True)
    procesada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+'
    )

    class Meta:
        verbose_name = _('Solicitud de pago')
        verbose_name_plural = _('Solicitudes de pago')
        ordering = ['created_at']

    def __str__(self):
        return f"Cuenta {self.get_tipo_display().lower()} · Mesa {self.mesa.number} · ${self.total}"


class AlertaMesero(models.Model):
    """Aviso al personal: llamar al mesero, pedir la cuenta o mensaje del sistema"""

    TIPO_CHOICES = [
        ('ayuda', 'Ayuda'),
        ('cuenta', 'Cuenta'),
        ('personalizado', 'Personalizado'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='alertas_mesero',
        db_index=True
    )
    mesa = models.ForeignKey(
        'mesas.Mesa',
        on_delete=models.CASCADE,
        related_name='alertas'
    )
    # null = alerta del sistema (p. ej. saldo pendiente tras un cobro parcial)
    sesion = models.ForeignKey(
        SesionCliente,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='alertas'
    )
    tipo = models.CharField(_('Tipo'), max_length=15, choices=TIPO_CHOICES, default='ayuda')
    mensaje = models.TextField(_('Mensaje'), blank=True)
    atendida = models.BooleanField(_('Atendida'), default=False, db_index=True)
    atendida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+'
    )
    created_at = models.DateTimeField(_('Creada'), default=timezone.now)
    atendida_at = models.DateTimeField(_('Atendida en'), null=True, blank=True)

    class Meta:
        verbose_name = _('Alerta al mesero')
        verbose_name_plural = _('Alertas al mesero')
        ordering = ['created_at']

    def __str__(self):
        return f"{self.get_tipo_display()} · Mesa {self.mesa.number}"
