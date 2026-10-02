# Subir COFFE-SAAS a producción

Esta guía explica cómo publicar el sistema en un dominio real (en los ejemplos, `cafe.midominio.com`).

## Por qué en desarrollo aparece "localhost"

En tu computadora el sistema corre en `http://localhost:3002` (la web) y `http://localhost:8000` (el API).
Por eso los links y los QR de las mesas muestran `localhost`. Eso es normal en desarrollo.

En producción no queda ningún `localhost`:

- La web llama al API en su mismo dominio (`https://cafe.midominio.com/api/v1`). En el build de
  producción la dirección de desarrollo ni siquiera se incluye, y tampoco se publican los archivos
  `.map` con el código fuente original.
- Los QR se arman con el dominio real: el de `REACT_APP_PUBLIC_URL` o, si está vacío, el dominio
  desde el que se abre el panel.
- Las fotos de la carta salen con `https://cafe.midominio.com/media/...`.
- `docker-compose.yml` (producción) toma todo del archivo `.env`. No tiene ningún dominio escrito.

El entorno de desarrollo (`docker-compose.dev.yml`) sigue igual.

---

## 1. Qué necesitas

- Un servidor (VPS) con Docker y **Docker Compose v2**: el comando es `docker compose` (con espacio).
  El antiguo `docker-compose` (con guion) no entiende este archivo. Compruébalo con `docker compose version`.
- El dominio apuntando al servidor: un registro DNS tipo **A** de `cafe.midominio.com` a la IP del servidor.
- Los puertos 80 y 443 abiertos (el HTTPS los necesita).

No uses `docker-start.sh` en el servidor: es un ayudante viejo de desarrollo. Usa los comandos de esta guía.

## 2. Variables a configurar

En el servidor, dentro de la carpeta del proyecto:

```bash
cp .env.example .env
nano .env   # borra la sección DESARROLLO y descomenta la de PRODUCCIÓN
```

Genera las dos claves obligatorias así (cada comando da una distinta, cópialas en el `.env`):

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # DB_PASSWORD
```

No inventes las claves a mano ni uses el signo `$` en ningún valor del `.env`: docker compose lo toma
como una variable y la clave quedaría cortada. Las claves generadas así nunca llevan `$`.

| Variable | Ejemplo | Para qué sirve |
|---|---|---|
| `DEBUG` | `False` | Siempre `False` en producción. |
| `SECRET_KEY` | (generada, 50+ caracteres) | Firma las sesiones y los tokens de inicio de sesión. Si se filtra, cualquiera podría entrar como cualquier usuario. Si falta, es corta o es la de ejemplo, el sistema no arranca. |
| `ALLOWED_HOSTS` | `cafe.midominio.com` | Dominios por los que se entra, sin `https://`. Si falta, el sistema no arranca. |
| `CSRF_TRUSTED_ORIGINS` | `https://cafe.midominio.com` | El mismo dominio con `https://`. Lo usa el admin de Django. |
| `CORS_ALLOWED_ORIGINS` | *(vacío)* | Solo hace falta si la web y el API van en subdominios distintos (topología B). |
| `DB_PASSWORD` | (generada) | Contraseña de PostgreSQL. Si falta, docker compose no arranca. |
| `REACT_APP_API_URL` | *(vacío)* | Vacío = API en el mismo dominio. Solo se llena en la topología B. |
| `REACT_APP_PUBLIC_URL` | `https://cafe.midominio.com` | Dominio que se imprime en los QR de las mesas. |
| `FRONTEND_PORT` | `8088` | Puerto local (solo `127.0.0.1`) al que apunta el proxy con HTTPS. |
| `EMAIL_*` | | Hoy el sistema **no envía correos**: no hay avisos ni recuperación de contraseña por correo. Se pueden dejar como están. |

**Guarda una copia del `.env`** (sobre todo `SECRET_KEY` y `DB_PASSWORD`) en un gestor de contraseñas,
fuera del servidor. Sin ese archivo no se puede reconstruir el servidor a partir de los respaldos.

