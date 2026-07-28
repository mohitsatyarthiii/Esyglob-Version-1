#!/usr/bin/env sh
set -eu

if [ ! -d /photon/photon_data ]; then
  echo "Photon data is missing. Run ./scripts/import-photon.sh before starting Photon." >&2
  exit 78
fi

exec java "-Xms${PHOTON_HEAP:-8g}" "-Xmx${PHOTON_HEAP:-8g}" -jar /photon/photon.jar serve
