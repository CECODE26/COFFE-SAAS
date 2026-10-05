# COFFE-SAAS Frontend

Dashboard moderno para gestión de cafeterías.

## 🚀 Características

- ✅ Dashboard con estadísticas en tiempo real
- ✅ Gestión visual de mesas
- ✅ Seguimiento de pedidos
- ✅ Sistema de reservas
- ✅ Catálogo de menú
- ✅ Autenticación con JWT
- ✅ Responsive design (mobile-first)
- ✅ Notificaciones en tiempo real (toast)

## 🛠️ Tech Stack

- **React 18** - UI Framework
- **React Router v6** - Routing
- **Tailwind CSS** - Styling
- **Axios** - HTTP Client
- **Recharts** - Charts & Graphs
- **Lucide React** - Icons
- **React Hot Toast** - Notifications

## 📦 Instalación

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

```bash
cp .env.example .env
# Editar .env si es necesario
```

### 3. Ejecutar en Desarrollo

```bash
npm start
```

La aplicación abrirá en `http://localhost:3000`

## 📁 Estructura del Proyecto

```
frontend/
├── public/                    # Archivos estáticos
│   └── index.html
├── src/
│   ├── components/           # Componentes reutilizables
│   │   ├── Button.jsx
│   │   ├── Card.jsx
│   │   ├── Navbar.jsx
│   │   └── PrivateRoute.jsx
│   ├── context/              # Estado global
│   │   ├── AuthContext.jsx
│   │   └── DataContext.jsx
│   ├── pages/                # Páginas principales
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Mesas.jsx
│   │   ├── Pedidos.jsx
│   │   ├── Menu.jsx
│   │   └── Reservas.jsx
│   ├── hooks/                # Hooks personalizados
│   │   ├── useAuth.js
│   │   └── useData.js
│   ├── services/             # Servicios API
│   │   └── api.js
│   ├── App.jsx              # Rutas principales
│   ├── index.js             # Entrada
│   └── index.css            # Estilos globales
├── package.json
├── tailwind.config.js
└── .env.example
```

## 🔐 Autenticación

La aplicación usa JWT tokens. Los tokens se almacenan en localStorage y se envían automáticamente en cada request.

**Endpoints de Auth:**
- `POST /auth/login/` - Login
- `POST /auth/refresh/` - Refresh token
- `POST /auth/register/` - Alta de distribuidor con su administrador (solo super admin; el panel usa `/tenants/` y `/auth/users/`)

## 📱 Páginas Disponibles

### Login (`/login`)
Página de autenticación con email y contraseña.

### Dashboard (`/dashboard`)
Vista general con:
- Estadísticas de mesas
- Gráficos de ocupación
- Pedidos recientes
- Métricas principales

### Mesas (`/mesas`)
Gestión visual de mesas:
- Grid de mesas con estados
- Ocupar/Liberar mesa
- Control de capacidad
- Filtros por estado

### Pedidos (`/pedidos`)
Gestión de pedidos:
- Lista de pedidos
- Cambio de estado (flujo completo)
- Detalles de items
- Acciones rápidas

### Menú (`/menu`)
Catálogo de productos:
- Organizado por categorías
- Información dietética
- Tiempo de preparación
- Disponibilidad

### Reservas (`/reservas`)
Sistema de reservas:
- Lista de reservas
- Confirmación
- Datos de cliente
- Filtros por estado

## 🎨 Estilos

Usa Tailwind CSS con configuración personalizada:
- Colores primarios personalizados
- Responsive design
- Componentes reutilizables

## 🔄 Estado Global

### AuthContext
Maneja:
- Login/Logout
- Usuario actual
- Estado de autenticación
- Tokens

### DataContext
Maneja:
- Mesas
- Pedidos
- Menú
- Reservas
- Funciones CRUD

## 🚀 Build para Producción

```bash
npm run build
```

Crea carpeta `build/` optimizada para producción.

## 📝 Variables de Entorno

```env
REACT_APP_API_URL=http://localhost:8000/api/v1
REACT_APP_ENV=development
```

## 🔗 Integración con Backend

El frontend se conecta automáticamente a la API Django:
- Base URL: `http://localhost:8000/api/v1`
- Autenticación: Bearer Token (JWT)
- CORS: Debe estar habilitado en Django

## 📊 Monitoreo

Usa React Developer Tools para debugging:
- Chrome DevTools
- React DevTools Extension

## 🐛 Troubleshooting

### Error: "Cannot GET /api/v1/..."
- Verifica que el backend Django esté corriendo en `http://localhost:8000`
- Revisa la variable `REACT_APP_API_URL` en `.env`

### Error: "401 Unauthorized"
- Verifica que tengas un token válido
- Intenta login de nuevo

### CORS Error
- Verifica `CORS_ALLOWED_ORIGINS` en Django settings
- Debe incluir `http://localhost:3000`

## 🚢 Deployment

### Docker
```bash
docker build -t coffe-saas-frontend .
docker run -p 3000:3000 coffe-saas-frontend
```

### Vercel
```bash
npm install -g vercel
vercel
```

### Netlify
```bash
npm run build
netlify deploy --prod --dir=build
```

## 📚 Recursos

- [React Docs](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [React Router](https://reactrouter.com)
- [Axios](https://axios-http.com)

## 📝 Licencia

Privado - CECODE26

---

**Versión:** 0.1.0  
**Última actualización:** 2025-09-24
