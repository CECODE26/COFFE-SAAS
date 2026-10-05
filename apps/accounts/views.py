from rest_framework import viewsets, status, views
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import User
from .serializers import (
    UserSerializer, UserCreateSerializer, CustomTokenObtainPairSerializer,
    DistribuidorRegistrationSerializer, UserUpdateSerializer,
    ChangePasswordSerializer
)
from .permissions import (
    CanCreateUser, CanManageUser, IsOwnUser, IsSuperAdmin, IsTenantMember
)


class CustomTokenObtainPairView(TokenObtainPairView):
    """Login con email y password"""
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]
    # Frena intentos de adivinar contraseñas (por IP real, con NUM_PROXIES)
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)

        if response.status_code == 200:
            user = User.objects.get(email=request.data.get('email'))
            user.update_last_login()

            # Add user data to response
            response.data['user'] = UserSerializer(user).data

        return response


class DistribuidorRegistrationView(views.APIView):
    """
    Alta de un distribuidor y su administrador en un paso. Ya no es un registro público:
    los distribuidores los crea el super admin (jerarquía de la plataforma).
    """
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'registro'

    def post(self, request):
        serializer = DistribuidorRegistrationSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        result = serializer.save()
        tenant = result['tenant']
        user = result['user']

        # Sin tokens del usuario nuevo: quien llama es el super admin, no el distribuidor
        return Response({
            'status': 'success',
            'message': 'Distribuidor registrado exitosamente',
            'data': {
                'user': UserSerializer(user).data,
                'tenant': {
                    'id': str(tenant.id),
                    'name': tenant.name,
                    'slug': tenant.slug,
                    'plan': tenant.plan,
                }
            }
        }, status=status.HTTP_201_CREATED)


class UserViewSet(viewsets.ModelViewSet):
    """CRUD de Usuarios - Multi-tenant"""
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['email', 'first_name', 'last_name', 'phone']
    ordering_fields = ['created_at', 'email', 'role']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action == 'create':
            # Qué rol puede asignar cada creador lo valida UserCreateSerializer
            return [IsAuthenticated(), CanCreateUser()]
        elif self.action in ['update', 'partial_update']:
            # Su propio perfil, o el personal que administra (cafe_admin: solo el de su local)
            return [IsAuthenticated(), (IsOwnUser | CanManageUser)()]
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsOwnUser()]
        elif self.action in ['activate', 'deactivate']:
            # Aquí no se aplican los permission_classes del @action: este método manda
            return [IsAuthenticated(), CanManageUser()]
        return [IsAuthenticated(), IsTenantMember()]

    def get_queryset(self):
        """Filtrar usuarios por tenant del usuario actual"""
        user = self.request.user

        if user.role == 'super_admin':
            return User.objects.all()

        if user.role == 'distribuidor_admin':
            return User.objects.filter(tenant=user.tenant)

        # Otros roles (incluido cafe_admin) solo ven usuarios de su cafetería y de su tenant
        if user.cafeteria_id:
            return User.objects.filter(cafeteria_id=user.cafeteria_id, tenant_id=user.tenant_id)

        return User.objects.filter(id=user.id)

    def perform_create(self, serializer):
        """Crear usuario con tenant del request"""
        serializer.save()

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        """Obtener perfil del usuario actual"""
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def change_password(self, request):
        """Cambiar contraseña del usuario actual"""
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            old_password = serializer.validated_data['old_password']
            new_password = serializer.validated_data['new_password']

            if not request.user.check_password(old_password):
                return Response(
                    {'error': 'Contraseña actual incorrecta'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            request.user.set_password(new_password)
            request.user.save()

            return Response(
                {'status': 'success', 'message': 'Contraseña actualizada'},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(
        detail=True, methods=['post'],
        permission_classes=[IsAuthenticated, CanManageUser]
    )
    def activate(self, request, pk=None):
        """Activar usuario"""
        user = self.get_object()
        user.is_active = True
        user.save()
        return Response(
            {'status': 'success', 'message': 'Usuario activado'},
            status=status.HTTP_200_OK
        )

    @action(
        detail=True, methods=['post'],
        permission_classes=[IsAuthenticated, CanManageUser]
    )
    def deactivate(self, request, pk=None):
        """Desactivar usuario"""
        user = self.get_object()
        user.is_active = False
        user.save()
        return Response(
            {'status': 'success', 'message': 'Usuario desactivado'},
            status=status.HTTP_200_OK
        )
