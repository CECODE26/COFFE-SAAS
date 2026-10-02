"""
Carta del tenant (categorías y productos) para el panel del personal.

Tenant: request.tenant no sirve aquí (el middleware corre antes que el JWT y queda en None). Se usa
request.user.tenant; el super_admin indica el tenant con 'tenant' en el cuerpo o ?tenant= al crear.
Permisos: ver apps.menu.permissions (gestión = super_admin/distribuidor_admin/cafe_admin; el gerente
además marca agotado/disponible; el resto lee). Fuera de su tenant, get_object() da 404.
"""
import uuid
from collections import defaultdict

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Avg, Count, ProtectedError, Q
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsTenantMember
from apps.auditoria.services import registrar
from apps.tenants.models import Tenant

from .imagenes import MAX_BYTES, ImagenInvalida, aplicar_imagen, procesar_imagen, quitar_imagen
from .models import Category, MenuItem
from .permissions import (
    PuedeCambiarDisponibilidad, PuedeGestionarCarta, categorias_visibles, items_visibles,
)
from .serializers import (
    CategoryDetailSerializer, CategorySerializer, CategoryWriteSerializer,
    MenuItemSerializer, MenuItemWriteSerializer,
)

ACCIONES_GESTION = ('create', 'update', 'partial_update', 'destroy')
# Cuerpo máximo de una petición de productos: la foto (5 MB) más los campos del formulario
MAX_CUERPO = MAX_BYTES + 512 * 1024


def _datos(request):
    return request.data if hasattr(request.data, 'get') else {}


def tenant_destino(request):
    """Tenant donde se crea algo de la carta: el del usuario; el super_admin lo indica con 'tenant'"""
    user = request.user
    if user.role != 'super_admin':
        return user.tenant
    valor = _datos(request).get('tenant') or request.query_params.get('tenant')
    if not valor:
        raise ValidationError({'tenant': ['Indica el distribuidor (tenant) de la carta.']})
    try:
        return Tenant.objects.get(pk=valor)
    except (Tenant.DoesNotExist, DjangoValidationError, ValueError, TypeError):
        raise ValidationError({'tenant': ['El distribuidor indicado no existe.']})


class TenantDestinoMixin:
    """create() resuelve el tenant antes de validar (el nombre es único por tenant) y lo pasa en el contexto"""

    def create(self, request, *args, **kwargs):
        self.tenant_nuevo = tenant_destino(request)
        return super().create(request, *args, **kwargs)

    def get_serializer_context(self):
        contexto = super().get_serializer_context()
        contexto['tenant'] = getattr(self, 'tenant_nuevo', None)
        return contexto


def _mensaje_categoria_eliminada(productos, oculta):
    if not productos:
        return 'Categoría eliminada.'
    if oculta:
        if productos == 1:
            return ('Categoría eliminada. Como estaba oculta, su producto quedó desactivado y sin categoría: '
                    'reactívalo cuando quieras que vuelva a la carta.')
        return (f'Categoría eliminada. Como estaba oculta, sus {productos} productos quedaron desactivados y sin '
                f'categoría: reactívalos cuando quieras que vuelvan a la carta.')
    if productos == 1:
        return 'Categoría eliminada. Su producto quedó sin categoría.'
    return f'Categoría eliminada. Sus {productos} productos quedaron sin categoría.'


