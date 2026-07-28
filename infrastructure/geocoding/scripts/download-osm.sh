#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/common.sh"

load_env
require_command curl
validate_https_url "${OSM_PBF_URL:-}" OSM_PBF_URL
validate_filename "${OSM_PBF_FILE:-}" OSM_PBF_FILE

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

if [ -n "${OSM_PBF_CHECKSUM_URL:-}" ]; then
  validate_https_url "$OSM_PBF_CHECKSUM_URL" OSM_PBF_CHECKSUM_URL
  checksum_file="$target.checksum"
  curl --fail --location --retry 5 --output "$checksum_file" "$OSM_PBF_CHECKSUM_URL"
  expected=$(awk 'NR == 1 { print $1 }' "$checksum_file")
  case "${OSM_PBF_CHECKSUM_ALGORITHM:-md5}" in
    sha256)
      require_command sha256sum
      actual=$(sha256sum "$target" | awk '{print $1}')
      ;;
    md5)
      require_command md5sum
      actual=$(md5sum "$target" | awk '{print $1}')
      ;;
    *)
      die "OSM_PBF_CHECKSUM_ALGORITHM must be md5 or sha256."
      ;;
  esac
  [ "$actual" = "$expected" ] ||
    die "Checksum mismatch for $target (expected $expected, got $actual)."
  log "Checksum verified for $target."
else
  log "WARNING: OSM_PBF_CHECKSUM_URL is not configured; checksum verification was skipped."
fi

log "OSM extract is ready: $target"
