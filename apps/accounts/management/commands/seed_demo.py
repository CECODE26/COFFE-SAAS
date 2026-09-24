"""
Pobla la base de datos con datos de demostración.

    python manage.py seed_demo          # crea datos si no existen
    python manage.py seed_demo --reset  # borra todo y vuelve a crear

Cuentas (contraseña para todas: admin123, excepto admin@coffe.com -> admin):
    superadmin@coffe.com   Super Admin (plataforma)
    distribuidor@coffe.com Admin Distribuidor (Andes Coffee Group)
    admin@coffe.com        Admin Cafetería (Café La Floresta)
"""
import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import User
from apps.cafeterias.models import Cafeteria
from apps.menu.models import Category, MenuItem
from apps.mesas.models import Mesa, Reserva
from apps.pedidos.models import Order, OrderItem
from apps.tenants.models import Tenant

PASSWORD = 'admin123'

TENANTS = [
    {
        'name': 'Andes Coffee Group', 'city': 'Quito', 'plan': 'pro', 'status': 'active',
        'ruc': '1791234567001', 'business_name': 'Andes Coffee Group S.A.',
        'email': 'contacto@andescoffee.ec', 'phone': '+593 2 245 1100',
        'cafes': [
            ('Café La Floresta', 'Quito', 'Av. 12 de Octubre y Coruña'),
            ('Café Cumbayá', 'Quito', 'Av. Interoceánica km 12'),
            ('Café Centro Histórico', 'Quito', 'Calle García Moreno N4-52'),
        ],
    },
    {
        'name': 'Café del Pacífico', 'city': 'Guayaquil', 'plan': 'basic', 'status': 'active',
        'ruc': '0992345678001', 'business_name': 'Pacífico Cafés Cía. Ltda.',
        'email': 'hola@cafedelpacifico.ec', 'phone': '+593 4 260 3300',
        'cafes': [
            ('Pacífico Malecón', 'Guayaquil', 'Malecón Simón Bolívar'),
            ('Pacífico Samborondón', 'Samborondón', 'Plaza Lagos, local 14'),
        ],
    },
    {
        'name': 'Montaña Roast', 'city': 'Cuenca', 'plan': 'free', 'status': 'active',
        'ruc': '0103456789001', 'business_name': 'Montaña Roast',
        'email': 'info@montanaroast.ec', 'phone': '+593 7 283 4400',
        'cafes': [('Montaña Roast Calderón', 'Cuenca', 'Calle Larga 7-45')],
    },
    {
        'name': 'Galápagos Brew Co.', 'city': 'Puerto Ayora', 'plan': 'enterprise', 'status': 'suspended',
        'ruc': '2004567890001', 'business_name': 'Galápagos Brew Company S.A.',
        'email': 'brew@galapagosbrew.ec', 'phone': '+593 5 252 5500',
        'cafes': [
            ('Brew Puerto Ayora', 'Puerto Ayora', 'Av. Charles Darwin'),
            ('Brew San Cristóbal', 'Puerto Baquerizo', 'Malecón Charles Darwin'),
        ],
    },
    {
        'name': 'Loja Tostadores', 'city': 'Loja', 'plan': 'basic', 'status': 'inactive',
        'ruc': '1105678901001', 'business_name': 'Loja Tostadores Artesanales',
        'email': 'tostadores@loja.ec', 'phone': '+593 7 257 6600',
        'cafes': [('Tostadores Vilcabamba', 'Loja', 'Parque central de Vilcabamba')],
    },
]

PLAN_LIMITS = {
    'free': (1, 10), 'basic': (5, 50), 'pro': (20, 500), 'enterprise': (999, 9999),
}