class CategoryViewSet(TenantDestinoMixin, viewsets.ModelViewSet):
    """
    CRUD de categorías. Gestión: ve también las ocultas (is_active=false); el resto, solo las activas.
    Filtros: ?is_active=true|false, ?tenant=<uuid> (super_admin), ?search=
    """
    queryset = Category.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    search_fields = ['name', 'description']
    filterset_fields = ['is_active', 'tenant']
    ordering_fields = ['order', 'name', 'created_at']
    ordering = ['order', 'name', 'id']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return CategoryDetailSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return CategoryWriteSerializer
        return CategorySerializer

    def get_permissions(self):
        if self.action in ACCIONES_GESTION + ('reordenar',):
            return [IsAuthenticated(), PuedeGestionarCarta()]
        return [IsAuthenticated(), IsTenantMember()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'super_admin':
            queryset = Category.objects.all()
        elif user.tenant_id:
            queryset = Category.objects.filter(tenant_id=user.tenant_id)
        else:
            return Category.objects.none()
        return categorias_visibles(user, queryset).annotate(
            num_items=Count('items', filter=Q(items__is_active=True))
        )

    def perform_update(self, serializer):
        visible = serializer.instance.is_active
        categoria = serializer.save()
        if categoria.is_active != visible:
            accion = 'menu.categoria.mostrar' if categoria.is_active else 'menu.categoria.ocultar'
            registrar(self.request.user, accion, categoria, nombre=categoria.name)

    def destroy(self, request, *args, **kwargs):
        """
        Borra la categoría. Sus productos NO se borran: quedan sin categoría (en la carta del cliente salen
        en «Otros»). Si la categoría estaba OCULTA, sus productos tampoco se veían: se desactivan para que no
        aparezcan de golpe en la carta (se reactivan uno a uno). Para esconder la categoría con todos sus
        productos sin borrarla, mejor PATCH is_active=false.
        """
        categoria = self.get_object()
        oculta = not categoria.is_active
        with transaction.atomic():
            productos = categoria.items.count()
            desactivados = 0
            if oculta:
                desactivados = categoria.items.filter(is_active=True).update(
                    is_active=False, updated_at=timezone.now()
                )
            registrar(
                request.user, 'menu.categoria.eliminar', categoria,
                nombre=categoria.name, productos=productos, desactivados=desactivados,
            )
            categoria.delete()
        return Response({
            'detail': _mensaje_categoria_eliminada(productos, oculta),
            'productos_sin_categoria': productos,
            'productos_desactivados': desactivados,
        })

    @action(detail=False, methods=['post'])
    def reordenar(self, request):
        """
        POST {ids: [uuid, ...]} con las categorías en el nuevo orden (todas de un mismo tenant). Las que no se
        envían van detrás, en el orden que tenían. Devuelve todas las categorías del tenant ya ordenadas.
        """
        ids = _datos(request).get('ids')
        if not isinstance(ids, list) or not ids:
            raise ValidationError({'ids': ['Envía la lista de categorías en el nuevo orden.']})
        try:
            ids = [uuid.UUID(str(valor)) for valor in ids]
        except ValueError:
            raise ValidationError({'ids': ['Alguna de las categorías no existe en esta carta.']})
        if len(set(ids)) != len(ids):
            raise ValidationError({'ids': ['Hay categorías repetidas en la lista.']})

        categorias = {c.pk: c for c in self.get_queryset().filter(pk__in=ids)}
        tenants = {c.tenant_id for c in categorias.values()}
        if len(categorias) != len(ids) or len(tenants) != 1:
            raise ValidationError({'ids': ['Alguna de las categorías no existe en esta carta.']})

        tenant_id = tenants.pop()
        resto = Category.objects.filter(tenant_id=tenant_id).exclude(pk__in=ids).order_by('order', 'name', 'id')
        nuevo_orden = [categorias[pk] for pk in ids] + list(resto)
        for posicion, categoria in enumerate(nuevo_orden):
            categoria.order = posicion
        with transaction.atomic():
            Category.objects.bulk_update(nuevo_orden, ['order'])

        queryset = self.get_queryset().filter(tenant_id=tenant_id).order_by('order', 'name', 'id')
        return Response(CategorySerializer(queryset, many=True, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['get'])
    def items(self, request, pk=None):
        """Productos de la categoría que el usuario puede ver"""
        categoria = self.get_object()
        productos = items_visibles(request.user, categoria.items.select_related('category')).order_by('name')
        return Response(MenuItemSerializer(productos, many=True, context=self.get_serializer_context()).data)


class MenuItemViewSet(TenantDestinoMixin, viewsets.ModelViewSet):
    """
    CRUD de productos (JSON o multipart con 'image'). Visibilidad por rol en permissions.items_visibles.
    Filtros: ?category=<uuid>, ?category__isnull=true (sin categoría), ?is_available=, ?is_active=,
    ?tenant=<uuid> (super_admin), ?search=, ?ordering=name|price|...
    """
    queryset = MenuItem.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    search_fields = ['name', 'description']
    filterset_fields = {
        'category': ['exact', 'isnull'],
        'is_available': ['exact'],
        'is_active': ['exact'],
        'tenant': ['exact'],
    }
    ordering_fields = ['category', 'name', 'price', 'preparation_time', 'created_at', 'updated_at']
    # Por categoría (su orden en la carta) y nombre; los que no tienen categoría, al final
    ordering = ['category__order', 'category__name', 'name', 'id']

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return MenuItemWriteSerializer
        return MenuItemSerializer

    def get_permissions(self):
        if self.action in ACCIONES_GESTION + ('imagen',):
            return [IsAuthenticated(), PuedeGestionarCarta()]
        if self.action in ('disponibilidad', 'toggle_availability'):
            return [IsAuthenticated(), PuedeCambiarDisponibilidad()]
        return [IsAuthenticated(), IsTenantMember()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'super_admin':
            queryset = MenuItem.objects.all()
        elif user.tenant_id:
            queryset = MenuItem.objects.filter(tenant_id=user.tenant_id)
        else:
            return MenuItem.objects.none()
        return items_visibles(user, queryset).select_related('category')

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # El tope de la foto se revisa ANTES de leer el cuerpo: si no, Django recibiría el archivo completo
        # (y lo guardaría en un temporal) aunque pese GB. procesar_imagen vuelve a revisar los 5 MB exactos.
        if request.method in ('POST', 'PUT', 'PATCH'):
            try:
                largo = int(request.META.get('CONTENT_LENGTH') or 0)
            except (TypeError, ValueError):
                largo = 0
            if largo > MAX_CUERPO:
                raise ValidationError({'image': [f'La imagen pesa {largo / 1024 / 1024:.1f} MB; el máximo es 5 MB.']})

    def perform_update(self, serializer):
        antes = {campo: getattr(serializer.instance, campo) for campo in ('price', 'cost', 'is_active')}
        item = serializer.save()
        usuario = self.request.user
        if item.price != antes['price']:
            registrar(usuario, 'menu.producto.precio', item, nombre=item.name, antes=antes['price'], despues=item.price)
        if item.cost != antes['cost']:
            registrar(usuario, 'menu.producto.costo', item, nombre=item.name, antes=antes['cost'], despues=item.cost)
        if item.is_active != antes['is_active']:
            accion = 'menu.producto.reactivar' if item.is_active else 'menu.producto.desactivar'
            registrar(usuario, accion, item, nombre=item.name)

    def destroy(self, request, *args, **kwargs):
        """
        Sin pedidos: se borra (y sus fotos). Con pedidos (OrderItem lo protege): se desactiva (is_active=false),
        deja de salir en la carta y se puede reactivar con PATCH is_active=true. Siempre responde 200.
        """
        item = self.get_object()
        try:
            with transaction.atomic():
                # Si el borrado falla, el registro de auditoría se revierte con él
                registrar(request.user, 'menu.producto.eliminar', item, nombre=item.name)
                item.delete()
        except ProtectedError:
            if item.is_active:
                item.is_active = False
                item.save(update_fields=['is_active', 'updated_at'])
            registrar(request.user, 'menu.producto.desactivar', item, nombre=item.name)
            return Response({
                'detail': 'Este producto ya tiene pedidos registrados, así que no se borra: '
                          'se desactivó y ya no aparece en la carta.',
                'desactivado': True,
                'item': self.get_serializer(item).data,
            })
        return Response({'detail': 'Producto eliminado.', 'desactivado': False})

    @action(detail=True, methods=['post', 'delete'])
    def imagen(self, request, pk=None):
        """POST multipart {image}: sube o reemplaza la foto. DELETE: la quita. Devuelve el producto."""
        item = self.get_object()
        if request.method == 'DELETE':
            if item.image or item.image_thumb:
                with transaction.atomic():
                    quitar_imagen(item)
            return Response(self.get_serializer(item).data)

        archivo = request.FILES.get('image')
        if archivo is None:
            raise ValidationError({'image': ['Adjunta la foto en el campo «image» (multipart/form-data).']})
        try:
            procesada = procesar_imagen(archivo)
        except ImagenInvalida as error:
            raise ValidationError({'image': [str(error)]})
        with transaction.atomic():
            aplicar_imagen(item, procesada)
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=['post'])
    def disponibilidad(self, request, pk=None):
        """POST {is_available: true|false} marca Disponible/Agotado; sin cuerpo, alterna. Devuelve el producto."""
        item = self.get_object()
        if not hasattr(request.data, 'get'):
            # Una lista u otro JSON que no es un objeto no alterna a ciegas
            raise ValidationError({'is_available': ['Debe ser true o false.']})
        valor = request.data.get('is_available')
        if valor is None:
            nuevo = not item.is_available
        else:
            try:
                nuevo = serializers.BooleanField().to_internal_value(valor)
            except serializers.ValidationError:
                raise ValidationError({'is_available': ['Debe ser true o false.']})
        if item.is_available != nuevo:
            item.is_available = nuevo
            item.save(update_fields=['is_available', 'updated_at'])
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=['post'])
    def toggle_availability(self, request, pk=None):
        """Alias antiguo de disponibilidad/"""
        return self.disponibilidad(request, pk=pk)

    @action(detail=False, methods=['get'])
    def available(self, request):
        """Productos que se pueden pedir (activos y disponibles), paginado"""
        queryset = self.filter_queryset(self.get_queryset()).filter(is_available=True, is_active=True)
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """
        La carta que se sirve hoy: [{category, items}] con categorías activas en su orden y productos activos
        y disponibles. Los productos sin categoría van al final en {category: {id: null, name: 'Sin categoría'}}.
        """
        productos = (
            self.filter_queryset(self.get_queryset())
            .filter(is_active=True, is_available=True)
            .filter(Q(category__isnull=True) | Q(category__is_active=True))
            .order_by('name')
        )
        por_categoria = defaultdict(list)
        for producto in productos:
            por_categoria[producto.category_id].append(producto)

        categorias = (
            Category.objects.filter(pk__in=[pk for pk in por_categoria if pk])
            .annotate(num_items=Count('items', filter=Q(items__is_active=True)))
            .order_by('order', 'name', 'id')
        )
        contexto = self.get_serializer_context()
        resultado = [
            {
                'category': CategorySerializer(c, context=contexto).data,
                'items': MenuItemSerializer(por_categoria[c.pk], many=True, context=contexto).data,
            }
            for c in categorias
        ]
        if por_categoria.get(None):
            resultado.append({
                'category': {
                    'id': None, 'tenant': None, 'name': 'Sin categoría', 'slug': '', 'description': '', 'icon': '',
                    'order': None, 'is_active': True, 'items_count': len(por_categoria[None]),
                    'created_at': None, 'updated_at': None,
                },
                'items': MenuItemSerializer(por_categoria[None], many=True, context=contexto).data,
            })
        return Response(resultado)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Resumen de la carta visible para el usuario (?tenant= para el super_admin)"""
        queryset = self.filter_queryset(self.get_queryset())
        resumen = queryset.aggregate(
            total=Count('id'),
            disponibles=Count('id', filter=Q(is_active=True, is_available=True)),
            agotados=Count('id', filter=Q(is_active=True, is_available=False)),
            inactivos=Count('id', filter=Q(is_active=False)),
            con_foto=Count('id', filter=Q(image__isnull=False) & ~Q(image='')),
            precio_promedio=Avg('price', filter=Q(is_active=True)),
        )
        user = request.user
        categorias = Category.objects.all() if user.role == 'super_admin' else Category.objects.filter(tenant_id=user.tenant_id)
        if request.query_params.get('tenant'):
            # Ya validado por el filtro de filter_queryset (un uuid inválido da 400 antes de llegar aquí)
            categorias = categorias.filter(tenant_id=request.query_params['tenant'])
        categorias = categorias_visibles(user, categorias)
        promedio = resumen['precio_promedio']
        return Response({
            'total_items': resumen['total'],
            'available_items': resumen['disponibles'],
            'unavailable_items': resumen['agotados'],
            'inactive_items': resumen['inactivos'],
            'items_with_image': resumen['con_foto'],
            'total_categories': categorias.count(),
            'average_price': f'{promedio:.2f}' if promedio is not None else '0.00',
        })