Las opciones de seguridad ya vienen activadas cuando `DEBUG=False`: redirección a HTTPS, cookies
`Secure` (también la del cliente que escanea el QR), HSTS de 1 hora y lectura de las cabeceras
del proxy. Solo cámbialas si sabes por qué (ver el final de `.env.example`).

Las variables `REACT_APP_*` quedan grabadas en la web al compilarla. Si las cambias, recompila
el frontend: `docker compose build frontend && docker compose up -d`.

## 3. Cómo se organiza (topologías)

El contenedor `frontend` (nginx) es la única puerta de entrada. Sirve la web y reparte las rutas:

```
Internet ──https──> Caddy o nginx del servidor ──http──> frontend (127.0.0.1:8088)
                         (pone el HTTPS)                    ├── /          web React
                                                            ├── /api/      Django (gunicorn)
                                                            ├── /admin/    Django
                                                            ├── /static/   estáticos
                                                            └── /media/    fotos de la carta
```

La base de datos, Redis y gunicorn no publican puertos. Solo se ven dentro de Docker.

El nginx del contenedor `frontend` también limita los intentos de inicio de sesión: el login del panel,
el registro y el login de `/admin/` aceptan unos 10 intentos por minuto desde una misma IP. Si se pasa,
responde "Demasiados intentos" y hay que esperar un minuto.

### Topología A (recomendada): todo en el mismo dominio

`https://cafe.midominio.com` para la web y `https://cafe.midominio.com/api/...` para el API.

- Es la más simple y la más segura.
- El cliente que escanea el QR se identifica con una cookie `SameSite=Lax`. En el mismo dominio
  esa cookie viaja siempre, así que no hay sorpresas.
- Variables: `ALLOWED_HOSTS=cafe.midominio.com`, `CSRF_TRUSTED_ORIGINS=https://cafe.midominio.com`,
  `CORS_ALLOWED_ORIGINS` vacío, `REACT_APP_API_URL` vacío.

### Topología B: web y API en subdominios del mismo dominio

`https://app.midominio.com` (web) y `https://api.midominio.com` (API).

- La cookie del cliente también funciona, porque `app.` y `api.` son el mismo sitio (`midominio.com`).
- **No funciona** con dominios que no comparten la raíz, por ejemplo la web en `algo.vercel.app` y el
  API en `algo.onrender.com`: el cliente del QR perdería su sesión.
- Variables:
  ```
  ALLOWED_HOSTS=app.midominio.com,api.midominio.com
  CSRF_TRUSTED_ORIGINS=https://app.midominio.com,https://api.midominio.com
  CORS_ALLOWED_ORIGINS=https://app.midominio.com
  REACT_APP_API_URL=https://api.midominio.com/api/v1
  REACT_APP_PUBLIC_URL=https://app.midominio.com
  ```
- En el proxy del servidor, los dos subdominios apuntan al mismo `127.0.0.1:8088`.

## 4. HTTPS (obligatorio)

Sin HTTPS el sistema no funciona en producción: las cookies van marcadas como `Secure` y el navegador
no las envía por `http`. Además, Django redirige todo a `https`.

### Opción fácil: Caddy (saca y renueva el certificado solo)

`/etc/caddy/Caddyfile`:

```
cafe.midominio.com {
    reverse_proxy 127.0.0.1:8088
}
```

Caddy ya envía las cabeceras `X-Forwarded-Proto`, `X-Forwarded-Host` y `X-Forwarded-For` que Django necesita.

### Opción nginx del servidor + certbot

