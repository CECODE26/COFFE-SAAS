from django.utils.deprecation import MiddlewareMixin
from django.http import HttpResponseForbidden
from .models import Tenant


class TenantMiddleware(MiddlewareMixin):
    """
    Middleware para resolver el tenant del request.
    Soporta múltiples formas de identificar el tenant:
    1. Header X-Tenant-ID
    2. Query param tenant_id
    3. Dominio (subdomain)
    4. Usuario autenticado
    """

    def process_request(self, request):
        tenant_id = self._resolve_tenant(request)

        if tenant_id:
            try:
                request.tenant = Tenant.objects.get(id=tenant_id, is_active=True)
            except Tenant.DoesNotExist:
                return HttpResponseForbidden('Tenant no encontrado o inactivo')
        else:
            request.tenant = None

        return None

    def _resolve_tenant(self, request):
        # 1. Desde header X-Tenant-ID
        tenant_id = request.META.get('HTTP_X_TENANT_ID')
        if tenant_id:
            return tenant_id

        # 2. Desde query parameter
        tenant_id = request.GET.get('tenant_id')
        if tenant_id:
            return tenant_id

        # 3. Desde usuario autenticado
        if request.user and request.user.is_authenticated:
            return request.user.tenant_id

        # 4. Desde dominio (subdomain)
        host = request.get_host().split(':')[0]
        if host not in ['localhost', '127.0.0.1']:
            subdomain = host.split('.')[0]
            if subdomain and subdomain not in ['api', 'app', 'www', 'admin']:
                try:
                    tenant = Tenant.objects.get(slug=subdomain)
                    return tenant.id
                except Tenant.DoesNotExist:
                    pass

        return None
