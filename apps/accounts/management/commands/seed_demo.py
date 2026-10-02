"""
Pobla la base de datos con datos de demostración.

    python manage.py seed_demo          # crea datos si no existen
    python manage.py seed_demo --reset  # borra todo y vuelve a crear

Cuentas (contraseña para todas: admin123, excepto admin@coffe.com -> admin):
    superadmin@coffe.com   Super Admin (plataforma)
    distribuidor@coffe.com Admin Distribuidor (Andes Coffee Group)
    admin@coffe.com        Admin Cafetería / dueño (Café La Floresta)
    gerente@coffe.com, camarero@coffe.com, cajero@coffe.com, cocinero@coffe.com
                           Equipo de Café La Floresta

Los datos se generan alrededor de la hora actual (America/Guayaquil) para que todo cuadre:
    - Hoy: pedidos desde la apertura de cada local hasta ahora; los más recientes siguen en curso.
      En los locales que se enseñan (RECIENTES) los últimos pedidos del día son fijos, así siempre
      hay pedidos pendientes, confirmados, en preparación y listos.
    - Un pedido está "abierto" si no está cancelado ni pagado. Una mesa está 'ocupada' si y solo si
      tiene exactamente un pedido de mesa abierto del personal (en curso, o entregado esperando el
      cobro) o comensales conectados por QR (sesiones activas). Todo lo demás que se entregó ya está
      cobrado. Las reservas de las próximas 2 horas dejan su mesa como 'reservada'.
    - Pedidos por QR (ESCENARIO_QR): en el local principal, una mesa con el grupo ANA + BETO (ya
      pidieron la cuenta) y CARLOS aparte (llamó al mesero), y otra mesa con una persona. Sus pedidos
      llevan sesion_cliente y el alias como customer_name, y están repartidos por el tablero.
    - Historial: 3 jornadas completas antes de hoy (DIAS_HISTORIAL), al mismo ritmo.
    - Distribuidores suspendidos/inactivos y locales cerrados: solo sus 2 últimas jornadas antes del
      cierre (DIAS_HISTORIAL_CERRADO) y su personal queda inactivo (el admin del distribuidor no).
    - Fotos: si existe frontend/public/img/croissant.jpg, el «Croissant de mantequilla» de cada carta la
      lleva (procesada como las que sube el dueño: WebP + miniatura). No se descarga nada de internet.
"""
import random
from collections import defaultdict
from datetime import datetime, time, timedelta
from decimal import Decimal
from itertools import product

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import User
from apps.auditoria.models import RegistroAuditoria, SolicitudDatos
from apps.cafeterias.models import Cafeteria
from apps.comensales.models import AlertaMesero, SesionCliente, SolicitudPago, SolicitudUnion
from apps.menu.imagenes import ImagenInvalida, aplicar_imagen, procesar_imagen
from apps.menu.models import Category, MenuItem
from apps.mesas.models import Mesa, Reserva, generar_token_qr
from apps.pedidos.models import Order, OrderItem
from apps.tenants.models import Tenant

PASSWORD = 'admin123'

ACTIVOS = ('pendiente', 'confirmada', 'preparando', 'lista')

DIAS_HISTORIAL = 3          # jornadas completas antes de hoy en los locales abiertos
DIAS_HISTORIAL_CERRADO = 2  # últimas jornadas de un local antes de cerrar

# Pedidos por hora (hora valle, hora pico) según el local
RITMO_PRINCIPAL = (5, 10)
RITMO_ABIERTO = (1.2, 3)   # pedidos/hora: hora floja → hora pico
RITMO_CERRADO = (1, 3)      # los locales que cerraron tenían poco movimiento

# Afluencia por hora del día: 0 = hora valle, 1 = hora pico (desayuno fuerte, almuerzo moderado)
AFLUENCIA = {7: 0.35, 8: 0.85, 9: 1.0, 10: 0.55, 11: 0.25, 12: 0.4, 13: 0.5, 14: 0.25,
             15: 0.05, 16: 0.1, 17: 0.25, 18: 0.2, 19: 0.1}

# Últimos pedidos de hoy, fijos, en los locales que se enseñan en la demo (a cualquier hora que se
# siembre): (hace cuántos minutos entró, estado, tipo). 'por_cobrar' = entregado en mesa y los
# clientes siguen sentados esperando la cuenta. Los pedidos del día anteriores a estos ya se cerraron.
RECIENTES = {
    'Café La Floresta': [
        (1, 'pendiente', 'mesa'), (3, 'confirmada', 'takeaway'), (5, 'preparando', 'mesa'),
        (7, 'preparando', 'delivery'), (13, 'lista', 'mesa'), (19, 'lista', 'takeaway'),
        (32, 'por_cobrar', 'mesa'), (46, 'por_cobrar', 'mesa'),
    ],
    'Pacífico Malecón': [(2, 'pendiente', 'mesa'), (6, 'confirmada', 'takeaway'), (11, 'preparando', 'mesa')],
    'Café Centro Histórico': [(4, 'confirmada', 'takeaway'), (9, 'preparando', 'mesa')],
    'Café Cumbayá': [(6, 'preparando', 'mesa')],
}

# Comensales que piden desde su celular (QR) en el local principal. Tiempos en minutos antes de sembrar.
#   sesiones: (alias, llegó hace, alias de la fundadora del grupo al que se unió o None, última actividad hace)
#   pedidos:  (alias, hace cuánto lo pidió, estado); 'por_cobrar' = entregado y aún sin cobrar
#   cuenta:   (quién la pidió, tipo, método preferido, hace cuánto) -> SolicitudPago pendiente + alerta 'cuenta'
#   alertas:  (alias, tipo, hace cuánto) sin atender
# Cada mesa se elige entre las que tienen sitio para todos y el personal no sienta a nadie más en ella
# desde un rato antes de que llegue el primero (QR_MARGEN_MIN).
ESCENARIO_QR = [
    dict(
        # ANA fundó el grupo y BETO se unió (ella lo aceptó); ya comieron y BETO pidió la cuenta grupal.
        # CARLOS vino aparte: tiene un pedido en cocina y otro recién enviado, y llamó al mesero.
        sesiones=[('ANA', 44, None, 7), ('BETO', 42, 'ANA', 5), ('CARLOS', 16, None, 1)],
        pedidos=[('ANA', 40, 'por_cobrar'), ('BETO', 37, 'por_cobrar'),
                 ('CARLOS', 12, 'preparando'), ('CARLOS', 2, 'pendiente')],
        cuenta=('BETO', 'grupal', 'tarjeta', 5),
        alertas=[('CARLOS', 'ayuda', 1)],
    ),
    dict(
        # Una persona sola: un pedido listo para servir y otro en cola de cocina
        sesiones=[('SOFÍA', 18, None, 4)],
        pedidos=[('SOFÍA', 15, 'lista'), ('SOFÍA', 4, 'confirmada')],
    ),
]
QR_MARGEN_MIN = 80  # un pedido del personal ocupa la mesa hasta 75 min (y se cobra antes de irse)

MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
         'octubre', 'noviembre', 'diciembre']

