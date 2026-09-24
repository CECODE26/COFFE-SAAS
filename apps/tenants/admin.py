from django.contrib import admin
from .models import Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'ruc', 'plan', 'status', 'get_active_cafes_count', 'get_active_users_count', 'is_active', 'created_at']
    list_filter = ['plan', 'status', 'is_active', 'created_at']
    search_fields = ['name', 'email', 'ruc', 'business_name']
    ordering = ['-created_at']
    readonly_fields = ['id', 'created_at', 'updated_at']

    fieldsets = (
        ('Información Básica', {
            'fields': ('id', 'name', 'slug', 'description')
        }),
        ('Contacto', {
            'fields': ('email', 'phone', 'address', 'city')
        }),
        ('Datos Comerciales', {
            'fields': ('ruc', 'business_name', 'website', 'logo')
        }),
        ('Plan y Límites', {
            'fields': ('plan', 'max_cafes', 'max_users', 'subscription_expires_at')
        }),
        ('Estado', {
            'fields': ('status', 'is_active')
        }),
        ('Fechas', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_active_cafes_count(self, obj):
        return obj.get_active_cafes_count()
    get_active_cafes_count.short_description = 'Cafeterías Activas'

    def get_active_users_count(self, obj):
        return obj.get_active_users_count()
    get_active_users_count.short_description = 'Usuarios Activos'
