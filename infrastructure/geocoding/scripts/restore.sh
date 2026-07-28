#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/common.sh"

[ -n "${GEOCODING_ENV_FILE:-}" ] || [ ! -f "$ROOT_DIR/.active-env" ] ||
  GEOCODING_ENV_FILE=$(cat "$ROOT_DIR/.active-env")
export GEOCODING_ENV_FILE
load_env
validate_env
require_command docker
require_command sha256sum

[ "$#" -eq 1 ] || die "Usage: RESTORE_CONFIRM=<backup-id> ./scripts/restore.sh <backup-directory>"
source_dir=$(CDPATH= cd -- "$1" 2>/dev/null && pwd) ||
  die "Backup directory does not exist: $1"
[ -f "$source_dir/manifest.env" ] || die "Backup manifest is missing."

# shellcheck disable=SC1090
. "$source_dir/manifest.env"
[ "${RESTORE_CONFIRM:-}" = "$BACKUP_ID" ] ||
  die "Set RESTORE_CONFIRM=$BACKUP_ID to confirm this destructive restore."

(
  cd "$source_dir"
  sha256sum --check SHA256SUMS
)

log "Stopping public geocoder traffic while restoring."
gateway_id=$(docker ps -q --filter "label=com.docker.compose.service=gateway" | head -n 1)
[ -z "$gateway_id" ] || docker stop "$gateway_id" >/dev/null

compose up -d nominatim
started=$(date +%s)
until compose exec -T nominatim curl --fail --silent --max-time 5 \
  http://127.0.0.1:8080/status >/dev/null 2>&1; do
  [ $(($(date +%s) - started)) -lt 600 ] ||
    die "Nominatim did not start for restore."
  sleep 10
done

log "Restoring PostgreSQL/PostGIS database."
compose exec -T nominatim pg_restore \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --exit-on-error \
  <"$source_dir/nominatim.dump"

for item in photon_data photon_app nominatim_flatnode; do
  volume="${COMPOSE_PROJECT_NAME}_${item}"
  docker volume create "$volume" >/dev/null
  docker run --rm --network none \
    -v "$volume:/target" \
    -v "$source_dir:/backup:ro" \
    alpine:3.22.1 sh -eu -c \
    "find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -xzf '/backup/${item}.tar.gz' -C /target"
done

docker run --rm --network none \
  -v "${COMPOSE_PROJECT_NAME}_photon_data:/target" \
  -v "${COMPOSE_PROJECT_NAME}_photon_app:/app" \
  alpine:3.22.1 chown -R 10002:10002 /target /app

compose up -d nominatim photon
[ -z "$gateway_id" ] || docker start "$gateway_id" >/dev/null
./scripts/healthcheck.sh
log "Restore completed successfully from backup $BACKUP_ID."
