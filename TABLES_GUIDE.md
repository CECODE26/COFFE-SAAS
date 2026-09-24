# Sistema de Mesas y Reservas - Guía Completa

## Overview

El sistema de mesas permite:
- Gestionar mesas/espacios de la cafetería
- Seguimiento de estado (disponible, ocupada, reservada)
- Códigos QR para cada mesa
- Reservaciones automáticas
- Validación de capacidad
- Detección de conflictos de horario

---

## Modelos

### Mesa (Table)

**Estados:**
```
disponible → ocupada → limpiando → disponible
         ↘ reservada
         ↘ mantenimiento
```

**Campos Principales:**
- `number`: Número de mesa (1, 2, 3...)
- `capacity`: Capacidad máxima de personas
- `min_capacity`: Capacidad mínima
- `status`: Estado actual
- `guest_count`: Clientes actualmente
- `occupied_since`: Hora de ocupación
- `qr_code`: Código QR único
- `current_order`: Pedido asociado (FK)

### Reserva (Reservation)

**Estados:**
```
pendiente → confirmada → completada
        ↘ cancelada
```

**Campos:**
- `customer_name`: Nombre del cliente
- `customer_phone`: Teléfono
- `reservation_date`: Fecha
- `reservation_time`: Hora exacta
- `guest_count`: Número de clientes
- `status`: Estado actual

---

## API Endpoints

### Mesas

#### 1. Crear Mesa

**POST** `/api/v1/mesas/mesas/`

```bash
curl -X POST http://localhost:8000/api/v1/mesas/mesas/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "number": 1,
    "description": "Mesa ventana con vista",
    "capacity": 4,
    "min_capacity": 2,
    "location": "Piso 1, Sección A"
  }'
```

**Respuesta:**
```json
{
  "id": "mesa-uuid",
  "number": 1,
  "capacity": 4,
  "status": "disponible",
  "qr_code": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "location": "Piso 1, Sección A",
  "is_active": true,
  "created_at": "2025-09-24T10:30:00Z"
}
```

#### 2. Listar Mesas

**GET** `/api/v1/mesas/mesas/`

```bash
curl -X GET http://localhost:8000/api/v1/mesas/mesas/ \
  -H "Authorization: Bearer <token>"
```

Filtros disponibles:
- `?status=disponible` - Por estado
- `?search=piso` - Búsqueda
- `?ordering=number` - Ordenamiento

#### 3. Marcar Mesa como Ocupada

**POST** `/api/v1/mesas/mesas/{id}/occupy/`

```bash
curl -X POST http://localhost:8000/api/v1/mesas/mesas/mesa-uuid/occupy/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "guest_count": 3
  }'
```

- `guest_count`: Número de clientes (validado contra min/max capacity)
- Estado cambia a **ocupada**
- Se registra `occupied_since`

#### 4. Liberar Mesa

**POST** `/api/v1/mesas/mesas/{id}/free/`

```bash
curl -X POST http://localhost:8000/api/v1/mesas/mesas/mesa-uuid/free/ \
  -H "Authorization: Bearer <token>"
```

- Estado cambia a **disponible**
- Se limpia `guest_count` y `occupied_since`
- Se desasocia `current_order`

#### 5. Marcar en Limpieza

**POST** `/api/v1/mesas/mesas/{id}/cleaning/`

```bash
curl -X POST http://localhost:8000/api/v1/mesas/mesas/mesa-uuid/cleaning/ \
  -H "Authorization: Bearer <token>"
```

El personal puede indicar que la mesa se está limpiando

#### 6. Marcar en Mantenimiento

**POST** `/api/v1/mesas/mesas/{id}/maintenance/`

```bash
curl -X POST http://localhost:8000/api/v1/mesas/mesas/mesa-uuid/maintenance/ \
  -H "Authorization: Bearer <token>"
```

Para mantenimiento/reparación

#### 7. Cambiar Estado Genérico

**POST** `/api/v1/mesas/mesas/{id}/change_status/`

```bash
curl -X POST http://localhost:8000/api/v1/mesas/mesas/mesa-uuid/change_status/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "ocupada",
    "guest_count": 2
  }'
```

Estados válidos: `disponible`, `ocupada`, `reservada`, `limpiando`, `mantenimiento`

#### 8. Obtener Mesas Disponibles

**GET** `/api/v1/mesas/mesas/available/`

```bash
curl -X GET http://localhost:8000/api/v1/mesas/mesas/available/ \
  -H "Authorization: Bearer <token>"
```

Filtra automáticamente por cafetería del usuario

#### 9. Obtener Mesas Ocupadas

**GET** `/api/v1/mesas/mesas/occupied/`

