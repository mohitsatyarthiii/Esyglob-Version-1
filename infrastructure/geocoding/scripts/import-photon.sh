#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/common.sh"

load_env
validate_env
require_command docker
require_command curl
require_command md5sum
require_command tar

: "${PHOTON_VERSION:?PHOTON_VERSION is required}"
validate_https_url "${PHOTON_DB_URL:-}" PHOTON_DB_URL
validate_https_url "${PHOTON_DB_CHECKSUM_URL:-}" PHOTON_DB_CHECKSUM_URL

app_volume="${COMPOSE_PROJECT_NAME}_photon_app"
data_volume="${COMPOSE_PROJECT_NAME}_photon_data"
if volume_has_file "$data_volume" photon_data/nodes/0/_state/global-0.st ||
   volume_has_file "$data_volume" photon_data/_state/global-0.st; then
  if [ "${ALLOW_EXISTING_IMPORT:-0}" != "1" ]; then
    die "Existing Photon database detected. Refusing to overwrite it."
  fi
  log "Existing Photon database retained."
  exit 0
fi

mkdir -p data/cache
jar="data/cache/photon-${PHOTON_VERSION}.jar"
jar_url="https://github.com/komoot/photon/releases/download/${PHOTON_VERSION}/photon-${PHOTON_VERSION}.jar"
if [ ! -s "$jar" ]; then
  log "Downloading Photon ${PHOTON_VERSION} release JAR."
  curl --fail --location --retry 8 --retry-all-errors --output "$jar.part" "$jar_url"
  mv -- "$jar.part" "$jar"
fi
if [ -n "${PHOTON_JAR_SHA256:-}" ]; then
  require_command sha256sum
  printf '%s  %s\n' "$PHOTON_JAR_SHA256" "$jar" | sha256sum --check -
else
  log "WARNING: PHOTON_JAR_SHA256 is empty; pin it after verifying the upstream release asset."
fi

archive_name=$(basename "$PHOTON_DB_URL")
archive="data/cache/$archive_name"
checksum="data/cache/$archive_name.md5"
log "Downloading Photon database (resumable): $PHOTON_DB_URL"
curl --fail --location --continue-at - --retry 8 --retry-all-errors \
  --output "$archive.part" "$PHOTON_DB_URL"
mv -- "$archive.part" "$archive"
curl --fail --location --retry 5 --output "$checksum" "$PHOTON_DB_CHECKSUM_URL"
expected=$(awk 'NR == 1 { print $1 }' "$checksum")
actual=$(md5sum "$archive" | awk '{print $1}')
[ "$actual" = "$expected" ] ||
  die "Photon database checksum mismatch (expected $expected, got $actual)."

staging="$ROOT_DIR/data/photon-staging"
ensure_clean_directory "$staging"
log "Inspecting and extracting Photon database."
tar -tjf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))' &&
  die "Photon archive contains an unsafe path."
tar -xjf "$archive" -C "$staging"
photon_dir=$(find "$staging" -type d -name photon_data -print -quit)
[ -n "$photon_dir" ] || die "Photon archive does not contain photon_data."

docker volume create "$app_volume" >/dev/null
docker volume create "$data_volume" >/dev/null
docker run --rm --network none \
  -v "$app_volume:/target" \
  -v "$ROOT_DIR/data/cache:/source:ro" \
  alpine:3.22.1 sh -eu -c \
  "cp '/source/photon-${PHOTON_VERSION}.jar' /target/photon.jar && chown -R 10002:10002 /target"
docker run --rm --network none \
  -v "$data_volume:/target" \
  -v "$photon_dir:/source:ro" \
  alpine:3.22.1 sh -eu -c \
  "mkdir -p /target/photon_data && cp -a /source/. /target/photon_data/ && chown -R 10002:10002 /target"

ensure_clean_directory "$staging"
rmdir "$staging"
log "Photon ${PHOTON_VERSION} application and verified database are ready."
