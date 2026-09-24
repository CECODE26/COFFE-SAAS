from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['email', 'get_full_name', 'tenant', 'role', 'is_active', 'created_at']
    list_filter = ['role', 'is_active', 'tenant', 'created_at']
    search_fields = ['email', 'first_name', 'last_name', 'phone']
    ordering = ['-created_at']

    fieldsets = (
        ('Personal', {'fields': ('email', 'first_name', 'last_name', 'phone')}),
        ('Tenant Info', {'fields': ('tenant', 'cafeteria')}),
        ('Rol y Permisos', {'fields': ('role', 'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Configuración', {'fields': ('language', 'timezone')}),
        ('Fechas', {'fields': ('created_at', 'updated_at', 'last_login'), 'classes': ('collapse',)}),
    )

    readonly_fields = ['created_at', 'updated_at', 'last_login']

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2', 'first_name', 'last_name'),
        }),
    )