```bash
curl -X GET http://localhost:8000/api/v1/mesas/mesas/occupied/ \
  -H "Authorization: Bearer <token>"
```

Útil para conocer carga de trabajo

#### 10. Estadísticas de Mesas

**GET** `/api/v1/mesas/mesas/stats/`

```bash
curl -X GET http://localhost:8000/api/v1/mesas/mesas/stats/ \
  -H "Authorization: Bearer <token>"
```

**Respuesta:**
```json
{
  "total_mesas": 15,
  "available_mesas": 8,
  "occupied_mesas": 5,
  "reserved_mesas": 2,
  "cleaning_mesas": 0,
  "average_occupancy": 33.33,
  "total_capacity": 15
}
```

#### 11. Obtener Mesa por Código QR

**GET** `/api/v1/mesas/mesas/by_qr/?qr_code=f47ac10b-58cc-4372-a567-0e02b2c3d479`

```bash
curl -X GET "http://localhost:8000/api/v1/mesas/mesas/by_qr/?qr_code=CODE" \
  -H "Authorization: Bearer <token>"
```

Útil para escanear QR en la mesa

---

### Reservas

#### 1. Crear Reserva

**POST** `/api/v1/mesas/reservas/`

```bash
curl -X POST http://localhost:8000/api/v1/mesas/reservas/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "mesa": "mesa-uuid",
    "customer_name": "Juan García",
    "customer_phone": "+593987654321",
    "customer_email": "juan@example.com",
    "guest_count": 4,
    "reservation_date": "2025-09-30",
    "reservation_time": "19:00",
    "notes": "Aniversario, sorpresa"
  }'
```

**Validaciones:**
- ✅ `guest_count` dentro de rango (min_capacity - capacity)
- ✅ No hay conflicto de horario (±30 min/90 min duración)
- ✅ `reservation_date` es hoy o futuro

**Respuesta:**
```json
{
  "id": "reserva-uuid",
  "mesa": "mesa-uuid",
  "mesa_info": {
    "number": 1,
    "capacity": 4
  },
  "customer_name": "Juan García",
  "reservation_date": "2025-09-30",
  "reservation_time": "19:00:00",
  "status": "pendiente",
  "created_at": "2025-09-24T10:30:00Z"
}
```

#### 2. Listar Reservas

**GET** `/api/v1/mesas/reservas/`

```bash
curl -X GET http://localhost:8000/api/v1/mesas/reservas/ \
  -H "Authorization: Bearer <token>"
```

Filtros:
- `?status=confirmada`
- `?search=juan`

#### 3. Confirmar Reserva

**POST** `/api/v1/mesas/reservas/{id}/confirm/`

```bash
curl -X POST http://localhost:8000/api/v1/mesas/reservas/reserva-uuid/confirm/ \
  -H "Authorization: Bearer <token>"
```

Solo admin puede confirmar. Estado: **pendiente** → **confirmada**

#### 4. Cancelar Reserva

**POST** `/api/v1/mesas/reservas/{id}/cancel/`

```bash
curl -X POST http://localhost:8000/api/v1/mesas/reservas/reserva-uuid/cancel/ \
  -H "Authorization: Bearer <token>"
```

Estado: → **cancelada**

#### 5. Completar Reserva

**POST** `/api/v1/mesas/reservas/{id}/complete/`

```bash
curl -X POST http://localhost:8000/api/v1/mesas/reservas/reserva-uuid/complete/ \
  -H "Authorization: Bearer <token>"
```

Marcar como completada después que el cliente llega

#### 6. Reservas Próximas (30 min)

**GET** `/api/v1/mesas/reservas/upcoming/`

```bash
curl -X GET http://localhost:8000/api/v1/mesas/reservas/upcoming/ \
  -H "Authorization: Bearer <token>"
```

Reservas que se deben confirmar pronto

#### 7. Reservas de Hoy

**GET** `/api/v1/mesas/reservas/today/`

```bash
curl -X GET http://localhost:8000/api/v1/mesas/reservas/today/ \
  -H "Authorization: Bearer <token>"
```

#### 8. Reservas por Fecha

**GET** `/api/v1/mesas/reservas/by_date/?date=2025-09-30`

```bash
curl -X GET "http://localhost:8000/api/v1/mesas/reservas/by_date/?date=2025-09-30" \
  -H "Authorization: Bearer <token>"
```

---

## Flujo Completo de Ejemplo

### Escenario: Cliente llega sin reserva

