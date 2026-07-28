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
mkdir -p data
curl --fail --location --continue-at - --retry 5 "$OSM_PBF_URL" --output "data/$OSM_PBF_FILE"
echo "Downloaded data/$OSM_PBF_FILE"