MENU = [
    ('Café de especialidad', '☕', [
        ('Espresso', 'Doble shot de altura, notas de cacao y panela.', '1.80', 3, dict(is_vegan=True)),
        ('Cappuccino', 'Espresso con leche texturizada y espuma sedosa.', '2.80', 4, dict(is_vegetarian=True)),
        ('Flat White', 'Ristretto doble con microespuma.', '3.10', 4, dict(is_vegetarian=True)),
        ('V60 de origen', 'Filtrado a mano, grano de Loja lavado.', '3.50', 6, dict(is_vegan=True)),
        ('Mocaccino', 'Espresso, chocolate de Esmeraldas y leche.', '3.40', 5, dict(is_vegetarian=True)),
    ]),
    ('Bebidas frías', '🧊', [
        ('Cold Brew', 'Infusión en frío por 18 horas.', '3.20', 2, dict(is_vegan=True)),
        ('Iced Latte de vainilla', 'Espresso, leche y vainilla natural sobre hielo.', '3.60', 3, dict(is_vegetarian=True)),
        ('Limonada de hierbaluisa', 'Refrescante y cítrica.', '2.50', 3, dict(is_vegan=True)),
    ]),
    ('Panadería', '🥐', [
        ('Croissant de mantequilla', 'Hojaldre horneado cada mañana.', '2.20', 2, dict(is_vegetarian=True, has_gluten=True)),
        ('Pan de yuca', 'Tres unidades, recién salidos del horno.', '1.90', 4, dict(is_vegetarian=True)),
        ('Rol de canela', 'Con glaseado de queso crema.', '2.60', 2, dict(is_vegetarian=True, has_gluten=True)),
    ]),
    ('Brunch', '🍳', [
        ('Tostada de aguacate', 'Pan de masa madre, huevo pochado y semillas.', '6.50', 12, dict(is_vegetarian=True, has_gluten=True)),
        ('Bolón de verde mixto', 'Queso y chicharrón, con huevo frito.', '5.80', 15, dict()),
        ('Bowl de açaí', 'Granola, banano y frutos rojos.', '6.20', 8, dict(is_vegan=True)),
    ]),
    ('Postres', '🍰', [
        ('Cheesecake de maracuyá', 'Base de galleta y coulis de maracuyá.', '4.20', 3, dict(is_vegetarian=True, has_gluten=True)),
        ('Brownie de cacao 70%', 'Con nueces, tibio.', '3.30', 3, dict(is_vegetarian=True, has_gluten=True)),
    ]),
]

FIRST_NAMES = ['Sofía', 'Mateo', 'Valentina', 'Sebastián', 'Camila', 'Nicolás', 'Isabella', 'Diego',
               'Martina', 'Joaquín', 'Lucía', 'Andrés', 'Emilia', 'Gabriel', 'Paula', 'Tomás']
LAST_NAMES = ['Andrade', 'Villacís', 'Cedeño', 'Paredes', 'Mora', 'Zambrano', 'Salazar', 'Guerrero',
              'Ortiz', 'Espinoza', 'Chávez', 'Montalvo']
LOCATIONS = ['Terraza', 'Ventanal', 'Salón principal', 'Barra', 'Jardín', 'Rincón lectura']
NOTES = ['Cumpleaños, traerán pastel', 'Prefieren mesa junto a la ventana', 'Silla para bebé',
         'Reunión de trabajo, necesitan enchufe', '']


