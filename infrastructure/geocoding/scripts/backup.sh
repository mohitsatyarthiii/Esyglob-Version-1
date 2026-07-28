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

backup_id=${BACKUP_ID_OVERRIDE:-$(date -u '+%Y%m%dT%H%M%SZ')}
printf '%s' "$backup_id" | grep -Eq '^[0-9]{8}T[0-9]{6}Z(-[A-Za-z0-9_-]+)?$' ||
  die "BACKUP_ID_OVERRIDE contains unsafe characters."
case "${BACKUP_DIR:-./backups}" in
  /*) backup_root=${BACKUP_DIR:-./backups} ;;
  *) backup_root="$ROOT_DIR/${BACKUP_DIR:-./backups}" ;;
esac
mkdir -p "$backup_root"
backup_root=$(CDPATH='' cd -- "$backup_root" && pwd)
target="$backup_root/$backup_id"
[ ! -e "$target" ] || die "Backup already exists: $target"
mkdir -p "$target"

id=$(service_container_id nominatim || true)
[ -n "$id" ] && [ "$(docker inspect --format '{{.State.Running}}' "$id")" = "true" ] ||
  fail_service nominatim "Nominatim must be running before backup."

log "Creating a consistent PostgreSQL custom-format backup."
if ! compose exec -T nominatim pg_dump -U nominatim -d nominatim \
  --format=custom --compress=6 --no-owner >"$target/nominatim.dump"; then
  print_service_diagnostics nominatim
  die "PostgreSQL backup failed; incomplete files remain in $target for diagnosis."
fi
[ -s "$target/nominatim.dump" ] || die "PostgreSQL backup is empty."

log "Backing up Photon and Nominatim auxiliary volumes."
for item in photon_data photon_app nominatim_flatnode; do
  volume="${COMPOSE_PROJECT_NAME}_${item}"
  volume_exists "$volume" || die "Required volume does not exist: $volume"
  docker run --rm --network none \
    -v "$volume:/source:ro" -v "$target:/backup" "$ALPINE_IMAGE" \
    tar -czf "/backup/${item}.tar.gz" -C /source . ||
    die "Backup failed while archiving $volume."
done

cat >"$target/manifest.env" <<EOF
BACKUP_ID=$backup_id
SOURCE_PROJECT=$COMPOSE_PROJECT_NAME
PHOTON_VERSION=$PHOTON_VERSION
OSM_PBF_FILE=$OSM_PBF_FILE
CREATED_AT=$backup_id
EOF
(
  cd "$target"
  sha256sum nominatim.dump photon_data.tar.gz photon_app.tar.gz \
    nominatim_flatnode.tar.gz manifest.env >SHA256SUMS
)

if [ "${BACKUP_RETENTION_DAYS:-0}" -gt 0 ] 2>/dev/null; then
  find "$backup_root" -mindepth 1 -maxdepth 1 -type d \
    -mtime "+${BACKUP_RETENTION_DAYS}" -print |
    while IFS= read -r old_backup; do
      log "Retention candidate (not automatically deleted): $old_backup"
    done
fi
log "Backup completed: $target"
