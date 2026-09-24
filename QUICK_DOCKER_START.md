# ⚡ COFFE-SAAS - Quick Docker Start

**¡Todo dockerizado y listo!** Sigue estos pasos para levantar el proyecto completo.

---

## 🚀 1. Requisitos Previos

```bash
# Verifica que Docker esté instalado
docker --version
docker-compose --version

# Si no lo tienes:
# macOS/Windows: Descargar Docker Desktop
# https://www.docker.com/products/docker-desktop
#
# Linux: 
# curl -fsSL https://get.docker.com -o get-docker.sh
# sudo sh get-docker.sh
```

---

## 🎯 2. Levanta TODO con UN COMANDO

### **Opción A: Script Automático (Recomendado)**

```bash
cd /ruta/a/COFFE-SAAS

# Desarrollo (con hot reload)
./docker-start.sh dev

# O Producción (compilado)
./docker-start.sh prod
```

### **Opción B: Docker Compose Directo**

```bash
cd /ruta/a/COFFE-SAAS

# Desarrollo (hot reload)
docker-compose -f docker-compose.dev.yml up

# Producción
docker-compose up
```

---

## 📱 3. Accede a Los Servicios

### **Modo Desarrollo**

| Servicio | URL | Usuario | Contraseña |
|----------|-----|---------|-----------|
| **Frontend (React)** | http://localhost:3000 | - | - |
| **Backend (API)** | http://localhost:8000/api/v1/ | - | - |
| **API Docs** | http://localhost:8000/api/docs/ | - | - |
| **Admin Django** | http://localhost:8000/admin/ | admin@coffe.com | admin |
| **pgAdmin** | http://localhost:5050 | admin@coffe.local | admin |

### **Modo Producción**

| Servicio | URL |
|----------|-----|
| **Frontend** | http://localhost:3000 |
| **Backend** | http://localhost:8000 |
| **Admin** | http://localhost:8000/admin/ |
| **pgAdmin** | http://localhost:5050 |

---

## 🎮 4. Comandos Útiles

### **Ver Estado de Servicios**

```bash
# Desarrollo
docker-compose -f docker-compose.dev.yml ps

# Producción
docker-compose ps
```

### **Ver Logs en Tiempo Real**

```bash
# Todos los servicios
docker-compose -f docker-compose.dev.yml logs -f

# Solo Frontend
docker-compose -f docker-compose.dev.yml logs -f frontend

# Solo Backend
docker-compose -f docker-compose.dev.yml logs -f web

# Solo Base de Datos
docker-compose -f docker-compose.dev.yml logs -f db
```

### **Parar Todo**

```bash
# Mantener datos
docker-compose -f docker-compose.dev.yml stop

# Parar y limpiar (borra datos)
docker-compose -f docker-compose.dev.yml down -v

# Solo producción
docker-compose down -v
```

### **Ejecutar Comandos en Contenedores**

```bash
# Django migrations
docker exec coffe_saas_web_dev python manage.py migrate

# Crear super usuario
docker exec -it coffe_saas_web_dev python manage.py createsuperuser

# Django shell
docker exec -it coffe_saas_web_dev python manage.py shell

# Bash en contenedor
docker exec -it coffe_saas_web_dev bash
```

---

## 🔄 5. Flujo Típico de Desarrollo

### **Primera vez**

```bash
# 1. Clonar proyecto (si no lo has hecho)
git clone https://github.com/CECODE26/COFFE-SAAS.git
cd COFFE-SAAS

# 2. Levantar stack
./docker-start.sh dev

# 3. Esperar a que termine de iniciar (~30 segundos)

# 4. Abrir en navegador
# Frontend: http://localhost:3000
# Backend: http://localhost:8000/admin/
```

### **Editar código**

```bash
# Los cambios se reflejan automáticamente (hot reload)

# Frontend: Edita /frontend/src/* → Recarga automática
# Backend: Edita /apps/* → Django recarga automáticamente

# Si necesitas migraciones:
docker exec coffe_saas_web_dev python manage.py makemigrations
docker exec coffe_saas_web_dev python manage.py migrate
```

### **Parar y reiniciar**

