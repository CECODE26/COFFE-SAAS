import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from apps.tenants.models import Tenant


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('El email es requerido')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'super_admin')
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Usuario multi-tenant"""

    ROLE_CHOICES = [
        ('super_admin', 'Super Administrador'),
        ('distribuidor_admin', 'Admin Distribuidor'),
        ('cafe_admin', 'Admin Cafetería'),
        ('gerente', 'Gerente'),
        ('camarero', 'Camarero'),
        ('cajero', 'Cajero'),
        ('cocinero', 'Cocinero'),
        ('usuario', 'Usuario'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(_('Email'), unique=True, db_index=True)
    phone = models.CharField(_('Teléfono'), max_length=20, blank=True)

    first_name = models.CharField(_('Nombre'), max_length=150)
    last_name = models.CharField(_('Apellido'), max_length=150)

    # Multi-tenant
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='users',
        null=True,
        blank=True,
        db_index=True
    )
    cafeteria = models.ForeignKey(
        'cafeterias.Cafeteria',
        on_delete=models.SET_NULL,
        related_name='users',
        null=True,
        blank=True,
        db_index=True
    )

    role = models.CharField(_('Rol'), max_length=20, choices=ROLE_CHOICES, default='usuario')

    # Status
    is_active = models.BooleanField(_('Activo'), default=True)
    is_staff = models.BooleanField(_('Es Staff'), default=False)

    # Dates
    created_at = models.DateTimeField(_('Creado'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Actualizado'), auto_now=True)
    last_login = models.DateTimeField(_('Último Login'), null=True, blank=True)

    # Settings
    language = models.CharField(_('Idioma'), max_length=10, default='es', choices=[('es', 'Español'), ('en', 'English')])
    timezone = models.CharField(_('Zona Horaria'), max_length=50, default='America/Guayaquil')

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta:
        verbose_name = _('Usuario')
        verbose_name_plural = _('Usuarios')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'email']),
            models.Index(fields=['tenant', 'role']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.get_full_name()} ({self.email})"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def is_super_admin(self):
        return self.role == 'super_admin'

    def is_distribuidor_admin(self):
        return self.role == 'distribuidor_admin'

    def is_cafe_admin(self):
        return self.role == 'cafe_admin'

    def update_last_login(self):
        self.last_login = timezone.now()
        self.save(update_fields=['last_login'])
