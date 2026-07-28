#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Copy .env.example to .env and configure it first." >&2
  exit 2
fi

set -a
. ./.env
set +a
docker compose build photon
docker compose create photon
volume_name="$(docker volume ls --format '{{.Name}}' | awk '/esyglob-geocoding_photon_data$/ { print; exit }')"
if [ -z "$volume_name" ]; then
  echo "Photon Docker volume could not be resolved." >&2
  exit 3
fi
docker run --rm \
  -v "$volume_name:/target" \
  alpine:3.22 \
  sh -c "apk add --no-cache curl bzip2 tar && curl --fail --location --retry 5 '$PHOTON_DB_URL' | bzip2 -cd | tar -x -C /target --strip-components=1 && chown -R 10002:10002 /target"
echo "Photon OSM database imported into $volume_name."
