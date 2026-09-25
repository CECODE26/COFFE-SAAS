from django.contrib import admin

from .models import RegistroAuditoria, SolicitudDatos


@admin.register(SolicitudDatos)
class SolicitudDatosAdmin(admin.ModelAdmin):
    list_display = ['codigo', 'tipo', 'nombre', 'email', 'estado', 'created_at', 'fecha_limite']
    list_filter = ['estado', 'tipo', 'relacion']
    search_fields = ['codigo', 'nombre', 'email', 'identificacion']
    readonly_fields = ['codigo', 'ip', 'created_at', 'fecha_limite', 'resuelta_at', 'updated_at']


@admin.register(RegistroAuditoria)
class RegistroAuditoriaAdmin(admin.ModelAdmin):
    """Bitácora de solo lectura"""
    list_display = ['created_at', 'accion', 'objeto_tipo', 'objeto_id', 'usuario', 'tenant']
    list_filter = ['accion', 'objeto_tipo', 'tenant']
    search_fields = ['accion', 'objeto_id', 'usuario__email']
    list_select_related = ['usuario', 'tenant']
    readonly_fields = ['id', 'tenant', 'usuario', 'accion', 'objeto_tipo', 'objeto_id', 'detalle', 'created_at']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
