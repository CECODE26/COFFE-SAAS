from django.contrib import admin
from django.utils.html import format_html
from .models import Mesa, Reserva


@admin.register(Mesa)
class MesaAdmin(admin.ModelAdmin):
    list_display = [
        'number', 'cafeteria', 'get_status_badge', 'capacity',
        'guest_count', 'location', 'is_active', 'created_at'
    ]
    list_filter = ['cafeteria', 'status', 'is_active', 'created_at', 'location']
    search_fields = ['number', 'description', 'qr_code']
    ordering = ['cafeteria', 'number']
    readonly_fields = ['id', 'qr_code', 'created_at', 'updated_at', 'slug', 'get_qr_code_display']

    fieldsets = (
        ('Información Básica', {
            'fields': ('id', 'cafeteria', 'tenant', 'number', 'slug')
        }),
        ('Detalles', {
            'fields': ('description', 'location', 'capacity', 'min_capacity')
        }),
        ('QR', {
            'fields': ('qr_code', 'get_qr_code_display')
        }),
        ('Estado', {
            'fields': ('status', 'is_active')
        }),
        ('Sesión Actual', {
            'fields': ('current_order', 'guest_count', 'occupied_since'),
            'classes': ('collapse',)
        }),
        ('Fechas', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_status_badge(self, obj):
        colors = {
            'disponible': '#28A745',
            'ocupada': '#FF6B6B',
            'reservada': '#FFC107',
            'limpiando': '#17A2B8',
            'mantenimiento': '#6C757D',
        }
        color = colors.get(obj.status, '#6C757D')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; border-radius: 3px;">{}</span>',
            color,
            obj.get_status_display()
        )
    get_status_badge.short_description = 'Estado'

    def get_qr_code_display(self, obj):
        if obj.qr_code:
            return format_html(
                '<code style="font-family: monospace; background-color: #f5f5f5; padding: 5px; border-radius: 3px;">{}</code>',
                obj.qr_code
            )
        return '-'
    get_qr_code_display.short_description = 'Código QR'


@admin.register(Reserva)
class ReservaAdmin(admin.ModelAdmin):
    list_display = [
        'customer_name', 'mesa', 'reservation_date', 'reservation_time',
        'guest_count', 'get_status_badge', 'customer_phone'
    ]
    list_filter = ['status', 'reservation_date', 'mesa__cafeteria', 'created_at']
    search_fields = ['customer_name', 'customer_phone', 'customer_email']
    ordering = ['-reservation_date', '-reservation_time']
    readonly_fields = ['id', 'created_at', 'updated_at', 'confirmed_at', 'completed_at', 'cancelled_at']

    fieldsets = (
        ('Información del Cliente', {
            'fields': ('id', 'customer_name', 'customer_phone', 'customer_email')
        }),
        ('Reserva', {
            'fields': ('mesa', 'guest_count', 'reservation_date', 'reservation_time')
        }),
        ('Estado', {
            'fields': ('status',)
        }),
        ('Notas', {
            'fields': ('notes',)
        }),
        ('Fechas', {
            'fields': ('created_at', 'confirmed_at', 'completed_at', 'cancelled_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_status_badge(self, obj):
        colors = {
            'pendiente': '#FFC107',
            'confirmada': '#28A745',
            'cancelada': '#DC3545',
            'completada': '#20C997',
        }
        color = colors.get(obj.status, '#6C757D')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; border-radius: 3px;">{}</span>',
            color,
            obj.get_status_display()
        )
    get_status_badge.short_description = 'Estado'
