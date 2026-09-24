from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Category, MenuItem
from .serializers import (
    CategoryListSerializer, CategoryDetailSerializer,
    CategoryCreateUpdateSerializer, MenuItemSerializer,
    MenuItemCreateUpdateSerializer
)
from apps.accounts.permissions import IsDistribuidorAdmin, IsTenantMember


class CategoryViewSet(viewsets.ModelViewSet):
    """CRUD de Categorías del Menú"""
    queryset = Category.objects.all()
    permission_classes = [IsAuthenticated]
    search_fields = ['name', 'description']
    ordering_fields = ['order', 'name']
    ordering = ['order', 'name']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return CategoryDetailSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return CategoryCreateUpdateSerializer
        return CategoryListSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsDistribuidorAdmin()]
        return [IsAuthenticated(), IsTenantMember()]

    def get_queryset(self):
        """Filtrar categorías por tenant"""
        user = self.request.user

        if user.role == 'super_admin':
            return Category.objects.all()

        if user.tenant:
            return Category.objects.filter(tenant=user.tenant, is_active=True)

        return Category.objects.none()

    def perform_create(self, serializer):
        """Crear categoría con tenant del request"""
        serializer.save(tenant=self.request.tenant)

    @action(detail=True, methods=['get'])
    def items(self, request, pk=None):
        """Obtener items de una categoría"""
        category = self.get_object()
        items = category.items.filter(is_active=True, is_available=True)

        serializer = MenuItemSerializer(items, many=True)
        return Response(serializer.data)


class MenuItemViewSet(viewsets.ModelViewSet):
    """CRUD de Items del Menú"""
    queryset = MenuItem.objects.all()
    permission_classes = [IsAuthenticated]
    search_fields = ['name', 'description']
    ordering_fields = ['category', 'name', 'price']
    ordering = ['category', 'name']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return MenuItemCreateUpdateSerializer
        return MenuItemSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsDistribuidorAdmin()]
        return [IsAuthenticated(), IsTenantMember()]

    def get_queryset(self):
        """Filtrar items por tenant"""
        user = self.request.user

        if user.role == 'super_admin':
            return MenuItem.objects.all()

        if user.tenant:
            queryset = MenuItem.objects.filter(tenant=user.tenant)

            # Si no es admin, solo mostrar items disponibles
            if user.role != 'distribuidor_admin':
                queryset = queryset.filter(is_available=True, is_active=True)

            return queryset

        return MenuItem.objects.none()

    def perform_create(self, serializer):
        """Crear item con tenant del request"""
        serializer.save(tenant=self.request.tenant)

    @action(detail=False, methods=['get'])
    def available(self, request):
        """Obtener items disponibles"""
        queryset = self.get_queryset().filter(is_available=True, is_active=True)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = MenuItemSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = MenuItemSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def toggle_availability(self, request, pk=None):
        """Alternar disponibilidad del item"""
        item = self.get_object()
        item.is_available = not item.is_available
        item.save()

        return Response(
            {
                'status': 'success',
                'is_available': item.is_available
            },
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """Obtener items agrupados por categoría"""
        user = self.request.user

        if user.role == 'super_admin':
            categories = Category.objects.all()
        elif user.tenant:
            categories = Category.objects.filter(tenant=user.tenant, is_active=True)
        else:
            return Response([], status=status.HTTP_200_OK)

        result = []
        for category in categories:
            items = category.items.filter(is_active=True, is_available=True)
            if items.exists():
                result.append({
                    'category': CategoryListSerializer(category).data,
                    'items': MenuItemSerializer(items, many=True).data
                })

        return Response(result)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Estadísticas del menú"""
        queryset = self.get_queryset()

        stats_data = {
            'total_items': queryset.count(),
            'available_items': queryset.filter(is_available=True).count(),
            'total_categories': Category.objects.filter(
                tenant=request.tenant if hasattr(request, 'tenant') else None
            ).count(),
            'average_price': queryset.aggregate(avg=models.Avg('price'))['avg'] or 0,
        }

        from django.db import models as django_models
        return Response({
            'total_items': queryset.count(),
            'available_items': queryset.filter(is_available=True).count(),
            'total_categories': Category.objects.filter(
                tenant=request.tenant if hasattr(request, 'tenant') else None
            ).count(),
        })
