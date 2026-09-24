# Docker Setup Guide - COFFE-SAAS

Guía completa para ejecutar COFFE-SAAS con Docker (Frontend + Backend + BD).

## 🚀 Quick Start (1 minuto)

### Opción 1: Script automático

```bash
# Desarrollo (hot reload)
./docker-start.sh dev

# Producción (compilado)
./docker-start.sh prod
```

### Opción 2: Docker Compose directo

```bash
# Desarrollo
docker-compose -f docker-compose.dev.yml up

# Producción
docker-compose up
```

---

## 📋 Requisitos

- ✅ Docker instalado
- ✅ Docker Compose v2.0+
- ✅ 4GB RAM mínimo
- ✅ 10GB espacio disponible

### Instalar Docker

**macOS/Windows:**
```bash
# Descargar Docker Desktop
https://www.docker.com/products/docker-desktop
```

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

**Verificar instalación:**
```bash
docker --version
docker-compose --version
```

---

## 🔧 Arquitectura Docker

### Componentes

```
┌─────────────────────────────────────────────┐
│  COFFE-SAAS Docker Compose Stack            │
├─────────────────────────────────────────────┤
│                                             │
│  Frontend (React)                           │
│  ├─ Node.js (dev) o Nginx (prod)           │
│  ├─ Port: 3000                             │
│  └─ Hot reload en dev                      │
│                                             │
│  Backend (Django)                           │
│  ├─ Python + Gunicorn                      │
│  ├─ Port: 8000                             │
│  └─ Migrations automáticas                 │
│                                             │
│  Database (PostgreSQL)                      │
│  ├─ Port: 5432                             │
│  └─ Volume persistente                     │
│                                             │
│  Redis (Cache)                              │
│  ├─ Port: 6379                             │
│  └─ Celery workers (background)            │
│                                             │
│  pgAdmin (DB Management)                    │
│  ├─ Port: 5050                             │
│  └─ Email: admin@coffe.local               │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🎯 Modo DESARROLLO

### Iniciar

```bash
docker-compose -f docker-compose.dev.yml up
```

### Características

✅ Hot reload en React (cambios en tiempo real)  
✅ Django en debug mode  
✅ Logs en la consola  
✅ Volumes montados para desarrollo  
✅ Acceso a bases de datos  

### Acceso a Servicios

```
Frontend:       http://localhost:3000
Backend API:    http://localhost:8000/api/v1/
API Docs:       http://localhost:8000/api/docs/
Admin Django:   http://localhost:8000/admin/
pgAdmin:        http://localhost:5050
```

### Credenciales Desarrollo

```
Django Admin:
  Email: admin@coffe.com
  Password: admin (o la que creaste)

pgAdmin:
  Email: admin@coffe.local
  Password: admin

PostgreSQL:
  User: postgres
  Password: postgres
```

### Usar Comandos Django

```bash
# Crear super usuario
docker exec coffe_saas_web_dev python manage.py createsuperuser

# Migraciones
docker exec coffe_saas_web_dev python manage.py migrate

# Shell
docker exec -it coffe_saas_web_dev python manage.py shell

# Collectstatic
docker exec coffe_saas_web_dev python manage.py collectstatic --noinput
```

### Ver Logs

```bash
# Todos los servicios
docker-compose -f docker-compose.dev.yml logs -f

# Solo un servicio
docker-compose -f docker-compose.dev.yml logs -f frontend
docker-compose -f docker-compose.dev.yml logs -f web
docker-compose -f docker-compose.dev.yml logs -f db
```

---

## 🚀 Modo PRODUCCIÓN

### Build y Run

```bash
# Construir imágenes
docker-compose build

# Ejecutar
docker-compose up -d

# Ver estado
docker-compose ps
```

### Características

✅ Frontend compilado (optimizado)  
✅ Nginx serviendo assets  
✅ Django con Gunicorn  
✅ Base de datos persistente  
✅ Celery workers  
✅ pgAdmin para BD  

### Acceso a Servicios

```
Frontend:       http://localhost:3000
API:            http://localhost:8000
Admin:          http://localhost:8000/admin
pgAdmin:        http://localhost:5050
```

### Detener Servicios

```bash
# Detener pero mantener datos
docker-compose down

# Detener y limpiar todo
docker-compose down -v

# Solo detener, sin borrar
docker-compose stop
```

---

## 📊 Docker Compose Files

### `docker-compose.yml` (Producción)

```yaml
Services:
├── db (PostgreSQL 15)
├── redis (Redis 7)
├── web (Django + Gunicorn)
├── celery (Background jobs)
├── pgadmin
└── frontend (React + Nginx)
```

**Características:**
- Build de imágenes optimizadas
- Nginx como reverse proxy
- Gunicorn para Django
- Healthchecks automáticos
- Volumes persistentes

### `docker-compose.dev.yml` (Desarrollo)

```yaml
Services:
├── db (PostgreSQL 15)
├── redis (Redis 7)
├── web (Django runserver)
├── pgadmin
└── frontend (React dev server)
```

**Características:**
- Hot reload activado
- Debug mode en Django
- Volumes para código fuente
- Logs en consola
- WDS para React

---

## 🔄 Flujos Comunes

### Limpiar y Reiniciar Todo

```bash
# Desarrollo
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up