```bash
# 1. Camarero ve mesas disponibles
GET /api/v1/mesas/mesas/available/

# 2. Selecciona mesa 1, ocupa con 3 clientes
POST /api/v1/mesas/mesas/mesa-1-uuid/occupy/
{ "guest_count": 3 }

# 3. Crea pedido para la mesa
POST /api/v1/pedidos/orders/
{
  "order_type": "mesa",
  "mesa": "mesa-1-uuid",
  "items": [...]
}

# 4. Después que come, libera mesa
POST /api/v1/mesas/mesas/mesa-1-uuid/free/

# 5. Personal marca en limpieza mientras se limpia
POST /api/v1/mesas/mesas/mesa-1-uuid/cleaning/

# Cuando termina de limpiar, pasa a disponible automáticamente
# O puede usar change_status
POST /api/v1/mesas/mesas/mesa-1-uuid/change_status/
{ "status": "disponible" }
```

### Escenario: Reserva

```bash
# 1. Cliente hace reserva
POST /api/v1/mesas/reservas/
{
  "mesa": "mesa-5-uuid",
  "customer_name": "María López",
  "customer_phone": "+593987654322",
  "guest_count": 4,
  "reservation_date": "2025-09-30",
  "reservation_time": "19:00"
}
# Estado: pendiente

# 2. Admin confirma
POST /api/v1/mesas/reservas/reserva-uuid/confirm/
# Estado: confirmada

# 3. Sistema alerta 30 min antes
GET /api/v1/mesas/reservas/upcoming/

# 4. Cliente llega, ocupan mesa
POST /api/v1/mesas/mesas/mesa-5-uuid/occupy/
{ "guest_count": 4 }

# 5. Después de comer
POST /api/v1/mesas/reservas/reserva-uuid/complete/
POST /api/v1/mesas/mesas/mesa-5-uuid/free/
```

---

## QR Code Integration

Cada mesa tiene un código QR único. Usar para:

### Generar QR en Frontend
```javascript
// QR Code data
{
  mesa_id: "uuid",
  qr_code: "unique-code",
  number: 1,
  cafeteria: "uuid"
}

// Escanear desde mobile
GET /api/v1/mesas/mesas/by_qr/?qr_code=CODE
```

### Casos de Uso
- Cliente escanea QR → Ver menú
- Camarero escanea → Agregar item a pedido
- Admin escanea → Ver status de mesa

---

## Permisos y Acceso

| Rol | Crear | Cambiar Estado | Ver Stats | Confirmar Res |
|-----|-------|----------------|-----------|--------------|
| super_admin | ✅ | ✅ | ✅ | ✅ |
| distribuidor_admin | ✅ | ✅ | ✅ | ✅ |
| cafe_admin | ✅ | ✅ | ✅ | ✅ |
| camarero | ❌ | ✅ | ❌ | ❌ |
| cajero | ❌ | ✅ | ❌ | ❌ |

---

## Validaciones

### Ocupar Mesa
- ✅ `guest_count` >= min_capacity
- ✅ `guest_count` <= capacity
- ✅ Mesa status es modificable

### Crear Reserva
- ✅ `guest_count` dentro de rango
- ✅ No hay conflicto horario
- ✅ Fecha es futuro
- ✅ Hora es válida

### Liberar Mesa
- ✅ Mesa no está disponible
- ✅ Se limpia guest_count
- ✅ Se desasocia pedido

---

## Dashboarding

### Para Manager
```bash
# Ocupación actual
GET /api/v1/mesas/mesas/stats/

# Reservas de hoy
GET /api/v1/mesas/reservas/today/

# Reservas próximas
GET /api/v1/mesas/reservas/upcoming/

# Mesas en limpieza
GET /api/v1/mesas/mesas/?status=limpiando
```

### Para Camarero
```bash
# Mesas disponibles
GET /api/v1/mesas/mesas/available/

# Mesas ocupadas
GET /api/v1/mesas/mesas/occupied/

# Por QR
GET /api/v1/mesas/mesas/by_qr/?qr_code=XXX
```

---

## Integraciones

### Con Pedidos
```
Mesa → Pedido (FK)
Cuando liberas mesa, se desasocia el pedido
```

### Con Facturación
```
Pedido → Factura (cuando se paga)
Mesa → Histórico de pedidos
```

### Con Reportes
```
- Promedio de clientes por mesa
- Tiempo de ocupación
- Rotación de mesas
- Mesas más/menos usadas
```

---

## Próximos Pasos

- [ ] Generación de QR codes (qrcode lib)
- [ ] Mapa visual de mesas (UI)
- [ ] Reservas de grupo (múltiples mesas)
- [ ] Descuento por reserva
- [ ] Reputación de cliente (no-show tracking)
- [ ] Integración con WhatsApp (confirmaciones)