# Cada local: nombre, ciudad, dirección, horario, días desde el alta del distribuidor hasta su apertura
# y, si ya cerró, hace cuántos días. Si el distribuidor no está activo, todos sus locales cierran
# el día de la baja (o antes).
TENANTS = [
    {
        'name': 'Andes Coffee Group', 'city': 'Quito', 'plan': 'pro', 'status': 'active',
        'ruc': '1791234567001', 'business_name': 'Andes Coffee Group S.A.',
        'email': 'contacto@andescoffee.ec', 'phone': '+593 2 245 1100', 'vence_en': 210,
        'cafes': [
            dict(nombre='Café La Floresta', ciudad='Quito', direccion='Av. 12 de Octubre y Coruña',
                 abre='07:00', cierra='21:00', alta=1, mesas=12, principal=True),
            dict(nombre='Café Cumbayá', ciudad='Quito', direccion='Av. Interoceánica km 12',
                 abre='07:30', cierra='21:00', alta=40, mesas=10,
                 # Ex camarero (cuenta desactivada hace 40 días) que pidió acceso a sus datos (LOPDP)
                 exequipo=[('camarero', 'Andrés', 'Yépez', 40)]),
            dict(nombre='Café Centro Histórico', ciudad='Quito', direccion='Calle García Moreno N4-52',
                 abre='08:00', cierra='20:00', alta=75),
            dict(nombre='Café Quicentro', ciudad='Quito',
                 direccion='C.C. Quicentro Shopping, Av. Naciones Unidas y Av. de los Shyris',
                 abre='08:00', cierra='21:00', alta=20, cerrada_hace=38),
        ],
    },
    {
        'name': 'Café del Pacífico', 'city': 'Guayaquil', 'plan': 'basic', 'status': 'active',
        'ruc': '0992345678001', 'business_name': 'Pacífico Cafés Cía. Ltda.',
        'email': 'hola@cafedelpacifico.ec', 'phone': '+593 4 260 3300', 'vence_en': 95,
        'cafes': [
            dict(nombre='Pacífico Malecón', ciudad='Guayaquil', direccion='Malecón Simón Bolívar',
                 abre='07:00', cierra='22:00', alta=2, mesas=11),
            dict(nombre='Pacífico Samborondón', ciudad='Samborondón', direccion='Plaza Lagos, local 14',
                 abre='08:00', cierra='21:30', alta=45),
        ],
    },
    {
        'name': 'Montaña Roast', 'city': 'Cuenca', 'plan': 'free', 'status': 'active',
        'ruc': '0103456789001', 'business_name': 'Montaña Roast',
        'email': 'info@montanaroast.ec', 'phone': '+593 7 283 4400', 'vence_en': 12,
        'cafes': [
            dict(nombre='Montaña Roast Calle Larga', ciudad='Cuenca', direccion='Calle Larga 7-45',
                 abre='07:30', cierra='20:00', alta=3),
        ],
    },
    {
        'name': 'Galápagos Brew Co.', 'city': 'Puerto Ayora', 'plan': 'enterprise', 'status': 'suspended',
        'ruc': '2004567890001', 'business_name': 'Galápagos Brew Company S.A.',
        'email': 'brew@galapagosbrew.ec', 'phone': '+593 5 252 5500', 'baja_hace': 14,
        'cafes': [
            dict(nombre='Brew Puerto Ayora', ciudad='Puerto Ayora', direccion='Av. Charles Darwin',
                 abre='07:00', cierra='20:30', alta=2),
            dict(nombre='Brew San Cristóbal', ciudad='Puerto Baquerizo', direccion='Malecón Charles Darwin',
                 abre='07:30', cierra='20:00', alta=12, cerrada_hace=26),
        ],
    },
    {
        'name': 'Loja Tostadores', 'city': 'Loja', 'plan': 'basic', 'status': 'inactive',
        'ruc': '1105678901001', 'business_name': 'Loja Tostadores Artesanales',
        'email': 'tostadores@loja.ec', 'phone': '+593 7 257 6600', 'baja_hace': 19,
        'cafes': [
            dict(nombre='Tostadores Vilcabamba', ciudad='Loja', direccion='Parque central de Vilcabamba',
                 abre='08:00', cierra='20:00', alta=2),
        ],
    },
]

PLAN_LIMITS = {
    'free': (1, 10), 'basic': (5, 50), 'pro': (20, 500), 'enterprise': (999, 9999),
}

MENU = [
    ('Café de especialidad', '☕', [
        ('Espresso', 'Doble shot de altura, notas de cacao y panela.', '1.80', 3, dict(is_vegan=True, is_vegetarian=True)),
        ('Cappuccino', 'Espresso con leche texturizada y espuma sedosa.', '2.80', 4, dict(is_vegetarian=True)),
        ('Flat White', 'Ristretto doble con microespuma.', '3.10', 4, dict(is_vegetarian=True)),
        ('V60 de origen', 'Filtrado a mano, grano de Loja lavado.', '3.50', 6, dict(is_vegan=True, is_vegetarian=True)),
        ('Mocaccino', 'Espresso, chocolate de Esmeraldas y leche.', '3.40', 5, dict(is_vegetarian=True)),
    ]),
    ('Bebidas frías', '🧊', [
        ('Cold Brew', 'Infusión en frío por 18 horas.', '3.20', 2, dict(is_vegan=True, is_vegetarian=True)),
        ('Iced Latte de vainilla', 'Espresso, leche y vainilla natural sobre hielo.', '3.60', 3, dict(is_vegetarian=True)),
        ('Limonada de hierbaluisa', 'Refrescante y cítrica.', '2.50', 3, dict(is_vegan=True, is_vegetarian=True)),
    ]),
    ('Panadería', '🥐', [
        ('Croissant de mantequilla', 'Hojaldre horneado cada mañana.', '2.20', 2, dict(is_vegetarian=True, has_gluten=True)),
        ('Pan de yuca', 'Tres unidades, recién salidos del horno.', '1.90', 4, dict(is_vegetarian=True)),
        ('Rol de canela', 'Con glaseado de queso crema.', '2.60', 2, dict(is_vegetarian=True, has_gluten=True)),
    ]),
    ('Brunch', '🍳', [
        ('Tostada de aguacate', 'Pan de masa madre, huevo pochado y semillas.', '6.50', 12, dict(is_vegetarian=True, has_gluten=True)),
        ('Bolón de verde mixto', 'Queso y chicharrón, con huevo frito.', '5.80', 15, dict()),
        ('Bowl de açaí', 'Granola, banano y frutos rojos.', '6.20', 8, dict(is_vegan=True, is_vegetarian=True)),
    ]),
    ('Postres', '🍰', [
        ('Cheesecake de maracuyá', 'Base de galleta y coulis de maracuyá.', '4.20', 3, dict(is_vegetarian=True, has_gluten=True)),
        ('Brownie de cacao 70%', 'Con nueces, tibio.', '3.30', 3, dict(is_vegetarian=True, has_gluten=True)),
    ]),
]

# Fotos reales de la carta demo (archivos en frontend/public/img; si no están, el producto queda sin foto)
FOTOS_DEMO = {
    'Croissant de mantequilla': 'croissant.jpg',
}

FIRST_NAMES = [
    'Sofía', 'Mateo', 'Valentina', 'Sebastián', 'Camila', 'Nicolás', 'Isabella', 'Diego', 'Martina',
    'Joaquín', 'Lucía', 'Andrés', 'Emilia', 'Gabriel', 'Paula', 'Tomás', 'Daniela', 'Santiago',
    'Gabriela', 'Alejandro', 'María José', 'Juan Pablo', 'Carolina', 'Fernando', 'Estefanía', 'Ricardo',
    'Doménica', 'Esteban', 'Karla', 'Javier', 'Verónica', 'Luis', 'Paola', 'Jorge', 'Andrea', 'Carlos',
    'Mishel', 'David', 'Natalia', 'Francisco', 'Belén', 'Patricio', 'Adriana', 'Cristian', 'Jessica',
    'Marco', 'Tatiana', 'Byron', 'Johanna', 'Wilson', 'Cristina', 'Kevin', 'Anahí', 'Bryan', 'Lorena',
    'Fabián', 'Diana', 'Miguel', 'Mónica', 'Rafael', 'Pamela', 'Henry', 'Viviana', 'Oswaldo',
    'Katherine', 'Edison', 'Rocío', 'Galo', 'Silvia', 'Hernán',
]
LAST_NAMES = [
    'Andrade', 'Villacís', 'Cedeño', 'Paredes', 'Mora', 'Zambrano', 'Salazar', 'Guerrero', 'Ortiz',
    'Espinoza', 'Chávez', 'Montalvo', 'Cevallos', 'Vera', 'Moreira', 'Intriago', 'Macías', 'Loor',
    'Ponce', 'Vásquez', 'Ramírez', 'Torres', 'Herrera', 'Jaramillo', 'Castillo', 'Benítez', 'Carrión',
    'Suárez', 'Pazmiño', 'Naranjo', 'Calle', 'Ordóñez', 'Sarmiento', 'Tapia', 'Guamán', 'Quishpe',
    'Chiluisa', 'Toapanta', 'Cabrera', 'Moscoso', 'Vintimilla', 'Crespo', 'Alvarado', 'Aguirre',
    'Bravo', 'Burbano', 'Estrella', 'Freire', 'Garcés', 'Hidalgo', 'León', 'Maldonado', 'Mejía',
    'Molina', 'Muñoz', 'Narváez', 'Peñaherrera', 'Pinto', 'Proaño', 'Rivadeneira', 'Robalino',
    'Rosero', 'Salinas', 'Terán', 'Unda', 'Vaca', 'Velasco', 'Yánez', 'Zurita', 'Ayala', 'Coronel',
    'Dávila',
]

