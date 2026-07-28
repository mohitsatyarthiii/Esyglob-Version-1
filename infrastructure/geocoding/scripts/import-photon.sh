#!/usr/bin/env sh
set -eu
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

load_env
validate_env
preflight
require_command md5sum
require_command sha256sum
require_command tar
require_command find

: "${PHOTON_VERSION:?PHOTON_VERSION is required}"
: "${PHOTON_DB_ARCHIVE:?PHOTON_DB_ARCHIVE is required}"
validate_filename "$PHOTON_DB_ARCHIVE" PHOTON_DB_ARCHIVE
validate_https_url "${PHOTON_JAR_URL:-}" PHOTON_JAR_URL
validate_https_url "${PHOTON_DB_URL:-}" PHOTON_DB_URL
validate_https_url "${PHOTON_DB_CHECKSUM_URL:-}" PHOTON_DB_CHECKSUM_URL
require_free_disk "${MIN_FREE_DISK_GB:-12}"

app_volume="${COMPOSE_PROJECT_NAME}_photon_app"
data_volume="${COMPOSE_PROJECT_NAME}_photon_data"
replace=0
if [ "${PHOTON_REPLACE_CONFIRM:-}" = "$COMPOSE_PROJECT_NAME" ]; then
  replace=1
fi
if volume_has_file "$app_volume" .installed-version &&
   volume_has_file "$data_volume" .import-complete; then
  if [ "$replace" -eq 0 ]; then
    log "Completed Photon ${PHOTON_VERSION} installation already exists; retaining it."
    exit 0
  fi
  log "A confirmed Photon replacement was requested."
fi
if { volume_exists "$app_volume" || volume_exists "$data_volume"; } &&
   [ "$replace" -eq 0 ]; then
  die "Photon volumes exist without completion markers. Preserve them for diagnosis and use a new COMPOSE_PROJECT_NAME to retry safely."
fi

mkdir -p "$ROOT_DIR/data/cache"
jar="$ROOT_DIR/data/cache/photon-${PHOTON_VERSION}.jar"
if [ ! -s "$jar" ]; then
  log "Downloading pinned Photon ${PHOTON_VERSION} JAR."
  curl --fail --location --continue-at - --retry 8 --retry-all-errors \
    --connect-timeout 20 --output "$jar.part" "$PHOTON_JAR_URL"
  [ -s "$jar.part" ] || die "Downloaded Photon JAR is empty."
  mv -- "$jar.part" "$jar"
fi
actual_jar_sha=$(sha256sum "$jar" | awk '{ print tolower($1) }')
expected_jar_sha=$(printf '%s' "$PHOTON_JAR_SHA256" | tr 'A-F' 'a-f')
[ "$actual_jar_sha" = "$expected_jar_sha" ] ||
  die "Photon JAR checksum mismatch (expected $expected_jar_sha, got $actual_jar_sha)."
log "Photon JAR checksum verified."

archive="$ROOT_DIR/data/cache/$PHOTON_DB_ARCHIVE"
checksum="$archive.md5"
curl --fail --location --retry 5 --output "$checksum" "$PHOTON_DB_CHECKSUM_URL"
expected=$(awk 'NR == 1 { print tolower($1) }' "$checksum")
printf '%s' "$expected" | grep -Eq '^[0-9a-f]{32}$' ||
  die "The Photon database checksum response is not a valid MD5 value."
if [ -f "$archive" ]; then
  actual=$(md5sum "$archive" | awk '{ print tolower($1) }')
else
  actual=
fi
if [ "$actual" != "$expected" ]; then
  log "Downloading Photon database (resumable)."
  curl --fail --location --continue-at - --retry 8 --retry-all-errors \
    --connect-timeout 20 --output "$archive.part" "$PHOTON_DB_URL"
  [ -s "$archive.part" ] || die "Downloaded Photon database archive is empty."
  actual=$(md5sum "$archive.part" | awk '{ print tolower($1) }')
  [ "$actual" = "$expected" ] ||
    die "Photon database checksum mismatch (expected $expected, got $actual)."
  mv -- "$archive.part" "$archive"
fi
log "Photon database checksum verified."

staging="$ROOT_DIR/data/photon-staging"
ensure_clean_directory "$staging"
log "Inspecting and extracting the Photon database."
if tar -tjf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  die "Photon archive contains an unsafe path."
fi
tar -xjf "$archive" -C "$staging"
photon_dir=$(find "$staging" -type d -name photon_data -print -quit)
[ -n "$photon_dir" ] || die "Photon archive does not contain photon_data."
[ -d "$photon_dir/nodes" ] || [ -d "$photon_dir/_state" ] ||
  die "Extracted Photon database does not contain a recognizable index."

docker volume create "$app_volume" >/dev/null
docker volume create "$data_volume" >/dev/null
if [ "$replace" -eq 1 ]; then
  compose stop gateway photon >/dev/null 2>&1 || true
  for volume in "$app_volume" "$data_volume"; do
    docker run --rm --network none -v "$volume:/target" "$ALPINE_IMAGE" \
      sh -eu -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'
  done
fi
docker run --rm --network none \
  -v "$app_volume:/target" \
  -v "$ROOT_DIR/data/cache:/source:ro" \
  "$ALPINE_IMAGE" sh -eu -c \
  "cp '/source/photon-${PHOTON_VERSION}.jar' /target/photon.jar
   printf '%s\n' '$PHOTON_VERSION' > /target/.installed-version
   chown -R 10002:10002 /target"
docker run --rm --network none \
  -v "$data_volume:/target" \
  -v "$photon_dir:/source:ro" \
  "$ALPINE_IMAGE" sh -eu -c \
  "mkdir -p /target/photon_data
   cp -a /source/. /target/photon_data/
   printf '%s\n' '$PHOTON_VERSION' > /target/.import-complete
   chown -R 10002:10002 /target"

ensure_clean_directory "$staging"
rmdir "$staging"
log "Photon ${PHOTON_VERSION} application and verified database are ready."
