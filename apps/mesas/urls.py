from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import MesaViewSet, ReservaViewSet

router = DefaultRouter()
router.register(r'mesas', MesaViewSet, basename='mesa')
router.register(r'reservas', ReservaViewSet, basename='reserva')

urlpatterns = [
    path('', include(router.urls)),
]
