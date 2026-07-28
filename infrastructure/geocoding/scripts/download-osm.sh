#!/usr/bin/env sh
set -eu
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

load_env
require_command curl
require_command md5sum
validate_https_url "${OSM_PBF_URL:-}" OSM_PBF_URL
validate_https_url "${OSM_PBF_CHECKSUM_URL:-}" OSM_PBF_CHECKSUM_URL
validate_filename "${OSM_PBF_FILE:-}" OSM_PBF_FILE
require_free_disk "${MIN_FREE_DISK_GB:-12}"

mkdir -p data
target="data/$OSM_PBF_FILE"
partial="$target.part"

if [ -f "$target" ]; then
  log "$target already exists; validating the existing file."
else
  log "Downloading $OSM_PBF_URL to $target (resumable)."
  curl \
    --fail \
    --location \
    --continue-at - \
    --retry 8 \
    --retry-all-errors \
    --connect-timeout 20 \
    --output "$partial" \
    "$OSM_PBF_URL"
  [ -s "$partial" ] || die "Downloaded PBF is empty."
  mv -- "$partial" "$target"
fi

checksum_file="$target.md5"
curl --fail --location --retry 5 --output "$checksum_file" "$OSM_PBF_CHECKSUM_URL"
expected=$(awk 'NR == 1 { print tolower($1) }' "$checksum_file")
printf '%s' "$expected" | grep -Eq '^[0-9a-f]{32}$' ||
  die "The OSM checksum response is not a valid MD5 value."
actual=$(md5sum "$target" | awk '{ print tolower($1) }')
[ "$actual" = "$expected" ] ||
  die "Checksum mismatch for $target (expected $expected, got $actual)."
log "Checksum verified for $target."

log "OSM extract is ready: $target"