```nginx
server {
    listen 80;
    server_name cafe.midominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cafe.midominio.com;
    # ssl_certificate / ssl_certificate_key: los pone certbot (certbot --nginx -d cafe.midominio.com)

    client_max_body_size 10m;   # fotos de hasta 5 MB

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

### Si además usas Cloudflare (nube naranja)

- Pon el modo SSL en *Full (strict)*.
- Deja `NUM_PROXIES=2` (no lo subas). Lo que cambia es que el proxy del servidor tiene que pasar la IP
  real del visitante, que Cloudflare manda en la cabecera `CF-Connecting-IP`. Si no, todos los visitantes
  parecerían tener la IP de Cloudflare y compartirían el límite de intentos de inicio de sesión.
  - Caddy:
    ```
    cafe.midominio.com {
        reverse_proxy 127.0.0.1:8088 {
            header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
        }
    }
    ```
  - nginx: cambia la línea de `X-Forwarded-For` por `proxy_set_header X-Forwarded-For $http_cf_connecting_ip;`
- Esa cabecera la podría inventar quien se conecte directo a tu servidor sin pasar por Cloudflare. Por eso,
  en el firewall del servidor abre los puertos 80 y 443 solo para las IPs de Cloudflare
  (lista oficial en <https://www.cloudflare.com/ips/>).

## 5. Desplegar

```bash
git clone <repositorio> coffe-saas && cd coffe-saas
cp .env.example .env && nano .env        # paso 2
docker compose build                     # compila la web con REACT_APP_* del .env
docker compose up -d
docker compose exec web python manage.py createsuperuser
```

- **Migraciones y collectstatic** se ejecutan solos cada vez que arranca el servicio `web`.
  Para correrlos a mano: `docker compose exec web python manage.py migrate` y
  `docker compose exec web python manage.py collectstatic --noinput`.
- Revisión de seguridad de Django: `docker compose exec web python manage.py check --deploy`.
  Solo deberían quedar avisos de HSTS (`security.W005`, `security.W021`), que son decisiones a tomar
  más adelante, y avisos de `drf_spectacular` sobre la documentación automática del API (no afectan).

Para actualizar después de cambios:

```bash
git pull
docker compose build
docker compose up -d
```

Durante unos segundos, mientras el servicio `web` reinicia, la web puede responder con error 502. Es normal.

### Cuentas y datos de demostración

- **No ejecutes `seed_demo` en producción.** Crea cuentas cuyas contraseñas están escritas en el código
  del proyecto, así que cualquiera que lo haya visto podría entrar. Y con `--reset` **borra todos los datos**
  de la base: usuarios, locales, pedidos y registros. Hoy el comando no se protege solo: la única
  protección es no ejecutarlo.
- Si la base de producción viene de una copia de desarrollo o de una demo, revisa si quedaron cuentas de prueba:
  ```bash
  docker compose exec web python manage.py shell -c "from apps.accounts.models import User; print(list(User.objects.filter(email__endswith='@coffe.com').values_list('email', flat=True)))"
  ```
  - Si **toda** la base es de demostración (todavía no hay datos reales), lo más limpio es empezar de cero.
    Esto borra toda la base de datos, pero no las fotos:
    ```bash
    docker compose down
    docker volume rm coffe-saas-prod_postgres_data
    docker compose up -d
    docker compose exec web python manage.py createsuperuser
    ```
  - Si ya hay datos reales, borra o desactiva esas cuentas desde `/admin/` (Usuarios). También puedes
    cambiarles la contraseña: `docker compose exec web python manage.py changepassword correo@ejemplo.com`.

### Contraseñas olvidadas

El sistema todavía no tiene recuperación de contraseña por correo. Si alguien olvida la suya, un
superusuario se la cambia con `docker compose exec web python manage.py changepassword correo@ejemplo.com`
o desde `/admin/`.

## 6. Ver los logs (errores)

```bash
docker compose ps                               # qué servicios están arriba
docker compose logs -f --tail 200 web frontend  # últimos mensajes de Django y nginx, en vivo (Ctrl+C para salir)
docker compose logs --since 1h web              # lo de la última hora
```

Los logs de Docker ya rotan solos: cada contenedor guarda como máximo 5 archivos de 10 MB, así que no
llenan el disco del servidor.

## 7. Fotos de la carta (/media)

Las fotos que suben los locales se guardan en el volumen de Docker `media_volume`. **Hay que decidir**
entre dos opciones:

1. **nginx (ya configurado, sirve para empezar).** El contenedor `frontend` sirve `/media/` desde ese
   volumen. No hay que hacer nada más, pero las fotos viven en el disco del servidor: inclúyelas en
   las copias de seguridad (paso 8). Si algún día hay varios servidores, esta opción ya no alcanza.
2. **Almacenamiento externo tipo Cloudflare R2 o Amazon S3.** Las fotos quedan fuera del servidor, con
   CDN y sin preocuparse por el disco. Requiere instalar `django-storages` y `boto3`, crear el bucket,
   configurar las credenciales y mover las fotos que ya existan. Es un cambio aparte, todavía no está hecho.

## 8. Copias de seguridad

Todos los comandos se ejecutan dentro de la carpeta del proyecto. Toman el usuario y el nombre de la base
del propio contenedor, así que sirven aunque hayas cambiado `DB_USER` o `DB_NAME`.

### Respaldo a mano

```bash
# Base de datos
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > bd_$(date +%F).sql.gz
# Fotos
docker run --rm -v coffe-saas-prod_media_volume:/datos:ro -v "$PWD":/respaldo alpine \
  tar czf /respaldo/media_$(date +%F).tgz -C /datos .
