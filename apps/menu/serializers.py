from django.db import IntegrityError, transaction
from django.utils.text import slugify
from rest_framework import serializers

from .imagenes import ImagenInvalida, aplicar_imagen, procesar_imagen
from .models import Category, MenuItem
from .permissions import gestiona_carta, items_visibles

TIEMPO_MAX_MIN = 180
MENSAJE_CATEGORIA_AJENA = 'Esa categoría no existe en esta carta.'
MENSAJE_CARRERA = 'Alguien acaba de guardar otro elemento con un nombre parecido. Intenta de nuevo.'


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def slug_unico(modelo, tenant, nombre, excluir=None):
    """slug a partir del nombre, único en el tenant: cafe, cafe-2, cafe-3…"""
    largo = modelo._meta.get_field('slug').max_length
    base = slugify(nombre)[:largo].strip('-') or ('categoria' if modelo is Category else 'producto')
    otros = modelo.objects.filter(tenant=tenant).exclude(pk=excluir)
    candidato, n = base, 2
    while otros.filter(slug=candidato).exists():
        sufijo = f'-{n}'
        candidato = f'{base[:largo - len(sufijo)].rstrip("-")}{sufijo}'
        n += 1
    return candidato


def limpiar_nombre(valor):
    nombre = ' '.join((valor or '').split())
    if not nombre:
        raise serializers.ValidationError('Escribe un nombre.')
    return nombre


class DatosPlanosMixin:
    """
    Los formularios multipart (FormData) llegan como QueryDict y DRF trata un booleano ausente como False
    (un producto nuevo quedaría "agotado"). Se pasan a dict plano: lo que no se envía no se toca.
    """

    def to_internal_value(self, data):
        if hasattr(data, 'dict'):
            data = data.dict()
        return super().to_internal_value(data)


# ---------------------------------------------------------------------------
# Productos
# ---------------------------------------------------------------------------

class MenuItemSerializer(serializers.ModelSerializer):
    """Lectura. cost y profit_margin solo para quien gestiona la carta; image/image_thumb: URL absoluta o null"""
    category_name = serializers.SerializerMethodField()
    profit_margin = serializers.SerializerMethodField()

    class Meta:
        model = MenuItem
        fields = [
            'id', 'tenant', 'category', 'category_name', 'name', 'slug', 'description',
            'price', 'cost', 'profit_margin', 'image', 'image_thumb',
            'is_available', 'is_active', 'preparation_time',
            'is_vegetarian', 'is_vegan', 'has_gluten', 'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_fields(self):
        campos = super().get_fields()
        request = self.context.get('request')
        if not (request and gestiona_carta(request.user)):
            campos.pop('cost', None)
            campos.pop('profit_margin', None)
        return campos

    def get_category_name(self, obj):
        return obj.category.name if obj.category_id else None

    def get_profit_margin(self, obj):
        return round(obj.get_profit_margin(), 2)


class MenuItemWriteSerializer(serializers.ModelSerializer):
    """
    Crear/editar producto (JSON o multipart). El tenant lo pone la vista (context['tenant']) o es el del
    producto; el slug se genera del nombre. 'image' (archivo, opcional) se procesa con apps.menu.imagenes.
    Responde con la representación de lectura (MenuItemSerializer).
    """
    name = serializers.CharField(max_length=200)
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), required=False, allow_null=True,
        error_messages={'does_not_exist': MENSAJE_CATEGORIA_AJENA, 'incorrect_type': MENSAJE_CATEGORIA_AJENA},
    )
    image = serializers.FileField(required=False, write_only=True)

    class Meta:
        model = MenuItem
        fields = [
            'name', 'description', 'price', 'cost', 'category', 'image',
            'is_available', 'is_active', 'preparation_time',
            'is_vegetarian', 'is_vegan', 'has_gluten',
        ]

    def to_internal_value(self, data):
        # Como DatosPlanosMixin: el QueryDict de multipart pasa a dict plano
        data = data.dict() if hasattr(data, 'dict') else data
        # Un PATCH en JSON puede reenviar la URL actual de la foto (o null): se ignora, no es un archivo
        if isinstance(data, dict) and 'image' in data and not hasattr(data['image'], 'read'):
            data = {k: v for k, v in data.items() if k != 'image'}
        return super().to_internal_value(data)

    def _tenant(self):
        return self.instance.tenant if self.instance else self.context['tenant']

    def validate_name(self, value):
        return limpiar_nombre(value)

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError('El precio debe ser mayor a 0.')
        return value

    def validate_cost(self, value):
        if value < 0:
            raise serializers.ValidationError('El costo no puede ser negativo.')
        return value

    def validate_preparation_time(self, value):
        if value > TIEMPO_MAX_MIN:
            raise serializers.ValidationError(
                f'El tiempo de preparación debe estar entre 0 y {TIEMPO_MAX_MIN} minutos.'
            )
        return value

    def validate_image(self, archivo):
        try:
            return procesar_imagen(archivo)
        except ImagenInvalida as error:
            raise serializers.ValidationError(str(error))

    def validate(self, attrs):
        tenant = self._tenant()
        categoria = attrs.get('category')
        if categoria is not None and categoria.tenant_id != tenant.pk:
            raise serializers.ValidationError({'category': MENSAJE_CATEGORIA_AJENA})

        nombre = attrs.get('name')
        if nombre is not None:
            existente = (
                MenuItem.objects.filter(tenant=tenant, name__iexact=nombre)
                .exclude(pk=self.instance.pk if self.instance else None).first()
            )
            if existente:
                raise serializers.ValidationError({'name': (
                    f'Ya existe un producto desactivado llamado «{existente.name}». Reactívalo en vez de crear otro.'
                    if not existente.is_active else
                    f'Ya existe un producto llamado «{existente.name}» en la carta.'
                )})
        return attrs

    def create(self, validated_data):
        procesada = validated_data.pop('image', None)
        tenant = self._tenant()
        try:
            with transaction.atomic():
                item = MenuItem.objects.create(
                    tenant=tenant, slug=slug_unico(MenuItem, tenant, validated_data['name']), **validated_data
                )
                if procesada:
                    aplicar_imagen(item, procesada)
        except IntegrityError:
            raise serializers.ValidationError({'name': MENSAJE_CARRERA})
        return item

    def update(self, instance, validated_data):
        procesada = validated_data.pop('image', None)
        if 'name' in validated_data and validated_data['name'] != instance.name:
            instance.slug = slug_unico(MenuItem, instance.tenant, validated_data['name'], excluir=instance.pk)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        try:
            with transaction.atomic():
                instance.save()
                if procesada:
                    aplicar_imagen(instance, procesada)
        except IntegrityError:
            raise serializers.ValidationError({'name': MENSAJE_CARRERA})
        return instance

    def to_representation(self, instance):
        return MenuItemSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# Categorías
