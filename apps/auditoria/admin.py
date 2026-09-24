from django.contrib import admin

from .models import SolicitudDatos


@admin.register(SolicitudDatos)
class SolicitudDatosAdmin(admin.ModelAdmin):
    list_display = ['codigo', 'tipo', 'nombre', 'email', 'estado', 'created_at', 'fecha_limite']
    list_filter = ['estado', 'tipo', 'relacion']
    search_fields = ['codigo', 'nombre', 'email', 'identificacion']
    readonly_fields = ['codigo', 'ip', 'created_at', 'fecha_limite', 'resuelta_at', 'updated_at']
