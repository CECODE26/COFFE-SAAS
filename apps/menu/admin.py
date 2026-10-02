from django import forms
from django.contrib import admin
from django.db import transaction
from django.utils.html import format_html

from .imagenes import ImagenInvalida, aplicar_imagen, procesar_imagen, quitar_imagen
from .models import Category, MenuItem


class MenuItemAdminForm(forms.ModelForm):
    """La foto subida desde el admin pasa por el mismo proceso que la API (WebP, sin EXIF, miniatura)"""
    foto = forms.FileField(label='Subir/reemplazar foto', required=False)
    quitar_foto = forms.BooleanField(label='Quitar la foto', required=False)

    class Meta:
        model = MenuItem
        exclude = ['image', 'image_thumb']

    def clean_foto(self):
        archivo = self.cleaned_data.get('foto')
        if not archivo:
            return None
        try:
            return procesar_imagen(archivo)
        except ImagenInvalida as error:
            raise forms.ValidationError(str(error))


class MenuItemInline(admin.TabularInline):
    """Items inline en Category"""
    model = MenuItem
    extra = 0
    fields = ['name', 'price', 'cost', 'is_available', 'preparation_time']


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'icon', 'order', 'get_items_count', 'is_active']
    list_filter = ['tenant', 'is_active']
    search_fields = ['name', 'description']
    ordering = ['order', 'name']
    readonly_fields = ['id', 'created_at', 'updated_at']

    inlines = [MenuItemInline]

    fieldsets = (
        ('Información Básica', {
            'fields': ('id', 'tenant', 'name', 'slug', 'description')
        }),
        ('Visualización', {
            'fields': ('icon', 'order', 'is_active')
        }),
        ('Fechas', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_items_count(self, obj):
        return obj.items.count()
    get_items_count.short_description = 'Items'


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'tenant', 'category', 'get_price_display',
        'is_available', 'preparation_time', 'get_dietary_badges'
    ]
    list_filter = [
        'tenant', 'category', 'is_available', 'is_active',
        'is_vegetarian', 'is_vegan', 'has_gluten'
    ]
    search_fields = ['name', 'description']
    ordering = ['category', 'name']
    readonly_fields = ['id', 'created_at', 'updated_at', 'get_profit_margin', 'get_foto']
    form = MenuItemAdminForm

    fieldsets = (
        ('Información Básica', {
            'fields': ('id', 'tenant', 'category', 'name', 'slug', 'description')
        }),
        ('Foto', {
            'fields': ('get_foto', 'foto', 'quitar_foto')
        }),
        ('Precios', {
            'fields': ('price', 'cost', 'get_profit_margin')
        }),
        ('Disponibilidad', {
            'fields': ('is_available', 'is_active', 'preparation_time')
        }),
        ('Información Dietética', {
            'fields': ('is_vegetarian', 'is_vegan', 'has_gluten')
        }),
        ('Fechas', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def save_model(self, request, obj, form, change):
        with transaction.atomic():
            super().save_model(request, obj, form, change)
            procesada = form.cleaned_data.get('foto')
            if procesada:
                aplicar_imagen(obj, procesada)
            elif form.cleaned_data.get('quitar_foto') and (obj.image or obj.image_thumb):
                quitar_imagen(obj)

    def get_foto(self, obj):
        if not obj.image_thumb:
            return '-'
        return format_html('<img src="{}" style="max-height: 120px; border-radius: 6px;">', obj.image_thumb.url)
    get_foto.short_description = 'Foto actual'

    def get_price_display(self, obj):
        return f"${obj.price}"
    get_price_display.short_description = 'Precio'

    def get_dietary_badges(self, obj):
        badges = []
        if obj.is_vegetarian:
            badges.append(format_html(
                '<span style="background-color: #90EE90; padding: 2px 6px; border-radius: 3px; margin-right: 5px;">🥗 Vegetariano</span>'
            ))
        if obj.is_vegan:
            badges.append(format_html(
                '<span style="background-color: #FFB6C1; padding: 2px 6px; border-radius: 3px; margin-right: 5px;">🌱 Vegano</span>'
            ))
        if obj.has_gluten:
            badges.append(format_html(
                '<span style="background-color: #FFA07A; padding: 2px 6px; border-radius: 3px;">⚠️ Contiene Gluten</span>'
            ))
        return format_html(' '.join(str(b) for b in badges)) if badges else '-'
    get_dietary_badges.short_description = 'Dietas'