# Producción
docker-compose down -v
docker-compose up -d
```

### Ver Base de Datos

```bash
# Con psql
docker exec -it coffe_saas_db psql -U postgres -d coffe_saas

# Con pgAdmin
Abrir http://localhost:5050
Email: admin@coffe.local
Password: admin
```

### Ejecutar Migraciones

```bash
# Automático al iniciar
# O manual:
docker exec coffe_saas_web_dev python manage.py migrate
```

### Crear Super Usuario

```bash
docker exec -it coffe_saas_web_dev python manage.py createsuperuser
```

### Ver Logs en Tiempo Real

```bash
docker-compose -f docker-compose.dev.yml logs -f

# Solo frontend
docker-compose -f docker-compose.dev.yml logs -f frontend

# Solo backend
docker-compose -f docker-compose.dev.yml logs -f web
```

---

## 🐛 Troubleshooting

### Puerto ya en uso

```bash
# Encontrar qué proceso usa el puerto
lsof -i :3000    # Frontend
lsof -i :8000    # Backend
lsof -i :5432    # PostgreSQL

# Matar el proceso
kill -9 <PID>

# O cambiar el puerto en docker-compose.yml
ports:
  - "3001:3000"  # Cambiar 3000 a 3001
```

### Error: "Cannot connect to Docker daemon"

```bash
# Reiniciar Docker
sudo systemctl restart docker

# MacOS: Reiniciar Docker Desktop
```

### Base de datos corrupta

```bash
# Borrar volumen de datos
docker volume rm coffe_saas-postgres_data

# Reiniciar
docker-compose -f docker-compose.dev.yml up
```

### Cambios en código no se reflejan

```bash
# Desarrollo: Verificar volumes en docker-compose.dev.yml
# Productcion: Reconstruir
docker-compose build --no-cache
docker-compose up -d
```

### Memory leak o uso de RAM alto

```bash
# Limpiar recursos no usados
docker system prune

# Con advertencia
docker system prune -a
```

---

## 📦 Tamaño de Imágenes

```
Frontend (Nginx):    ~50MB
Backend (Python):    ~500MB
Database:           Imagen PostgreSQL
Redis:              ~30MB
pgAdmin:            ~200MB

Total aproximado:   ~800MB
```

---

## 🔐 Seguridad

### Cambiar Credenciales (Producción)

**Django:**
```bash
# .env
SECRET_KEY="genera-una-clave-segura"
DEBUG=False
```

**PostgreSQL:**
```yaml
# docker-compose.yml
environment:
  POSTGRES_DB: coffe_saas
  POSTGRES_USER: usuario_seguro
  POSTGRES_PASSWORD: contraseña_fuerte
```

**pgAdmin:**
```yaml
environment:
  PGADMIN_DEFAULT_EMAIL: admin@tudominio.com
  PGADMIN_DEFAULT_PASSWORD: contraseña_fuerte
```

---

## 📊 Monitoreo

### Ver recursos usados

```bash
docker stats

# Específico
docker stats coffe_saas_web_dev
```

### Ver volúmenes

```bash
docker volume ls
docker volume inspect coffe_saas-postgres_data
```

### Backup de Base de Datos

```bash
# Backup
docker exec coffe_saas_db pg_dump -U postgres coffe_saas > backup.sql

# Restore
docker exec -i coffe_saas_db psql -U postgres coffe_saas < backup.sql
```

---

## 🚀 Deployment

### AWS/Azure/Google Cloud

```bash
# Push a Docker Registry
docker tag coffe_saas_web myregistry.azurecr.io/coffe_saas:latest
docker push myregistry.azurecr.io/coffe_saas:latest

# Deploy con Docker Compose
docker-compose -f docker-compose.yml up -d
```

### Heroku

```bash
heroku login
heroku create mi-app
git push heroku main
```

### DigitalOcean

```bash
# SSH a droplet
ssh root@your_ip

# Clone repo
git clone https://github.com/CECODE26/COFFE-SAAS.git
cd COFFE-SAAS

# Ejecutar
docker-compose up -d
```

---

## ✅ Checklist

- [ ] Docker instalado
- [ ] Docker Compose instalado
- [ ] Repositorio clonado
- [ ] Ejecutar `docker-compose -f docker-compose.dev.yml up`
- [ ] Frontend abre en localhost:3000
- [ ] Backend accesible en localhost:8000
- [ ] Login funciona
- [ ] Base de datos conectada
- [ ] Logs sin errores

---

## 📚 Referencia Rápida

```bash
# Iniciar (Desarrollo)
docker-compose -f docker-compose.dev.yml up

# Iniciar (Producción)
docker-compose up -d

# Ver logs
docker-compose logs -f

# Parar
docker-compose stop

# Parar y limpiar
docker-compose down

# Ver servicios
docker-compose ps

# Ejecutar comando
docker exec coffe_saas_web_dev python manage.py migrate

# Shell interactivo
docker exec -it coffe_saas_web_dev bash
```

---

**¡Listo!** 🎉 Tu proyecto COFFE-SAAS está dockerizado y listo para desarrollo/producción.

Versión: 0.1.0  
Última actualización: 2025-09-24