```bash
# Parar (mantiene datos)
docker-compose -f docker-compose.dev.yml stop

# Reiniciar
docker-compose -f docker-compose.dev.yml up

# Parar y limpiar todo
docker-compose -f docker-compose.dev.yml down -v
```

---

## 🐛 6. Solucionar Problemas

### **"Cannot connect to Docker daemon"**

✅ **Solución:** Abre Docker Desktop (macOS/Windows) o reinicia Docker (Linux)

```bash
# macOS/Windows: Abre Docker Desktop
# Linux: sudo systemctl restart docker
```

### **Puerto ya en uso (3000, 8000, 5432, etc)**

✅ **Solución:** Cambia el puerto en docker-compose

```yaml
# En docker-compose.dev.yml cambiar:
ports:
  - "3001:3000"  # Cambiar 3000 a 3001
```

### **Base de datos corrupta**

✅ **Solución:** Limpiar volumen

```bash
docker volume rm coffe_saas-postgres_data
docker-compose -f docker-compose.dev.yml up
```

### **Cambios en código no se reflejan**

✅ **Solución:** Verifica volumes en docker-compose

```bash
# Desarrollo debe tener volumes:
volumes:
  - ./frontend/src:/app/src
  - .:/app (en backend)
```

---

## 📊 7. Arquitectura Dockerizada

```
┌─────────────────────────────────────────────┐
│  COFFE-SAAS (Docker Stack)                  │
├─────────────────────────────────────────────┤
│                                             │
│  🎨 Frontend (React + Nginx/Node)           │
│     Port: 3000                              │
│     Hot reload en desarrollo                │
│                                             │
│  🔌 Backend (Django + Gunicorn)             │
│     Port: 8000                              │
│     Migrations automáticas                  │
│                                             │
│  🗄️  Database (PostgreSQL)                  │
│     Port: 5432                              │
│     Volumen persistente                     │
│                                             │
│  💾 Cache (Redis)                           │
│     Port: 6379                              │
│     Celery workers                          │
│                                             │
│  🖥️  pgAdmin (BD Management)                │
│     Port: 5050                              │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🎯 8. Checklist de Validación

```bash
# 1. Servicios corriendo
docker-compose -f docker-compose.dev.yml ps
# ✅ Todos deben estar "Up"

# 2. Frontend carga
curl http://localhost:3000
# ✅ Debe retornar HTML

# 3. Backend responde
curl http://localhost:8000/api/v1/auth/users/
# ✅ Debe retornar 401 (no autenticado es normal)

# 4. Base de datos conectada
docker exec coffe_saas_db psql -U postgres -d coffe_saas -c "SELECT 1"
# ✅ Debe retornar 1

# 5. Login funciona
# ✅ Ir a http://localhost:3000 e intentar login
```

---

## 🔒 9. Credenciales Por Defecto

### **Django Admin**
```
Email: admin@coffe.com
Contraseña: admin
```
*(O la que creaste con `createsuperuser`)*

### **pgAdmin**
```
Email: admin@coffe.local
Contraseña: admin
```

### **PostgreSQL**
```
Usuario: postgres
Contraseña: postgres
Base de datos: coffe_saas
```

---

## 📚 10. Documentación Completa

- **DOCKER_GUIDE.md** - Guía técnica detallada
- **FRONTEND_SETUP.md** - Setup del frontend React
- **ARCHITECTURE.md** - Arquitectura del sistema
- **README.md** - Overview del proyecto

---

## ⚡ Resumen Rápido

```bash
# TODO EN UNO
./docker-start.sh dev

# Acceso
Frontend: http://localhost:3000
Backend:  http://localhost:8000
Admin:    http://localhost:8000/admin/

# Logs
docker-compose -f docker-compose.dev.yml logs -f

# Parar
docker-compose -f docker-compose.dev.yml down
```

---

## 🎉 ¡Listo!

Tu proyecto COFFE-SAAS está **100% dockerizado** con:

✅ Frontend React con hot reload  
✅ Backend Django con auto-migrations  
✅ PostgreSQL con datos persistentes  
✅ Redis para cache/Celery  
✅ pgAdmin para gestionar BD  

**¡A desarrollar! 🚀**

---

*Actualizado: 2025-09-24*  
*Versión: 0.1.0*
