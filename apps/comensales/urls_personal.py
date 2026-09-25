"""Rutas del personal para las sesiones QR de las mesas (/api/v1/comensales/). Auth JWT."""
from django.urls import path

from . import views_personal as views

urlpatterns = [
    path('mesas/<uuid:mesa_id>/', views.MesaDetalleView.as_view(), name='comensales-mesa'),
    path('mesas/<uuid:mesa_id>/cobrar/', views.MesaCobrarView.as_view(), name='comensales-mesa-cobrar'),
    path('mesas/<uuid:mesa_id>/cerrar/', views.MesaCerrarView.as_view(), name='comensales-mesa-cerrar'),
    path('sesiones/<uuid:sesion_id>/codigo/', views.SesionCodigoView.as_view(), name='comensales-sesion-codigo'),
    path('alertas/', views.AlertasView.as_view(), name='comensales-alertas'),
    path('alertas/<uuid:alerta_id>/atender/', views.AlertaAtenderView.as_view(), name='comensales-alerta-atender'),
    path('resumen/', views.ResumenView.as_view(), name='comensales-resumen'),
]
