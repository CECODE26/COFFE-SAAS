import ipaddress

from rest_framework import generics, mixins, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.permissions import IsSuperAdmin
from .models import SolicitudDatos
from .serializers import SolicitudDatosPublicaSerializer, SolicitudDatosSerializer


class SolicitudDatosPublicaView(generics.CreateAPIView):
    """Cualquier persona puede ejercer sus derechos sin tener cuenta"""
    serializer_class = SolicitudDatosPublicaSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'solicitudes_datos'

    def perform_create(self, serializer):
        # Misma IP que usa el límite de DRF: con NUM_PROXIES toma la que agregó nuestro proxy,
        # no el primer valor de X-Forwarded-For (ese lo puede inventar cualquiera)
        ip = ScopedRateThrottle().get_ident(self.request)
        try:
            ip = str(ipaddress.ip_address(ip.strip()))
        except (ValueError, AttributeError):
            # Sin NUM_PROXIES, DRF puede devolver la cadena completa de X-Forwarded-For: usamos la conexión directa
            ip = self.request.META.get('REMOTE_ADDR')
        serializer.save(ip=ip or None)


class SolicitudDatosViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    """Bandeja de solicitudes para el Super Admin"""
    queryset = SolicitudDatos.objects.all()
    serializer_class = SolicitudDatosSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    filterset_fields = ['estado', 'tipo']
    search_fields = ['codigo', 'nombre', 'email', 'identificacion']
    http_method_names = ['get', 'patch', 'head', 'options']
