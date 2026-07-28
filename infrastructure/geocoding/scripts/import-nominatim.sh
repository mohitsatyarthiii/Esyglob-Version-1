#!/usr/bin/env sh
set -eu
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

load_env
validate_env
preflight
validate_filename "${OSM_PBF_FILE:-}" OSM_PBF_FILE
require_free_disk "${MIN_FREE_DISK_GB:-12}"

database_volume="${COMPOSE_PROJECT_NAME}_nominatim_db"
if volume_has_file "$database_volume" import-finished; then
  log "Completed Nominatim import already exists; validating it without overwriting data."
elif volume_has_file "$database_volume" PG_VERSION; then
  die "An incomplete Nominatim database exists in $database_volume (PG_VERSION exists but import-finished does not). Preserve it for diagnosis, then use a new COMPOSE_PROJECT_NAME to retry safely."
else
  [ -f "$ROOT_DIR/data/$OSM_PBF_FILE" ] || "$ROOT_DIR/scripts/download-osm.sh"
fi

log "Starting the pinned Nominatim image. The first India import can take many hours."
compose up -d --no-deps nominatim
nominatim_id=$(service_container_id nominatim || true)
[ -n "$nominatim_id" ] || fail_service nominatim "Nominatim container was not created."
docker update --restart=no "$nominatim_id" >/dev/null ||
  fail_service nominatim "Could not disable restart loops during import."
enable_temporary_egress nominatim
trap 'disable_temporary_egress nominatim' EXIT INT TERM
wait_for_service_healthy nominatim "${IMPORT_TIMEOUT_SECONDS:-86400}"

compose exec -T nominatim pg_isready -U nominatim -d nominatim >/dev/null ||
  fail_service nominatim "PostgreSQL readiness validation failed."
compose exec -T nominatim sudo -u nominatim nominatim admin \
  --project-dir /nominatim --check-database >/dev/null ||
  fail_service nominatim "Nominatim database integrity validation failed."
compose exec -T nominatim psql -U nominatim -d nominatim \
  -v ON_ERROR_STOP=1 -Atc \
  "SELECT extversion FROM pg_extension WHERE extname = 'postgis';" |
  grep -Eq '^[0-9]+\.[0-9]+' ||
  fail_service nominatim "PostGIS extension validation failed."

volume_has_file "$database_volume" import-finished ||
  fail_service nominatim "Nominatim became healthy but its import-finished marker is absent."
disable_temporary_egress nominatim
trap - EXIT INT TERM
docker update --restart=unless-stopped "$nominatim_id" >/dev/null ||
  fail_service nominatim "Import succeeded but the reboot restart policy could not be restored."
log "Nominatim import and PostGIS validation completed successfully."
