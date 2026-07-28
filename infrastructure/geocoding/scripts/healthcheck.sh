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

nominatim="http://${GEOCODER_BIND_IP}:${NOMINATIM_PORT}"
photon="http://${GEOCODER_BIND_IP}:${PHOTON_PORT}"

for service in nominatim photon gateway; do
  id=$(service_container_id "$service" || true)
  [ -n "$id" ] || fail_service "$service" "$service container does not exist."
  [ "$(docker inspect --format '{{.State.Running}}' "$id")" = "true" ] ||
    fail_service "$service" "$service is not running."
done

log "Checking PostgreSQL and PostGIS."
compose exec -T nominatim pg_isready -U nominatim -d nominatim >/dev/null ||
  fail_service nominatim "PostgreSQL is not ready."
postgis_version=$(compose exec -T nominatim psql -U nominatim -d nominatim \
  -Atc "SELECT PostGIS_Lib_Version();" | tr -d '\r') ||
  fail_service nominatim "PostGIS version query failed."
[ -n "$postgis_version" ] ||
  fail_service nominatim "PostGIS version query returned no result."

check_http() {
  service=$1
  label=$2
  url=$3
  pattern=$4
  attempts=${HEALTH_RETRIES:-12}
  while [ "$attempts" -gt 0 ]; do
    if response=$(curl --fail --silent --show-error --max-time 15 "$url" 2>/dev/null) &&
       printf '%s' "$response" | grep -q "$pattern"; then
      log "$label passed."
      return
    fi
    attempts=$((attempts - 1))
    [ "$attempts" -gt 0 ] || fail_service "$service" "$label failed: $url"
    sleep "${HEALTH_RETRY_DELAY_SECONDS:-5}"
  done
}

check_http nominatim "Nominatim status" "$nominatim/status" "OK"
check_http nominatim "Nominatim search" \
  "$nominatim/search?q=New%20Delhi&format=jsonv2&limit=1" '"place_id"'
check_http nominatim "Nominatim reverse" \
  "$nominatim/reverse?lat=28.6139&lon=77.2090&format=jsonv2" '"place_id"'
check_http photon "Photon search" "$photon/api?q=New%20Delhi&limit=1" '"features"'
check_http photon "Photon reverse" \
  "$photon/reverse?lat=28.6139&lon=77.2090" '"features"'

if [ -n "${BACKEND_HEALTH_URL:-}" ]; then
  validate_https_url "$BACKEND_HEALTH_URL" BACKEND_HEALTH_URL
  curl --fail --silent --show-error --max-time 15 "$BACKEND_HEALTH_URL" >/dev/null ||
    die "Backend health endpoint failed: $BACKEND_HEALTH_URL"
fi

compose ps
log "All geocoding checks passed. PostGIS $postgis_version is active."
