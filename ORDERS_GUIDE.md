# Sistema de Pedidos - Guía Completa

## Overview

El sistema de pedidos de COFFE-SAAS permite:
- Crear pedidos (mesa, delivery, takeaway)
- Gestionar estado del pedido (pendiente → entregada)
- Seguimiento de items en cocina
- Cálculo automático de totales
- Registro de pagos
- Estadísticas de ventas

---

## Modelos

### Order (Pedido)

**Estados:**
```
pendiente → confirmada → preparando → lista → entregada
         ↘ cancelada
```

**Campos Principales:**
- `order_number`: Auto-generado (PED-20250924-0001)
- `order_type`: mesa | delivery | takeaway | escritorio
- `status`: Estado actual
- `subtotal`, `tax`, `discount`, `total`: Montos
- `payment_method`: efectivo, tarjeta, transferencia
- `is_paid`: Boolean
- `notes`: Notas del cliente
- `kitchen_notes`: Notas para cocina

### OrderItem (Item de Pedido)

**Estados:**
```
pendiente → preparando → lista → entregada
         ↘ cancelada
```

**Campos:**
- `menu_item`: Referencia al producto
- `quantity`: Cantidad
- `unit_price`: Precio al momento
- `special_price`: Precio especial (opcional)
- `notes`: Notas especiales (sin picante, extra hielo, etc)

---

## API Endpoints

### 1. Crear Pedido

**POST** `/api/v1/pedidos/orders/`

```bash
curl -X POST http://localhost:8000/api/v1/pedidos/orders/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "order_type": "mesa",
    "mesa": "mesa-uuid",
    "kitchen_notes": "Sin picante",
    "notes": "Cliente VIP",
    "items": [
      {
        "menu_item": "item-uuid-1",
        "quantity": 2,
        "notes": "Sin hielo"
      },
      {
        "menu_item": "item-uuid-2",
        "quantity": 1
      }
    ]
  }'
```

**Respuesta:**
```json
{
  "id": "order-uuid",
  "order_number": "PED-20250924-0001",
  "status": "pendiente",
  "subtotal": "24.50",
  "tax": "2.94",
  "total": "27.44",
  "items": [...],
  "created_at": "2025-09-24T10:30:00Z"
}
```

### 2. Confirmar Pedido

**POST** `/api/v1/pedidos/orders/{id}/confirm/`

```bash
curl -X POST http://localhost:8000/api/v1/pedidos/orders/order-uuid/confirm/ \
  -H "Authorization: Bearer <token>"
```

El pedido pasa de **pendiente** → **confirmada**

### 3. Enviar a Cocina

**POST** `/api/v1/pedidos/orders/{id}/send_to_kitchen/`

```bash
curl -X POST http://localhost:8000/api/v1/pedidos/orders/order-uuid/send_to_kitchen/ \
  -H "Authorization: Bearer <token>"
```

El pedido pasa de **confirmada** → **preparando**  
Todos los items cambian a **preparando**

### 4. Marcar Como Listo

**POST** `/api/v1/pedidos/orders/{id}/mark_ready/`

```bash
curl -X POST http://localhost:8000/api/v1/pedidos/orders/order-uuid/mark_ready/ \
  -H "Authorization: Bearer <token>"
```

El pedido pasa de **preparando** → **lista**  
Todos los items cambian a **lista**

### 5. Completar/Entregar Pedido

**POST** `/api/v1/pedidos/orders/{id}/complete/`

```bash
curl -X POST http://localhost:8000/api/v1/pedidos/orders/order-uuid/complete/ \
  -H "Authorization: Bearer <token>"
```

El pedido pasa de **lista** → **entregada**  
Se registra `completed_at`

### 6. Cancelar Pedido

**POST** `/api/v1/pedidos/orders/{id}/cancel/`

```bash
curl -X POST http://localhost:8000/api/v1/pedidos/orders/order-uuid/cancel/ \
  -H "Authorization: Bearer <token>"
```

El pedido pasa a **cancelada** (puede hacerse desde cualquier estado excepto entregada)

### 7. Registrar Pago

**POST** `/api/v1/pedidos/orders/{id}/mark_paid/`

```bash
curl -X POST http://localhost:8000/api/v1/pedidos/orders/order-uuid/mark_paid/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method": "efectivo"
  }'
```

Opciones: `efectivo`, `tarjeta`, `transferencia`

### 8. Aplicar Descuento

**POST** `/api/v1/pedidos/orders/{id}/apply_discount/`

```bash
curl -X POST http://localhost:8000/api/v1/pedidos/orders/order-uuid/apply_discount/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "discount": "5.00"
  }'
```

Recalcula el total automáticamente

### 9. Listar Pedidos Pendientes

**GET** `/api/v1/pedidos/orders/pending/`

```bash
curl -X GET http://localhost:8000/api/v1/pedidos/orders/pending/ \
  -H "Authorization: Bearer <token>"
```

Filtra automáticamente por cafetería del usuario

### 10. Estadísticas de Pedidos

**GET** `/api/v1/pedidos/orders/stats/?start_date=2025-09-01&end_date=2025-09-30`

```bash
curl -X GET "http://localhost:8000/api/v1/pedidos/orders/stats/" \
  -H "Authorization: Bearer <token>"
```

**Respuesta:**
```json
{
  "total_orders": 150,
  "pending_orders": 5,
  "completed_orders": 140,
  "total_revenue": "3500.00",
  "average_order_value": "23.33",
  "cash_collected": "2100.00"
}
```

### 11. Pedidos de Hoy

**GET** `/api/v1/pedidos/orders/today/`

```bash
curl -X GET http://localhost:8000/api/v1/pedidos/orders/today/ \
  -H "Authorization: Bearer <token>"
```

