import os
import sys
from pathlib import Path
from decouple import config
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def lista_env(valor):
    """'a, b,,c' -> ['a', 'b', 'c']: variables separadas por comas (vacía = lista vacía)"""
    return [s.strip() for s in str(valor).split(',') if s.strip()]


# Toda la configuración sale de variables de entorno (o del .env de la raíz), ver .env.example
# y docs/PRODUCCION.md. En desarrollo (DEBUG=True) hay valores por defecto con localhost; en
# producción (DEBUG=False) NO: si falta algo importante, Django se niega a arrancar con un mensaje claro.
DEBUG = config('DEBUG', default=True, cast=bool)

SECRET_KEY = config('SECRET_KEY', default='django-insecure-dev-key-change-in-production')


def _secret_key_insegura(clave):
    """Mismos criterios que el aviso security.W009 de Django, más los textos de ejemplo de .env.example.
    Con ella se firman las sesiones y los JWT: una clave conocida permite fabricar tokens de cualquier usuario."""
    clave = clave or ''
    return (
        len(clave) < 50
        or len(set(clave)) < 5
        or clave.startswith('django-insecure')
        or 'pon-aqui' in clave.lower()
    )


if not DEBUG and _secret_key_insegura(SECRET_KEY):
    raise ImproperlyConfigured(
        'Con DEBUG=False hace falta una SECRET_KEY propia, secreta y de al menos 50 caracteres '
        '(no la de desarrollo ni la de ejemplo). '
        'Genera una con: python3 -c "import secrets; print(secrets.token_urlsafe(50))"'
    )

# Hosts con los que se puede llegar al backend (sin esquema ni puerto): cafe.midominio.com,api.midominio.com
_HOSTS_DESARROLLO = 'localhost,127.0.0.1'
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default=_HOSTS_DESARROLLO if DEBUG else '', cast=lista_env)
if not DEBUG and not ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        'Con DEBUG=False hay que definir ALLOWED_HOSTS con el dominio real (p. ej. cafe.midominio.com).'
    )

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'rest_framework',
    'corsheaders',
    'django_filters',
    'drf_spectacular',

    'apps.accounts',
    'apps.tenants',
    'apps.cafeterias',
    'apps.pedidos',
    'apps.mesas',
    'apps.menu',
    'apps.facturacion',
    'apps.auditoria',
    'apps.comensales',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'apps.tenants.middleware.TenantMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='coffe_saas'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default=''),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'es-ec'
TIME_ZONE = 'America/Guayaquil'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
# La carpeta static/ del proyecto es opcional (está en .gitignore): solo se usa si existe
STATICFILES_DIRS = [BASE_DIR / 'static'] if (BASE_DIR / 'static').is_dir() else []

# Archivos subidos (fotos de la carta). En desarrollo los sirve Django (config/urls.py con DEBUG);
# en producción los sirve nginx desde el volumen media_volume (ver frontend/nginx.conf y docs/PRODUCCION.md).
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# DRF Configuration
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    # Paginación: ?page_size=N (por defecto 20, máximo 500)
    'DEFAULT_PAGINATION_CLASS': 'config.pagination.StandardPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_THROTTLE_RATES': {
        # Formulario público de derechos LOPDP
        'solicitudes_datos': '5/hour',
        # Inicio de sesión público y alta de distribuidor por /auth/register/ (además del límite en nginx)
        'login': config('THROTTLE_LOGIN', default='10/min'),
        'registro': config('THROTTLE_REGISTRO', default='5/hour'),
    },
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# JWT Configuration
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'ALGORITHM': 'HS256',
}

# Orígenes (esquema + dominio [+ puerto]) de la web que llama al API.
# Solo hacen falta si la web y el API están en orígenes distintos (app.midominio.com + api.midominio.com);
# con web y API en el mismo dominio (/api) puede quedar vacío. En producción no hay default con localhost.
_ORIGENES_DESARROLLO = (
    'http://localhost:3000,http://localhost:3002,http://localhost:8000,'
    'http://127.0.0.1:3000,http://127.0.0.1:3002'
)
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS', default=_ORIGENES_DESARROLLO if DEBUG else '', cast=lista_env
)

# El cliente que escanea el QR se identifica con una cookie httpOnly: el navegador debe enviarla
CORS_ALLOW_CREDENTIALS = True

# Orígenes HTTPS desde los que se aceptan formularios con cookie de sesión (admin de Django, login por sesión)
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS', default=_ORIGENES_DESARROLLO if DEBUG else '', cast=lista_env
)

