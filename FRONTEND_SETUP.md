# Frontend Setup Guide

Guía completa para ejecutar el dashboard React de COFFE-SAAS.

## 🚀 Quick Start (5 minutos)

### 1. Instalar Dependencias

```bash
cd frontend
npm install
```

### 2. Configurar API

Crear/editar `.env`:

```bash
cp .env.example .env
```

Contenido:
```env
REACT_APP_API_URL=http://localhost:8000/api/v1
```

### 3. Ejecutar Frontend

```bash
npm start
```

Abre automáticamente en `http://localhost:3000`

### 4. Login

```
Email: admin@coffe.com (o tu usuario)
Contraseña: (tu contraseña)
```

---

## 📋 Requisitos Previos

✅ Backend Django corriendo en `http://localhost:8000`  
✅ Base de datos migrada  
✅ Super admin creado  
✅ Node.js 16+ instalado  
✅ npm o yarn  

---

## 🏗️ Estructura del Proyecto

```
frontend/
├── public/                      # Estáticos HTML/assets
├── src/
│   ├── components/             # Componentes reutilizables
│   │   ├── Button.jsx         # Botones versátiles
│   │   ├── Card.jsx           # Tarjetas de contenido
│   │   ├── Navbar.jsx         # Navegación principal
│   │   └── PrivateRoute.jsx   # Protección de rutas
│   │
│   ├── context/               # Estado global (React Context)
│   │   ├── AuthContext.jsx    # Autenticación (login, user, token)
│   │   └── DataContext.jsx    # Datos (mesas, pedidos, menú, reservas)
│   │
│   ├── hooks/                 # Hooks personalizados
│   │   ├── useAuth.js         # Hook para acceder a AuthContext
│   │   └── useData.js         # Hook para acceder a DataContext
│   │
│   ├── pages/                 # Páginas completas
│   │   ├── Login.jsx          # Página de login
│   │   ├── Dashboard.jsx      # Dashboard con stats
│   │   ├── Mesas.jsx          # Gestión visual de mesas
│   │   ├── Pedidos.jsx        # Gestión de pedidos
│   │   ├── Menu.jsx           # Catálogo de menú
│   │   └── Reservas.jsx       # Sistema de reservas
│   │
│   ├── services/              # Servicios (API)
│   │   └── api.js             # Cliente Axios configurado
│   │
│   ├── App.jsx                # Rutas principales
│   ├── index.js               # Entrada de la app
│   └── index.css              # Estilos globales
│
├── package.json
├── tailwind.config.js
└── README.md
```

---

## 🔐 Autenticación

### Flujo de Login

```
Usuario ingresa email/password
         ↓
API: POST /auth/login/
         ↓
Respuesta: { access, refresh, user }
         ↓
localStorage.setItem('access_token', access)
localStorage.setItem('refresh_token', refresh)
localStorage.setItem('user', JSON.stringify(user))
         ↓
AuthContext actualiza estado
         ↓
Redirecciona a /dashboard
```

### Token Refresh Automático

Si el token expira (1 hora):
1. Axios interceptor detecta error 401
2. Usa refresh_token para obtener nuevo access_token
3. Reintenta el request original
4. Si falla, redirige a /login

### Logout

```
Usuario hace click en logout
         ↓
localStorage.removeItem()
AuthContext se limpia
         ↓
Redirecciona a /login
```

---

## 📱 Páginas del Dashboard

### Login (`/login`)

**Funcionalidades:**
- Autenticación con email/password
- Validación en el lado del cliente
- Toast notifications
- Redirección automática a dashboard

**Componentes:**
- Card con formulario
- Button para submit
- Toast para errores

### Dashboard (`/dashboard`)

**Funcionalidades:**
- Estadísticas en tiempo real
- Gráfico de ocupación de mesas
- Pedidos recientes
- Métricas principales

**Componentes:**
- Stat Cards (4 tarjetas)
- Bar Chart (Recharts)
- Tabla de pedidos

**API Calls:**
```
GET /mesas/mesas/stats/
GET /pedidos/orders/
GET /mesas/mesas/
```

### Mesas (`/mesas`)

**Funcionalidades:**
- Grid visual de mesas
- Cambio de color según estado
- Modal para ocupar mesa
- Selector de número de clientes

**Estados Visuales:**
- 🟢 Disponible
- 🔴 Ocupada
- 🟡 Reservada
- 🔵 Limpiando
- ⚫ Mantenimiento

**API Calls:**
```
GET /mesas/mesas/
POST /mesas/mesas/{id}/occupy/
POST /mesas/mesas/{id}/free/
GET /mesas/mesas/stats/
```

### Pedidos (`/pedidos`)

**Funcionalidades:**
- Lista de pedidos con filtros
- Estado individual de cada pedido
- Acciones rápidas
- Detalles de items

**Filtros:**
- Todos
- Activos (pendiente, confirmada, preparando, lista)
- Completados

**Acciones por Estado:**
```
pendiente   → Confirmar, Cancelar
confirmada  → Enviar a Cocina
preparando  → Marcar Listo
lista       → Entregar
entregada   → Marcar Pagado
```

