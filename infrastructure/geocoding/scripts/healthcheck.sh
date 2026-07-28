#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/common.sh"

[ -n "${GEOCODING_ENV_FILE:-}" ] || [ ! -f "$ROOT_DIR/.active-env" ] ||
  GEOCODING_ENV_FILE=$(cat "$ROOT_DIR/.active-env")
export GEOCODING_ENV_FILE
load_env
validate_env
require_command docker
require_command curl

base="http://${GEOCODER_BIND_IP}"
nominatim="${base}:${NOMINATIM_PORT}"
photon="${base}:${PHOTON_PORT}"

log "Checking PostgreSQL and PostGIS."
compose exec -T nominatim pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
postgis_version=$(compose exec -T nominatim psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -Atc "SELECT PostGIS_Lib_Version();" | tr -d '\r')
[ -n "$postgis_version" ] || die "PostGIS version query returned no result."

log "Checking Nominatim status, search, and reverse geocoding."
curl --fail --silent --show-error --max-time 10 "$nominatim/status" | grep -q 'OK'
curl --fail --silent --show-error --max-time 10 \
  "$nominatim/search?q=New%20Delhi&format=jsonv2&limit=1" | grep -q '"place_id"'
curl --fail --silent --show-error --max-time 10 \
  "$nominatim/reverse?lat=28.6139&lon=77.2090&format=jsonv2" | grep -q '"place_id"'

log "Checking Photon autocomplete and reverse geocoding."
curl --fail --silent --show-error --max-time 10 \
  "$photon/api?q=New%20Delhi&limit=1" | grep -q '"features"'
curl --fail --silent --show-error --max-time 10 \
  "$photon/reverse?lat=28.6139&lon=77.2090" | grep -q '"features"'

if [ -n "${BACKEND_HEALTH_URL:-}" ]; then
  validate_https_url "$BACKEND_HEALTH_URL" BACKEND_HEALTH_URL
  log "Checking the backend address API."
  curl --fail --silent --show-error --max-time 10 "$BACKEND_HEALTH_URL" >/dev/null
fi

compose ps
log "All geocoding checks passed. PostGIS $postgis_version is active."
