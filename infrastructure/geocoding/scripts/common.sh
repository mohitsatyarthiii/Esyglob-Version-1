#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

load_env() {
  ENV_FILE=${GEOCODING_ENV_FILE:-.env}
  [ -f "$ENV_FILE" ] || die "Missing $ENV_FILE. Copy .env.example to .env and configure it."
  set -a
  # shellcheck disable=SC1091
  . "$ENV_FILE"
  set +a
  : "${COMPOSE_PROJECT_NAME:=esyglob-geocoding}"
  : "${GEOCODER_BIND_IP:=127.0.0.1}"
  : "${NOMINATIM_PORT:=8088}"
  : "${PHOTON_PORT:=2322}"
  export ENV_FILE COMPOSE_PROJECT_NAME GEOCODER_BIND_IP NOMINATIM_PORT PHOTON_PORT
}

validate_env() {
  [ "${GEOCODER_BIND_IP}" = "127.0.0.1" ] ||
    die "GEOCODER_BIND_IP must be 127.0.0.1 for this private deployment."
  [ -n "${POSTGRES_PASSWORD:-}" ] ||
    die "POSTGRES_PASSWORD is required."
  [ "${#POSTGRES_PASSWORD}" -ge 24 ] ||
    die "POSTGRES_PASSWORD must contain at least 24 characters."
  [ -n "${ADDRESS_TOKEN_SECRET:-}" ] ||
    die "ADDRESS_TOKEN_SECRET is required."
  [ "${#ADDRESS_TOKEN_SECRET}" -ge 32 ] ||
    die "ADDRESS_TOKEN_SECRET must contain at least 32 characters."
}

validate_https_url() {
  case "$1" in
    https://*) ;;
    *) die "$2 must be an https:// URL" ;;
  esac
  printf '%s' "$1" | grep -Eq '[[:space:]]' &&
    die "$2 must not contain whitespace."
}

validate_filename() {
  case "$1" in
    ""|.*|*/*|*\\*|*".."*) die "$2 is not a safe filename" ;;
  esac
}

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

wait_for_url() {
  url=$1
  timeout_seconds=$2
  label=$3
  started=$(date +%s)
  while ! curl --fail --silent --show-error --max-time 8 "$url" >/dev/null 2>&1; do
    now=$(date +%s)
    [ $((now - started)) -lt "$timeout_seconds" ] ||
      die "Timed out waiting for $label at $url"
    sleep 10
  done
  log "$label is responding."
}

volume_exists() {
  docker volume inspect "$1" >/dev/null 2>&1
}

volume_has_file() {
  volume=$1
  path=$2
  volume_exists "$volume" || return 1
  docker run --rm --network none -v "$volume:/volume:ro" alpine:3.22.1 \
    test -f "/volume/$path"
}

ensure_clean_directory() {
  path=$1
  case "$path" in
    "$ROOT_DIR"/data/*|"$ROOT_DIR"/backups/*) ;;
    *) die "Refusing to modify unsafe path: $path" ;;
  esac
  if [ -e "$path" ]; then
    rm -rf -- "$path"
  fi
  mkdir -p -- "$path"
}
