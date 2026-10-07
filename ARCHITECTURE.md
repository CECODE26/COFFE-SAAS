# COFFE-SAAS Architecture

## Overview

COFFE-SAAS es una plataforma SaaS multi-tenant diseñada para gestionar redes de cafeterías a través de distribuidores. La arquitectura permite que cada distribuidor (tenant) tenga control total de sus cafeterías y usuarios.

## Data Model

### Tenant (Distribuidor)
- **Responsabilidades:**
  - Distribuidor de cafeterías en una región
  - Puede crear múltiples cafeterías
  - Puede invitar usuarios a sus cafeterías
  - No tiene plan, límites ni vencimiento de suscripción: el plan lo paga cada cafetería

- **Attributes:**
  - `id` (UUID) - Primary key
  - `name` - Nombre del distribuidor
  - `slug` - URL-friendly identifier
  - `email`, `phone`, `address` - Contact info
  - `ruc` - Unique business identifier (Ecuador)
  - `status` - active, inactive, suspended

### User (Multi-tenant)
- **Responsabilidades:**
  - Autenticación
  - Authorization basada en roles
  - Asociación con Tenant y Cafeteria

- **Roles:**
  ```
  super_admin (1)
    ├── Solo el owner de la plataforma
    ├── Acceso a todos los tenants
    └── Gestión de planes de las cafeterías y facturación
  
  distribuidor_admin (N)
    ├── Admin de un tenant específico
    ├── Puede crear/editar cafeterías
    ├── Puede invitar/gestionar usuarios
    └── Ve analytics de su tenant
  
  cafe_admin (N)
    ├── Admin de una cafetería específica
    ├── Gestión operativa de la cafetería
    └── Reportes de su cafetería
  
  gerente, camarero, cajero, cocinero (N)
    ├── Roles específicos de cafetería
    └── Acceso solo a su cafetería asignada
  ```

- **Attributes:**
  - `id` (UUID)
  - `email` - Unique per system
  - `tenant_id` (FK) - Tenant asociado (NULL para super_admin)
  - `cafeteria_id` (FK) - Cafetería asignada (NULL para admin roles)
  - `role` - Role type
  - `is_active` - Soft delete capability

### Cafeteria (Local)
- **Responsabilidades:**
  - Ubicación física del negocio
  - Gestión de mesas
  - Gestión de órdenes

- **Attributes:**
  - `id` (UUID)
  - `tenant_id` (FK) - Pertenece a un distribuidor
  - `name` - Nombre del local
  - `slug` - URL identifier
  - `address`, `city`, `postal_code`
  - `capacity`
  - `open_time`, `close_time`
  - `plan` - mensual ($70) o pro ($90, Mensual Pro), por local al mes, más IVA 15%.
    Catálogo en `apps/cafeterias/planes.py` (espejo de `frontend/src/config/site.js`).
    Lo eligen y cambian el super admin y el distribuidor dueño; el resto solo lo ve.

## Multi-Tenant Implementation

### Request Flow

```
User Request
    ↓
CORS Middleware (Allow cross-origin)
    ↓
TenantMiddleware
    ├─ Extrae tenant_id desde:
    │  ├─ Header: X-Tenant-ID
    │  ├─ Query: ?tenant_id=xxx
    │  ├─ User: user.tenant_id
    │  └─ Subdomain: cafe1.app.com
    ↓
request.tenant = Tenant object
    ↓
View/Serializer
    ├─ Filtra queries por request.tenant
    ├─ Valida permisos por role
    └─ Retorna datos filtrados
    ↓
Response
```

### QuerySet Filtering

Todos los querysets deben ser filtrados automáticamente:

```python
# models.py - CustomManager
class TenantAwareManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(tenant=self.model._current_tenant)

# views.py
def get_queryset(self):
    return Cafeteria.objects.filter(tenant=self.request.tenant)
```

### Isolation Levels

```
Level 1: Database
├─ Row-Level Security (RLS)
└─ Indexes on tenant_id

Level 2: ORM
├─ Automatic queryset filtering
└─ TenantAwareManager

Level 3: API
├─ Permission checks in views
├─ Serializer validation
└─ JWT token includes tenant_id

Level 4: Frontend
├─ User can only see their tenant
├─ UI hides other tenants
└─ API errors for unauthorized access
```

## Authentication & Authorization

### JWT Flow