# ---------------------------------------------------------------------------
# Producción detrás de un proxy inverso (nginx / Caddy) que termina HTTPS
# ---------------------------------------------------------------------------
# Django tiene que ver el esquema (https) y el dominio reales para armar las URLs absolutas
# (fotos de la carta con build_absolute_uri), redirigir a HTTPS y marcar las cookies como Secure.
# Solo es seguro si el proxy SOBRESCRIBE X-Forwarded-Proto / X-Forwarded-Host y gunicorn no es
# accesible directamente desde internet (en docker-compose.yml no publica ningún puerto).
if config('USE_X_FORWARDED_PROTO', default=not DEBUG, cast=bool):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = config('USE_X_FORWARDED_HOST', default=not DEBUG, cast=bool)

# Proxies delante de Django, para que el límite de peticiones por IP de DRF use la IP real del visitante
# (X-Forwarded-For). Proxy del servidor + nginx del frontend = 2. Vacío = comportamiento por defecto de DRF.
NUM_PROXIES = config('NUM_PROXIES', default='', cast=lambda v: int(v) if str(v).strip() else None)
REST_FRAMEWORK['NUM_PROXIES'] = NUM_PROXIES

# HTTPS y cookies. Desactivado en desarrollo (http://localhost); activo por defecto con DEBUG=False.
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=not DEBUG, cast=bool)
SESSION_COOKIE_SECURE = config('SESSION_COOKIE_SECURE', default=not DEBUG, cast=bool)
CSRF_COOKIE_SECURE = config('CSRF_COOKIE_SECURE', default=not DEBUG, cast=bool)
# HSTS: el navegador recuerda que el sitio es solo HTTPS. Se empieza con 1 hora; cuando todo funcione
# con HTTPS se puede subir a 31536000 (1 año). Ojo: no se puede "deshacer" antes de que expire.
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=0 if DEBUG else 3600, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = config('SECURE_HSTS_INCLUDE_SUBDOMAINS', default=False, cast=bool)
SECURE_HSTS_PRELOAD = config('SECURE_HSTS_PRELOAD', default=False, cast=bool)

# Cabeceras de seguridad (valen igual en desarrollo y producción)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'same-origin'

# Tenants por subdominio (apps/tenants/middleware.py): estos hosts nunca se leen como "<slug>.dominio".
# Por defecto: localhost, 127.0.0.1 y los hosts exactos de ALLOWED_HOSTS (el dominio propio del sistema;
# si no, "cafe" de cafe.midominio.com se buscaría como tenant). Los comodines (.midominio.com) no cuentan.
TENANT_HOSTS_SIN_SUBDOMINIO = config(
    'TENANT_HOSTS_SIN_SUBDOMINIO',
    default=','.join(dict.fromkeys(
        ['localhost', '127.0.0.1'] + [h for h in ALLOWED_HOSTS if h != '*' and not h.startswith('.')]
    )),
    cast=lista_env,
)
TENANT_SUBDOMINIOS_RESERVADOS = config(
    'TENANT_SUBDOMINIOS_RESERVADOS', default='api,app,www,admin', cast=lista_env
)

# Caché: Redis si hay REDIS_URL (límites anti-abuso y lock de limpieza compartidos entre procesos);
# si no, memoria local. Los tests usan memoria local para no compartir claves con el servidor de desarrollo.
REDIS_URL = config('REDIS_URL', default='')
TESTING = len(sys.argv) > 1 and sys.argv[1] == 'test'
if REDIS_URL and not TESTING:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
            'KEY_PREFIX': 'coffe',
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'coffe-saas',
        }
    }

# Comensales (pedidos por QR desde el celular del cliente)
COMENSAL_INACTIVIDAD_MIN = config('COMENSAL_INACTIVIDAD_MIN', default=15, cast=int)  # cierra sesiones sin pedidos
COMENSAL_COOKIE_HORAS = config('COMENSAL_COOKIE_HORAS', default=2, cast=int)
COMENSAL_PAGADA_CIERRE_MIN = config('COMENSAL_PAGADA_CIERRE_MIN', default=10, cast=int)  # pagada → cerrada
COMENSAL_UNION_EXPIRA_MIN = config('COMENSAL_UNION_EXPIRA_MIN', default=5, cast=int)  # solicitud de unión sin respuesta
COMENSAL_COOKIE_NOMBRE = 'coffe_comensal'
# Secure = la cookie solo viaja por HTTPS. True por defecto con DEBUG=False (producción); no la
# desactives en producción. Es SameSite=Lax: web y API tienen que estar en el mismo sitio (ver docs/PRODUCCION.md).
COMENSAL_COOKIE_SECURE = config('COMENSAL_COOKIE_SECURE', default=not DEBUG, cast=bool)

# Custom User Model
AUTH_USER_MODEL = 'accounts.User'

# Email Configuration
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}
