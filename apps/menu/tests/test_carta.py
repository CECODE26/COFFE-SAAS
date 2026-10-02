"""Gestión de la carta: permisos por rol, tenant, slugs, validaciones, lectura, borrado, orden y stats"""
from decimal import Decimal

from apps.auditoria.models import RegistroAuditoria
from apps.menu.models import Category, MenuItem
from apps.pedidos.models import Order, OrderItem

from .base import API_CATEGORIAS, API_ITEMS, PruebaCarta


class PermisosTests(PruebaCarta):
    def test_roles_de_gestion_crean_categorias_y_productos_en_su_tenant(self):
        for n, rol in enumerate(('cafe_admin', 'distribuidor_admin')):
            r = self.como(rol).post(API_CATEGORIAS, {'name': f'Brunch {n}', 'icon': '🍳'}, format='json')
            self.assertEqual(r.status_code, 201, r.content)
            categoria = Category.objects.get(pk=r.data['id'])
            self.assertEqual(categoria.tenant, self.tenant)

            r = self.como(rol).post(API_ITEMS, {
                'name': f'Bolón {n}', 'price': '5.80', 'cost': '1.90', 'category': str(categoria.pk),
                'preparation_time': 12,
            }, format='json')
            self.assertEqual(r.status_code, 201, r.content)
            item = MenuItem.objects.get(pk=r.data['id'])
            self.assertEqual((item.tenant, item.category), (self.tenant, categoria))
            self.assertEqual(item.slug, f'bolon-{n}')
            self.assertTrue(item.is_available and item.is_active)
            self.assertEqual(r.data['category_name'], f'Brunch {n}')
            self.assertEqual(r.data['cost'], '1.90')

    def test_el_personal_no_modifica_la_carta(self):
        for rol in ('camarero', 'cajero', 'cocinero', 'gerente'):
            client = self.como(rol)
            self.assertEqual(client.post(API_CATEGORIAS, {'name': 'X'}, format='json').status_code, 403, rol)
            self.assertEqual(client.post(API_ITEMS, {'name': 'X', 'price': '1'}, format='json').status_code, 403, rol)
            r = client.patch(self.item_url(self.cappuccino), {'price': '0.50'}, format='json')
            self.assertEqual(r.status_code, 403, rol)
            self.assertEqual(client.delete(self.item_url(self.cappuccino)).status_code, 403, rol)
            self.assertEqual(client.post(self.item_url(self.cappuccino, 'imagen/')).status_code, 403, rol)
            self.assertEqual(client.delete(f'{API_CATEGORIAS}{self.bebidas.pk}/').status_code, 403, rol)
        self.cappuccino.refresh_from_db()
        self.assertEqual(self.cappuccino.price, Decimal('2.80'))

    def test_gerente_marca_agotado_y_disponible(self):
        client = self.como('gerente')
        r = client.post(self.item_url(self.cappuccino, 'disponibilidad/'), {'is_available': False}, format='json')
        self.assertEqual((r.status_code, r.data['is_available']), (200, False))
        self.assertNotIn('cost', r.data)
        # El gerente ve los agotados (para reactivarlos) y los vuelve a poner disponibles
        ids = [i['id'] for i in client.get(API_ITEMS).data['results']]
        self.assertIn(str(self.agotado.pk), ids)
        r = client.post(self.item_url(self.agotado, 'disponibilidad/'), {'is_available': True}, format='json')
        self.assertEqual((r.status_code, r.data['is_available']), (200, True))
        # Sin cuerpo alterna
        r = client.post(self.item_url(self.agotado, 'disponibilidad/'))
        self.assertFalse(r.data['is_available'])
        r = client.post(self.item_url(self.agotado, 'disponibilidad/'), {'is_available': 'talvez'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_camarero_no_cambia_disponibilidad(self):
        r = self.como('camarero').post(self.item_url(self.cappuccino, 'disponibilidad/'), {'is_available': False})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.como('cajero').post(self.item_url(self.cappuccino, 'toggle_availability/')).status_code, 403)

    def test_super_admin_debe_indicar_el_tenant(self):
        client = self.como('super_admin')
        r = client.post(API_ITEMS, {'name': 'Mocaccino', 'price': '3.40'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('tenant', r.data)
        r = client.post(API_ITEMS, {'name': 'Mocaccino', 'price': '3.40', 'tenant': 'no-es-uuid'}, format='json')
        self.assertEqual((r.status_code, str(r.data['tenant'][0])), (400, 'El distribuidor indicado no existe.'))

        r = client.post(API_ITEMS, {'name': 'Mocaccino', 'price': '3.40', 'tenant': str(self.otro_tenant.pk)}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(MenuItem.objects.get(pk=r.data['id']).tenant, self.otro_tenant)
        r = client.post(f'{API_CATEGORIAS}?tenant={self.tenant.pk}', {'name': 'Jugos'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Category.objects.get(pk=r.data['id']).tenant, self.tenant)


class AislamientoTests(PruebaCarta):
    def test_otro_tenant_no_ve_ni_toca_la_carta(self):
        client = self.como(self.otro_admin)
        self.assertEqual(client.get(self.item_url(self.cappuccino)).status_code, 404)
        self.assertEqual(client.patch(self.item_url(self.cappuccino), {'price': '9'}, format='json').status_code, 404)
        self.assertEqual(client.delete(self.item_url(self.cappuccino)).status_code, 404)
        self.assertEqual(client.post(self.item_url(self.cappuccino, 'disponibilidad/')).status_code, 404)
        self.assertEqual(client.patch(f'{API_CATEGORIAS}{self.bebidas.pk}/', {'name': 'X'}, format='json').status_code, 404)
        ids = [i['id'] for i in client.get(API_ITEMS).data['results']]
        self.assertEqual(ids, [str(self.ajeno.pk)])

    def test_la_categoria_debe_ser_del_mismo_tenant(self):
        client = self.como('cafe_admin')
        r = client.post(API_ITEMS, {'name': 'Té', 'price': '2', 'category': str(self.otra_categoria.pk)}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(str(r.data['category'][0]), 'Esa categoría no existe en esta carta.')
        r = client.patch(self.item_url(self.cappuccino), {'category': str(self.otra_categoria.pk)}, format='json')
        self.assertEqual(r.status_code, 400)
        r = client.patch(self.item_url(self.cappuccino), {'category': 'no-es-uuid'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.cappuccino.refresh_from_db()
        self.assertEqual(self.cappuccino.category, self.bebidas)

    def test_el_tenant_del_cuerpo_se_ignora_fuera_del_super_admin(self):
        r = self.como('cafe_admin').post(
            API_ITEMS, {'name': 'Té verde', 'price': '2', 'tenant': str(self.otro_tenant.pk)}, format='json'
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(MenuItem.objects.get(pk=r.data['id']).tenant, self.tenant)


class ValidacionesTests(PruebaCarta):
    def test_slug_unico_por_tenant_y_nombres_repetidos(self):
        client = self.como('cafe_admin')
        r = client.post(API_ITEMS, {'name': 'Café con leche', 'price': '2.50'}, format='json')
        self.assertEqual((r.status_code, r.data['slug']), (201, 'cafe-con-leche'))
        # Mismo slug, nombre distinto (sin tilde): sufijo -2
        r = client.post(API_ITEMS, {'name': 'Cafe con leche', 'price': '2.50'}, format='json')
        self.assertEqual((r.status_code, r.data['slug']), (201, 'cafe-con-leche-2'))
        # Mismo nombre (sin importar mayúsculas ni espacios): 400 claro
        r = client.post(API_ITEMS, {'name': '  café   CON leche ', 'price': '2.50'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(str(r.data['name'][0]), 'Ya existe un producto llamado «Café con leche» en la carta.')
        # El otro tenant tiene su propio Cappuccino: aquí también se puede tener uno
        self.assertTrue(MenuItem.objects.filter(tenant=self.otro_tenant, name='Cappuccino').exists())
        r = client.post(API_ITEMS, {'name': 'cappuccino', 'price': '3'}, format='json')
        self.assertEqual(r.status_code, 400)

        r = client.post(API_CATEGORIAS, {'name': 'bebidas'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(str(r.data['name'][0]), 'Ya existe una categoría llamada «Bebidas» en la carta.')
        r = client.post(API_CATEGORIAS, {'name': '☕☕'}, format='json')
        self.assertEqual((r.status_code, r.data['slug']), (201, 'categoria'))

    def test_renombrar_regenera_el_slug_y_avisa_del_producto_desactivado(self):
        client = self.como('cafe_admin')
        MenuItem.objects.filter(pk=self.agotado.pk).update(is_active=False)
        r = client.patch(self.item_url(self.cappuccino), {'name': 'Capuchino doble'}, format='json')
        self.assertEqual((r.status_code, r.data['slug']), (200, 'capuchino-doble'))
        r = client.patch(self.item_url(self.cappuccino), {'name': 'Cheesecake'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('desactivado', str(r.data['name'][0]))

    def test_precio_costo_y_tiempo(self):
        client = self.como('cafe_admin')
        casos = [
            ({'price': '0'}, 'price'), ({'price': '-1'}, 'price'), ({'price': 'abc'}, 'price'),
            ({'price': '2', 'cost': '-0.01'}, 'cost'), ({'price': '2', 'preparation_time': 181}, 'preparation_time'),
            ({'price': '2', 'preparation_time': -1}, 'preparation_time'), ({'price': '2', 'name': '   '}, 'name'),
        ]
        for extra, campo in casos:
            datos = {'name': 'Nuevo', **extra}
            r = client.post(API_ITEMS, datos, format='json')
            self.assertEqual(r.status_code, 400, extra)
            self.assertIn(campo, r.data, extra)
        self.assertFalse(MenuItem.objects.filter(name='Nuevo').exists())
        r = client.post(API_ITEMS, {'name': 'Agua', 'price': '1', 'preparation_time': 0}, format='json')
        self.assertEqual(r.status_code, 201)

    def test_multipart_sin_booleanos_no_crea_el_producto_agotado(self):
        r = self.como('cafe_admin').post(
            API_ITEMS, {'name': 'Pan de yuca', 'price': '1.90', 'category': ''}, format='multipart'
        )
        self.assertEqual(r.status_code, 201, r.content)
        item = MenuItem.objects.get(pk=r.data['id'])
        self.assertTrue(item.is_available and item.is_active)
        self.assertIsNone(item.category)
        self.assertFalse(item.is_vegan)

    def test_patch_json_con_la_url_de_la_foto_se_ignora(self):
        r = self.como('cafe_admin').patch(
            self.item_url(self.cappuccino), {'image': 'http://x/media/a.webp', 'price': '3.00'}, format='json'
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['price'], '3.00')
        self.assertTrue(RegistroAuditoria.objects.filter(accion='menu.producto.precio').exists())


class LecturaTests(PruebaCarta):
    def test_costo_y_margen_solo_para_gestion(self):
        for rol in ('camarero', 'cajero', 'cocinero', 'gerente'):
            client = self.como(rol)
            fila = client.get(API_ITEMS).data['results'][0]
            self.assertNotIn('cost', fila, rol)
            self.assertNotIn('profit_margin', fila, rol)
            detalle = client.get(f'{API_CATEGORIAS}{self.bebidas.pk}/').data
            self.assertNotIn('cost', detalle['items'][0], rol)
            self.assertNotIn('cost', client.get(f'{API_CATEGORIAS}{self.bebidas.pk}/items/').data[0], rol)
            self.assertNotIn('cost', client.get(f'{API_ITEMS}by_category/').data[0]['items'][0], rol)
        for rol in ('cafe_admin', 'distribuidor_admin', 'super_admin'):
            fila = self.como(rol).get(f'{API_ITEMS}?tenant={self.tenant.pk}').data['results'][0]
            self.assertEqual(fila['cost'], '0.90', rol)
            self.assertEqual(fila['profit_margin'], Decimal('67.86'), rol)

    def test_visibilidad_por_rol(self):
        inactivo = MenuItem.objects.create(
            tenant=self.tenant, name='Colada morada', slug='colada', price=Decimal('2'), is_active=False,
        )

        def ids(rol, ruta=API_ITEMS):
            return {fila['id'] for fila in self.como(rol).get(ruta).data['results']}

        todos = {str(self.cappuccino.pk), str(self.agotado.pk), str(inactivo.pk)}
        self.assertEqual(ids('cafe_admin'), todos)
        self.assertEqual(ids('cafe_admin', f'{API_ITEMS}?is_active=true'), todos - {str(inactivo.pk)})
        # El gerente ve los agotados (para volver a marcarlos disponibles); el camarero, solo lo que se puede pedir
        self.assertEqual(ids('gerente'), {str(self.cappuccino.pk), str(self.agotado.pk)})
        self.assertEqual(ids('camarero'), {str(self.cappuccino.pk)})

        # Categoría oculta: sale de la carta que se sirve (con sus productos) salvo para gestión
        Category.objects.filter(pk=self.postres.pk).update(is_active=False)
        self.assertEqual(ids('cafe_admin'), todos)
        self.assertEqual(ids('gerente'), {str(self.cappuccino.pk)})
        self.assertEqual(ids('cafe_admin', API_CATEGORIAS), {str(self.bebidas.pk), str(self.postres.pk)})
        self.assertEqual(ids('camarero', API_CATEGORIAS), {str(self.bebidas.pk)})

    def test_productos_sin_categoria_no_desaparecen(self):
        suelto = MenuItem.objects.create(tenant=self.tenant, name='Agua', slug='agua', price=Decimal('1'))
        client = self.como('camarero')
        grupos = client.get(f'{API_ITEMS}by_category/').data
        self.assertEqual([g['category']['name'] for g in grupos], ['Bebidas', 'Sin categoría'])
        self.assertIsNone(grupos[-1]['category']['id'])
        self.assertEqual([i['id'] for i in grupos[-1]['items']], [str(suelto.pk)])
        filas = self.como('cafe_admin').get(f'{API_ITEMS}?category__isnull=true').data['results']
        self.assertEqual([f['id'] for f in filas], [str(suelto.pk)])
        # Orden por defecto: por categoría y los sin categoría al final
        filas = self.como('cafe_admin').get(API_ITEMS).data['results']
        self.assertEqual(filas[-1]['id'], str(suelto.pk))
        self.assertIsNone(filas[-1]['category_name'])

    def test_stats(self):
        r = self.como('cafe_admin').get(f'{API_ITEMS}stats/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data, {
            'total_items': 2, 'available_items': 1, 'unavailable_items': 1, 'inactive_items': 0,
            'items_with_image': 0, 'total_categories': 2, 'average_price': '3.50',
        })
        r = self.como('camarero').get(f'{API_ITEMS}stats/')
        self.assertEqual((r.data['total_items'], r.data['total_categories']), (1, 2))
        r = self.como('super_admin').get(f'{API_ITEMS}stats/?tenant={self.otro_tenant.pk}')
        self.assertEqual((r.data['total_items'], r.data['total_categories']), (1, 1))


class BorradoYOrdenTests(PruebaCarta):
    def test_borrar_producto_con_pedidos_lo_desactiva(self):
        pedido = Order.objects.create(tenant=self.tenant, cafeteria=self.cafe, order_type='takeaway')
        OrderItem.objects.create(order=pedido, menu_item=self.cappuccino, quantity=1, unit_price=Decimal('2.80'))
        r = self.como('cafe_admin').delete(self.item_url(self.cappuccino))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.data['desactivado'])
        self.assertIn('se desactivó', r.data['detail'])
        self.cappuccino.refresh_from_db()
        self.assertFalse(self.cappuccino.is_active)
        self.assertEqual(RegistroAuditoria.objects.filter(accion='menu.producto.eliminar').count(), 0)
        self.assertEqual(RegistroAuditoria.objects.filter(accion='menu.producto.desactivar').count(), 1)
        # Se puede reactivar
        r = self.como('cafe_admin').patch(self.item_url(self.cappuccino), {'is_active': True}, format='json')
        self.assertTrue(r.data['is_active'])

    def test_borrar_producto_sin_pedidos_lo_elimina(self):
        r = self.como('cafe_admin').delete(self.item_url(self.agotado))
        self.assertEqual((r.status_code, r.data['desactivado']), (200, False))
        self.assertFalse(MenuItem.objects.filter(pk=self.agotado.pk).exists())

    def test_borrar_categoria_deja_sus_productos_sin_categoria(self):
        r = self.como('cafe_admin').delete(f'{API_CATEGORIAS}{self.bebidas.pk}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['productos_sin_categoria'], 1)
        self.cappuccino.refresh_from_db()
        self.assertIsNone(self.cappuccino.category)
        self.assertTrue(self.cappuccino.is_active)

    def test_crear_categoria_sin_orden_va_al_final_y_reordenar(self):
        client = self.como('cafe_admin')
        r = client.post(API_CATEGORIAS, {'name': 'Brunch'}, format='json')
        brunch = r.data['id']
        self.assertEqual(r.data['order'], 2)

        r = client.post(f'{API_CATEGORIAS}reordenar/', {'ids': [brunch, str(self.bebidas.pk)]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual([c['name'] for c in r.data], ['Brunch', 'Bebidas', 'Postres'])
        self.assertEqual([c['order'] for c in r.data], [0, 1, 2])
        nombres = [c['name'] for c in client.get(API_CATEGORIAS).data['results']]
        self.assertEqual(nombres, ['Brunch', 'Bebidas', 'Postres'])

        for ids in ([], [brunch, brunch], [str(self.otra_categoria.pk)], ['no-es-uuid'], 'x'):
            r = client.post(f'{API_CATEGORIAS}reordenar/', {'ids': ids}, format='json')
            self.assertEqual(r.status_code, 400, ids)
        self.assertEqual(self.como('gerente').post(
            f'{API_CATEGORIAS}reordenar/', {'ids': [brunch]}, format='json').status_code, 403)
