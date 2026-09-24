# COFFE-SAAS Quickstart Guide

## Setup Inicial

### 1. Instalar Dependencias

```bash
# Crear virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Instalar paquetes
pip install -r requirements.txt

# Instalar dependencia faltante (decouple para env vars)
pip install python-decouple
```

### 2. Configurar Base de Datos

#### Opción A: PostgreSQL (Recomendado)
```bash
# Crear base de datos
createdb coffe_saas

# Editar .env
cp .env.example .env
# Actualizar: DB_HOST, DB_USER, DB_PASSWORD
```

#### Opción B: SQLite (Local Development)
```bash
# Editar config/settings.py
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
```

### 3. Ejecutar Migraciones

```bash
python manage.py migrate
```

### 4. Crear Super Admin

```bash
python manage.py createsuperuser
```

Responder:
```
Email: admin@coffe.com
First name: Admin
Last name: COFFE
Password: (ingresar contraseña)
```

### 5. Crear Distribuidor Ejemplo (Opcional)

```bash
python manage.py shell
```

```python
from apps.tenants.models import Tenant
from apps.accounts.models import User

# Crear Tenant
tenant = Tenant.objects.create(
    name="Distribuidora Central",
    slug="distribuidora-central",
    email="admin@distribuidora.com",
    ruc="1234567890",
    business_name="Distribuidora Central S.A.",
    plan="pro",
    max_cafes=10,
    max_users=100,
)

# Crear Usuario Admin
user = User.objects.create_user(
    email="distribuidor@cafe.com",
    first_name="Juan",
    last_name="Pérez",
    password="password123",
    role="distribuidor_admin",
    tenant=tenant,
)

print(f"Tenant: {tenant.name} ({tenant.id})")
print(f"User: {user.email}")
```

### 6. Levantar Servidor

```bash
python manage.py runserver
```

Acceso:
- API: http://localhost:8000/api/v1/
- Documentación: http://localhost:8000/api/docs/
- Admin: http://localhost:8000/admin/

---

## API Endpoints (Básicos)

### Autenticación

**Login**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@coffe.com",
    "password": "admin123"
  }'
```

Respuesta:
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": "uuid",
    "email": "admin@coffe.com",
    "role": "super_admin",
    ...
  }
}
```

**Usar Token en Requests**
```bash
curl -X GET http://localhost:8000/api/v1/auth/users/me/ \
  -H "Authorization: Bearer <access_token>"
```

### Distribuidores (Super Admin)

**Listar**
```bash
curl -X GET http://localhost:8000/api/v1/tenants/ \
  -H "Authorization: Bearer <access_token>"
```

**Crear**
```bash
curl -X POST http://localhost:8000/api/v1/tenants/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Distribuidora Quito",
    "email": "info@quito.com",
    "ruc": "1234567891",
    "business_name": "Distribuidora Quito S.A.",
    "phone": "+593987654321"
  }'
```

### Registro de Distribuidor

**Autoregistro**
```bash
curl -X POST http://localhost:8000/api/v1/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nuevo@distribuidor.com",
    "password": "SecurePass123",
    "password2": "SecurePass123",
    "distribuidor_name": "Mi Distribuidora",
    "ruc": "1234567892",
    "business_name": "Mi Distribuidora S.A.",
    "first_name": "Carlos",
    "last_name": "Rodríguez",
    "phone": "+593987654322"
  }'
```

### Usuarios

**Listar**
```bash
curl -X GET http://localhost:8000/api/v1/auth/users/ \
  -H "Authorization: Bearer <access_token>"
```

**Crear Usuario** (Distribuidor Admin)
```bash
curl -X POST http://localhost:8000/api/v1/auth/users/ \
  -H "Authorization: Bearer <distribuidor_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "camarero@cafe.com",
    "first_name": "Miguel",
    "last_name": "López",
    "password": "CamareroPass123",
    "password2": "CamareroPass123",
    "role": "camarero",
    "phone": "+593987654323"
  }'
```

### Cafeterías

**Listar**
```bash
curl -X GET http://localhost:8000/api/v1/cafeterias/ \
  -H "Authorization: Bearer <access_token>"
```

**Crear** (Distribuidor Admin)
```bash
curl -X POST http://localhost:8000/api/v1/cafeterias/ \
  -H "Authorization: Bearer <distribuidor_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Café Centro Quito",
    "address": "Calle Principal 123",
    "city": "Quito",
    "phone": "+593987654324",
    "email": "cafe.centro@distribuidor.com",
    "max_tables": 15,
    "capacity": 50,
    "open_time": "07:00:00",
    "close_time": "22:00:00"
  }'
```

---

## Testing en Postman

1. Importar colección (próximamente)
2. Configurar variables:
   - `base_url` = http://localhost:8000
   - `access_token` = Token de login
   - `tenant_id` = UUID del tenant

3. Tests disponibles:
   - Auth: login, refresh, me
   - Tenants: CRUD, stats
   - Users: CRUD, activate, deactivate
   - Cafeterias: CRUD, stats, users

---

## Estructura de Directorios

```
COFFE-SAAS/
├── config/              # Django configuration
│   ├── settings.py     # Settings (DRF, JWT, CORS, DB)
│   ├── urls.py         # URL routing
│   └── wsgi.py
├── apps/
│   ├── accounts/        # Users & Auth
│   ├── tenants/         # Distribuidores
│   ├── cafeterias/      # Locales
│   ├── pedidos/         # Orders
│   ├── mesas/           # Tables
│   ├── menu/            # Menu items
│   ├── facturacion/     # Billing
│   └── auditoria/       # Audit logs
├── manage.py
├── requirements.txt
├── .env.example
├── README.md            # Full documentation
├── ARCHITECTURE.md      # Technical deep-dive
└── QUICKSTART.md       # This file
```

---

## Troubleshooting

### Error: "no such table"
```bash
python manage.py migrate
```

### Error: "No module named 'decouple'"
```bash
pip install python-decouple
```

### Error: "DATABASES is improperly configured"
- Verificar .env
- Crear base de datos PostgreSQL

### Error: "Permission denied" en upload
```bash
mkdir -p media/tenants/logos media/cafeterias/logos media/cafeterias/banners
chmod 755 media
```

---

## Próximos Pasos

✅ Fase 1: Estructura SaaS Base  
✅ Fase 1: Serializers y ViewSets  
⏭️ Fase 2: Frontend Dashboard  
⏭️ Fase 3: Pedidos y Mesas  
⏭️ Fase 4: Pagos y Facturación  
⏭️ Fase 5: Mobile App  

---

## Contacto & Soporte

- GitHub: https://github.com/CECODE26/COFFE-SAAS
- Email: dev@coffe-saas.com