```

### Respaldo automático todos los días

Crea el archivo `/usr/local/bin/respaldo-coffe.sh` (cambia la ruta del proyecto por la tuya):

```bash
#!/bin/bash
set -euo pipefail
cd /ruta/al/proyecto/coffe-saas
DESTINO=/var/respaldos/coffe-saas
FECHA=$(date +%F)
mkdir -p "$DESTINO"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$DESTINO/bd_$FECHA.sql.gz"
docker run --rm -v coffe-saas-prod_media_volume:/datos:ro -v "$DESTINO":/respaldo alpine \
  tar czf "/respaldo/media_$FECHA.tgz" -C /datos .
# Se guardan los últimos 14 días
find "$DESTINO" -type f -mtime +14 -delete
```

Dale permisos y prográmalo a las 3:30 de la mañana:

```bash
sudo chmod +x /usr/local/bin/respaldo-coffe.sh
sudo crontab -e
# agrega esta línea:
30 3 * * * /usr/local/bin/respaldo-coffe.sh >> /var/log/respaldo-coffe.log 2>&1
```

**Copia los respaldos fuera del servidor** (a tu computadora, a otro servidor o a un almacenamiento
en la nube, por ejemplo con `rclone`). Si el servidor se pierde, los respaldos que estaban en él también.

### Restaurar

Esto **reemplaza** la base actual por la del respaldo:

```bash
docker compose stop web frontend
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
gunzip -c bd_2026-01-31.sql.gz | docker compose exec -T db sh -c 'psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
# Fotos (se agregan o sobrescriben en el volumen)
docker run --rm -v coffe-saas-prod_media_volume:/datos -v "$PWD":/respaldo alpine \
  tar xzf /respaldo/media_2026-01-31.tgz -C /datos
docker compose up -d
```

En un servidor nuevo: clona el proyecto, copia el `.env` guardado (paso 2), ejecuta `docker compose up -d`,
espera a que arranque y luego sigue los pasos de "Restaurar".

Prueba una restauración al menos una vez (por ejemplo en otro servidor) para saber que los respaldos sirven.

## 9. Importante: los QR de las mesas

**Imprime los QR de las mesas solo cuando el sistema ya esté en el dominio definitivo.**

Cada QR lleva escrito el link completo (por ejemplo `https://cafe.midominio.com/bienvenida?mesa=...`).
Si imprimes QR desde `localhost` o desde un dominio de prueba, no van a funcionar en los celulares de
los clientes. Y si más adelante cambias de dominio, hay que volver a imprimirlos.

Antes de imprimir, abre el panel desde `https://cafe.midominio.com`, ve a **Mesas** y confirma que el
link del QR empieza con tu dominio. Si imprimiste alguno con el dominio equivocado, basta con abrir el
panel desde el dominio real y volver a descargarlo o imprimirlo: la imagen del QR se arma en el momento.

