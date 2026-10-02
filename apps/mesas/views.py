import uuid

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, BasePermission
from django.utils import timezone
from django.db import IntegrityError, transaction
from django.db.models import Q, Count, Sum, Max, ProtectedError

from .models import Mesa, Reserva, generar_token_qr
from .serializers import (
    MesaListSerializer, MesaDetailSerializer, MesaGestionSerializer, MesaCreateSerializer,
    MesaStatusChangeSerializer, MesaStatsSerializer,
    ReservaListSerializer, ReservaDetailSerializer, ReservaCreateSerializer,
    ReservaUpdateSerializer, ROLES_GESTION_LOCAL, mesas_activas_de,
)
from apps.accounts.permissions import IsTenantMember, IsCafeUser
from apps.auditoria.services import registrar
from apps.cafeterias.models import Cafeteria
from apps.comensales.models import SesionCliente


class IsAdminMesas(BasePermission):
    """
    Quienes gestionan las mesas (crear, editar, desactivar/reactivar, borrar, regenerar el QR):
    cafe_admin, gerente, distribuidor_admin y super_admin. El alcance (su local / su tenant) lo da
    MesaViewSet.get_queryset (get_object() devuelve 404 fuera de él).
    """
    message = "Solo el administrador o el gerente del local pueden gestionar las mesas."
    ROLES = ['cafe_admin', 'gerente', 'distribuidor_admin', 'super_admin']

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.ROLES)


def _es_verdadero(valor):
    return str(valor).strip().lower() in ('1', 'true', 'si', 'sí', 'on')


def _error(mensaje):
    return Response({'error': mensaje}, status=status.HTTP_400_BAD_REQUEST)


class IsPersonalReservas(BasePermission):
    """
    Personal que puede crear, confirmar o cancelar reservas: el staff del local
    (cafe_admin, gerente, camarero, cajero, cocinero), distribuidor_admin y super_admin.
    Los clientes (rol 'usuario') quedan fuera. El alcance por local/tenant lo
    da ReservaViewSet.get_queryset (get_object() devuelve 404 fuera de él) y, al crear,
    el queryset de 'mesa' de ReservaCreateSerializer.
    """
    message = "Solo el personal del local puede gestionar las reservas."
    ROLES_LOCAL = ['cafe_admin', 'gerente', 'camarero', 'cajero', 'cocinero']

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.role in ['super_admin', 'distribuidor_admin']:
            return True
        return user.role in self.ROLES_LOCAL and user.cafeteria_id is not None


