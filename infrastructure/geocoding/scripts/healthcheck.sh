#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
set -a
. ./.env
set +a
curl --fail --silent "http://${GEOCODER_BIND_IP:-127.0.0.1}:${NOMINATIM_PORT:-8088}/status"
curl --fail --silent "http://${GEOCODER_BIND_IP:-127.0.0.1}:${PHOTON_PORT:-2322}/status"
docker compose ps
