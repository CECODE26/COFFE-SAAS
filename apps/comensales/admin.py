from django.contrib import admin

from .models import AlertaMesero, SesionCliente, SolicitudPago, SolicitudUnion


@admin.register(SesionCliente)
class SesionClienteAdmin(admin.ModelAdmin):
    list_display = [
        'alias', 'mesa', 'estado', 'grupo', 'fecha_inicio', 'ultima_actividad',
        'pagada_at', 'cerrada_at', 'motivo_cierre'
    ]
    list_filter = ['estado', 'motivo_cierre', 'mesa__cafeteria']
    search_fields = ['alias', 'mesa__number']
    ordering = ['-fecha_inicio']
    raw_id_fields = ['mesa', 'grupo']
    list_select_related = ['mesa__cafeteria', 'grupo__mesa']
    # El token de la cookie no se muestra (editable=False)
    readonly_fields = ['id', 'fecha_inicio', 'codigo_reconexion', 'codigo_expira_at', 'codigo_intentos']


@admin.register(SolicitudUnion)
class SolicitudUnionAdmin(admin.ModelAdmin):
    list_display = ['sesion', 'grupo', 'estado', 'created_at', 'resuelta_at', 'resuelta_por']
    list_filter = ['estado']
    search_fields = ['sesion__alias', 'grupo__alias']
    ordering = ['-created_at']
    raw_id_fields = ['sesion', 'grupo', 'resuelta_por']
    list_select_related = ['sesion__mesa', 'grupo__mesa', 'resuelta_por__mesa']
    readonly_fields = ['id', 'created_at']


@admin.register(SolicitudPago)
class SolicitudPagoAdmin(admin.ModelAdmin):
    list_display = [
        'mesa', 'tipo', 'grupo', 'solicitada_por', 'total', 'metodo_preferido',
        'metodo_pago', 'estado', 'created_at', 'procesada_at', 'procesada_por'
    ]
    list_filter = ['estado', 'tipo', 'metodo_pago', 'mesa__cafeteria']
    search_fields = ['grupo__alias', 'solicitada_por__alias', 'mesa__number']
    ordering = ['-created_at']
    raw_id_fields = ['mesa', 'grupo', 'solicitada_por', 'procesada_por', 'sesiones_cubiertas']
    list_select_related = ['mesa__cafeteria', 'grupo__mesa', 'solicitada_por__mesa', 'procesada_por']
    readonly_fields = ['id', 'created_at']


@admin.register(AlertaMesero)
class AlertaMeseroAdmin(admin.ModelAdmin):
    list_display = ['mesa', 'tipo', 'sesion', 'mensaje', 'atendida', 'created_at', 'atendida_por', 'atendida_at']
    list_filter = ['tipo', 'atendida', 'mesa__cafeteria']
    search_fields = ['mensaje', 'sesion__alias', 'mesa__number']
    ordering = ['-created_at']
    raw_id_fields = ['mesa', 'sesion', 'atendida_por']
    list_select_related = ['mesa__cafeteria', 'sesion__mesa', 'atendida_por']
    readonly_fields = ['id', 'created_at']
