from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema')),

    path('api/v1/auth/', include('apps.accounts.urls')),
    path('api/v1/tenants/', include('apps.tenants.urls')),
    path('api/v1/cafeterias/', include('apps.cafeterias.urls')),
    path('api/v1/pedidos/', include('apps.pedidos.urls')),
    path('api/v1/mesas/', include('apps.mesas.urls')),
    path('api/v1/menu/', include('apps.menu.urls')),
    path('api/v1/facturacion/', include('apps.facturacion.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