class MesaViewSet(viewsets.ModelViewSet):
    """CRUD de Mesas"""
    queryset = Mesa.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    search_fields = ['number', 'description', 'location']
    ordering_fields = ['number', 'status', 'capacity']
    # Orden estable (local, número) para que la paginación no repita ni omita mesas.
    # 'id' desempata si dos locales tuvieran el mismo nombre.
    ordering = ['cafeteria__name', 'number', 'id']

    # Acciones que solo hacen quienes gestionan las mesas (IsAdminMesas)
    ACCIONES_GESTION = [
        'create', 'update', 'partial_update', 'destroy',
        'regenerar_qr', 'desactivar', 'reactivar', 'siguiente_numero',
    ]
    # Listados/lecturas de operación: solo mesas activas (el listado admite ?incluir_inactivas=1 para gestión)
    ACCIONES_SOLO_ACTIVAS = ['list', 'available', 'occupied', 'stats', 'by_qr']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return MesaDetailSerializer
        elif self.action == 'create':
            return MesaCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return MesaGestionSerializer
        return MesaListSerializer

    def get_permissions(self):
        if self.action in self.ACCIONES_GESTION:
            return [IsAuthenticated(), IsAdminMesas()]
        elif self.action in ['occupy', 'free', 'cleaning', 'change_status']:
            return [IsAuthenticated(), IsCafeUser()]
        return [IsAuthenticated(), IsTenantMember()]

    def _gestiona_mesas(self):
        return self.request.user.role in IsAdminMesas.ROLES

    def _parametro_de_gestion(self, nombre):
        """Parámetros del listado que solo usan quienes gestionan mesas (para el resto se ignoran)"""
        return (
            self.action == 'list'
            and self._gestiona_mesas()
            and _es_verdadero(self.request.query_params.get(nombre, ''))
        )

    def _incluir_inactivas(self):
        """?incluir_inactivas=1: el listado trae también las desactivadas"""
        return self._parametro_de_gestion('incluir_inactivas')

    def _solo_inactivas(self):
        """?solo_inactivas=1: el listado trae solo las desactivadas (filtro «Desactivadas» del panel)"""
        return self._parametro_de_gestion('solo_inactivas')

    def get_queryset(self):
        """Filtrar mesas por cafetería del usuario"""
        user = self.request.user

        if user.role == 'super_admin':
            queryset = Mesa.objects.all()
        elif user.role == 'distribuidor_admin':
            queryset = Mesa.objects.filter(tenant=user.tenant)
        elif user.cafeteria:
            queryset = Mesa.objects.filter(cafeteria=user.cafeteria)
        else:
            return Mesa.objects.none()

        # Las mesas de locales cerrados (cafeteria.is_active=False) no forman parte de la
        # operación: no se listan ni se pueden ocupar/liberar (get_object() da 404), y
        # stats/available/occupied/by_qr cuentan solo mesas de locales abiertos.
        # Aplica también a super_admin. Las reservas de esos locales siguen en ReservaViewSet.
        queryset = queryset.filter(cafeteria__is_active=True)

        # Las mesas desactivadas no forman parte de la operación (listados, stats, by_qr). Las acciones
        # de detalle sí las encuentran (editar, reactivar, ver): así se pueden gestionar.
        if self._solo_inactivas():
            queryset = queryset.filter(is_active=False)
        elif self.action in self.ACCIONES_SOLO_ACTIVAS and not self._incluir_inactivas():
            queryset = queryset.filter(is_active=True)

        # Orden estable también para las acciones que no pasan por OrderingFilter
        return queryset.select_related('cafeteria', 'current_order').order_by(
            'cafeteria__name', 'number', 'id'
        )

    # ---- Gestión (crear / editar / borrar / desactivar / reactivar) ----

    def create(self, request, *args, **kwargs):
        """Crear mesa: el QR se genera aquí. Responde con la fila de la grilla (MesaListSerializer)"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                mesa = serializer.save()
                registrar(
                    request.user, 'mesa.crear', mesa,
                    numero=mesa.number, cafeteria=mesa.cafeteria.name
                )
        except IntegrityError:
            # Otra persona creó la misma mesa a la vez (el bloqueo del local lo hace casi imposible)
            return Response(
                {'number': [f"Ya existe la mesa {serializer.validated_data['number']} en este local."]},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(MesaListSerializer(mesa).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """Editar número, capacidad, zona o descripción. Desactivar/reactivar va por sus propias acciones."""
        partial = kwargs.pop('partial', False)
        mesa = self.get_object()

        if 'is_active' in request.data and _es_verdadero(request.data.get('is_active')) != mesa.is_active:
            return Response(
                {'is_active': ['Para desactivar o reactivar la mesa usa sus botones (desactivar / reactivar).']},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = self.get_serializer(mesa, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        campos = ['number', 'capacity', 'min_capacity', 'location', 'description']
        antes = {campo: getattr(mesa, campo) for campo in campos}
        mesa = serializer.save()
        cambios = {
            campo: [antes[campo], getattr(mesa, campo)]
            for campo in campos if antes[campo] != getattr(mesa, campo)
        }
        if cambios:
            registrar(
                request.user, 'mesa.editar', mesa,
                numero=mesa.number, cafeteria=mesa.cafeteria.name, cambios=cambios
            )
        return Response(MesaListSerializer(mesa).data)

    def _historial_de(self, mesa):
        """Qué historial tiene la mesa (lista vacía si nunca se usó): pedidos, clientes por QR, cuentas o reservas"""
        historial = []
        if mesa.orders.exists():
            historial.append('pedidos')
        if mesa.sesiones_cliente.exists():
            historial.append('clientes por QR')
        if mesa.solicitudes_pago.exists():
            historial.append('cuentas cobradas')
        if mesa.reservas.exists():
            historial.append('reservas')
        return historial

    def destroy(self, request, *args, **kwargs):
        """
        Borrar mesa. Solo si nunca se usó: con historial (pedidos, clientes por QR o reservas)
        se desactiva en vez de borrarla, para no perder ese historial.
        """
        mesa = self.get_object()
        with transaction.atomic():
            mesa = self._mesa_bloqueada(mesa)
            historial = self._historial_de(mesa)
            if historial:
                que = historial[0] if len(historial) == 1 else f"{', '.join(historial[:-1])} y {historial[-1]}"
                return _error(
                    f'La mesa {mesa.number} ya tuvo {que}: desactívala en vez de borrarla '
                    f'(así no se pierde ese historial).'
                )
            if mesa.status == 'ocupada':
                return _error(f'La mesa {mesa.number} está ocupada: libérala antes de borrarla.')
            try:
                with transaction.atomic():
                    registrar(
                        request.user, 'mesa.borrar', mesa,
                        numero=mesa.number, cafeteria=mesa.cafeteria.name
                    )
                    mesa.delete()
            except ProtectedError:
                return _error(
                    f'La mesa {mesa.number} tiene historial de pedidos por QR: desactívala en vez de borrarla.'
                )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _bloqueo_para_desactivar(self, mesa):
        """(Mesa bloqueada) 400 si la mesa está en uso: ocupada, gente por QR, pedidos abiertos o reservas"""
        if mesa.status == 'ocupada':
            return _error(f'La mesa {mesa.number} está ocupada: libérala antes de desactivarla.')

        conectadas = SesionCliente.objects.filter(mesa=mesa, estado='activa').count()
        if conectadas:
            return _error(
                f'La mesa {mesa.number} tiene {conectadas} persona(s) conectadas por QR: '
                f'cóbralas o ciérralas antes de desactivarla.'
            )

        from apps.comensales.services import pedidos_de_mesa_abiertos
        abierto = pedidos_de_mesa_abiertos(mesa).order_by('created_at').first()
        if abierto is not None:
            que_hacer = 'cóbralo' if abierto.status == 'entregada' else 'cóbralo o cancélalo'
            return _error(
                f'La mesa {mesa.number} tiene el pedido {abierto.order_number} abierto: '
                f'{que_hacer} antes de desactivarla.'
            )

        reservas = mesa.reservas.filter(
            status__in=['pendiente', 'confirmada'], reservation_date__gte=timezone.localdate()
        ).count()
        if reservas:
            return _error(
                f'La mesa {mesa.number} tiene {reservas} reserva(s) pendientes: '
                f'cancélalas o cámbialas de mesa antes de desactivarla.'
            )
        return None

    @action(detail=True, methods=['post'])
    def desactivar(self, request, pk=None):
        """
        Desactivar la mesa (en vez de borrarla): deja de listarse y su QR muestra "Escanea el QR de tu mesa".
        No se puede con la mesa en uso. Se conserva todo su historial y el mismo QR para cuando se reactive.
        """
        mesa = self.get_object()
        with transaction.atomic():
            mesa = self._mesa_bloqueada(mesa)
            if not mesa.is_active:
                return _error(f'La mesa {mesa.number} ya está desactivada.')
            bloqueo = self._bloqueo_para_desactivar(mesa)
            if bloqueo:
                return bloqueo

            # Las sesiones QR ya cobradas (viendo su ticket) se cierran y la mesa queda limpia para cuando vuelva
            from apps.comensales.services import cerrar_sesiones_pagadas
            cerrar_sesiones_pagadas(mesa)
            if mesa.status != 'mantenimiento':
                mesa.status = 'disponible'
            mesa.guest_count = 0
            mesa.occupied_since = None
            mesa.current_order = None
            mesa.nota_cierre = ''
            mesa.is_active = False
            mesa.save()
            registrar(
                request.user, 'mesa.desactivar', mesa,
                numero=mesa.number, cafeteria=mesa.cafeteria.name
            )

        return Response(
            {
                'status': 'success',
                'message': f'Mesa {mesa.number} desactivada: su QR deja de funcionar hasta que la reactives.',
                'mesa': MesaListSerializer(mesa).data
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def reactivar(self, request, pk=None):
        """Reactivar una mesa desactivada. Su QR vuelve a servir."""
        mesa = self.get_object()
        with transaction.atomic():
            mesa = self._mesa_bloqueada(mesa)
            if mesa.is_active:
                return _error(f'La mesa {mesa.number} ya está activa.')

            mesa.is_active = True
            mesa.save(update_fields=['is_active', 'updated_at'])
            registrar(
                request.user, 'mesa.reactivar', mesa,
                numero=mesa.number, cafeteria=mesa.cafeteria.name
            )

        return Response(
            {
                'status': 'success',
                'message': f'Mesa {mesa.number} reactivada: su QR vuelve a funcionar.',
                'mesa': MesaListSerializer(mesa).data
            },
            status=status.HTTP_200_OK
        )

    def _cafeteria_para_gestion(self, request):
        """
        Local sobre el que se gestiona (siguiente_numero). cafe_admin/gerente: el suyo (se ignora el
        parámetro). distribuidor: uno abierto de su tenant. super_admin: cualquiera abierto. Fuera → None (404).
        """
        user = request.user
        if user.role in ROLES_GESTION_LOCAL:
            cafeteria = user.cafeteria
            return cafeteria if cafeteria is not None and cafeteria.is_active else None

        try:
            cafeteria_id = uuid.UUID(str(request.query_params.get('cafeteria', '')).strip())
        except ValueError:
            return None
        locales = Cafeteria.objects.filter(is_active=True)
        if user.role != 'super_admin':
            locales = locales.filter(tenant_id=user.tenant_id)
        return locales.filter(pk=cafeteria_id).first()

    @action(detail=False, methods=['get'])
    def siguiente_numero(self, request):
        """Número sugerido para una mesa nueva (el mayor del local + 1, contando las desactivadas)"""
        user = request.user
        if user.role not in ROLES_GESTION_LOCAL and not request.query_params.get('cafeteria'):
            return _error('Indica el local (?cafeteria=<id>).')

        cafeteria = self._cafeteria_para_gestion(request)
        if cafeteria is None:
            return Response({'error': 'Local no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        mayor = Mesa.objects.filter(cafeteria=cafeteria).aggregate(mayor=Max('number'))['mayor'] or 0
        return Response({
            'numero': mayor + 1,
            'cafeteria': str(cafeteria.pk),
            'cafeteria_name': cafeteria.name,
            'mesas_activas': mesas_activas_de(cafeteria),
        })

    # ---- Operación (ocupar / liberar / estados) ----

    def _bloqueo_por_inactiva(self, mesa):
        """Una mesa desactivada no se ocupa ni cambia de estado: primero hay que reactivarla"""
        if not mesa.is_active:
            return _error(f'La mesa {mesa.number} está desactivada: reactívala para usarla.')
        return None

    def _cerrar_pagadas_al_ocupar(self, mesa):
        """
        (Mesa bloqueada) Ocupar a mano una mesa sin nadie conectado por QR equivale a "Mesa lista" + ocupar:
        las sesiones QR ya cobradas se cierran. Si no, el QR seguiría en "Estamos preparando tu mesa" y, al
        vencer esas sesiones, la mesa podría liberarse con gente sentada.
        """
        from apps.comensales.services import cerrar_sesiones_pagadas
        if not SesionCliente.objects.filter(mesa=mesa, estado='activa').exists():
            cerrar_sesiones_pagadas(mesa)

    def _mesa_bloqueada(self, mesa):
        """
        Relee la mesa con SELECT FOR UPDATE (llamar dentro de transaction.atomic). Así nadie
        entra por QR ni cobra mientras el personal cambia su estado: el cliente bloquea la
        misma fila al entrar.
        """
        return Mesa.objects.select_for_update().get(pk=mesa.pk)

    def _bloqueo_por_pedido_abierto(self, mesa):
        """
        Una mesa solo deja de estar ocupada cuando no tiene comensales conectados por QR
        (sesiones activas) ni pedidos abiertos de tipo mesa (abierto = no cancelado y no
        pagado). Si queda algo, devuelve un 400 que el frontend muestra tal cual; si no, None.
        """
        conectadas = SesionCliente.objects.filter(mesa=mesa, estado='activa').count()
        if conectadas:
            return Response(
                {
                    'error': (
                        f'La mesa {mesa.number} tiene {conectadas} persona(s) conectadas por QR: '
                        f'cóbralas o ciérrala desde el detalle de la mesa.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Solo pedidos del propio local: uno de otro local que apunte a esta mesa no la bloquea
        from apps.comensales.services import pedidos_de_mesa_abiertos
        abierto = pedidos_de_mesa_abiertos(mesa).order_by('created_at').first()
        if abierto is None:
            return None
        # Un pedido entregado ya no se puede cancelar: solo queda cobrarlo
        que_hacer = 'cóbralo' if abierto.status == 'entregada' else 'cóbralo o cancélalo'
        return Response(
            {
                'error': (
                    f'La mesa {mesa.number} tiene el pedido {abierto.order_number} abierto: '
                    f'{que_hacer} antes de liberarla.'
                )
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    @action(detail=True, methods=['post'])
    def occupy(self, request, pk=None):
        """Marcar mesa como ocupada"""
        mesa = self.get_object()
        bloqueo = self._bloqueo_por_inactiva(mesa)
        if bloqueo:
            return bloqueo
        guest_count = request.data.get('guest_count', 1)

        try:
            guest_count = int(guest_count)
            if guest_count < mesa.min_capacity or guest_count > mesa.capacity:
                return Response(
                    {
                        'error': f'Número de clientes fuera de rango ({mesa.min_capacity}-{mesa.capacity})'
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (ValueError, TypeError):
            return Response(
                {'error': 'guest_count debe ser un número'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            mesa = self._mesa_bloqueada(mesa)
            self._cerrar_pagadas_al_ocupar(mesa)
            mesa.occupy(guest_count)

        return Response(
            {
                'status': 'success',
                'message': f'Mesa {mesa.number} ocupada',
                'mesa': MesaDetailSerializer(mesa).data
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def free(self, request, pk=None):
        """Liberar mesa. Sobre una mesa 'limpiando' es el "Mesa lista" tras el último cobro por QR."""
        mesa = self.get_object()

        with transaction.atomic():
            mesa = self._mesa_bloqueada(mesa)

            if mesa.status == 'disponible':
                return Response(
                    {'error': 'Mesa ya está disponible'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            bloqueo = self._bloqueo_por_pedido_abierto(mesa)
            if bloqueo:
                return bloqueo

            # Las sesiones QR ya cobradas (solo lectura, viendo su ticket) se cierran:
            # si no, la mesa libre seguiría mostrando "Estamos preparando tu mesa" al escanear
            from apps.comensales.services import cerrar_sesiones_pagadas
            cerrar_sesiones_pagadas(mesa)
            mesa.free()

        return Response(
            {
                'status': 'success',
                'message': f'Mesa {mesa.number} liberada',
                'mesa': MesaDetailSerializer(mesa).data
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def cleaning(self, request, pk=None):
        """Marcar mesa como en limpieza"""
        mesa = self.get_object()
        bloqueo = self._bloqueo_por_inactiva(mesa)
        if bloqueo:
            return bloqueo
        with transaction.atomic():
            mesa = self._mesa_bloqueada(mesa)
            bloqueo = self._bloqueo_por_pedido_abierto(mesa)
            if bloqueo:
                return bloqueo

            mesa.cleaning()

        return Response(
            {
                'status': 'success',
                'message': f'Mesa {mesa.number} marcada como limpiando'
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def maintenance(self, request, pk=None):
        """Marcar mesa como en mantenimiento"""
        mesa = self.get_object()
        bloqueo = self._bloqueo_por_inactiva(mesa)
        if bloqueo:
            return bloqueo
        with transaction.atomic():
            mesa = self._mesa_bloqueada(mesa)
            bloqueo = self._bloqueo_por_pedido_abierto(mesa)
            if bloqueo:
                return bloqueo

            mesa.maintenance()

        return Response(
            {
                'status': 'success',
                'message': f'Mesa {mesa.number} marcada como mantenimiento'
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        """Cambiar estado de mesa"""
        mesa = self.get_object()
        bloqueo = self._bloqueo_por_inactiva(mesa)
        if bloqueo:
            return bloqueo
        serializer = MesaStatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data['status']
        guest_count = serializer.validated_data.get('guest_count')

        with transaction.atomic():
            mesa = self._mesa_bloqueada(mesa)

            # Salir de 'ocupada' exige que no quede nadie conectado por QR ni pedidos abiertos
            if new_status != 'ocupada':
                bloqueo = self._bloqueo_por_pedido_abierto(mesa)
                if bloqueo:
                    return bloqueo

            if new_status == 'ocupada':
                self._cerrar_pagadas_al_ocupar(mesa)

            mesa.status = new_status

            if new_status == 'ocupada' and guest_count:
                mesa.guest_count = guest_count
                mesa.occupied_since = timezone.now()
            elif new_status in ['disponible', 'limpiando']:
                mesa.guest_count = 0
                mesa.occupied_since = None
                if new_status == 'disponible':
                    # Igual que free(): mesa libre sin nota ni sesiones QR cobradas pendientes de cierre
                    from apps.comensales.services import cerrar_sesiones_pagadas
                    cerrar_sesiones_pagadas(mesa)
                    mesa.current_order = None
                    mesa.nota_cierre = ''

            mesa.save()

        return Response(
            {
                'status': 'success',
                'message': f'Estado actualizado a {mesa.get_status_display()}',
                'mesa': MesaDetailSerializer(mesa).data
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def regenerar_qr(self, request, pk=None):
        """
        Nuevo token para el QR de la mesa: el QR impreso anterior deja de servir.
        Las personas ya sentadas no se ven afectadas (su sesión va por cookie, no por el QR).
        """
        mesa = self.get_object()

        with transaction.atomic():
            mesa = self._mesa_bloqueada(mesa)
            mesa.qr_code = generar_token_qr()
            mesa.save(update_fields=['qr_code', 'updated_at'])
            # El token viejo no se guarda en la bitácora: basta saber quién lo cambió y cuándo
            registrar(
                request.user, 'mesa.regenerar_qr', mesa,
                numero=mesa.number, cafeteria=mesa.cafeteria.name
            )

        return Response(
            {
                'status': 'success',
                'message': f'QR de la mesa {mesa.number} regenerado: imprime la tarjeta nueva.',
                'qr_code': mesa.qr_code,
                'mesa': MesaDetailSerializer(mesa).data
            },
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'])
    def available(self, request):
        """Obtener mesas disponibles"""
        queryset = self.get_queryset().filter(status='disponible', is_active=True)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = MesaListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = MesaListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def occupied(self, request):
        """Obtener mesas ocupadas"""
        queryset = self.get_queryset().filter(status='ocupada')

        serializer = MesaListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Estadísticas de mesas"""
        queryset = self.get_queryset()

        total_mesas = queryset.count()
        available = queryset.filter(status='disponible').count()
        occupied = queryset.filter(status='ocupada').count()
        reserved = queryset.filter(status='reservada').count()
        cleaning = queryset.filter(status='limpiando').count()

        # Capacidad total = suma de asientos de todas las mesas (no el número de mesas)
        total_capacity = queryset.aggregate(total=Sum('capacity'))['total'] or 0

        # Ocupación promedio: % de mesas ocupadas sobre el total de mesas
        average_occupancy = (occupied / total_mesas) * 100 if total_mesas > 0 else 0

        stats_data = {
            'total_mesas': total_mesas,
            'available_mesas': available,
            'occupied_mesas': occupied,
            'reserved_mesas': reserved,
            'cleaning_mesas': cleaning,
            'average_occupancy': round(average_occupancy, 2),
            'total_capacity': total_capacity,
        }

        serializer = MesaStatsSerializer(stats_data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_qr(self, request):
        """Obtener mesa por código QR"""
        qr_code = request.query_params.get('qr_code')

        if not qr_code:
            return Response(
                {'error': 'qr_code requerido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            mesa = self.get_queryset().get(qr_code=qr_code)
            serializer = MesaDetailSerializer(mesa)
            return Response(serializer.data)
        except Mesa.DoesNotExist:
            return Response(
                {'error': 'Mesa no encontrada'},
                status=status.HTTP_404_NOT_FOUND
            )


class ReservaViewSet(viewsets.ModelViewSet):
    """CRUD de Reservas"""
    queryset = Reserva.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    search_fields = ['customer_name', 'customer_phone', 'customer_email']
    ordering_fields = ['reservation_date', 'reservation_time', 'status']
    # 'id' desempata reservas a la misma fecha y hora (paginación estable)
    ordering = ['reservation_date', 'reservation_time', 'id']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ReservaDetailSerializer
        elif self.action == 'create':
            return ReservaCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return ReservaUpdateSerializer
        return ReservaListSerializer

    def get_permissions(self):
        if self.action in ['create', 'confirm', 'cancel']:
            # Personal del local, distribuidor_admin o super_admin. get_queryset ya limita
            # a las reservas de su local / tenant; fuera de él get_object() da 404.
            return [IsAuthenticated(), IsPersonalReservas()]
        return [IsAuthenticated(), IsTenantMember()]

    def get_queryset(self):
        """Filtrar reservas por cafetería del usuario"""
        user = self.request.user

        if user.role == 'super_admin':
            queryset = Reserva.objects.all()
        elif user.role == 'distribuidor_admin':
            queryset = Reserva.objects.filter(mesa__tenant=user.tenant)
        elif user.cafeteria:
            queryset = Reserva.objects.filter(mesa__cafeteria=user.cafeteria)
        # Clientes solo ven sus propias reservas
        elif user.role == 'usuario':
            queryset = Reserva.objects.filter(customer_email=user.email)
        else:
            return Reserva.objects.none()

        # mesa_number y cafeteria_name sin N+1
        return queryset.select_related('mesa__cafeteria')

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirmar reserva"""
        reserva = self.get_object()

        if reserva.status != 'pendiente':
            return Response(
                {'error': 'Solo reservas pendientes pueden confirmarse'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reserva.confirm()

        return Response(
            {
                'status': 'success',
                'message': 'Reserva confirmada',
                'reserva': ReservaDetailSerializer(reserva).data
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancelar reserva"""
        reserva = self.get_object()

        if reserva.status == 'completada':
            return Response(
                {'error': 'No se puede cancelar una reserva completada'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reserva.cancel()

        return Response(
            {
                'status': 'success',
                'message': 'Reserva cancelada'
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Completar reserva"""
        reserva = self.get_object()

        if reserva.status != 'confirmada':
            return Response(
                {'error': 'Solo reservas confirmadas pueden completarse'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reserva.complete()

        return Response(
            {
                'status': 'success',
                'message': 'Reserva completada'
            },
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        """Obtener reservas próximas (30 min)"""
        from datetime import timedelta

        now = timezone.now()
        thirty_min_later = now + timedelta(minutes=30)

        queryset = self.get_queryset().filter(
            status__in=['pendiente', 'confirmada'],
            reservation_date=now.date(),
            reservation_time__lte=thirty_min_later.time(),
            reservation_time__gte=now.time()
        )

        serializer = ReservaListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def today(self, request):
        """Obtener reservas de hoy"""
        today = timezone.now().date()
        queryset = self.get_queryset().filter(
            reservation_date=today,
            status__in=['pendiente', 'confirmada']
        )

        serializer = ReservaListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_date(self, request):
        """Obtener reservas por fecha"""
        date_str = request.query_params.get('date')

        if not date_str:
            return Response(
                {'error': 'date requerido (YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from datetime import datetime
            reservation_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Formato de fecha inválido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = self.get_queryset().filter(
            reservation_date=reservation_date,
            status__in=['pendiente', 'confirmada']
        )

        serializer = ReservaListSerializer(queryset, many=True)
        return Response(serializer.data)