```
1. User Login (email + password)
   → Django validates credentials
   → Verifies tenant_id
   → Returns JWT token + refresh token

2. JWT Token Structure
   {
     "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
     "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
     "user": {
       "id": "uuid",
       "email": "user@cafe.com",
       "tenant_id": "uuid",
       "role": "camarero",
       "cafeteria_id": "uuid"
     }
   }

3. API Request with JWT
   Headers: Authorization: Bearer <access_token>
   Payload: Decoded JWT
   Tenant: request.user.tenant_id
```

### Permission Checks

```python
# views.py - Permission classes
class IsTenantMember(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.tenant == request.tenant

class IsSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.role == 'super_admin'

class IsCafeAdmin(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return (
            request.user.role == 'cafe_admin' and
            request.user.cafeteria == obj.cafeteria
        )
```

## API Structure

### Base URLs
- `/api/v1/auth/` - Authentication
- `/api/v1/tenants/` - Tenant management
- `/api/v1/cafeterias/` - Cafeteria management
- `/api/v1/users/` - User management
- `/api/v1/pedidos/` - Orders
- `/api/v1/mesas/` - Tables
- `/api/v1/menu/` - Menu items
- `/api/v1/facturacion/` - Billing

### Response Format

```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "Distribuidor 1",
    ...
  },
  "meta": {
    "pagination": {
      "count": 100,
      "next": "url",
      "previous": "url"
    }
  }
}
```

## Database Schema

### Key Relationships

```sql
-- Tenants (Distribuidores)
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Cafeterias (Locales)
CREATE TABLE cafeterias (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100),
  capacity INT DEFAULT 50,
  open_time TIME,
  close_time TIME,
  plan VARCHAR(20) DEFAULT 'mensual',  -- mensual | pro
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(tenant_id, slug)
);

-- Users (Multi-tenant)
CREATE TABLE accounts_user (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  cafeteria_id UUID REFERENCES cafeterias(id) ON DELETE SET NULL,
  role VARCHAR(20) DEFAULT 'usuario',
  first_name VARCHAR(150),
  last_name VARCHAR(150),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  last_login TIMESTAMP
);

-- Indexes
CREATE INDEX idx_cafeterias_tenant ON cafeterias(tenant_id);
CREATE INDEX idx_users_tenant ON accounts_user(tenant_id);
CREATE INDEX idx_users_tenant_email ON accounts_user(tenant_id, email);
CREATE INDEX idx_users_role ON accounts_user(tenant_id, role);
```

## Deployment Strategy

### Development
- SQLite (local) → PostgreSQL (recommended)
- Debug = True
- CORS allows localhost

### Staging
- PostgreSQL + Backup
- Debug = False
- HTTPS enforced
- Limited CORS origins

### Production
- PostgreSQL + Replication + Backup
- Gunicorn + Nginx
- Redis for caching
- Celery for background jobs
- AWS S3 for media
- CDN for static files

## Security Considerations

1. **Tenant Isolation**
   - Every query filters by tenant
   - No cross-tenant data leakage
   - Tests verify isolation

2. **Authentication**
   - JWT tokens include tenant_id
   - Tokens expire (1 hour access, 7 days refresh)
   - HTTPS in production

3. **Authorization**
   - Role-based access control (RBAC)
   - Object-level permissions
   - Audit logs for sensitive operations

4. **Data Protection**
   - PostgreSQL encryption
   - Passwords hashed with PBKDF2
   - CORS restricted to known origins
   - CSRF protection enabled

5. **Rate Limiting**
   - Per IP limits (future)
   - Per tenant limits (future)
   - Prevent abuse

## Testing Strategy

### Unit Tests
- Model validation
- Serializer logic
- Utility functions

### Integration Tests
- API endpoints
- Tenant isolation (verify no leakage)
- Permission checks

### End-to-End Tests
- Complete user workflows
- Cross-tenant scenarios
- Data consistency

## Monitoring & Logging

```
- Application Logs (Django logging)
- Request Logs (nginx/Gunicorn)
- Database Logs (PostgreSQL)
- Error Tracking (Sentry)
- Performance Monitoring (New Relic/DataDog)
- Audit Trail (auditoria app)
```

## Future Considerations

1. **Scalability**
   - Database partitioning by tenant
   - Read replicas for analytics
   - Caching layer (Redis)

2. **Features**
   - Real-time updates (WebSockets)
   - Mobile app sync
   - Analytics engine
   - Payment processing

3. **Compliance**
   - GDPR data export
   - Data retention policies
   - Audit trail requirements
