"""Rutas del cliente que escanea el QR de la mesa (/api/v1/cliente/). Auth por cookie."""
from django.urls import path

from . import views_cliente as views

urlpatterns = [
    path('bienvenida/', views.BienvenidaView.as_view(), name='cliente-bienvenida'),
    path('entrar/', views.EntrarView.as_view(), name='cliente-entrar'),
    path('reconectar/', views.ReconectarView.as_view(), name='cliente-reconectar'),
    path('sesion/', views.SesionView.as_view(), name='cliente-sesion'),
    path('union/<uuid:solicitud_id>/aceptar/', views.UnionAceptarView.as_view(), name='cliente-union-aceptar'),
    path('union/<uuid:solicitud_id>/rechazar/', views.UnionRechazarView.as_view(), name='cliente-union-rechazar'),
    path('menu/', views.MenuView.as_view(), name='cliente-menu'),
    path('pedidos/', views.PedidosView.as_view(), name='cliente-pedidos'),
    path('alertas/', views.AlertasView.as_view(), name='cliente-alertas'),
    path('cuenta/', views.CuentaView.as_view(), name='cliente-cuenta'),
    path('salir/', views.SalirView.as_view(), name='cliente-salir'),
    path('ticket/', views.TicketView.as_view(), name='cliente-ticket'),
]
