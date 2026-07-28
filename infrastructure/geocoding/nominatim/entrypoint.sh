#!/usr/bin/env sh
set -eu

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if ! nominatim admin --check-database >/dev/null 2>&1; then
  echo "Nominatim is not imported. Run ./scripts/import-nominatim.sh first." >&2
  exit 78
fi

workers="${NOMINATIM_API_WORKERS:-4}"
exec gunicorn \
  --bind 0.0.0.0:8088 \
  --workers "$workers" \
  --worker-class asgi \
  --protocol http \
  --worker-connections 1000 \
  "nominatim_api.server.falcon.server:run_wsgi()"
