#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
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
  requested_env=${GEOCODING_ENV_FILE:-.env}
  case "$requested_env" in
    /*) ENV_FILE=$requested_env ;;
    *) ENV_FILE="$ROOT_DIR/$requested_env" ;;
  esac
  [ -f "$ENV_FILE" ] ||
    die "Missing $ENV_FILE. Copy .env.example to .env and configure it."
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  : "${COMPOSE_PROJECT_NAME:=esyglob-geocoding}"
  : "${ALPINE_IMAGE:=alpine:3.22.1}"
  export ENV_FILE COMPOSE_PROJECT_NAME ALPINE_IMAGE
}

validate_env() {
  [ "${GEOCODER_BIND_IP:-}" = "127.0.0.1" ] ||
    die "GEOCODER_BIND_IP must be 127.0.0.1; expose only the localhost gateway."
  [ -n "${NOMINATIM_PASSWORD:-}" ] ||
    die "NOMINATIM_PASSWORD is required."
  [ "$NOMINATIM_PASSWORD" != "CHANGE_ME" ] ||
    die "Replace NOMINATIM_PASSWORD=CHANGE_ME in $ENV_FILE."
  [ "${#NOMINATIM_PASSWORD}" -ge 24 ] ||
    die "NOMINATIM_PASSWORD must contain at least 24 characters."
  printf '%s' "${PHOTON_JAR_SHA256:-}" | grep -Eq '^[0-9a-fA-F]{64}$' ||
    die "PHOTON_JAR_SHA256 must be a pinned 64-character SHA-256."
  [ "${UPDATE_STRATEGY:-replication}" = "replication" ] ||
    die "UPDATE_STRATEGY must be replication for this deployment."
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

preflight() {
  require_command docker
  require_command curl
  docker info >/dev/null 2>&1 ||
    die "Docker Engine is unavailable. Start Docker and check this user's Docker permissions."
  docker compose version >/dev/null 2>&1 ||
    die "Docker Compose v2 is required."
  compose config --quiet ||
    die "docker-compose.yml or $ENV_FILE is invalid."
}

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

service_container_id() {
  compose ps -aq "$1" 2>/dev/null | awk 'NR == 1 { print; exit }'
}

print_service_diagnostics() {
  service=$1
  id=$(service_container_id "$service" || true)
  if [ -z "$id" ]; then
    log "No container exists for service $service." >&2
    return
  fi
  log "Diagnostics for $service ($id):" >&2
  docker inspect --format \
    'status={{.State.Status}} exit={{.State.ExitCode}} oom_killed={{.State.OOMKilled}} error={{json .State.Error}} started={{.State.StartedAt}} finished={{.State.FinishedAt}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$id" >&2 2>/dev/null || true
  compose logs --no-color --tail 200 "$service" >&2 2>/dev/null || true
}

fail_service() {
  service=$1
  shift
  print_service_diagnostics "$service"
  die "$*"
}

wait_for_service_healthy() {
  service=$1
  timeout_seconds=$2
  started=$(date +%s)
  while :; do
    id=$(service_container_id "$service" || true)
    if [ -n "$id" ]; then
      running=$(docker inspect --format '{{.State.Running}}' "$id" 2>/dev/null || printf false)
      [ "$running" = "true" ] ||
        fail_service "$service" "$service exited before becoming healthy."
      health=$(docker inspect --format \
        '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || true)
      [ "$health" = "healthy" ] && {
        log "$service is healthy."
        return
      }
      [ "$health" != "unhealthy" ] ||
        fail_service "$service" "$service reported an unhealthy status."
    fi
    now=$(date +%s)
    [ $((now - started)) -lt "$timeout_seconds" ] ||
      fail_service "$service" "Timed out after ${timeout_seconds}s waiting for $service."
    sleep 10
  done
}

enable_temporary_egress() {
  service=$1
  id=$(service_container_id "$service" || true)
  [ -n "$id" ] || fail_service "$service" "Cannot enable egress before $service exists."
  EGRESS_NETWORK="${COMPOSE_PROJECT_NAME}_temporary_egress"
  if ! docker network inspect "$EGRESS_NETWORK" >/dev/null 2>&1; then
    docker network create --driver bridge \
      --label "com.esyglob.geocoding.temporary=true" "$EGRESS_NETWORK" >/dev/null ||
      die "Could not create temporary update network $EGRESS_NETWORK."
  fi
  docker network connect "$EGRESS_NETWORK" "$id" 2>/dev/null || true
  export EGRESS_NETWORK
  log "Temporary outbound network enabled for $service."
}

disable_temporary_egress() {
  service=$1
  network=${EGRESS_NETWORK:-"${COMPOSE_PROJECT_NAME}_temporary_egress"}
  id=$(service_container_id "$service" || true)
  [ -z "$id" ] || docker network disconnect "$network" "$id" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  log "Temporary outbound network removed for $service."
}

volume_exists() {
  docker volume inspect "$1" >/dev/null 2>&1
}

volume_has_file() {
  volume=$1
  path=$2
  volume_exists "$volume" || return 1
  docker run --rm --network none -v "$volume:/volume:ro" "$ALPINE_IMAGE" \
    test -f "/volume/$path"
}

available_disk_gb() {
  df -Pk "$ROOT_DIR" | awk 'NR == 2 { print int($4 / 1024 / 1024) }'
}

require_free_disk() {
  required=$1
  available=$(available_disk_gb)
  [ "$available" -ge "$required" ] ||
    die "Only ${available} GB is free; at least ${required} GB is required."
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
