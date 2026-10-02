#!/usr/bin/env bash
# Respaldo de COFFE-SAAS en el servidor: base de datos (pg_dump comprimido) y fotos de la carta (volumen media).
# Uso, desde la carpeta del proyecto:  ./scripts/backup.sh
# Lo usan el cron diario y scripts/deploy.sh antes de cada despliegue. Guarda 14 días en backups/.
set -euo pipefail
cd "$(dirname "$0")/.."

DIAS_RETENCION=${DIAS_RETENCION:-14}
FECHA=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
chmod 700 backups

if [ -z "$(docker compose ps -q db 2>/dev/null)" ]; then
  echo "La base de datos no está corriendo: no hay nada que respaldar."
  exit 0
fi

# Base de datos: se escribe primero en un temporal y se renombra solo si pg_dump terminó bien
TMP="backups/.db-$FECHA.sql.gz.tmp"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' | gzip > "$TMP"
mv "$TMP" "backups/db-$FECHA.sql.gz"

# Fotos de productos: el volumen media tal cual
docker compose exec -T web tar -czf - -C /app media > "backups/media-$FECHA.tar.gz"

chmod 600 backups/*.gz
find backups -maxdepth 1 -name 'db-*.sql.gz' -mtime +"$DIAS_RETENCION" -delete
find backups -maxdepth 1 -name 'media-*.tar.gz' -mtime +"$DIAS_RETENCION" -delete

echo "Respaldo listo: backups/db-$FECHA.sql.gz ($(du -h "backups/db-$FECHA.sql.gz" | cut -f1)) y backups/media-$FECHA.tar.gz ($(du -h "backups/media-$FECHA.tar.gz" | cut -f1))"