# Nombres fijos que no deben volver a salir de la bolsa (cuentas conocidas y titulares LOPDP)
SUPERADMIN = ('Janick', 'Cevallos')
EQUIPO_PRINCIPAL = [
    # (correo fijo o None, contraseña, rol, nombre, apellido)
    ('admin@coffe.com', 'admin', 'cafe_admin', 'Gabriela', 'Proaño'),
    ('gerente@coffe.com', PASSWORD, 'gerente', 'Valentina', 'Andrade'),
    ('camarero@coffe.com', PASSWORD, 'camarero', 'Mateo', 'Salazar'),
    (None, PASSWORD, 'camarero', 'Lucía', 'Mora'),
    ('cajero@coffe.com', PASSWORD, 'cajero', 'Sebastián', 'Paredes'),
    ('cocinero@coffe.com', PASSWORD, 'cocinero', 'Camila', 'Zambrano'),
]
ROLES_LOCAL = ['cafe_admin', 'gerente', 'camarero', 'camarero', 'cajero', 'cocinero']

# Solicitudes LOPDP, de la más antigua a la más reciente (así los códigos SD crecen con la fecha).
# Los titulares no son usuarios del sistema, salvo el ex camarero de Café Cumbayá (relación 'usuario'),
# que existe como cuenta desactivada de ese local ('exequipo'); {mes} es el mes en que se fue.
SOLICITUDES = [
    # (días desde que llegó, días hasta resolverse, tipo, relación, estado, nombre, apellido,
    #  prefijo de cédula, cafetería relacionada, detalle, respuesta)
    (25, 4, 'portabilidad', 'cliente', 'completada', 'Ximena', 'Riofrío', '11', 'Tostadores Vilcabamba, Loja',
     'Soy socia de Loja Tostadores y vamos a dejar de usar COFFE-SAAS. Necesitamos exportar el historial '
     'de pedidos, la carta y las reservas de Tostadores Vilcabamba para cambiar de sistema.',
     'Se entregó un archivo CSV con pedidos, carta y reservas de Tostadores Vilcabamba.'),
    (17, None, 'rectificacion', 'cliente', 'recibida', 'Rosa', 'Tenesaca', '01', 'Montaña Roast Calle Larga, Cuenca',
     'Soy socia de Montaña Roast. El RUC de nuestra razón social tiene dos dígitos invertidos en la '
     'cuenta del distribuidor y las facturas salen con ese error.', ''),
    (12, 3, 'eliminacion', 'visitante', 'completada', 'Tomás', 'Alvear', '17', '',
     'Les escribí por WhatsApp pidiendo una demo y ya no me interesa. Borren mis datos, por favor.',
     'Se verificó la identidad y se eliminaron nombre, teléfono y conversación de la base comercial.'),
    (4, None, 'acceso', 'usuario', 'en_revision', 'Andrés', 'Yépez', '17', 'Café Cumbayá, Quito',
     'Trabajé como camarero en Café Cumbayá hasta {mes}. Quiero saber qué datos míos siguen guardados.', ''),
    (1, None, 'eliminacion', 'comensal', 'recibida', 'Paula', 'Chiriboga', '17', 'Café La Floresta, Quito',
     'Hice una reserva en Café La Floresta la semana pasada y quiero que eliminen mi teléfono y correo.', ''),
]

RESERVADOS = {' '.join(SUPERADMIN)} | {f'{e[3]} {e[4]}' for e in EQUIPO_PRINCIPAL} | {
    f'{s[5]} {s[6]}' for s in SOLICITUDES}

LOCATIONS = ['Terraza', 'Ventanal', 'Salón principal', 'Barra', 'Jardín', 'Rincón de lectura', 'Mezzanine']
CAPACIDADES = [2, 2, 4, 4, 4, 6, 8]
CAPACIDAD_MINIMA = {2: 1, 4: 2, 6: 3, 8: 4}

# Notas de reserva válidas en cualquier mesa
NOTES = [
    'Cumpleaños, traerán pastel', 'Silla para bebé', 'Reunión de trabajo, necesitan enchufe',
    'Alergia a los frutos secos', 'Aniversario, algo tranquilo por favor', 'Una persona usa silla de ruedas',
    'Desayuno de equipo, factura con RUC', 'Pueden llegar 10 minutos tarde', 'Primera visita, les recomendó un amigo',
]
# Notas que solo tienen sentido según la ubicación de la mesa reservada
NOTAS_UBICACION = {
    'Terraza': ['Piden la terraza si hace sol', 'Vienen con un perro pequeño'],
    'Jardín': ['Prefieren estar al aire libre', 'Vienen con un perro pequeño'],
    'Ventanal': ['Prefieren mesa junto a la ventana'],
    'Rincón de lectura': ['Buscan un sitio tranquilo para leer'],
}
# Notas que no encajan en ciertas ubicaciones (al mezzanine se sube por escaleras; la barra es de taburetes)
NOTAS_EXCLUIDAS = {
    'Mezzanine': {'Una persona usa silla de ruedas', 'Silla para bebé'},
    'Barra': {'Una persona usa silla de ruedas', 'Silla para bebé'},
}
KITCHEN_NOTES = ['Sin azúcar', 'Con leche de almendras', 'Leche deslactosada', 'Extra caliente', 'Poco hielo',
                 'Sin canela', 'Para compartir', 'El pan bien tostado']
DOMINIOS = ['gmail.com', 'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.es']
DIRECCIONES = {
    'Quito': ['Calle Lérida E14-45, La Floresta', 'Av. República de El Salvador N34-127',
              'Calle Whymper N28-39 y Orellana', 'Av. Eloy Alfaro N32-650', 'Calle Guipúzcoa E14-66',
              'Av. 6 de Diciembre N24-253', 'Calle Francisco de Orellana, Cumbayá'],
    'Guayaquil': ['Av. 9 de Octubre 424 y Chile', 'Cdla. Kennedy Norte, Mz. 105 V. 12',
                  'Urdesa Central, Circunvalación Sur 214', 'Calle Panamá 508 y Junín'],
    'Samborondón': ['Urb. La Puntilla, Mz. 3 V. 8', 'Km 2.5 vía Samborondón, Edif. Xima',
                    'Urb. Ciudad Celeste, Mz. 12 V. 4'],
    'Cuenca': ['Calle Larga 9-51 y Benigno Malo', 'Av. Solano 2-34', 'Calle Bolívar 6-78 y Borrero'],
    'Puerto Ayora': ['Av. Baltra y Floreana', 'Calle Islas Plaza', 'Barrio Pelican Bay'],
    'Puerto Baquerizo': ['Av. Alsacio Northia', 'Calle Española y Hernán Melville'],
    'Loja': ['Av. Eterna Juventud, Vilcabamba', 'Calle Bolívar y Diego Vaca de Vega, Vilcabamba'],
}
ESTADO_ITEM = {'pendiente': 'pendiente', 'confirmada': 'pendiente', 'preparando': 'preparando',
               'lista': 'lista', 'entregada': 'entregada', 'cancelada': 'cancelada'}


def _hora(texto):
    h, m = texto.split(':')
    return time(int(h), int(m))


def _slug(texto):
    return slugify(texto).replace('-', '')


class BolsaNombres:
    """Nombres completos únicos: cada combinación nombre + apellido sale una sola vez."""

    def __init__(self):
        self.disponibles = [c for c in product(FIRST_NAMES, LAST_NAMES) if ' '.join(c) not in RESERVADOS]
        random.shuffle(self.disponibles)

    def sacar(self):
        return self.disponibles.pop()


