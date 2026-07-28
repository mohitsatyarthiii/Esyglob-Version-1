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

[ "${UPDATE_STRATEGY:-replication}" = "replication" ] ||
  die "This host-safe update workflow supports UPDATE_STRATEGY=replication. Full blue/green imports require a separately capacity-planned host."
for service in nominatim photon gateway; do
  id=$(service_container_id "$service" || true)
  [ -n "$id" ] && [ "$(docker inspect --format '{{.State.Running}}' "$id")" = "true" ] ||
    fail_service "$service" "$service must be running before update."
done

update_id="$(date -u '+%Y%m%dT%H%M%SZ')-preupdate"
case "${BACKUP_DIR:-./backups}" in
  /*) backup_root=${BACKUP_DIR:-./backups} ;;
  *) backup_root="$ROOT_DIR/${BACKUP_DIR:-./backups}" ;;
esac
backup_path="$backup_root/$update_id"
log "Creating rollback backup $update_id."
BACKUP_ID_OVERRIDE=$update_id "$ROOT_DIR/scripts/backup.sh"

rollback() {
  trap - EXIT INT TERM
  disable_temporary_egress nominatim
  log "Update failed; restoring the verified pre-update backup." >&2
  RESTORE_CONFIRM=$update_id "$ROOT_DIR/scripts/restore.sh" "$backup_path" ||
    die "Automatic rollback also failed. Services and logs were preserved; inspect them before retrying."
  die "Update failed and was rolled back to $update_id."
}
trap rollback EXIT INT TERM

log "Applying available Nominatim replication changes."
enable_temporary_egress nominatim
if ! compose exec -T -u nominatim nominatim sh -eu -c \
  'cd /nominatim
   NOMINATIM_REPLICATION_UPDATE_INTERVAL=0 nominatim replication --once'; then
  print_service_diagnostics nominatim
  exit 1
fi
disable_temporary_egress nominatim
compose exec -T nominatim sudo -u nominatim nominatim admin \
  --project-dir /nominatim --check-database >/dev/null ||
  fail_service nominatim "Nominatim failed validation after replication."

log "Refreshing the checksum-pinned Photon release and India database."
PHOTON_REPLACE_CONFIRM=$COMPOSE_PROJECT_NAME \
  "$ROOT_DIR/scripts/import-photon.sh"
compose up -d --no-deps photon
wait_for_service_healthy photon "${STARTUP_TIMEOUT_SECONDS:-900}"
compose up -d --no-deps gateway
wait_for_service_healthy gateway "${STARTUP_TIMEOUT_SECONDS:-900}"
"$ROOT_DIR/scripts/healthcheck.sh"

trap - EXIT INT TERM
log "Update completed. Rollback backup retained at $backup_path."
