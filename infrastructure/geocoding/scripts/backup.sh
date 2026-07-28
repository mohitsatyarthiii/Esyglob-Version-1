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

timestamp=$(date -u '+%Y%m%dT%H%M%SZ')
backup_root="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_root"
backup_root=$(CDPATH= cd -- "$backup_root" && pwd)
target="$backup_root/$timestamp"
mkdir -p "$target"

log "Creating consistent PostgreSQL logical backup."
compose exec -T nominatim pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  --compress=6 \
  --no-owner \
  >"$target/nominatim.dump"
[ -s "$target/nominatim.dump" ] || die "PostgreSQL backup is empty."

log "Backing up Photon index, Photon application, and Nominatim flatnode data."
for item in photon_data photon_app nominatim_flatnode; do
  volume="${COMPOSE_PROJECT_NAME}_${item}"
  volume_exists "$volume" || die "Required volume does not exist: $volume"
  docker run --rm --network none \
    -v "$volume:/source:ro" \
    -v "$target:/backup" \
    alpine:3.22.1 tar -czf "/backup/${item}.tar.gz" -C /source .
done

cat >"$target/manifest.env" <<EOF
BACKUP_ID=$timestamp
SOURCE_PROJECT=$COMPOSE_PROJECT_NAME
POSTGRES_DB=$POSTGRES_DB
POSTGRES_USER=$POSTGRES_USER
PHOTON_VERSION=$PHOTON_VERSION
OSM_PBF_FILE=$OSM_PBF_FILE
CREATED_AT=$timestamp
EOF

(
  cd "$target"
  sha256sum nominatim.dump photon_data.tar.gz photon_app.tar.gz \
    nominatim_flatnode.tar.gz manifest.env >SHA256SUMS
)
log "Backup completed: $target"
