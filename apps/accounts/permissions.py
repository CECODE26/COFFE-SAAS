from rest_framework import permissions


class IsSuperAdmin(permissions.BasePermission):
    """Solo super admins"""
    message = "Solo super administradores pueden acceder a este recurso."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == 'super_admin'
        )


class IsTenantMember(permissions.BasePermission):
    """Usuario pertenece al tenant"""
    message = "No perteneces a este tenant."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.tenant_id is not None
        )

    def has_object_permission(self, request, view, obj):
        if hasattr(obj, 'tenant_id'):
            return request.user.tenant_id == obj.tenant_id
        return True


class IsDistribuidorAdmin(permissions.BasePermission):
    """Admin de Distribuidor"""
    message = "Solo administradores del distribuidor pueden acceder."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in ['super_admin', 'distribuidor_admin']
        )

    def has_object_permission(self, request, view, obj):
        if request.user.role == 'super_admin':
            return True

        if hasattr(obj, 'tenant_id'):
            return request.user.tenant_id == obj.tenant_id

        return False


class IsCafeAdmin(permissions.BasePermission):
    """Admin de Cafetería o Distribuidor"""
    message = "No tienes permisos para acceder a esta cafetería."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [
                'super_admin', 'distribuidor_admin', 'cafe_admin'
            ]
        )

    def has_object_permission(self, request, view, obj):
        if request.user.role == 'super_admin':
            return True

        if request.user.role == 'distribuidor_admin':
            if hasattr(obj, 'tenant_id'):
                return request.user.tenant_id == obj.tenant_id

        if request.user.role == 'cafe_admin':
            if hasattr(obj, 'id'):
                return request.user.cafeteria_id == obj.id

        return False


class IsCafeUser(permissions.BasePermission):
    """Usuario de Cafetería (camarero, cajero, etc)"""
    message = "No tienes permisos para acceder a esta cafetería."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.cafeteria_id is not None
        )

    def has_object_permission(self, request, view, obj):
        if request.user.role == 'super_admin':
            return True

        if hasattr(obj, 'cafeteria_id'):
            return request.user.cafeteria_id == obj.cafeteria_id

        return False


class CanCreateCafeteria(permissions.BasePermission):
    """Verificar si puede crear más cafeterías"""
    message = "Has alcanzado el límite de cafeterías para tu plan."

    def has_permission(self, request, view):
        if request.user.role == 'super_admin':
            return True

        if request.user.role != 'distribuidor_admin':
            return False

        tenant = request.user.tenant
        return tenant and tenant.can_create_cafe()


class CanCreateUser(permissions.BasePermission):
    """Verificar si puede crear más usuarios"""
    message = "Has alcanzado el límite de usuarios para tu plan."

    def has_permission(self, request, view):
        if request.user.role == 'super_admin':
            return True

        if request.user.role != 'distribuidor_admin':
            return False

        tenant = request.user.tenant
        return tenant and tenant.can_create_user()


class IsTenantOwner(permissions.BasePermission):
    """El usuario es propietario del tenant (distribuidor)"""
    message = "No eres administrador de este distribuidor."

    def has_object_permission(self, request, view, obj):
        if request.user.role == 'super_admin':
            return True

        return (
            request.user.role == 'distribuidor_admin' and
            request.user.tenant_id == obj.id
        )


class IsOwnUser(permissions.BasePermission):
    """El usuario solo puede editar su propio perfil"""
    message = "No puedes editar el perfil de otro usuario."

    def has_object_permission(self, request, view, obj):
        if request.user.role == 'super_admin':
            return True

        if request.user.role == 'distribuidor_admin':
            return request.user.tenant_id == obj.tenant_id

        return request.user.id == obj.id
