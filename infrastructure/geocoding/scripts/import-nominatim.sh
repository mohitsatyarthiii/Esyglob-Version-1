#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/common.sh"

load_env
validate_env
require_command docker
require_command curl
validate_filename "${OSM_PBF_FILE:-}" OSM_PBF_FILE

database_volume="${COMPOSE_PROJECT_NAME}_nominatim_db"
if volume_has_file "$database_volume" PG_VERSION; then
  log "Existing Nominatim/PostGIS import detected in $database_volume."
  if [ "${ALLOW_EXISTING_IMPORT:-0}" != "1" ]; then
    die "Refusing to overwrite it. Set ALLOW_EXISTING_IMPORT=1 only to validate/start the existing import."
  fi
else
  [ -f "data/$OSM_PBF_FILE" ] || ./scripts/download-osm.sh
fi

log "Starting the pinned Nominatim image. Initial imports can take many hours."
compose up -d nominatim
compose logs --follow --no-log-prefix nominatim &
logs_pid=$!
trap 'kill "$logs_pid" >/dev/null 2>&1 || true' EXIT INT TERM

timeout_seconds="${IMPORT_TIMEOUT_SECONDS:-172800}"
started=$(date +%s)
until compose exec -T nominatim curl --fail --silent --max-time 5 \
  http://127.0.0.1:8080/status >/dev/null 2>&1; do
  now=$(date +%s)
  if [ $((now - started)) -ge "$timeout_seconds" ]; then
    compose logs --tail 200 nominatim >&2
    die "Nominatim did not become ready within ${timeout_seconds}s."
  fi
  running=$(compose ps --status running --services | grep -c '^nominatim$' || true)
  [ "$running" -eq 1 ] || {
    compose logs --tail 200 nominatim >&2
    die "Nominatim stopped during import."
  }
  sleep 30
done

kill "$logs_pid" >/dev/null 2>&1 || true
trap - EXIT INT TERM

compose exec -T nominatim pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
compose exec -T nominatim sudo -u nominatim nominatim admin \
  --project-dir /nominatim --check-database
compose exec -T nominatim psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 -Atc \
  "SELECT extversion FROM pg_extension WHERE extname = 'postgis';" |
  grep -Eq '^[0-9]+\.[0-9]+' || die "PostGIS extension validation failed."

log "Nominatim import and PostGIS validation completed successfully."