---

## Items de Pedido

### Cambiar Estado de Item

**POST** `/api/v1/pedidos/items/{id}/mark_ready/`

Cambia item de **preparando** → **lista**

**POST** `/api/v1/pedidos/items/{id}/mark_completed/`

Cambia item de **lista** → **entregada**

**POST** `/api/v1/pedidos/items/{id}/cancel/`

Cancela item y recalcula total del pedido

---

## Menú

### Crear Categoría

**POST** `/api/v1/menu/categories/`

```bash
curl -X POST http://localhost:8000/api/v1/menu/categories/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cafés",
    "slug": "cafes",
    "description": "Bebidas de café",
    "icon": "☕",
    "order": 1
  }'
```

### Crear Item de Menú

**POST** `/api/v1/menu/items/`

```bash
curl -X POST http://localhost:8000/api/v1/menu/items/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "category-uuid",
    "name": "Café Espresso",
    "slug": "cafe-espresso",
    "description": "Café espresso de alta calidad",
    "price": "3.50",
    "cost": "1.00",
    "preparation_time": 2,
    "is_available": true,
    "is_vegetarian": true,
    "is_vegan": true,
    "has_gluten": false
  }'
```

### Listar Items Disponibles

**GET** `/api/v1/menu/items/available/`

```bash
curl -X GET http://localhost:8000/api/v1/menu/items/available/ \
  -H "Authorization: Bearer <token>"
```

### Items Agrupados por Categoría

**GET** `/api/v1/menu/items/by_category/`

```bash
curl -X GET http://localhost:8000/api/v1/menu/items/by_category/ \
  -H "Authorization: Bearer <token>"
```

**Respuesta:**
```json
[
  {
    "category": {
      "id": "cat-uuid",
      "name": "Cafés",
      "icon": "☕"
    },
    "items": [
      {
        "id": "item-uuid",
        "name": "Espresso",
        "price": "3.50",
        ...
      }
    ]
  }
]
```

### Cambiar Disponibilidad

**POST** `/api/v1/menu/items/{id}/toggle_availability/`

Activa/desactiva la disponibilidad del item

---

## Flujo Completo de Ejemplo

### 1. Camarero toma orden

```bash
# Obtener menú disponible
GET /api/v1/menu/items/by_category/

# Crear pedido
POST /api/v1/pedidos/orders/
{
  "order_type": "mesa",
  "mesa": "mesa-1-uuid",
  "items": [
    {"menu_item": "cafe-uuid", "quantity": 2},
    {"menu_item": "sandwich-uuid", "quantity": 1}
  ]
}
# Respuesta: order-uuid con estado "pendiente"
```

### 2. Confirmar orden

```bash
POST /api/v1/pedidos/orders/order-uuid/confirm/
# Estado: pendiente → confirmada
```

### 3. Enviar a cocina

```bash
POST /api/v1/pedidos/orders/order-uuid/send_to_kitchen/
# Estado: confirmada → preparando
```

### 4. Cocina marca items listos

```bash
# Café listo primero
POST /api/v1/pedidos/items/item1-uuid/mark_ready/
# item1: preparando → lista

# Sandwich listo
POST /api/v1/pedidos/items/item2-uuid/mark_ready/
# item2: preparando → lista
```

### 5. Marcar pedido como listo

```bash
POST /api/v1/pedidos/orders/order-uuid/mark_ready/
# Estado: preparando → lista
# (o cuando todos los items estén listos)
```

### 6. Servir y marcar como entregado

```bash
POST /api/v1/pedidos/orders/order-uuid/complete/
# Estado: lista → entregada
```

### 7. Registrar pago

```bash
POST /api/v1/pedidos/orders/order-uuid/mark_paid/
{
  "payment_method": "efectivo"
}
# is_paid: true
```

### 8. Ver estadísticas

```bash
GET /api/v1/pedidos/orders/stats/?start_date=2025-09-24
# Ingresos del día, promedio, etc
```

---

## Permiso y Acceso

| Rol | Puede Crear | Puede Confirmar | Puede Enviar Cocina | Puede Ver Stats |
|-----|-----------|-----------------|-------------------|-----------------|
| super_admin | ✅ Todos | ✅ Todos | ✅ Todos | ✅ Todos |
| distribuidor_admin | ✅ Su tenant | ✅ Su tenant | ✅ Su tenant | ✅ Su tenant |
| cafe_admin | ✅ Su café | ✅ Su café | ✅ Su café | ✅ Su café |
| camarero | ✅ Su café | ❌ | ❌ | ❌ |
| cajero | ❌ | ✅ Su café | ❌ | ❌ |

---

## Validaciones

### Crear Pedido
- ✅ User debe tener cafetería asignada
- ✅ Si order_type='mesa', mesa_id es obligatorio
- ✅ Si order_type='delivery', customer_address es obligatorio
- ✅ Al menos 1 item

### Registrar Pago
- ✅ Pedido debe estar confirmado
- ✅ payment_method válido

### Descuento
- ✅ Debe ser número positivo
- ✅ No puede exceder el subtotal (validar en frontend)

---

## Cálculos Automáticos

```
subtotal = SUM(item.quantity * item.price)
tax = subtotal * 0.12 (IVA Ecuador 12%)
total = subtotal + tax - discount
```

Se recalculan automáticamente cuando:
- Se añade/elimina item
- Se aplica descuento
- Se cancela item

---

## Próximos Pasos

- [ ] WebSocket para actualización en tiempo real
- [ ] Printing de boletas
- [ ] Integración con POS
- [ ] Historial de cambios (auditoria)
- [ ] Reportes de cocina