**API Calls:**
```
GET /pedidos/orders/
POST /pedidos/orders/{id}/confirm/
POST /pedidos/orders/{id}/send_to_kitchen/
POST /pedidos/orders/{id}/mark_ready/
POST /pedidos/orders/{id}/complete/
POST /pedidos/orders/{id}/mark_paid/
```

### Menú (`/menu`)

**Funcionalidades:**
- Catálogo agrupado por categoría
- Información nutricional
- Tiempo de preparación
- Imágenes de productos

**Información Mostrada:**
- Nombre y descripción
- Precio
- Tiempo de preparación
- Etiquetas: Vegetariano, Vegano, Gluten

**API Calls:**
```
GET /menu/items/by_category/
```

### Reservas (`/reservas`)

**Funcionalidades:**
- Lista de reservas
- Filtros por estado
- Datos de cliente
- Confirmación de reservas

**Estados:**
- Pendiente (amarillo)
- Confirmada (verde)
- Cancelada (rojo)
- Completada (gris)

**API Calls:**
```
GET /mesas/reservas/
POST /mesas/reservas/{id}/confirm/
POST /mesas/reservas/{id}/cancel/
POST /mesas/reservas/{id}/complete/
```

---

## 🎨 Personalización

### Colores

Editar `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        50: '#f5f3ff',
        600: '#8b5cf6',
        900: '#3f0f5c',
        // ...
      }
    }
  }
}
```

### Componentes

Crear nuevo componente:

```javascript
// src/components/MyComponent.jsx
import React from 'react';

export const MyComponent = ({ children, ...props }) => {
  return (
    <div className="..." {...props}>
      {children}
    </div>
  );
};
```

Usar en una página:

```javascript
import { MyComponent } from '../components/MyComponent';

// En JSX:
<MyComponent>Contenido</MyComponent>
```

---

## 🔄 Flujos de Datos

### Ocupar una Mesa

```
Componente: Mesas.jsx
         ↓
Usuario hace click en mesa
         ↓
Modal se abre para ingresar # de clientes
         ↓
handleOccupy() llamado
         ↓
occupyMesa(mesaId, guestCount)
         ↓
API: POST /mesas/mesas/{id}/occupy/
         ↓
fetchMesas() para actualizar
         ↓
Componente se re-renderiza
         ↓
Toast de éxito
```

### Crear Pedido

```
Frontend: POST /pedidos/orders/
{
  "order_type": "mesa",
  "mesa": "uuid",
  "items": [
    {"menu_item": "uuid", "quantity": 2, "notes": "..."}
  ]
}
         ↓
Backend: Crea Order + OrderItems
Calcula total
         ↓
Response: Order con items
         ↓
DataContext actualiza
         ↓
Componente Pedidos se actualiza
```

---

## 🐛 Debugging

### React DevTools

1. Instalar extensión en Chrome/Firefox
2. En el componente:
   ```javascript
   import { useAuth } from '../hooks/useAuth';
   const { user, loading } = useAuth();
   console.log('User:', user); // Debug
   ```

### Network Tab

1. Abrir DevTools → Network
2. Filtrar por "Fetch/XHR"
3. Ver requests a la API

### Local Storage

```javascript
// En la consola:
localStorage.getItem('access_token')
localStorage.getItem('user')
```

---

## 📦 Build para Producción

```bash
npm run build
```

Crea carpeta `build/` optimizada:
- Minificado
- Chunking automático
- Cache busting

### Servir Build

```bash
# Con npm
npm install -g serve
serve -s build

# Con Docker
docker build -t coffe-frontend .
docker run -p 80:3000 coffe-frontend
```

---

## 🚀 Deployment

### Vercel (Recomendado)

```bash
npm install -g vercel
vercel login
vercel
```

### Netlify

```bash
npm run build
netlify deploy --prod --dir=build
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 📝 Variables de Entorno

```env
# API
REACT_APP_API_URL=http://localhost:8000/api/v1

# Ambiente
REACT_APP_ENV=development

# Opcional
REACT_APP_DEBUG=false
```

---

## ✅ Checklist Pre-Producción

- [ ] Backend está corriendo y accesible
- [ ] Base de datos está actualizada
- [ ] CORS está habilitado en Django
- [ ] JWT tokens configurados
- [ ] Variables de entorno configuradas
- [ ] Tests pasando
- [ ] Responsive design probado
- [ ] Performance optimizado
- [ ] Error handling completo
- [ ] Logging configurado

---

## 🆘 Troubleshooting

### "Cannot GET /api/v1/..."
```
Solución:
1. Verifica que Django esté en http://localhost:8000
2. Revisa REACT_APP_API_URL en .env
3. npm start reinicia el servidor
```

### "401 Unauthorized"
```
Solución:
1. Logout y vuelve a hacer login
2. Verifica JWT en localStorage
3. Token puede estar expirado
```

### CORS Error
```
Solución en Django settings.py:
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8000",
]
```

### Componentes no se actualizan
```
Verifica:
1. Estado en Context se actualiza
2. useData() o useAuth() usado correctamente
3. No hay errores en console
4. API request fue exitoso
```

---

## 📚 Recursos

- [React Docs](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [React Router](https://reactrouter.com)
- [Axios](https://axios-http.com)
- [Recharts](https://recharts.org)

---

**Versión:** 0.1.0  
**Última actualización:** 2025-09-24  
**Desarrollador:** COFFE-SAAS Team
