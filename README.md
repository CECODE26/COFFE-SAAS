# COFFE-SAAS 🍰

Plataforma SaaS multi-tenant para administración de cafeterías y distribuidores.

## Arquitectura Multi-Tenant

```
┌─────────────────────────────────────────────────────┐
│          SUPER ADMIN (You)                           │
│  - Gestiona Distribuidores                          │
│  - Ve métricas globales                             │
│  - Planes de cada cafetería (Mensual / Pro)         │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
   ┌────▼──────┐            ┌────────▼────┐
   │DISTRIBUIDOR 1│         │DISTRIBUIDOR 2│
   │(TENANT 1)   │         │(TENANT 2)    │
   └────┬──────┘            └────────┬────┘
        │                             │
    ┌───┴────────┬──────────┐    ┌────┴─────────┐
    │            │          │    │              │
ADMIN-     USUARIO-   USUARIO-  ADMIN-    USUARIO-
CAFE-1    CAFE-1     CAFE-2   CAFE-3    CAFE-3
```

## 3 Niveles de Acceso

### 1. SUPER ADMIN (Administrador Global)
- Panel para crear/gestionar Distribuidores
- Estadísticas de toda la red
- Plan de cada cafetería (Mensual $70 o Mensual Pro $90 por local al mes, más IVA) e ingreso mensual estimado

### 2. DISTRIBUIDOR (Gestor de Zona)
- Crea sus propias cafeterías/locales y elige o cambia el plan de cada una (el distribuidor no tiene plan)
- Agrega usuarios (camareros, cajeros, gerentes) a sus cafés
- Panel con sus cafeterías y métricas
- Gestión de empleados por cafetería

### 3. USUARIOS DE CAFETERÍA (Camareros, Cajeros, Gerentes)
- Acceso solo a su cafetería asignada (ven su plan, no lo cambian)
- Funcionalidades: órdenes, mesas, pagos
- Roles específicos (camarero, cajero, cocinero, etc.)

## Estructura de Base de Datos

### Modelos Principales

```
Tenant (Distribuidor)
├── id (UUID)
├── name
├── slug
├── email, phone, address
├── ruc, business_name
├── status (active, inactive, suspended)
└── created_at, updated_at

User (Usuario Multi-tenant)
├── id (UUID)
├── email
├── first_name, last_name
├── tenant_id (FK) ← Asociado a Distribuidor
├── cafeteria_id (FK) ← Asociado a Cafetería
├── role (super_admin, distribuidor_admin, cafe_admin, camarero, etc)
└── created_at, updated_at

Cafeteria (Local)
├── id (UUID)
├── tenant_id (FK) ← Pertenece a Distribuidor
├── name, slug
├── address, city, phone, email
├── capacity
├── open_time, close_time
├── plan (mensual, pro) ← lo paga cada local; catálogo en apps/cafeterias/planes.py
└── created_at, updated_at
```

## Instalación

### 1. Clonar el repositorio
```bash
git clone git@github.com:CECODE26/COFFE-SAAS.git
cd COFFE-SAAS
```

### 2. Crear virtual environment
```bash
python -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate
```

### 3. Instalar dependencias
```bash
pip install -r requirements.txt
```

### 4. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus datos
```

### 5. Crear base de datos (PostgreSQL)
```bash
createdb coffe_saas
```

### 6. Ejecutar migraciones
```bash
python manage.py migrate
```

### 7. Crear super admin
```bash
python manage.py createsuperuser
```

### 8. Ejecutar servidor de desarrollo
```bash
python manage.py runserver
```

API disponible en: http://localhost:8000/api/v1/
Documentación: http://localhost:8000/api/docs/

## Endpoints de API (Fase 1)

### Autenticación
- `POST /api/v1/auth/login/` - Login
- `POST /api/v1/auth/refresh/` - Refresh token
- `POST /api/v1/auth/register/` - Alta de distribuidor con su administrador (solo super admin)

### Distribuidores (Super Admin)
- `GET /api/v1/tenants/` - Listar distribuidores
- `POST /api/v1/tenants/` - Crear distribuidor
- `GET /api/v1/tenants/{id}/` - Detalle distribuidor
- `PUT /api/v1/tenants/{id}/` - Actualizar distribuidor
- `DELETE /api/v1/tenants/{id}/` - Eliminar distribuidor

### Cafeterías
- `GET /api/v1/cafeterias/` - Listar cafeterías (filtrado por tenant)
- `POST /api/v1/cafeterias/` - Crear cafetería
- `GET /api/v1/cafeterias/{id}/` - Detalle cafetería
- `PUT /api/v1/cafeterias/{id}/` - Actualizar cafetería

### Usuarios
- `GET /api/v1/auth/users/` - Listar usuarios (filtrado por tenant)
- `POST /api/v1/auth/users/` - Crear usuario
- `GET /api/v1/auth/users/{id}/` - Detalle usuario
- `PUT /api/v1/auth/users/{id}/` - Actualizar usuario

## Características de Seguridad

✅ Autenticación JWT  
✅ CORS configurado  
✅ Row-Level Security (filtrado automático por tenant)  
✅ Rate limiting (próximamente)  
✅ Validación de permisos por role  
✅ Logging y auditoría  

## Middleware Multi-Tenant

El middleware `TenantMiddleware` resuelve automáticamente el tenant desde:
1. Header `X-Tenant-ID`
2. Query param `tenant_id`
3. Usuario autenticado
4. Subdominio (ej: cafe1.app.com)

## Próximas Fases

### Fase 2: Features SaaS
- [x] Planes por cafetería (Mensual y Mensual Pro; se contratan por WhatsApp)
- [ ] Facturación electrónica SRI (incluida en Mensual Pro, próximamente)
- [ ] Landing page
- [ ] Dashboard de super admin
- [ ] Dashboard de distribuidor
- [ ] Analytics y reportes
- [ ] Envío de emails

### Fase 3: Mobile App
- [ ] App móvil React Native (Expo)
- [ ] Sync offline
- [ ] QR para mesas
- [ ] Push notifications

### Fase 4: Optimizaciones
- [ ] Caching con Redis
- [ ] Background jobs con Celery
- [ ] CDN para media
- [ ] Optimización de queries

## Contribuir

Creamos una propuesta sólida. Para más detalles sobre la arquitectura específica, revisar los modelos en:
- `apps/tenants/models.py` - Modelo de Distribuidor
- `apps/accounts/models.py` - Modelo de Usuario multi-tenant
- `apps/cafeterias/models.py` - Modelo de Cafetería
- `apps/tenants/middleware.py` - Middleware multi-tenant

## Licencia

Privado - CECODE26

---

**Iniciado:** 2025-09-24  
**Versión:** 0.1.0-alpha  
**Desarrollador:** @cecode26