# ---------------------------------------------------------------------------

class CategorySerializer(serializers.ModelSerializer):
    """Lectura. items_count: productos activos de la categoría (disponibles o agotados)"""
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            'id', 'tenant', 'name', 'slug', 'description', 'icon',
            'order', 'is_active', 'items_count', 'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_items_count(self, obj):
        anotado = getattr(obj, 'num_items', None)  # anotado por CategoryViewSet.get_queryset
        return anotado if anotado is not None else obj.items.filter(is_active=True).count()


# Compatibilidad con el nombre anterior
CategoryListSerializer = CategorySerializer


class CategoryDetailSerializer(CategorySerializer):
    """Detalle con sus productos (los que el usuario puede ver, sin costo si no gestiona la carta)"""
    items = serializers.SerializerMethodField()

    class Meta(CategorySerializer.Meta):
        fields = CategorySerializer.Meta.fields + ['items']
        read_only_fields = fields

    def get_items(self, obj):
        request = self.context.get('request')
        productos = items_visibles(request.user, obj.items.all()) if request else obj.items.none()
        return MenuItemSerializer(productos.order_by('name'), many=True, context=self.context).data


class CategoryWriteSerializer(DatosPlanosMixin, serializers.ModelSerializer):
    """Crear/editar categoría. slug automático; sin 'order' al crear, va al final. Responde como CategorySerializer"""
    name = serializers.CharField(max_length=100)

    class Meta:
        model = Category
        fields = ['name', 'description', 'icon', 'order', 'is_active']

    def _tenant(self):
        return self.instance.tenant if self.instance else self.context['tenant']

    def validate_name(self, value):
        return limpiar_nombre(value)

    def validate(self, attrs):
        nombre = attrs.get('name')
        if nombre is not None:
            existente = (
                Category.objects.filter(tenant=self._tenant(), name__iexact=nombre)
                .exclude(pk=self.instance.pk if self.instance else None).first()
            )
            if existente:
                raise serializers.ValidationError({'name': (
                    f'Ya existe una categoría oculta llamada «{existente.name}». Actívala en vez de crear otra.'
                    if not existente.is_active else
                    f'Ya existe una categoría llamada «{existente.name}» en la carta.'
                )})
        return attrs

    def create(self, validated_data):
        tenant = self._tenant()
        if 'order' not in validated_data:
            ultima = Category.objects.filter(tenant=tenant).order_by('-order').values_list('order', flat=True).first()
            validated_data['order'] = 0 if ultima is None else ultima + 1
        try:
            with transaction.atomic():
                return Category.objects.create(
                    tenant=tenant, slug=slug_unico(Category, tenant, validated_data['name']), **validated_data
                )
        except IntegrityError:
            raise serializers.ValidationError({'name': MENSAJE_CARRERA})

    def update(self, instance, validated_data):
        if 'name' in validated_data and validated_data['name'] != instance.name:
            instance.slug = slug_unico(Category, instance.tenant, validated_data['name'], excluir=instance.pk)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        try:
            with transaction.atomic():
                instance.save()
        except IntegrityError:
            raise serializers.ValidationError({'name': MENSAJE_CARRERA})
        return instance

    def to_representation(self, instance):
        return CategorySerializer(instance, context=self.context).data


# Compatibilidad con los nombres anteriores
CategoryCreateUpdateSerializer = CategoryWriteSerializer
MenuItemCreateUpdateSerializer = MenuItemWriteSerializer
