from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import SolicitudDatosPublicaView, SolicitudDatosViewSet

router = DefaultRouter()
router.register(r'solicitudes', SolicitudDatosViewSet, basename='solicitud-datos')

urlpatterns = [
    path('solicitar/', SolicitudDatosPublicaView.as_view(), name='solicitud-datos-publica'),
    path('', include(router.urls)),
]
