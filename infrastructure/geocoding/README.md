# EsyGlob private geocoding platform

This deployment runs Nominatim/PostgreSQL/PostGIS and Photon on one Ubuntu
24.04 VPS. Only the Nginx gateway is published, and only on localhost:

```text
EsyGlob backend
  |-- http://127.0.0.1:8088 --> gateway --> Nominatim :8080
  `-- http://127.0.0.1:2322 --> gateway --> Photon    :2322
```

Browsers and mobile applications must call the public EsyGlob HTTPS backend.
They must never call these localhost services directly. PostgreSQL, Nominatim,
and Photon have no host port. The steady-state service network is marked
internal. Import and replication scripts attach only Nominatim to a temporary
outbound bridge and remove that bridge immediately afterward; this is required
to initialize and fetch signed HTTPS replication data without giving the
gateway or Photon general egress.

## Compatibility decisions

| File | Previous failure | Production correction |
|---|---|---|
| `docker-compose.yml` | CPU, RAM, JVM, shared memory, and PostgreSQL settings assumed a large host; the PBF mount could conflict with image ownership initialization; Photon could start without an installed JAR. | All resources are environment-driven with 2-vCPU/8-GB defaults. PBF data is read-only at `/data`, outside Nominatim's managed project directory. Photon uses completion-marked named volumes provisioned by the import script. Only the gateway publishes localhost ports. |
| `.env.example` | Required values, immutable versions, and small-host sizing were incomplete or inconsistent with scripts. | Contains every required variable, pinned images and Photon SHA-256, 2-vCPU/8-GB defaults, replication URL, timeouts, and lifecycle controls. |
| `gateway/nginx.conf` | The old layout and obsolete blue/green template disagreed about ports and networks and could retain stale Docker DNS addresses. | The unused template was removed. The active configuration proxies separate localhost ports, resolves Docker service addresses dynamically, uses bounded timeouts, and exposes a local health endpoint. |
| `scripts/common.sh` | Sourcing `.env` without a slash invokes POSIX `PATH` lookup; waits did not consistently detect crashes. | Resolves the environment file to an absolute path, validates configuration, verifies Docker/Compose, checks service state, and prints inspect state, exit code, OOM status, and logs on failure. |
| `download-osm.sh` | Verification could be skipped. | Resumable HTTPS download with mandatory published MD5 verification and a free-space gate. |
| `import-nominatim.sh` | A partial PostgreSQL cluster could be mistaken for a valid import and restarted repeatedly. | Requires the image's `import-finished` marker, refuses ambiguous partial imports, waits on the real `/status` health check, and validates PostgreSQL, PostGIS, and Nominatim. |
| `import-photon.sh` | JAR verification was optional and volume contents were inferred from fragile Elasticsearch paths. | Uses a pinned upstream URL and mandatory SHA-256, verifies the database MD5, checks archive paths, seeds volumes deterministically, fixes ownership, and writes explicit completion markers. |
| `start.sh` | The active environment path could be malformed and services were started before readiness was known. | Records the absolute environment path, validates import markers, starts engines once, waits for health, then starts the gateway and runs functional tests. |
| `healthcheck.sh` | It used stale variable names/direct engine ports and lost diagnostics under `set -e`. | Tests both gateway routes, PostgreSQL/PostGIS, search, and reverse geocoding with bounded retries and service diagnostics. |
| `backup.sh` | Database failures could leave an unexplained empty dump and archives lacked a strict lifecycle. | Creates a PostgreSQL custom dump, volume archives, manifest, and SHA-256 set; incomplete backup directories are retained for diagnosis. |
| `restore.sh` | Restore could write while the API still held database sessions and failure recovery was weak. | Requires exact confirmation, validates all checksums before mutation, enters maintenance mode, terminates sessions, restores data and ownership, then validates every service. |
| `update.sh` | Full blue/green India imports require two complete datasets and cannot fit reliably on a 100-GB host. | Creates a verified rollback backup, applies official Nominatim replication, safely replaces the pinned Photon dataset, validates the stack, and automatically restores the backup on failure. |

Nominatim runs as the image's required root entrypoint because that maintained
image initializes PostgreSQL and drops privileges internally. Photon runs as
UID/GID `10002`, and the gateway uses the official Nginx user for workers.
There is no privileged mode.

## Host requirements

- Ubuntu 24.04 LTS, x86-64
- Docker Engine and Docker Compose v2
- `curl`, `tar`, `bzip2`, `md5sum`, `sha256sum`, `find`
- 2 vCPU, 8 GB RAM, and 100 GB SSD minimum for the configured India scope
- No inbound firewall rules for TCP 5432, 8088, or 2322

The exact disk needed grows with OpenStreetMap. Check free space before import;
100 GB is a constrained deployment and may require a storage upgrade as India
data grows. The scripts stop before downloads when the configured free-space
floor is not met.

Install prerequisites:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl bzip2 coreutils findutils tar
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Log out and back in after changing Docker group membership.

## Initial deployment

```sh
cd /var/www/esyglob/infrastructure/geocoding
cp .env.example .env
openssl rand -hex 32
```

Replace `NOMINATIM_PASSWORD=CHANGE_ME` with the generated hexadecimal value.
Do not add application secrets to this frontend-independent stack.

```sh
chmod 600 .env
chmod 750 scripts scripts/*.sh
docker compose --env-file "$(pwd)/.env" config
./scripts/download-osm.sh
./scripts/import-nominatim.sh
./scripts/import-photon.sh
./scripts/start.sh
```

Downloads resume from `.part` files. A Nominatim database import itself is not
safe to blindly resume after an unknown crash. If `PG_VERSION` exists without
`import-finished`, preserve the volume for diagnosis and retry with a new
`COMPOSE_PROJECT_NAME`; do not delete the old volume until the new import is
healthy. Photon staging is repeatable and checksum protected.

After the import scripts provision their named volumes, both `start.sh` and
plain `docker compose --env-file .env up -d` survive reboot through
`restart: unless-stopped`. Use `start.sh` for readiness and functional checks.

Verify exposure:

```sh
docker compose --env-file .env ps
sudo ss -lntp | grep -E ':(8088|2322)'
curl -fsS http://127.0.0.1:8088/status
curl -fsS 'http://127.0.0.1:2322/api?q=Delhi&limit=1'
```

Both sockets must show `127.0.0.1`, never `0.0.0.0` or `[::]`.

## Backend configuration

For a backend process running directly on the same VPS:

```dotenv
NOMINATIM_BASE_URL=http://127.0.0.1:8088
PHOTON_BASE_URL=http://127.0.0.1:2322
ADDRESS_SERVICE_TIMEOUT_MS=6500
ADDRESS_CACHE_TTL_SECONDS=900
ADDRESS_CACHE_MAX_KEYS=5000
```

These are intentionally HTTP because traffic stays on the kernel's localhost
interface. Public client-to-backend traffic remains HTTPS. If the backend is a
container, `127.0.0.1` means that backend container; attach it to an explicitly
designed private Docker network instead of opening geocoder ports publicly.

## Resource profiles

The committed `.env.example` is the safe 2-vCPU/8-GB profile:

```dotenv
NOMINATIM_CPUS=1.25
PHOTON_CPUS=0.50
GATEWAY_CPUS=0.25
NOMINATIM_MEMORY_LIMIT=5g
PHOTON_MEMORY_LIMIT=1536m
GATEWAY_MEMORY_LIMIT=128m
NOMINATIM_THREADS=1
PHOTON_HEAP_MAX=-Xmx1024m
POSTGRES_SHARED_BUFFERS=1GB
POSTGRES_MAINTENANCE_WORK_MEM=1GB
POSTGRES_EFFECTIVE_CACHE_SIZE=4GB
```

For the future 8-vCPU/32-GB/400-GB host, change only `.env`:

```dotenv
NOMINATIM_CPUS=6.25
PHOTON_CPUS=1.25
GATEWAY_CPUS=0.50
NOMINATIM_MEMORY_LIMIT=22g
PHOTON_MEMORY_LIMIT=8g
GATEWAY_MEMORY_LIMIT=256m
NOMINATIM_SHM_SIZE=2gb
NOMINATIM_THREADS=6
NOMINATIM_API_POOL_SIZE=4
PHOTON_HEAP_MIN=-Xms1g
PHOTON_HEAP_MAX=-Xmx6g
POSTGRES_SHARED_BUFFERS=6GB
POSTGRES_MAINTENANCE_WORK_MEM=4GB
POSTGRES_AUTOVACUUM_WORK_MEM=1GB
POSTGRES_WORK_MEM=24MB
POSTGRES_EFFECTIVE_CACHE_SIZE=20GB
POSTGRES_MAX_WAL_SIZE=8GB
POSTGRES_MAX_CONNECTIONS=100
MIN_FREE_DISK_GB=40
```

PostgreSQL `work_mem` is per operation, so do not raise it aggressively.

## Operations

Health:

```sh
./scripts/healthcheck.sh
```

Backup:

```sh
./scripts/backup.sh
```

Copy backups to encrypted storage outside this VPS. Local backups are rollback
copies, not disaster recovery.

Restore:

```sh
cat backups/<backup-id>/manifest.env
RESTORE_CONFIRM=<backup-id> ./scripts/restore.sh backups/<backup-id>
```

Restore is destructive and uses maintenance mode. It never mutates data until
all backup checksums pass.

Update:

```sh
./scripts/update.sh
```

The small-host update strategy uses incremental Nominatim replication instead
of a second full import. Photon replacement is performed in maintenance mode.
A full pre-update backup is retained and is restored automatically if update
validation fails. Schedule an update window.

Never run:

```text
docker compose down -v
```

That deletes the imported databases.

## Diagnostics

Every lifecycle script reports container status, exit code, `OOMKilled`, Docker
error state, and the last 200 service log lines when a service exits or becomes
unhealthy. Additional host checks:

```sh
docker compose --env-file .env ps
docker compose --env-file .env logs --tail 300 nominatim photon gateway
docker inspect "$(docker compose --env-file .env ps -q nominatim)"
df -h
free -h
sudo journalctl -u docker --since '30 minutes ago'
```

Do not use insecure TLS flags, make services public, delete partial volumes, or
increase memory limits after an OOM without first inspecting host memory and
the recorded container state.
