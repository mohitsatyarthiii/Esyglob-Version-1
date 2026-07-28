#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/common.sh"

GEOCODING_ENV_FILE=.env
export GEOCODING_ENV_FILE
load_env
validate_env
require_command docker
require_command curl
require_command sed

base_project=$COMPOSE_PROJECT_NAME
timestamp=$(date -u '+%Y%m%dT%H%M%SZ')
candidate_project="${base_project}-candidate-${timestamp}"
candidate_env="$ROOT_DIR/data/update-${timestamp}.env"
candidate_pbf="${OSM_PBF_FILE%.osm.pbf}-${timestamp}.osm.pbf"
state_file="$ROOT_DIR/.active-project"
active_env_file="$ROOT_DIR/.active-env"
old_project=$base_project
[ ! -f "$state_file" ] || old_project=$(cat "$state_file")
old_env="$ROOT_DIR/.env"
[ ! -f "$active_env_file" ] || old_env=$(cat "$active_env_file")

mkdir -p "$ROOT_DIR/data"
cp "$ENV_FILE" "$candidate_env"
cat >>"$candidate_env" <<EOF
COMPOSE_PROJECT_NAME=$candidate_project
OSM_PBF_FILE=$candidate_pbf
GEOCODER_BIND_IP=127.0.0.1
NOMINATIM_PORT=${CANDIDATE_NOMINATIM_PORT:-18088}
PHOTON_PORT=${CANDIDATE_PHOTON_PORT:-12322}
EOF
chmod 0600 "$candidate_env"

cleanup_candidate() {
  log "Stopping failed candidate project $candidate_project."
  failed_ids=$(docker ps -aq --filter "label=com.docker.compose.project=$candidate_project")
  for failed_id in $failed_ids; do
    docker update --restart=no "$failed_id" >/dev/null 2>&1 || true
    docker stop "$failed_id" >/dev/null 2>&1 || true
  done
}

log "Creating a pre-update backup of $old_project."
GEOCODING_ENV_FILE="$old_env" ./scripts/backup.sh

log "Building isolated candidate project $candidate_project."
GEOCODING_ENV_FILE="$candidate_env" ./scripts/download-osm.sh
GEOCODING_ENV_FILE="$candidate_env" ./scripts/import-nominatim.sh
GEOCODING_ENV_FILE="$candidate_env" ./scripts/import-photon.sh
docker compose --env-file "$candidate_env" up -d photon

candidate_network="${candidate_project}_private"
log "Validating candidate services on their private network."
started=$(date +%s)
until docker run --rm --network "$candidate_network" alpine:3.22.1 \
  wget -q -T 8 -O /dev/null "http://photon:2322/api?q=New%20Delhi&limit=1"; do
  if [ $(($(date +%s) - started)) -ge "${IMPORT_TIMEOUT_SECONDS:-172800}" ]; then
    cleanup_candidate
    die "Candidate Photon service failed to become ready."
  fi
  sleep 15
done
docker run --rm --network "$candidate_network" alpine:3.22.1 \
  wget -q -T 8 -O /dev/null \
  "http://nominatim:8080/reverse?lat=28.6139&lon=77.2090&format=jsonv2"

gateway_id=$(docker compose --env-file .env --profile gateway ps -q gateway)
[ -n "$gateway_id" ] ||
  die "Stable gateway is not running. Complete the initial deployment before update."

docker network connect "$candidate_network" "$gateway_id" 2>/dev/null || true
nominatim_id=$(docker compose --env-file "$candidate_env" ps -q nominatim)
photon_id=$(docker compose --env-file "$candidate_env" ps -q photon)
nominatim_name=$(docker inspect -f '{{.Name}}' "$nominatim_id" | sed 's#^/##')
photon_name=$(docker inspect -f '{{.Name}}' "$photon_id" | sed 's#^/##')
[ -n "$nominatim_name" ] && [ -n "$photon_name" ] ||
  die "Could not resolve candidate container names."

gateway_config="$ROOT_DIR/gateway/nginx.conf"
gateway_backup="$ROOT_DIR/data/nginx-${timestamp}.rollback.conf"
rendered="$ROOT_DIR/data/nginx-${timestamp}.candidate.conf"
cp "$gateway_config" "$gateway_backup"
sed \
  -e "s/__NOMINATIM_UPSTREAM__/$nominatim_name/g" \
  -e "s/__PHOTON_UPSTREAM__/$photon_name/g" \
  "$ROOT_DIR/gateway/nginx.conf.template" >"$rendered"
cp "$rendered" "$gateway_config"

rollback_gateway() {
  log "Candidate cutover failed; restoring the previous gateway configuration."
  cp "$gateway_backup" "$gateway_config"
  docker exec "$gateway_id" nginx -t >/dev/null 2>&1 || true
  docker exec "$gateway_id" nginx -s reload >/dev/null 2>&1 || true
  cleanup_candidate
}

docker exec "$gateway_id" nginx -t || {
  rollback_gateway
  die "Candidate gateway configuration is invalid."
}
docker exec "$gateway_id" nginx -s reload

if ! GEOCODING_ENV_FILE="$candidate_env" ./scripts/healthcheck.sh; then
  rollback_gateway
  die "Candidate failed post-cutover validation; previous services restored."
fi

printf '%s\n' "$candidate_project" >"$state_file"
printf '%s\n' "$candidate_env" >"$active_env_file"
if [ "$old_project" != "$candidate_project" ]; then
  old_ids=$(docker ps -q \
    --filter "label=com.docker.compose.project=$old_project" \
    --filter "label=com.docker.compose.service=nominatim")
  old_ids="$old_ids $(docker ps -q \
    --filter "label=com.docker.compose.project=$old_project" \
    --filter "label=com.docker.compose.service=photon")"
  for container_id in $old_ids; do
    if [ "$container_id" != "$gateway_id" ]; then
      docker update --restart=no "$container_id" >/dev/null
      docker stop "$container_id" >/dev/null
    fi
  done
fi

log "Blue/green cutover completed. Active project: $candidate_project"
log "Previous volumes were retained for manual rollback. Do not delete them until the observation window passes."
