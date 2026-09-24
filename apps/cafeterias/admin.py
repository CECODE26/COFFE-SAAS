from django.contrib import admin
from .models import Cafeteria


@admin.register(Cafeteria)
class CafeteriaAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'city', 'capacity', 'max_tables', 'get_active_users_count', 'is_active', 'created_at']
    list_filter = ['tenant', 'city', 'is_active', 'created_at']
    search_fields = ['name', 'city', 'email', 'phone', 'address']
    ordering = ['-created_at']
    readonly_fields = ['id', 'created_at', 'updated_at']

    fieldsets = (
        ('Información Básica', {
            'fields': ('id', 'tenant', 'name', 'slug', 'description')
        }),
        ('Ubicación', {
            'fields': ('address', 'city', 'postal_code')
        }),
        ('Contacto', {
            'fields': ('phone', 'email')
        }),
        ('Datos Comerciales', {
            'fields': ('ruc', 'registration_number')
        }),
        ('Capacidad', {
            'fields': ('max_tables', 'capacity', 'open_time', 'close_time')
        }),
        ('Media', {
            'fields': ('logo', 'banner'),
            'classes': ('collapse',)
        }),
        ('Estado', {
            'fields': ('is_active',)
        }),
        ('Fechas', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_active_users_count(self, obj):
        return obj.get_active_users_count()
    get_active_users_count.short_description = 'Usuarios Activos'
