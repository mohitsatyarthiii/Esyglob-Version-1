#!/usr/bin/env sh
set -eu
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

if [ -z "${GEOCODING_ENV_FILE:-}" ] && [ -f "$ROOT_DIR/.active-env" ]; then
  GEOCODING_ENV_FILE=$(cat "$ROOT_DIR/.active-env")
  export GEOCODING_ENV_FILE
fi
load_env
validate_env
preflight
require_command sha256sum

[ "$#" -eq 1 ] ||
  die "Usage: RESTORE_CONFIRM=<backup-id> ./scripts/restore.sh <backup-directory>"
source_dir=$(CDPATH='' cd -- "$1" 2>/dev/null && pwd) ||
  die "Backup directory does not exist: $1"
[ -f "$source_dir/manifest.env" ] || die "Backup manifest is missing."

BACKUP_ID=$(awk -F= '$1 == "BACKUP_ID" { print substr($0, index($0, "=") + 1); exit }' \
  "$source_dir/manifest.env")
printf '%s' "${BACKUP_ID:-}" | grep -Eq '^[0-9]{8}T[0-9]{6}Z(-[A-Za-z0-9_-]+)?$' ||
  die "Backup manifest contains an invalid BACKUP_ID."
[ "${RESTORE_CONFIRM:-}" = "$BACKUP_ID" ] ||
  die "Set RESTORE_CONFIRM=$BACKUP_ID to confirm this destructive restore."
(
  cd "$source_dir"
  sha256sum --check SHA256SUMS
) || die "Backup checksum verification failed. No data was changed."

restart_gateway=0
gateway_id=$(service_container_id gateway || true)
if [ -n "$gateway_id" ] &&
   [ "$(docker inspect --format '{{.State.Running}}' "$gateway_id")" = "true" ]; then
  restart_gateway=1
fi
restore_failed() {
  trap - EXIT INT TERM
  log "Restore failed. Attempting to return services to a diagnosable running state." >&2
  compose restart nominatim >/dev/null 2>&1 || true
  [ "$restart_gateway" -eq 0 ] || compose up -d --no-deps gateway >/dev/null 2>&1 || true
  print_service_diagnostics nominatim
}
trap restore_failed EXIT INT TERM

log "Entering maintenance mode for restore."
compose stop gateway photon >/dev/null 2>&1 || true
compose up -d --no-deps nominatim
wait_for_service_healthy nominatim "${STARTUP_TIMEOUT_SECONDS:-900}"
compose exec -T nominatim service apache2 stop >/dev/null ||
  fail_service nominatim "Could not stop Nominatim API before database restore."
compose exec -T nominatim psql -U nominatim -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nominatim' AND pid <> pg_backend_pid();" \
  >/dev/null ||
  fail_service nominatim "Could not terminate database sessions for restore."

log "Restoring PostgreSQL/PostGIS."
if ! compose exec -T nominatim pg_restore -U nominatim -d nominatim \
  --clean --if-exists --no-owner --exit-on-error <"$source_dir/nominatim.dump"; then
  fail_service nominatim "PostgreSQL restore failed."
fi

for item in photon_data photon_app nominatim_flatnode; do
  volume="${COMPOSE_PROJECT_NAME}_${item}"
  docker volume create "$volume" >/dev/null
  docker run --rm --network none \
    -v "$volume:/target" -v "$source_dir:/backup:ro" "$ALPINE_IMAGE" \
    sh -eu -c \
    "find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
     tar -xzf '/backup/${item}.tar.gz' -C /target" ||
    die "Failed to restore $volume."
done
docker run --rm --network none \
  -v "${COMPOSE_PROJECT_NAME}_photon_data:/data" \
  -v "${COMPOSE_PROJECT_NAME}_photon_app:/app" "$ALPINE_IMAGE" \
  chown -R 10002:10002 /data /app

compose restart nominatim
wait_for_service_healthy nominatim "${STARTUP_TIMEOUT_SECONDS:-900}"
compose up -d --no-deps photon
wait_for_service_healthy photon "${STARTUP_TIMEOUT_SECONDS:-900}"
compose up -d --no-deps gateway
wait_for_service_healthy gateway "${STARTUP_TIMEOUT_SECONDS:-900}"
trap - EXIT INT TERM
"$ROOT_DIR/scripts/healthcheck.sh"
log "Restore completed successfully from backup $BACKUP_ID."