No uses **Regenerar QR** para esto. Ese botón cambia el código de la mesa y deja inservibles los QR ya
impresos. Sirve solo para anular un QR que se filtró o se copió.

## 10. Comprobaciones después de desplegar

- [ ] `https://cafe.midominio.com` abre la página de inicio y `http://` redirige a `https://`.
- [ ] Puedes iniciar sesión en el panel.
- [ ] No hay cuentas de demostración en la base (ver "Cuentas y datos de demostración" en el paso 5).
- [ ] Una foto de la carta se ve y su dirección empieza con `https://cafe.midominio.com/media/`.
- [ ] En **Mesas**, el link del QR empieza con `https://cafe.midominio.com/bienvenida?mesa=`.
- [ ] Desde un celular con datos móviles (no el Wi-Fi del local), escanea un QR, entra con un nombre y
      haz un pedido de prueba. Recarga la página: debe seguir dentro de la mesa (la cookie funciona).
- [ ] `docker compose exec web python manage.py check --deploy` sin errores.
- [ ] `docker compose logs --tail 100 web` no muestra errores.
- [ ] El respaldo automático corrió al día siguiente (`/var/log/respaldo-coffe.log`) y el `.env` está
      guardado en el gestor de contraseñas.

## 11. Problemas comunes

| Síntoma | Causa probable |
|---|---|
| `docker compose` dice que falta `SECRET_KEY`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` o `DB_PASSWORD` | Esa variable está vacía en el `.env` (paso 2). |
| El servicio `web` se reinicia y el log dice "SECRET_KEY propia" | La clave es corta o es la de ejemplo: genera una nueva (paso 2). |
| `Bad Request (400)` | El dominio no está en `ALLOWED_HOSTS`. |
| La página redirige sin parar | El proxy no envía `X-Forwarded-Proto: https`. |
| Las fotos salen con `http://` o con otro dominio | El proxy no pasa `Host` / `X-Forwarded-Host` / `X-Forwarded-Proto`. |
| El cliente del QR vuelve a la bienvenida a cada rato | No hay HTTPS, o la web y el API están en sitios distintos (ver topologías). |
| `CSRF verification failed` en `/admin/` | Falta el dominio con `https://` en `CSRF_TRUSTED_ORIGINS`. |
| La web sigue llamando a otra dirección después de cambiar el `.env` | Las `REACT_APP_*` se graban al compilar: `docker compose build frontend`. |
| Error `413` al subir una foto | Falta `client_max_body_size 10m;` en el nginx del servidor. |
| Error `502` que no se va solo | El servicio `web` no arrancó: mira `docker compose logs --tail 100 web`. |
| "Demasiados intentos" al iniciar sesión | Más de 10 intentos por minuto desde la misma IP. Espera un minuto. Si les pasa a todos a la vez con Cloudflare, revisa la parte de Cloudflare del paso 4. |
| `password authentication failed` en el log de `web` | Se cambió `DB_PASSWORD` después de crear la base. La contraseña de PostgreSQL queda fijada la primera vez: vuelve a poner la original. |

## Recomendaciones pendientes

- **Antes de abrir al público:** la pantalla de inicio de sesión muestra el bloque "Cuentas demo" con
  correos y contraseñas de prueba. Hay que ocultarlo en producción (cambio de código pendiente).
- `seed_demo` debería negarse a correr con `DEBUG=False` (cambio de código pendiente). Mientras tanto, no lo ejecutes.
- `/admin/` y la documentación del API (`/api/docs/`, `/api/schema/`) quedan públicas en el dominio.
  Conviene restringirlas por IP en el proxy o cambiar la ruta del admin.
- El límite de intentos de login está en el nginx del contenedor `frontend`. Lo ideal es agregarlo también
  en Django (cambio de código pendiente).
- Cuando todo funcione con HTTPS, sube `SECURE_HSTS_SECONDS` a `31536000` (1 año).
