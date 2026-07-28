#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Copy .env.example to .env and configure it first." >&2
  exit 2
fi

set -a
. ./.env
set +a
test -f "data/$OSM_PBF_FILE" || ./scripts/download-osm.sh
docker compose build nominatim
docker compose up -d postgis
docker compose run --rm --user root --entrypoint chown nominatim -R 10001:10001 /srv/nominatim-project
docker compose run --rm --entrypoint nominatim nominatim import \
  --project-dir /srv/nominatim-project \
  --osm-file "/imports/$OSM_PBF_FILE" \
  --threads "${NOMINATIM_THREADS:-8}"
docker compose run --rm --entrypoint nominatim nominatim admin \
  --project-dir /srv/nominatim-project \
  --check-database
echo "Nominatim import completed and passed its database check."
