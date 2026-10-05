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
            (request.user.role == 'super_admin' or request.user.tenant_id is not None)
        )

    def has_object_permission(self, request, view, obj):
        if request.user.role == 'super_admin':
            return True
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


# Quién crea a quién: super_admin crea distribuidores (tenants) y usuarios de cualquier rol,
# distribuidor_admin solo crea Admin Cafetería y cafe_admin solo el personal de su local.
# El serializer (UserCreateSerializer.ASSIGNABLE_ROLES) decide qué rol puede asignar cada uno.
CREADORES_DE_USUARIOS = ('super_admin', 'distribuidor_admin', 'cafe_admin')
# Personal que gestiona el admin de una cafetería (crear, editar, activar y desactivar)
PERSONAL_DE_CAFETERIA = ('gerente', 'camarero', 'cajero', 'cocinero')


class CanCreateUser(permissions.BasePermission):
    """Puede crear usuarios: rol creador, con tenant (y local, si es cafe_admin) y cupo en el plan"""
    message = "No tienes permisos para crear usuarios."

    def has_permission(self, request, view):
        user = request.user
        if user.role == 'super_admin':
            return True

        if user.role not in CREADORES_DE_USUARIOS or not user.tenant_id:
            return False
        if user.role == 'cafe_admin' and not user.cafeteria_id:
            self.message = "Tu cuenta no tiene una cafetería asignada."
            return False

        if not user.tenant.can_create_user():
            self.message = "Has alcanzado el límite de usuarios para tu plan."
            return False
        return True


class CanManageUser(permissions.BasePermission):
    """
    Editar, activar o desactivar a otro usuario. El alcance lo da UserViewSet.get_queryset
    (tenant o cafetería); aquí se limita qué cuentas puede tocar el admin de cafetería.
    """
    message = "No puedes gestionar a este usuario."

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and
            request.user.role in CREADORES_DE_USUARIOS
        )

    def has_object_permission(self, request, view, obj):
        user = request.user
        if obj.pk == user.pk:
            # Nadie se desactiva a sí mismo (su perfil lo edita con IsOwnUser)
            self.message = "No puedes gestionar tu propia cuenta desde aquí."
            return False
        if user.role == 'super_admin':
            return True
        if user.role == 'distribuidor_admin':
            # Sin tenant no gestiona a nadie (None == None incluiría a los super admins)
            return user.tenant_id is not None and user.tenant_id == obj.tenant_id
        if user.role == 'cafe_admin':
            return (
                obj.role in PERSONAL_DE_CAFETERIA and
                obj.tenant_id == user.tenant_id and
                obj.cafeteria_id is not None and
                obj.cafeteria_id == user.cafeteria_id
            )
        return False


class CanDeleteUser(permissions.BasePermission):
    """
    Eliminar una cuenta: solo el super admin. Los demás gestores la desactivan (CanManageUser).
    Las reglas de negocio (no a sí mismo, no al último super admin activo) las aplica UserViewSet.destroy.
    """
    message = "Solo el super administrador puede eliminar cuentas. Puedes desactivarla en su lugar."

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and
            request.user.role == 'super_admin'
        )


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

        if request.user.id == obj.id:
            return True

        if request.user.role == 'distribuidor_admin':
            # Sin tenant solo su propio perfil (None == None incluiría a los super admins)
            return request.user.tenant_id is not None and request.user.tenant_id == obj.tenant_id

        return False
