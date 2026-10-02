#!/usr/bin/env bash
# Despliegue de COFFE-SAAS en el servidor, en dos pasos para no cambiar nada si el build falla.
#
#   ./scripts/deploy.sh construir   respaldo de la base → git pull → build en segundo plano
#                                   (log en build.log, código de salida en build.done)
#   ./scripts/deploy.sh estado      muestra si el build terminó y cómo
#   ./scripts/deploy.sh activar     solo si build.done es 0: reemplaza los contenedores (docker compose up -d)
#
# Nunca usa "docker compose down -v" (borraría la base de datos).
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  construir)
    if [ -f build.done ] || [ ! -f build.log ]; then :; else
      echo "Hay un build en curso (existe build.log sin build.done). Espera o revisa con: ./scripts/deploy.sh estado"
      exit 1
    fi
    ./scripts/backup.sh
    git pull --ff-only
    rm -f build.done
    nohup sh -c 'docker compose build > build.log 2>&1; echo $? > build.done' > /dev/null 2>&1 &
    echo "Build iniciado en segundo plano (commit $(git rev-parse --short HEAD)). Revisa con: ./scripts/deploy.sh estado"
    ;;
  estado)
    if [ ! -f build.done ]; then
      echo "Build en curso. Últimas líneas del log:"; tail -5 build.log 2>/dev/null || true
    elif [ "$(cat build.done)" = "0" ]; then
      echo "Build terminado sin errores. Para activarlo: ./scripts/deploy.sh activar"
    else
      echo "El build FALLÓ (código $(cat build.done)). Últimas líneas del log:"; tail -40 build.log
    fi
    ;;
  activar)
    if [ ! -f build.done ]; then echo "El build no ha terminado todavía."; exit 1; fi
    if [ "$(cat build.done)" != "0" ]; then
      echo "El build falló (código $(cat build.done)): no se cambia nada."; tail -40 build.log; exit 1
    fi
    docker compose up -d
    docker compose ps
    ;;
  *)
    echo "Uso: $0 construir | estado | activar"; exit 1
    ;;
esac
