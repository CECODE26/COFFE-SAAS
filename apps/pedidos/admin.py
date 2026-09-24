from django.contrib import admin
from django.utils.html import format_html
from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    """Items inline en Order"""
    model = OrderItem
    extra = 0
    fields = ['menu_item', 'quantity', 'unit_price', 'special_price', 'status', 'notes']
    readonly_fields = ['menu_item', 'quantity', 'unit_price']


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = [
        'order_number', 'cafeteria', 'get_status_badge', 'get_type_badge',
        'total', 'is_paid', 'created_by', 'created_at'
    ]
    list_filter = ['status', 'order_type', 'is_paid', 'payment_method', 'created_at', 'cafeteria']
    search_fields = ['order_number', 'customer_name', 'customer_phone']
    ordering = ['-created_at']
    readonly_fields = ['id', 'order_number', 'subtotal', 'tax', 'total', 'created_at', 'updated_at', 'confirmed_at', 'completed_at']

    inlines = [OrderItemInline]

    fieldsets = (
        ('Información Básica', {
            'fields': ('id', 'order_number', 'tenant', 'cafeteria', 'created_by')
        }),
        ('Tipo de Pedido', {
            'fields': ('order_type', 'mesa', 'customer_name', 'customer_phone', 'customer_address')
        }),
        ('Estado', {
            'fields': ('status',)
        }),
        ('Montos', {
            'fields': ('subtotal', 'tax', 'discount', 'total')
        }),
        ('Pago', {
            'fields': ('payment_method', 'is_paid', 'paid_at')
        }),
        ('Notas', {
            'fields': ('notes', 'kitchen_notes'),
            'classes': ('collapse',)
        }),
        ('Fechas', {
            'fields': ('created_at', 'confirmed_at', 'completed_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_status_badge(self, obj):
        colors = {
            'pendiente': '#FFC107',
            'confirmada': '#17A2B8',
            'preparando': '#FF6B6B',
            'lista': '#28A745',
            'entregada': '#20C997',
            'cancelada': '#6C757D',
        }
        color = colors.get(obj.status, '#6C757D')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; border-radius: 3px;">{}</span>',
            color,
            obj.get_status_display()
        )
    get_status_badge.short_description = 'Estado'

    def get_type_badge(self, obj):
        return obj.get_order_type_display()
    get_type_badge.short_description = 'Tipo'


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = [
        'order', 'menu_item', 'quantity', 'unit_price', 'special_price',
        'status', 'created_at'
    ]
    list_filter = ['status', 'order__cafeteria', 'created_at']
    search_fields = ['order__order_number', 'menu_item__name']
    ordering = ['-created_at']
    readonly_fields = ['id', 'created_at', 'completed_at', 'updated_at']

    fieldsets = (
        ('Pedido e Item', {
            'fields': ('id', 'order', 'menu_item')
        }),
        ('Cantidad y Precio', {
            'fields': ('quantity', 'unit_price', 'special_price')
        }),
        ('Estado', {
            'fields': ('status',)
        }),
        ('Notas', {
            'fields': ('notes',)
        }),
        ('Fechas', {
            'fields': ('created_at', 'completed_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
