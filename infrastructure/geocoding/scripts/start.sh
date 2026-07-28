#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/common.sh"

load_env
validate_env
require_command docker

volume_has_file "${COMPOSE_PROJECT_NAME}_nominatim_db" PG_VERSION ||
  die "Nominatim is not imported. Run ./scripts/import-nominatim.sh first."
volume_has_file "${COMPOSE_PROJECT_NAME}_photon_app" photon.jar ||
  die "Photon is not imported. Run ./scripts/import-photon.sh first."

compose up -d nominatim photon
compose --profile gateway up -d gateway
printf '%s\n' "$COMPOSE_PROJECT_NAME" >"$ROOT_DIR/.active-project"
printf '%s\n' "$ROOT_DIR/$ENV_FILE" >"$ROOT_DIR/.active-env"
./scripts/healthcheck.sh
log "Private geocoding stack started successfully."