class Command(BaseCommand):
    help = 'Crea datos de demostración (super admin, distribuidores, cafeterías, menú, mesas, pedidos, reservas)'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='Borra los datos existentes antes de sembrar')
        parser.add_argument(
            '--permitir-produccion', action='store_true',
            help='Permite correrlo con DEBUG=False (crea cuentas con contraseñas conocidas; --reset borra TODO)'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # En producción crearía cuentas con contraseñas públicas y --reset borraría los datos reales
        if not settings.DEBUG and not options['permitir_produccion']:
            raise CommandError(
                'seed_demo es solo para desarrollo: con DEBUG=False no se ejecuta. '
                'Si de verdad es un servidor de demostración, usa --permitir-produccion.'
            )
        random.seed(42)

        if options['reset']:
            self.stdout.write('Borrando datos existentes…')
            Mesa.objects.update(current_order=None)
            # Lo de comensales QR va antes que las mesas (SesionCliente y SolicitudPago las protegen)
            for model in (RegistroAuditoria, SolicitudDatos, AlertaMesero, SolicitudPago, SolicitudUnion,
                          OrderItem, Order, SesionCliente, Reserva, Mesa, MenuItem, Category, User,
                          Cafeteria, Tenant):
                model.objects.all().delete()
        elif Tenant.objects.exists():
            self.stdout.write(self.style.WARNING('Ya hay datos. Usa --reset para regenerarlos.'))
            return

        self.now = timezone.localtime().replace(microsecond=0)
        self.today = self.now.date()
        self.nombres = BolsaNombres()
        # Clientes habituales (pedidos para llevar y reservas): nunca coinciden con un usuario
        self.clientes = [self.nombres.sacar() for _ in range(260)]
        # Cada cliente deja siempre el mismo teléfono y correo (y la misma dirección en cada ciudad)
        self.contactos = {}
        self.direcciones = {}
        self.emails = set()
        self.principal = None
        # Ex empleados con cuenta desactivada: (nombre, apellido) -> (usuario, fecha de baja)
        self.exequipo = {}
        # Fotos demo: nombre del producto -> ImagenProcesada (se procesa una vez; cada producto guarda su copia)
        self.fotos_demo = self._cargar_fotos_demo()

        superadmin = User.objects.create_superuser(
            email='superadmin@coffe.com', password=PASSWORD,
            first_name=SUPERADMIN[0], last_name=SUPERADMIN[1],
        )
        self.emails.add(superadmin.email)
        self._fechar(User, superadmin.pk, self.now - timedelta(days=200))

        for t_idx, data in enumerate(TENANTS):
            self._create_tenant(t_idx, data)

        self._create_solicitudes()

        activos = Order.objects.filter(status__in=ACTIVOS).count()
        por_cobrar = Order.objects.filter(status='entregada', is_paid=False).count()
        self.stdout.write(self.style.SUCCESS(
            f'Listo: {Tenant.objects.count()} distribuidores, {Cafeteria.objects.count()} cafeterías, '
            f'{User.objects.count()} usuarios, {Mesa.objects.count()} mesas '
            f'({Mesa.objects.filter(status="ocupada").count()} ocupadas), '
            f'{Order.objects.count()} pedidos ({Order.objects.filter(created_at__date=self.today).count()} de hoy, '
            f'{activos} pedidos activos ahora, {por_cobrar} entregados por cobrar), '
            f'{SesionCliente.objects.filter(estado="activa").count()} comensales conectados por QR '
            f'({Order.objects.filter(sesion_cliente__isnull=False).count()} pedidos por QR), '
            f'{Reserva.objects.count()} reservas, {SolicitudDatos.objects.count()} solicitudes LOPDP.'
        ))
        self.stdout.write('\nCuentas demo:')
        self.stdout.write(f'  superadmin@coffe.com   / {PASSWORD}  (Super Admin)')
        self.stdout.write(f'  distribuidor@coffe.com / {PASSWORD}  (Distribuidor)')
        self.stdout.write('  admin@coffe.com        / admin     (Cafetería, dueño)')
        self.stdout.write(f'  camarero@coffe.com     / {PASSWORD}  (Equipo: también gerente@, cajero@, cocinero@)')

    # ------------------------------------------------------------------ utilidades

    def _fechar(self, model, pk, creado, **extra):
        """Fija created_at (y otros campos de fecha) sin pasar por auto_now_add."""
        model.objects.filter(pk=pk).update(created_at=creado, **extra)

    def _a_las(self, fecha, hora):
        return timezone.make_aware(datetime.combine(fecha, hora))

    def _jornada(self, cafe, fecha):
        return self._a_las(fecha, cafe.open_time), self._a_las(fecha, cafe.close_time)

    def _entre(self, desde, hasta):
        """Instante al azar entre dos fechas (redondeado al minuto)."""
        segundos = max(int((hasta - desde).total_seconds()), 60)
        return (desde + timedelta(seconds=random.randint(0, segundos))).replace(second=0)

    def _celular(self):
        return f'+593 9{random.randint(10000000, 99999999)}'

    def _email(self, first, last, dominio):
        """nombre.apellido@dominio; solo lleva sufijo si ya existe."""
        base = f'{_slug(first)}.{_slug(last)}'
        email, n = f'{base}@{dominio}', 2
        while email in self.emails:
            email, n = f'{base}{n}@{dominio}', n + 1
        self.emails.add(email)
        return email

    # ------------------------------------------------------------------ distribuidores y locales

    def _create_tenant(self, t_idx, data):
        max_cafes, max_users = PLAN_LIMITS[data['plan']]
        activo = data['status'] == 'active'
        # Fechas de alta escalonadas para que el listado tenga historia
        alta = (self.now - timedelta(days=30 * (len(TENANTS) - t_idx) + 7)).replace(
            hour=random.randint(9, 17), minute=random.choice([0, 15, 30, 45]), second=0)
        baja = None if activo else self._a_las(self.today - timedelta(days=data['baja_hace']), time(18, 0))

        tenant = Tenant.objects.create(
            name=data['name'], slug=slugify(data['name']), email=data['email'], phone=data['phone'],
            city=data['city'], address=data['cafes'][0]['direccion'], ruc=data['ruc'],
            business_name=data['business_name'], plan=data['plan'], status=data['status'],
            is_active=activo, max_cafes=max_cafes, max_users=max_users,
            description=f"Distribuidor de cafeterías en {data['city']}.",
            # Los no activos dejaron vencer la suscripción unos días antes de la baja
            subscription_expires_at=self.now + timedelta(days=data['vence_en']) if activo else baja - timedelta(days=3),
        )
        self._fechar(Tenant, tenant.pk, alta, **({'updated_at': baja} if baja else {}))

        dist_email = 'distribuidor@coffe.com' if t_idx == 0 else f'admin@{tenant.slug}.ec'
        first, last = self.nombres.sacar()
        dist = User.objects.create_user(
            email=dist_email, password=PASSWORD, tenant=tenant, role='distribuidor_admin',
            first_name=first, last_name=last,
        )
        self.emails.add(dist_email)
        self._fechar(User, dist.pk, alta)

        items = self._create_menu(tenant, alta)

        for c_idx, info in enumerate(data['cafes']):
            cerrada_hace = info.get('cerrada_hace')
            if not activo:
                cerrada_hace = max(cerrada_hace or 0, data['baja_hace'])
            cierre = self.today - timedelta(days=cerrada_hace) if cerrada_hace else None
            alta_cafe = alta + timedelta(days=info['alta'], hours=random.randint(1, 5))

            cafe = Cafeteria.objects.create(
                tenant=tenant, name=info['nombre'], slug=slugify(info['nombre']), city=info['ciudad'],
                address=info['direccion'], phone=self._celular(),
                email=f"{slugify(info['nombre'])}@{tenant.slug}.ec",
                open_time=_hora(info['abre']), close_time=_hora(info['cierra']),
                is_active=cierre is None,
            )
            extra = {'updated_at': self._a_las(cierre, time(19, 0))} if cierre else {}
            self._fechar(Cafeteria, cafe.pk, alta_cafe, **extra)

            principal = info.get('principal', False)
            if cierre:
                ritmo = RITMO_CERRADO
            else:
                ritmo = RITMO_PRINCIPAL if principal else RITMO_ABIERTO
            ctx = dict(
                tenant=tenant, cafe=cafe, items=items, alta=alta_cafe, cierre=cierre, principal=principal,
                codigo=f'{t_idx + 1}{c_idx + 1}', ritmo=ritmo, n_mesas=info.get('mesas') or random.randint(8, 10),
                exequipo=info.get('exequipo', []),
                # abiertos_mesa: mesa -> su pedido abierto (no cancelado y sin cobrar)
                personal=defaultdict(list), abiertos_mesa={}, ultimo_en_mesa={}, reservadas=set(),
                agenda=defaultdict(list),
                # mesas_qr: mesa -> (mesa, escenario, {alias: sesión}); qr_desde: mesa -> desde cuándo
                # el personal ya no sienta a nadie en ella (la esperan los comensales QR)
                mesas_qr={}, qr_desde={},
            )
            if principal:
                self.principal = ctx
            self._create_staff(ctx)
            self._create_mesas(ctx)
            self._create_orders(ctx)
            self._completar_escenario_qr(ctx)
            self._create_reservas(ctx)
            self._ajustar_mesas(ctx)

    def _create_menu(self, tenant, alta):
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
        for item in items:
            if item.name in self.fotos_demo:
                aplicar_imagen(item, self.fotos_demo[item.name])
        Category.objects.filter(tenant=tenant).update(created_at=alta)
        MenuItem.objects.filter(tenant=tenant).update(created_at=alta)
        return items

    def _cargar_fotos_demo(self):
        """Fotos locales del frontend para la carta demo, procesadas con el mismo servicio que las del dueño"""
        fotos = {}
        for producto, archivo in FOTOS_DEMO.items():
            ruta = settings.BASE_DIR / 'frontend' / 'public' / 'img' / archivo
            if not ruta.exists():
                continue
            with ruta.open('rb') as f:
                try:
                    fotos[producto] = procesar_imagen(File(f, name=archivo))
                except ImagenInvalida as error:
                    self.stdout.write(self.style.WARNING(f'No se pudo usar {ruta}: {error}'))
        return fotos

    def _create_staff(self, ctx):
        tenant, cafe = ctx['tenant'], ctx['cafe']
        # El personal se contrató entre la apertura del local y hace unos días (o antes del cierre)
        desde = ctx['alta']
        hasta = self.now - timedelta(days=3)
        if ctx['cierre']:
            hasta = min(hasta, self._a_las(ctx['cierre'] - timedelta(days=DIAS_HISTORIAL_CERRADO + 1), time(12, 0)))

        if ctx['principal']:
            # Equipo del local principal con correos fáciles de recordar
            equipo = EQUIPO_PRINCIPAL
        else:
            equipo = [(None, PASSWORD, role, *self.nombres.sacar()) for role in ROLES_LOCAL]
        # Local cerrado (o distribuidor dado de baja): todo su personal quedó desactivado al cerrar
        cierre = self._a_las(ctx['cierre'], time(19, 0)) if ctx['cierre'] else None

        for email, password, role, first, last in equipo:
            if email:
                self.emails.add(email)
            else:
                email = self._email(first, last, f'{cafe.slug}.ec')
            es_admin = role == 'cafe_admin'
            alta = desde if es_admin else self._entre(desde, hasta)
            if cierre:
                baja = cierre
            elif es_admin or ctx['principal'] or random.random() > 0.1:
                baja = None
            else:
                # Alguna baja suelta en los locales abiertos
                baja = self._entre(alta + timedelta(days=1), self.now - timedelta(hours=12))
            self._crear_empleado(ctx, email, password, role, first, last, alta, baja)

        # Ex empleados con nombre fijo (los que aparecen en las solicitudes LOPDP)
        for role, first, last, dias_baja in ctx['exequipo']:
            baja = (self.now - timedelta(days=dias_baja)).replace(hour=18, minute=0, second=0)
            alta = self._entre(desde, baja - timedelta(days=30))
            user = self._crear_empleado(ctx, self._email(first, last, f'{cafe.slug}.ec'), PASSWORD, role,
                                        first, last, alta, baja, phone=self._celular())
            self.exequipo[(first, last)] = (user, baja)

    def _crear_empleado(self, ctx, email, password, role, first, last, alta, baja, **extra):
        """Crea un usuario del local; si tiene fecha de baja, su cuenta queda desactivada desde entonces."""
        user = User.objects.create_user(
            email=email, password=password, tenant=ctx['tenant'], cafeteria=ctx['cafe'], role=role,
            first_name=first, last_name=last, is_active=baja is None, **extra,
        )
        self._fechar(User, user.pk, alta, **({'updated_at': baja} if baja else {}))
        ctx['personal'][role].append((user, alta, baja))
        return user

    def _create_mesas(self, ctx):
        tenant, cafe, n = ctx['tenant'], ctx['cafe'], ctx['n_mesas']
        zonas = random.sample(LOCATIONS, 3)
        mesas = []
        for num in range(1, n + 1):
            capacity = random.choice(CAPACIDADES)
            mesas.append(Mesa.objects.create(
                tenant=tenant, cafeteria=cafe, number=num, slug=f'mesa-{num}',
                capacity=capacity, min_capacity=CAPACIDAD_MINIMA[capacity],
                # Token aleatorio y no adivinable (nunca el id ni el número de la mesa)
                qr_code=generar_token_qr(), status='disponible',
                location=zonas[(num - 1) * len(zonas) // n],
            ))
        Mesa.objects.filter(cafeteria=cafe).update(created_at=ctx['alta'])
        # El aforo del local es la suma de sus mesas
        Cafeteria.objects.filter(pk=cafe.pk).update(capacity=sum(m.capacity for m in mesas))
        ctx['mesas'] = mesas

    # ------------------------------------------------------------------ pedidos

    def _instantes(self, inicio, fin, ritmo, factor=1.0):
        """Horas de llegada de los pedidos entre inicio y fin según la afluencia de cada franja."""
        valle, pico = ritmo
        instantes = []
        t = inicio
        while t < fin:
            corte = min(t.replace(minute=0, second=0) + timedelta(hours=1), fin)
            segundos = int((corte - t).total_seconds())
            if segundos >= 60:
                esperado = (valle + (pico - valle) * AFLUENCIA.get(t.hour, 0)) * factor * segundos / 3600
                n = int(esperado) + (1 if random.random() < esperado % 1 else 0)
                instantes += [t + timedelta(seconds=random.randint(0, segundos - 1)) for _ in range(n)]
            t = corte
        return sorted(instantes)

    def _create_orders(self, ctx):
        cafe = ctx['cafe']
        libre_desde = {m.pk: self.now - timedelta(days=365) for m in ctx['mesas']}

        if ctx['cierre']:
            # Local cerrado: solo sus últimas jornadas antes del cierre
            dias = [ctx['cierre'] - timedelta(days=k) for k in range(DIAS_HISTORIAL_CERRADO, 0, -1)]
        else:
            dias = [self.today - timedelta(days=k) for k in range(DIAS_HISTORIAL, 0, -1)]
        for dia in dias:
            inicio, fin = self._jornada(cafe, dia)
            instantes = self._instantes(inicio, fin, ctx['ritmo'], factor=random.uniform(0.92, 1.08))
            self._registrar_dia(ctx, dia, [(t, None) for t in instantes], libre_desde)

        if ctx['cierre']:
            return

        # Hoy: desde la apertura hasta ahora (nada en el futuro)
        inicio, fin = self._jornada(cafe, self.today)
        fin = min(fin, self.now - timedelta(minutes=1))
        medianoche = self._a_las(self.today, time(0, 0))
        if ctx['principal']:
            # El local principal siempre tiene movimiento: si aún no abrió o abrió hace poco,
            # se simula que abrió hace una hora
            inicio = max(min(inicio, self.now - timedelta(hours=1)), medianoche)
            fin = self.now - timedelta(minutes=1)
        instantes = self._instantes(inicio, fin, ctx['ritmo']) if fin > inicio else []
        pedidos = [(t, None) for t in instantes]

        # Últimos pedidos fijos del local (RECIENTES), a cualquier hora que se siembre: sustituyen a
        # la cola natural del día, de modo que los anteriores ya están entregados (o cancelados)
        recientes = [(self.now - timedelta(minutes=minutos), (estado, tipo))
                     for minutos, estado, tipo in RECIENTES.get(cafe.name, [])]
        recientes = [(t, fijo) for t, fijo in recientes if t >= medianoche]  # todo debe ser de hoy
        if recientes:
            desde = min(t for t, _ in recientes)
            pedidos = [(t, fijo) for t, fijo in pedidos if t < desde] + sorted(recientes, key=lambda p: p[0])
        if ctx['principal']:
            # Los pedidos por QR se numeran junto con los del día, en orden de llegada
            pedidos = sorted(pedidos + self._preparar_escenario_qr(ctx, medianoche), key=lambda p: p[0])
        self._registrar_dia(ctx, self.today, pedidos, libre_desde)

    def _preparar_escenario_qr(self, ctx, medianoche):
        """Elige las mesas de ESCENARIO_QR y crea sus sesiones (antes de repartir las mesas de hoy).

        Devuelve los pedidos de esos comensales como [(instante, (estado, 'qr', sesión))] para que
        _registrar_dia los cree junto con los del personal.
        """
        llegadas = [minutos for esc in ESCENARIO_QR for _, minutos, _, _ in esc['sesiones']]
        if self.now - timedelta(minutes=max(llegadas)) < medianoche:
            return []  # sembrado justo después de medianoche: todo debe ser de hoy
        pedidos = []
        for esc in ESCENARIO_QR:
            candidatas = [m for m in ctx['mesas']
                          if m.pk not in ctx['mesas_qr'] and m.capacity >= len(esc['sesiones'])]
            if not candidatas:
                continue
            mesa = random.choice(candidatas)
            sesiones = {}
            for alias, llego, fundadora, actividad in esc['sesiones']:
                sesiones[alias] = SesionCliente.objects.create(
                    tenant=ctx['tenant'], mesa=mesa, alias=alias, estado='activa', qr_entrada=mesa.qr_code,
                    grupo=sesiones[fundadora] if fundadora else None,
                    fecha_inicio=self.now - timedelta(minutes=llego),
                    ultima_actividad=self.now - timedelta(minutes=actividad),
                )
            ctx['mesas_qr'][mesa.pk] = (mesa, esc, sesiones)
            primera = min(s.fecha_inicio for s in sesiones.values())
            ctx['qr_desde'][mesa.pk] = primera - timedelta(minutes=QR_MARGEN_MIN)
            pedidos += [(self.now - timedelta(minutes=hace), (estado, 'qr', sesiones[alias]))
                        for alias, hace, estado in esc['pedidos']]
        return pedidos

    def _admite_personal(self, ctx, mesa, creado):
        """¿Puede el personal sentar a alguien en la mesa a esa hora? (no si la esperan comensales QR)"""
        return mesa.pk not in ctx['qr_desde'] or creado < ctx['qr_desde'][mesa.pk]

    def _completar_escenario_qr(self, ctx):
        """Uniones a grupos, cuentas pedidas y llamadas al mesero de los comensales QR (ya con sus pedidos)."""
        metodos = dict(SolicitudPago.METODO_CHOICES)
        for mesa, esc, sesiones in ctx['mesas_qr'].values():
            # Quien se unió a un grupo lo pidió al entrar y la fundadora lo aceptó al momento
            for sesion in sesiones.values():
                if sesion.grupo_id:
                    SolicitudUnion.objects.create(
                        sesion=sesion, grupo=sesion.grupo, estado='aceptada', resuelta_por=sesion.grupo,
                        created_at=sesion.fecha_inicio,
                        resuelta_at=sesion.fecha_inicio + timedelta(seconds=random.randint(20, 90)),
                    )

            if esc.get('cuenta'):
                alias, tipo, metodo, hace = esc['cuenta']
                quien = sesiones[alias]
                pedida = self.now - timedelta(minutes=hace)
                cubiertas = list(quien.sesiones_de_grupo()) if tipo == 'grupal' else [quien]
                totales = (Order.objects.filter(sesion_cliente__in=cubiertas, is_paid=False)
                           .exclude(status='cancelada')
                           .aggregate(subtotal=Sum('subtotal'), iva=Sum('tax'), total=Sum('total')))
                solicitud = SolicitudPago.objects.create(
                    tenant=ctx['tenant'], mesa=mesa, tipo=tipo, grupo_id=quien.grupo_key, solicitada_por=quien,
                    subtotal=totales['subtotal'] or Decimal('0'), iva=totales['iva'] or Decimal('0'),
                    total=totales['total'] or Decimal('0'), metodo_preferido=metodo, created_at=pedida,
                )
                solicitud.sesiones_cubiertas.set(cubiertas)
                AlertaMesero.objects.create(
                    tenant=ctx['tenant'], mesa=mesa, sesion=quien, tipo='cuenta', created_at=pedida,
                    mensaje=f'{quien.alias} pide la cuenta ({tipo}) · {metodos[metodo]}',
                )

            for alias, tipo, hace in esc.get('alertas', []):
                AlertaMesero.objects.create(
                    tenant=ctx['tenant'], mesa=mesa, sesion=sesiones[alias], tipo=tipo,
                    # Mismo texto que guarda services.llamar_mesero
                    mensaje=f'{alias} llama al mesero' if tipo == 'ayuda' else '',
                    created_at=self.now - timedelta(minutes=hace),
                )

    def _estado_hoy(self, minutos):
        """Estado de un pedido de hoy según cuánto hace que entró."""
        if minutos < 8:
            return 'pendiente' if minutos < 3 or random.random() < 0.35 else 'confirmada'
        if minutos < 18:
            return 'preparando'
        if minutos < 28:
            return 'lista'
        return 'cancelada' if random.random() < 0.05 else 'entregada'

    def _registrar_dia(self, ctx, dia, pedidos, libre_desde):
        """Crea los pedidos de un día. pedidos: [(instante, fijo)], donde fijo es (estado, tipo), None si
        va al azar, o (estado, 'qr', sesión) para un pedido de un comensal QR (va a la mesa de su sesión)."""
        es_hoy = dia == self.today
        # ~5% de cancelados, sin que el azar deje un día con demasiados
        max_cancelados, cancelados = max(1, round(len(pedidos) * 0.05)), 0
        for nnn, (creado, fijo) in enumerate(pedidos, start=1):
            sesion = None
            if fijo and fijo[1] == 'qr':
                estado, _, sesion = fijo
                tipo, mesa = 'mesa', sesion.mesa
            else:
                estado, tipo = fijo or (None, random.choices(['mesa', 'takeaway', 'delivery'], weights=[60, 25, 15])[0])
                mesa = None
            if tipo == 'mesa' and not sesion:
                # Una mesa solo recibe otro pedido cuando sus clientes ya se fueron (y no la esperan comensales QR)
                libres = [m for m in ctx['mesas'] if libre_desde[m.pk] <= creado and self._admite_personal(ctx, m, creado)]
                if not libres and fijo:
                    # Un pedido fijo va a la mesa que antes se desocupa entre las que no tienen cuenta abierta
                    sin_cuenta = [m for m in ctx['mesas']
                                  if m.pk not in ctx['abiertos_mesa'] and self._admite_personal(ctx, m, creado)]
                    libres = [min(sin_cuenta, key=lambda m: libre_desde[m.pk])] if sin_cuenta else []
                if libres:
                    mesa = random.choice(libres)
                    libre_desde[mesa.pk] = creado + timedelta(minutes=random.randint(35, 75))
                else:
                    tipo = 'takeaway'
            minutos = (self.now - creado).total_seconds() / 60
            por_cobrar = estado == 'por_cobrar' and mesa is not None
            if estado:
                status = 'entregada' if estado == 'por_cobrar' else estado
            elif es_hoy:
                status = self._estado_hoy(minutos)
            else:
                status = 'cancelada' if random.random() < 0.05 else 'entregada'
            if status == 'cancelada':
                cancelados += 1
                if cancelados > max_cancelados:
                    status = 'entregada'
            numero = f"PED-{ctx['codigo']}-{dia:%m%d}-{nnn:03d}"
            order = self._crear_pedido(ctx, creado, status, tipo, mesa, numero, es_hoy, por_cobrar, sesion)
            if mesa and not sesion:
                # Los pedidos QR no cuentan aquí: su mesa está ocupada por las sesiones, no por un pedido
                ctx['ultimo_en_mesa'][mesa.pk] = order
                if status != 'cancelada' and not order.is_paid:
                    # Pedido abierto: la mesa sigue ocupada (y no admite otro pedido) hasta que se cobre
                    ctx['abiertos_mesa'][mesa.pk] = order
                    libre_desde[mesa.pk] = self.now + timedelta(days=1)

    def _responsable(self, ctx, tipo, creado):
        """Camarero para mesa, cajero para llevar/delivery; solo personal que trabajaba ahí en esa fecha."""
        preferidos = ('camarero',) if tipo == 'mesa' else ('cajero',)
        for roles in (preferidos, ('camarero', 'cajero'), ('cafe_admin',)):
            candidatos = [u for r in roles for u, alta, baja in ctx['personal'][r]
                          if alta <= creado and (baja is None or creado < baja)]
            if candidatos:
                return random.choice(candidatos)
        return None

    def _crear_pedido(self, ctx, creado, status, tipo, mesa, numero, es_hoy, por_cobrar=False, sesion=None):
        """sesion: comensal QR que lo pidió desde su celular (lleva su alias y no lo registró el personal)."""
        tenant, cafe = ctx['tenant'], ctx['cafe']

        # Para llevar y delivery suelen cobrarse al pedir; en mesa se cobra al final. Todo lo entregado
        # ya está cobrado, salvo las mesas que siguen sentadas esperando la cuenta (por_cobrar)
        cobrado_al_pedir = tipo != 'mesa' and random.random() < 0.6
        if status == 'cancelada':
            pagado = False
        elif status == 'entregada':
            pagado = not por_cobrar
        else:
            pagado = cobrado_al_pedir

        confirmado = None
        if status not in ('pendiente', 'cancelada'):
            confirmado = creado + timedelta(seconds=random.randint(40, 150))
        completado = None
        if status == 'entregada':
            completado = creado + timedelta(minutes=random.uniform(18, 28 if es_hoy else 32))
            if es_hoy:
                completado = min(completado, self.now - timedelta(minutes=2))
        pagado_en = None
        if pagado:
            if cobrado_al_pedir:
                pagado_en = creado + timedelta(seconds=random.randint(30, 120))
            elif tipo == 'mesa':
                # La cuenta se pide un rato después de servir
                pagado_en = completado + timedelta(minutes=random.randint(2, 15))
            else:
                # Se cobra al recoger el pedido o al entregar el delivery
                pagado_en = completado + timedelta(minutes=random.randint(0, 3), seconds=random.randint(20, 59))
            pagado_en = min(pagado_en, self.now - timedelta(seconds=30))

        nombre = telefono = direccion = ''
        if tipo != 'mesa':
            cliente = random.choice(self.clientes)
            nombre = ' '.join(cliente)
            if tipo == 'delivery':
                # El cliente habitual deja siempre su mismo teléfono y dirección en esa ciudad
                telefono = self._contacto(cliente)[0]
                clave = (cliente, cafe.city)
                if clave not in self.direcciones:
                    self.direcciones[clave] = random.choice(DIRECCIONES.get(cafe.city, DIRECCIONES['Quito']))
                direccion = self.direcciones[clave]
        if sesion:
            nombre = sesion.alias

        order = Order.objects.create(
            tenant=tenant, cafeteria=cafe, order_type=tipo, mesa=mesa, status=status, order_number=numero,
            created_by=None if sesion else self._responsable(ctx, tipo, creado), sesion_cliente=sesion,
            customer_name=nombre, customer_phone=telefono, customer_address=direccion,
            is_paid=pagado,
            payment_method=random.choice(['efectivo', 'tarjeta', 'tarjeta', 'transferencia']) if pagado else 'pendiente',
            kitchen_notes=random.choice(KITCHEN_NOTES) if random.random() < 0.12 else '',
        )
        cantidad = random.choices([1, 2, 3, 4], weights=[35, 35, 20, 10])[0]
        OrderItem.objects.bulk_create([
            OrderItem(
                order=order, menu_item=menu_item, unit_price=menu_item.price, status=ESTADO_ITEM[status],
                quantity=random.choices([1, 2, 3], weights=[75, 20, 5])[0],
            )
            for menu_item in random.sample(ctx['items'], cantidad)
        ])
        order.calculate_total()

        ultimo = max(t for t in (creado, confirmado, completado, pagado_en) if t)
        Order.objects.filter(pk=order.pk).update(
            created_at=creado, confirmed_at=confirmado, completed_at=completado, paid_at=pagado_en,
            updated_at=ultimo,
        )
        OrderItem.objects.filter(order=order).update(created_at=creado, completed_at=completado, updated_at=ultimo)
        order.created_at = creado
        return order

    # ------------------------------------------------------------------ reservas y estado de mesas

    def _slot(self, desde, hasta):
        """Hora de reserva al azar (en punto, y cuarto, y media...) dentro del rango."""
        t = desde.replace(second=0)
        t += timedelta(minutes=(-t.minute) % 15)
        opciones = []
        while t <= hasta:
            opciones += [t] * (3 if t.minute in (0, 30) else 1)
            t += timedelta(minutes=15)
        return random.choice(opciones) if opciones else None

    def _reservar(self, ctx, fecha, estado, desde=None, hasta=None, excluir=(), cliente=None,
                  email=None, telefono=None, nota=None, creada=None, cancelada_en=None):
        abre, cierra = self._jornada(ctx['cafe'], fecha)
        # La última reserva se acepta una hora antes de cerrar
        momento = self._slot(desde or abre, min(hasta or cierra, cierra - timedelta(hours=1)))
        if momento is None:
            return None
        agenda = ctx['agenda']
        # Nada de dos reservas en la misma mesa con menos de 2 horas de diferencia
        candidatas = [m for m in ctx['mesas'] if m.pk not in excluir
                      and all(abs(momento - t) >= timedelta(hours=2) for t in agenda[m.pk])]
        if not candidatas:
            return None
        mesa = random.choice(candidatas)
        agenda[mesa.pk].append(momento)

        minimo = 1 if mesa.capacity <= 2 else max(2, mesa.min_capacity)
        first, last = cliente or random.choice(self.clientes)
        telefono, email = self._contacto((first, last), email=email, telefono=telefono)
        if nota is None:
            nota = self._nota(mesa) if random.random() < 0.45 else ''

        # Se reservó con 1 a 6 días de anticipación (y nunca "en el futuro")
        if creada is None:
            creada = momento - timedelta(days=random.randint(1, 6), hours=random.randint(0, 9),
                                         minutes=random.randint(0, 59))
            creada = min(creada, self.now - timedelta(minutes=random.randint(20, 240)))
        tope = min(momento, self.now)
        confirmada_en = completada_en = None
        if estado in ('confirmada', 'completada'):
            confirmada_en = min(creada + timedelta(hours=random.uniform(0.5, 20)), tope - timedelta(minutes=5))
            confirmada_en = max(confirmada_en, creada + timedelta(minutes=1))
        if estado == 'completada':
            completada_en = momento + timedelta(minutes=random.randint(60, 110))
        if estado == 'cancelada' and cancelada_en is None:
            cancelada_en = creada + (tope - creada) * random.uniform(0.2, 0.9)

        reserva = Reserva.objects.create(
            mesa=mesa, customer_name=f'{first} {last}', customer_phone=telefono,
            customer_email=email, guest_count=random.randint(minimo, mesa.capacity),
            reservation_date=fecha, reservation_time=timezone.localtime(momento).time(),
            status=estado, notes=nota,
        )
        ultimo = max(t for t in (creada, confirmada_en, completada_en, cancelada_en) if t)
        self._fechar(Reserva, reserva.pk, creada, confirmed_at=confirmada_en, completed_at=completada_en,
                     cancelled_at=cancelada_en if estado == 'cancelada' else None, updated_at=ultimo)
        reserva.mesa_id, reserva.momento = mesa.pk, momento
        return reserva

    def _email_cliente(self, first, last):
        return f'{_slug(first)}.{_slug(last)}@{random.choice(DOMINIOS)}'

    def _contacto(self, cliente, email=None, telefono=None):
        """(teléfono, correo) de un cliente: el mismo nombre deja siempre los mismos datos."""
        if cliente not in self.contactos:
            if email is None:
                email = self._email_cliente(*cliente) if random.random() < 0.6 else ''
            self.contactos[cliente] = (telefono or self._celular(), email)
        return self.contactos[cliente]

    def _nota(self, mesa):
        """Nota de reserva compatible con la ubicación de la mesa (la terraza solo en la terraza, etc.)."""
        excluidas = NOTAS_EXCLUIDAS.get(mesa.location, set())
        opciones = [n for n in NOTES if n not in excluidas] + NOTAS_UBICACION.get(mesa.location, [])
        return random.choice(opciones)

    def _create_reservas(self, ctx):
        cafe = ctx['cafe']

        if ctx['cierre']:
            # Local cerrado: solo reservas pasadas, anteriores al cierre
            cierre = ctx['cierre']
            for _ in range(random.randint(3, 5)):
                dia = cierre - timedelta(days=random.randint(1, 10))
                self._reservar(ctx, dia, random.choices(['completada', 'cancelada'], weights=[90, 10])[0])
            # Una reserva que ya estaba hecha para después del cierre y se canceló
            if (self.today - cierre).days >= 2:
                dia = cierre + timedelta(days=random.randint(1, (self.today - cierre).days - 1))
                cierre_dt = self._a_las(cierre, time(19, 0))
                self._reservar(ctx, dia, 'cancelada', creada=cierre_dt - timedelta(days=2, hours=3),
                               cancelada_en=cierre_dt + timedelta(hours=1),
                               nota='Cancelada por el local: cierre definitivo')
            return

        principal = ctx['principal']
        # Pasadas: atendidas en días anteriores (alguna cancelada)
        for _ in range(random.randint(6, 8) if principal else random.randint(3, 5)):
            estado = random.choices(['completada', 'cancelada'], weights=[90, 10])[0]
            self._reservar(ctx, self.today - timedelta(days=random.randint(1, 10)), estado)

        # Hoy: solo en mesas que no están ocupadas ahora (por un pedido abierto o por comensales QR)
        ocupadas = set(ctx['abiertos_mesa']) | set(ctx['mesas_qr'])
        hoy = []
        abre, _ = self._jornada(cafe, self.today)
        hasta_atendidas = self.now - timedelta(minutes=150)
        for _ in range(random.randint(1, 2) if principal else random.randint(0, 1)):
            if hasta_atendidas > abre:
                hoy.append(self._reservar(ctx, self.today, 'completada', hasta=hasta_atendidas, excluir=ocupadas))
        pronto = self.now + timedelta(minutes=20)
        if principal:
            # Una reserva en las próximas 2 horas para que se vea una mesa reservada
            hoy.append(self._reservar(ctx, self.today, 'confirmada', desde=pronto,
                                      hasta=self.now + timedelta(hours=2), excluir=ocupadas))
        for _ in range(random.randint(1, 3) if principal else random.randint(0, 2)):
            estado = random.choices(['confirmada', 'pendiente'], weights=[65, 35])[0]
            hoy.append(self._reservar(ctx, self.today, estado, desde=pronto, excluir=ocupadas))

        for reserva in filter(None, hoy):
            if reserva.status in ('pendiente', 'confirmada') and reserva.momento <= self.now + timedelta(hours=2):
                ctx['reservadas'].add(reserva.mesa_id)

        # Próximos 10 días
        for _ in range(random.randint(9, 12) if principal else random.randint(4, 6)):
            dias = random.randint(1, 10)
            if dias <= 2:
                estado = random.choices(['confirmada', 'pendiente', 'cancelada'], weights=[60, 32, 8])[0]
            else:
                estado = random.choices(['pendiente', 'confirmada', 'cancelada'], weights=[55, 35, 10])[0]
            self._reservar(ctx, self.today + timedelta(days=dias), estado)

    def _ajustar_mesas(self, ctx):
        """Estado final de las mesas, recalculado desde la base de datos.

        Una mesa está 'ocupada' si y solo si tiene exactamente un pedido de mesa abierto del personal
        (ni cancelado ni pagado): current_order es ese pedido y occupied_since su hora de entrada; o si
        tiene comensales conectados por QR (sesiones activas): sin current_order (cada comensal tiene sus
        pedidos), occupied_since = llegada del primero y guest_count = nº de sesiones activas. Las demás
        mesas quedan libres, reservadas (reserva en las próximas 2 horas) o limpiando, sin pedidos abiertos.
        """
        cafe = ctx['cafe']
        abiertos = defaultdict(list)
        for pedido in (Order.objects.filter(cafeteria=cafe, order_type='mesa', is_paid=False,
                                            sesion_cliente__isnull=True)
                       .exclude(status='cancelada')):
            abiertos[pedido.mesa_id].append(pedido)
        if None in abiertos or any(len(pedidos) > 1 for pedidos in abiertos.values()):
            raise CommandError(f"{cafe.name}: hay mesas con más de un pedido abierto (o pedidos de mesa sin mesa)")
        conectadas = defaultdict(list)
        for sesion in SesionCliente.objects.filter(mesa__cafeteria=cafe, estado='activa'):
            conectadas[sesion.mesa_id].append(sesion)
        con_pedidos_qr = set(Order.objects.filter(cafeteria=cafe, sesion_cliente__isnull=False, is_paid=False)
                             .exclude(status='cancelada').values_list('mesa_id', flat=True))
        if ctx['cierre']:
            if abiertos or conectadas:
                raise CommandError(f"{cafe.name}: un local cerrado no puede tener pedidos abiertos ni comensales QR")
            return  # local cerrado: todas disponibles
        ocupadas, reservadas = {mesa_id: pedidos[0] for mesa_id, pedidos in abiertos.items()}, ctx['reservadas']
        if set(ocupadas) != set(ctx['abiertos_mesa']) or reservadas & set(ocupadas):
            raise CommandError(f"{cafe.name}: el estado de las mesas no cuadra con sus pedidos")
        # Mesas QR: las del escenario, con sus pedidos abiertos, sin pedidos del personal ni reservas
        if (set(conectadas) != set(ctx['mesas_qr']) or not con_pedidos_qr <= set(conectadas)
                or set(conectadas) & (set(ocupadas) | reservadas)):
            raise CommandError(f"{cafe.name}: las mesas con comensales QR no cuadran con sus sesiones y pedidos")
        for mesa in ctx['mesas']:
            if mesa.pk in ocupadas:
                pedido = ocupadas[mesa.pk]
                Mesa.objects.filter(pk=mesa.pk).update(
                    status='ocupada', current_order=pedido, occupied_since=pedido.created_at,
                    guest_count=random.randint(mesa.min_capacity, mesa.capacity),
                )
            elif mesa.pk in conectadas:
                sesiones = conectadas[mesa.pk]
                Mesa.objects.filter(pk=mesa.pk).update(
                    status='ocupada', current_order=None, nota_cierre='',
                    occupied_since=min(s.fecha_inicio for s in sesiones), guest_count=len(sesiones),
                )
            elif mesa.pk in reservadas:
                Mesa.objects.filter(pk=mesa.pk).update(status='reservada')

        # En los locales grandes que están atendiendo, la mesa que se acaba de desocupar se está limpiando
        abre, cierra = self._jornada(cafe, self.today)
        atendiendo = ctx['principal'] or abre <= self.now <= cierra
        if len(ctx['mesas']) >= 10 and atendiendo:
            libres = [m for m in ctx['mesas']
                      if m.pk not in ocupadas and m.pk not in reservadas and m.pk not in conectadas]
            if libres:
                antiguo = self.now - timedelta(days=365)
                libres.sort(key=lambda m: getattr(ctx['ultimo_en_mesa'].get(m.pk), 'created_at', antiguo))
                Mesa.objects.filter(pk=libres[-1].pk).update(status='limpiando')

    # ------------------------------------------------------------------ LOPDP

    def _create_solicitudes(self):
        """Solicitudes de derechos LOPDP en distintos estados para el panel de Privacidad."""
        por_anio = {}
        for (dias, resuelta_en, tipo, relacion, estado, first, last, provincia, cafeteria,
             detalle, respuesta) in SOLICITUDES:
            creada = (self.now - timedelta(days=dias)).replace(
                hour=random.randint(8, 19), minute=random.randint(0, 59), second=0)
            creada = min(creada, self.now - timedelta(hours=2))
            # Código correlativo por año, asignado en orden cronológico
            if creada.year not in por_anio:
                por_anio[creada.year] = SolicitudDatos.objects.filter(codigo__startswith=f'SD-{creada.year}-').count()
            por_anio[creada.year] += 1
            telefono = self._celular()
            email = f'{_slug(first)}.{_slug(last)}@gmail.com'
            if (first, last) in self.exequipo:
                # El titular es un ex empleado: su cuenta desactivada existe en el local que menciona
                usuario, baja = self.exequipo[(first, last)]
                telefono = usuario.phone or telefono
                detalle = detalle.format(mes=MESES[baja.month - 1])
            resuelta = creada + timedelta(days=resuelta_en, hours=random.randint(1, 6)) if resuelta_en else None
            sol = SolicitudDatos.objects.create(
                codigo=f'SD-{creada.year}-{por_anio[creada.year]:04d}',
                tipo=tipo, relacion=relacion, nombre=f'{first} {last}',
                identificacion=f'{provincia}{random.randint(10000000, 99999999)}',
                email=email, telefono=telefono, cafeteria=cafeteria,
                detalle=detalle, declaracion_veracidad=True, estado=estado, respuesta=respuesta,
                fecha_limite=creada + timedelta(days=15), resuelta_at=resuelta,
            )
            self._fechar(SolicitudDatos, sol.pk, creada, updated_at=resuelta or creada)

            if relacion == 'comensal' and self.principal:
                # La reserva que menciona la titular existe en Café La Floresta, con sus mismos datos
                self._reservar(self.principal, self.today - timedelta(days=7), 'completada',
                               cliente=(first, last), email=email, telefono=telefono, nota='')