class Command(BaseCommand):
    help = 'Crea datos de demostración (super admin, distribuidores, cafeterías, menú, mesas, pedidos, reservas)'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='Borra los datos existentes antes de sembrar')

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(42)

        if options['reset']:
            self.stdout.write('Borrando datos existentes…')
            Mesa.objects.update(current_order=None)
            for model in (OrderItem, Order, Reserva, Mesa, MenuItem, Category, User, Cafeteria, Tenant):
                model.objects.all().delete()
        elif Tenant.objects.exists():
            self.stdout.write(self.style.WARNING('Ya hay datos. Usa --reset para regenerarlos.'))
            return

        User.objects.create_superuser(
            email='superadmin@coffe.com', password=PASSWORD,
            first_name='Janick', last_name='Cevallos',
        )

        now = timezone.now()
        for t_idx, data in enumerate(TENANTS):
            max_cafes, max_users = PLAN_LIMITS[data['plan']]
            tenant = Tenant.objects.create(
                name=data['name'], slug=slugify(data['name']), email=data['email'], phone=data['phone'],
                city=data['city'], address=data['cafes'][0][2], ruc=data['ruc'],
                business_name=data['business_name'], plan=data['plan'], status=data['status'],
                is_active=data['status'] == 'active', max_cafes=max_cafes, max_users=max_users,
                description=f"Distribuidor de cafeterías en {data['city']}.",
                subscription_expires_at=now + timedelta(days=random.randint(-20, 300)),
            )
            # Fechas de alta escalonadas para que el listado tenga historia
            Tenant.objects.filter(pk=tenant.pk).update(created_at=now - timedelta(days=30 * (len(TENANTS) - t_idx) + 7))

            dist_email = 'distribuidor@coffe.com' if t_idx == 0 else f'admin@{tenant.slug}.ec'
            User.objects.create_user(
                email=dist_email, password=PASSWORD, tenant=tenant, role='distribuidor_admin',
                first_name=random.choice(FIRST_NAMES), last_name=random.choice(LAST_NAMES),
            )

            items = self._create_menu(tenant)

            for c_idx, (cafe_name, city, address) in enumerate(data['cafes']):
                cafe = Cafeteria.objects.create(
                    tenant=tenant, name=cafe_name, slug=slugify(cafe_name), city=city, address=address,
                    phone=f'+593 9{random.randint(10000000, 99999999)}',
                    email=f'{slugify(cafe_name)}@{tenant.slug}.ec',
                    max_tables=12, capacity=random.choice([40, 50, 60]),
                    is_active=not (t_idx == 3 and c_idx == 1),
                )
                self._create_staff(tenant, cafe, is_main=(t_idx == 0 and c_idx == 0))
                mesas = self._create_mesas(tenant, cafe)
                self._create_orders(tenant, cafe, mesas, items, t_idx, c_idx)
                self._create_reservas(mesas)

        self.stdout.write(self.style.SUCCESS(
            f'Listo: {Tenant.objects.count()} distribuidores, {Cafeteria.objects.count()} cafeterías, '
            f'{User.objects.count()} usuarios, {Mesa.objects.count()} mesas, '
            f'{Order.objects.count()} pedidos, {Reserva.objects.count()} reservas.'
        ))
        self.stdout.write('\nCuentas demo:')
        self.stdout.write(f'  superadmin@coffe.com   / {PASSWORD}  (Super Admin)')
        self.stdout.write(f'  distribuidor@coffe.com / {PASSWORD}  (Distribuidor)')
        self.stdout.write('  admin@coffe.com        / admin     (Cafetería)')

    def _create_menu(self, tenant):
        items = []
        for order, (cat_name, icon, products) in enumerate(MENU):
            cat = Category.objects.create(tenant=tenant, name=cat_name, slug=slugify(cat_name), icon=icon, order=order)
            for name, desc, price, prep, flags in products:
                price = Decimal(price)
                items.append(MenuItem.objects.create(
                    tenant=tenant, category=cat, name=name, slug=slugify(name), description=desc,
                    price=price, cost=(price * Decimal('0.35')).quantize(Decimal('0.01')),
                    preparation_time=prep, **flags,
                ))
        return items

    def _create_staff(self, tenant, cafe, is_main):
        if is_main:
            User.objects.create_user(
                email='admin@coffe.com', password='admin', tenant=tenant, cafeteria=cafe,
                role='cafe_admin', first_name='Janick', last_name='Cevallos',
            )
        else:
            User.objects.create_user(
                email=f'admin.{cafe.slug}@coffe.com', password=PASSWORD, tenant=tenant, cafeteria=cafe,
                role='cafe_admin', first_name=random.choice(FIRST_NAMES), last_name=random.choice(LAST_NAMES),
            )
        for role in ['gerente', 'camarero', 'camarero', 'cajero', 'cocinero']:
            first = random.choice(FIRST_NAMES)
            User.objects.create_user(
                email=f'{slugify(first)}.{role}.{random.randint(100, 999)}@{cafe.slug}.ec',
                password=PASSWORD, tenant=tenant, cafeteria=cafe, role=role,
                first_name=first, last_name=random.choice(LAST_NAMES),
                is_active=random.random() > 0.1,
            )

    def _create_mesas(self, tenant, cafe):
        statuses = ['disponible'] * 5 + ['ocupada'] * 3 + ['reservada', 'limpiando']
        mesas = []
        for n in range(1, random.randint(8, 12) + 1):
            capacity = random.choice([2, 2, 4, 4, 4, 6, 8])
            status = random.choice(statuses)
            mesa = Mesa.objects.create(
                tenant=tenant, cafeteria=cafe, number=n, slug=f'mesa-{n}',
                capacity=capacity, min_capacity=1 if capacity <= 2 else 2,
                qr_code=f'{cafe.id.hex[:8]}-M{n:02d}', status=status,
                location=random.choice(LOCATIONS),
                guest_count=random.randint(1, capacity) if status == 'ocupada' else 0,
                occupied_since=timezone.now() - timedelta(minutes=random.randint(5, 90)) if status == 'ocupada' else None,
            )
            mesas.append(mesa)
        return mesas

    def _create_orders(self, tenant, cafe, mesas, items, t_idx, c_idx):
        staff = list(User.objects.filter(cafeteria=cafe, role__in=['camarero', 'cajero', 'cafe_admin']))
        flow = ['pendiente', 'confirmada', 'preparando', 'lista', 'entregada', 'entregada', 'entregada', 'cancelada']
        now = timezone.now()
        for i in range(random.randint(10, 16)):
            status = random.choice(flow)
            order_type = random.choice(['mesa', 'mesa', 'mesa', 'takeaway', 'delivery'])
            mesa = random.choice(mesas) if order_type == 'mesa' else None
            created = now - timedelta(minutes=random.randint(3, 60 * 24 * 3))
            order = Order.objects.create(
                tenant=tenant, cafeteria=cafe, order_type=order_type, mesa=mesa, status=status,
                order_number=f'PED-{t_idx + 1}{c_idx + 1}-{created:%m%d}-{i + 1:03d}',
                created_by=random.choice(staff) if staff else None,
                customer_name=f'{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}' if order_type != 'mesa' else '',
                is_paid=status == 'entregada' and random.random() > 0.3,
            )
            for menu_item in random.sample(items, random.randint(1, 4)):
                OrderItem.objects.create(
                    order=order, menu_item=menu_item, quantity=random.randint(1, 3), unit_price=menu_item.price,
                    status='entregada' if status == 'entregada' else 'pendiente',
                )
            order.calculate_total()
            if order.is_paid:
                order.payment_method = random.choice(['efectivo', 'tarjeta', 'transferencia'])
                order.paid_at = created + timedelta(minutes=30)
            Order.objects.filter(pk=order.pk).update(
                created_at=created, payment_method=order.payment_method, paid_at=order.paid_at,
            )
            if mesa and mesa.status == 'ocupada' and status in ('confirmada', 'preparando', 'lista') and not mesa.current_order:
                mesa.current_order = order
                mesa.save(update_fields=['current_order'])

    def _create_reservas(self, mesas):
        today = timezone.localdate()
        for _ in range(random.randint(3, 6)):
            mesa = random.choice(mesas)
            Reserva.objects.create(
                mesa=mesa,
                customer_name=f'{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}',
                customer_phone=f'+593 9{random.randint(10000000, 99999999)}',
                customer_email=random.choice(['', f'cliente{random.randint(1, 999)}@gmail.com']),
                guest_count=random.randint(1, mesa.capacity),
                reservation_date=today + timedelta(days=random.randint(0, 10)),
                reservation_time=f'{random.randint(8, 20):02d}:{random.choice(["00", "30"])}',
                status=random.choice(['pendiente', 'pendiente', 'confirmada', 'confirmada', 'cancelada']),
                notes=random.choice(NOTES),
            )
