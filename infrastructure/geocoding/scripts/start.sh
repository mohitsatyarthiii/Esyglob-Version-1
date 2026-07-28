#!/usr/bin/env sh
set -eu
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

load_env
validate_env
preflight

volume_has_file "${COMPOSE_PROJECT_NAME}_nominatim_db" import-finished ||
  die "Nominatim has no completed import. Run ./scripts/import-nominatim.sh first."
volume_has_file "${COMPOSE_PROJECT_NAME}_photon_app" .installed-version ||
  die "Photon application is not provisioned. Run ./scripts/import-photon.sh first."
volume_has_file "${COMPOSE_PROJECT_NAME}_photon_data" .import-complete ||
  die "Photon database has no completed import. Run ./scripts/import-photon.sh first."

compose up -d --no-deps nominatim photon
wait_for_service_healthy nominatim "${STARTUP_TIMEOUT_SECONDS:-900}"
wait_for_service_healthy photon "${STARTUP_TIMEOUT_SECONDS:-900}"
compose up -d --no-deps gateway
wait_for_service_healthy gateway "${STARTUP_TIMEOUT_SECONDS:-900}"

printf '%s\n' "$COMPOSE_PROJECT_NAME" >"$ROOT_DIR/.active-project"
printf '%s\n' "$ENV_FILE" >"$ROOT_DIR/.active-env"
"$ROOT_DIR/scripts/healthcheck.sh"
log "Private geocoding stack started successfully on 127.0.0.1:${NOMINATIM_PORT} and 127.0.0.1:${PHOTON_PORT}."
