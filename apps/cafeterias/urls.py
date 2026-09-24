from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import CafeteriaViewSet

router = DefaultRouter()
router.register(r'', CafeteriaViewSet, basename='cafeteria')

urlpatterns = [
    path('', include(router.urls)),
]
