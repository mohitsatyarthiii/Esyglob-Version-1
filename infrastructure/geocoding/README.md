# EsyGlob private geocoding platform

This directory deploys the private address infrastructure used by EsyGlob web,
mobile, and admin applications.

```text
Web / Mobile / Admin
          |
          v
Node backend (the only public HTTPS API)
          |
          v
127.0.0.1:8088 / 127.0.0.1:2322
          |
          v
localhost gateway -> Nominatim + PostgreSQL/PostGIS
                  -> Photon
```

PostgreSQL, PostGIS, Nominatim, and Photon are never directly published. The
maintained Nominatim image deliberately bundles PostgreSQL 16 and PostGIS; its
database port remains private inside that container. This avoids the removed
custom PyPI image while retaining isolated, persistent PostGIS storage.

## Supported components

- `mediagis/nominatim:5.3.2-2026-04-20T06-30`
- Photon `1.2.1` upstream release JAR
- Eclipse Temurin Java 21 pinned runtime
- Nginx `1.28.0-alpine3.21` localhost gateway
- Named Docker volumes for Nominatim/PostGIS, flatnode, Photon JAR, and Photon DB

There are no local Dockerfiles. Never change an image to `latest`.

## Host requirements

- Ubuntu 24.04 LTS, x86-64
- Docker Engine and Docker Compose v2
- `curl`, `tar`, `bzip2`, `md5sum`, `sha256sum`, `sed`
- Fast SSD/NVMe storage
- An application firewall that denies inbound TCP 5432, 8088, and 2322

Recommended baseline for the default India deployment:

- 8 vCPU
- 32 GB RAM
- 400 GB SSD/NVMe
- at least 200 GB free before an update

Install host dependencies:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl bzip2 coreutils tar
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Log out and back in after adding the Docker group.

## Initial installation

```sh
cd infrastructure/geocoding
cp .env.example .env
openssl rand -base64 48
openssl rand -hex 32
```

Put the first result in `POSTGRES_PASSWORD` and the second in
`ADDRESS_TOKEN_SECRET`. Keep `.env` readable only by the deployment user:

```sh
chmod 600 .env
chmod 750 scripts
chmod 750 scripts/*.sh
```

Download and import:

```sh
./scripts/download-osm.sh
./scripts/import-nominatim.sh
./scripts/import-photon.sh
./scripts/start.sh
```

`import-nominatim.sh` follows the import logs and may run for hours. It detects
an existing PostGIS cluster and refuses to overwrite it. `import-photon.sh`
verifies the database checksum before copying it into its named volume.

Verify host bindings:

```sh
docker compose --profile gateway ps
sudo ss -lntp | grep -E ':(8088|2322)'
```

Both listeners must show `127.0.0.1`, never `0.0.0.0` or `[::]`.

## Backend connection

The Node backend is the only public boundary. Put these values in the backend
environment on the same VPS:

```dotenv
PHOTON_BASE_URL=http://127.0.0.1:2322
NOMINATIM_BASE_URL=http://127.0.0.1:8088
ADDRESS_SERVICE_TIMEOUT_MS=6500
ADDRESS_CACHE_TTL_SECONDS=900
ADDRESS_CACHE_MAX_KEYS=5000
ADDRESS_TOKEN_SECRET=<same-independent-address-token-secret>
```

If the Node backend runs in Docker, do not use `127.0.0.1` from that container.
Attach it to the geocoding private network and route it through a private
service network, or use `host-gateway` with host firewall rules. Do not publish
the geocoders to solve container connectivity.

Browser and mobile clients must call only backend endpoints such as:

```text
https://api.esyglob.in/api/location/autocomplete/search
https://api.esyglob.in/api/location/autocomplete/resolve
https://api.esyglob.in/api/location/autocomplete/reverse
```

They must never call Nominatim or Photon directly.

## Health verification

```sh
./scripts/healthcheck.sh
```

The script verifies:

- PostgreSQL readiness
- installed PostGIS version
- Nominatim status
- Nominatim forward search
- Nominatim reverse geocoding
- Photon autocomplete
- Photon reverse geocoding

Set `BACKEND_HEALTH_URL` to a protected backend capability/health endpoint if
the operational environment supplies its required authentication.

## Backups

Create a backup:

```sh
./scripts/backup.sh
```

The backup contains:

- a compressed PostgreSQL custom-format dump
- Nominatim flatnode data
- Photon application JAR
- Photon search database
- manifest and SHA-256 checksums

Copy backups to separate encrypted object storage. A backup on the same VPS is
not disaster recovery. For large Asia/planet deployments, combine logical
database backups with crash-consistent provider volume snapshots.

Never run:

```text
docker compose down -v
```

That command permanently removes imported databases.

## Restore

List the backup ID:

```sh
cat backups/<timestamp>/manifest.env
```

Restore requires an exact confirmation:

```sh
RESTORE_CONFIRM=<backup-id> ./scripts/restore.sh backups/<timestamp>
```

The script validates every checksum, temporarily stops the localhost gateway,
restores PostGIS and named volumes, restarts services, and executes the full
health suite. Schedule a maintenance window because a full restore is not a
zero-downtime operation.

## Blue/green updates

Updates require enough free disk for two complete datasets. The update process:

1. Creates a backup of the active slot.
2. Downloads a new OSM extract.
3. Imports a new Nominatim/PostGIS candidate.
4. Downloads and verifies a new Photon database.
5. Starts candidate services on a separate private Docker network.
6. Validates search and reverse geocoding.
7. Connects the stable gateway to the candidate network.
8. Validates the gateway configuration and reloads Nginx.
9. Runs the complete post-cutover health suite.
10. Automatically restores the previous gateway configuration on failure.
11. Stops old containers but retains their volumes for rollback.

Run:

```sh
./scripts/update.sh
```

The Nginx reload is connection-preserving, so backend traffic continues during
cutover. Keep the old volumes for at least 24-72 hours. Remove an old candidate
only after identifying its exact project and taking a verified backup:

```sh
docker ps -a --filter label=com.docker.compose.project=<old-project>
docker volume ls --filter label=com.docker.compose.project=<old-project>
```

Do not automate deletion of old geocoder volumes.

## Dataset sizing

The following figures are planning ranges, not guarantees. OSM grows continuously
and import style materially changes storage.

| Dataset | Recommended RAM | Working disk | Typical import |
|---|---:|---:|---:|
| India (`address`) | 32 GB | 120-200 GB | 2-10 hours |
| Asia (`address`) | 64-96 GB | 400-700 GB | 18-48 hours |
| Planet (`address/full`) | 128 GB minimum | 1-1.5 TB NVMe | 2.5-5 days |

Photon currently needs roughly 0.6 GB for India, 9-10 GB for Asia, and 60-100 GB
for planet data. Blue/green updates need approximately twice the active dataset
plus download archives and backups.

For Asia:

```dotenv
OSM_PBF_URL=https://download.geofabrik.de/asia-latest.osm.pbf
OSM_PBF_FILE=asia-latest.osm.pbf
OSM_PBF_CHECKSUM_URL=https://download.geofabrik.de/asia-latest.osm.pbf.md5
PHOTON_DB_URL=https://download1.graphhopper.com/public/asia/photon-db-asia-1.0-latest.tar.bz2
PHOTON_DB_CHECKSUM_URL=https://download1.graphhopper.com/public/asia/photon-db-asia-1.0-latest.tar.bz2.md5
```

For planet, use an official OSM planet mirror, configure its published
checksum, provision at least 128 GB RAM and 1 TB NVMe, and increase the import
timeout. Do not attempt a planet import on the 32-GB application VPS.

## Performance

The Compose defaults are tuned for an 8-vCPU/32-GB India host:

- PostgreSQL `shared_buffers=4GB`
- `maintenance_work_mem=6GB`
- `work_mem=32MB`
- `effective_cache_size=20GB`
- `checkpoint_timeout=30min`
- `max_wal_size=8GB`
- Nominatim import threads: 7
- Photon heap: 8 GB

Do not increase all memory settings together. PostgreSQL `work_mem` is allocated
per operation, not per server. Monitor swap, OOM kills, disk latency, and free
space during imports.

## Scaling and reliability

- Keep Node response caching enabled to absorb repeated autocomplete queries.
- Scale Node API replicas before scaling the geocoders.
- Nominatim reads can be scaled only from a consistent replicated PostGIS
  dataset; do not run independent imports behind round-robin DNS.
- Photon can be replicated from the same verified database dump.
- For planet scale, separate Nominatim/PostGIS and Photon onto dedicated NVMe
  hosts and connect through WireGuard/private networking.
- Back up `.env`, gateway configuration, manifests, and database dumps off-host.
- Use provider snapshots before image, kernel, or Docker upgrades.

## Monitoring

Alert on:

- gateway health-check failure
- Nominatim or Photon container restart
- HTTP 5xx and timeout rate
- autocomplete/reverse latency p95 and p99
- disk usage above 75% and 85%
- inode exhaustion
- Postgres connection saturation
- host swap activity and OOM events
- backup age and checksum validation

Export Docker metrics through cAdvisor and host metrics through node_exporter,
both bound to a private monitoring network.

## Troubleshooting

### Import stopped

```sh
docker compose logs --tail 300 nominatim
docker inspect "$(docker compose ps -q nominatim)" \
  --format '{{.State.Status}} {{.State.OOMKilled}} {{.State.ExitCode}}'
df -h
free -h
```

Do not delete the volume. Correct disk/RAM problems and rerun with:

```sh
ALLOW_EXISTING_IMPORT=1 ./scripts/import-nominatim.sh
```

### Photon will not start

```sh
docker compose logs --tail 300 photon
docker volume inspect esyglob-geocoding_photon_app
docker volume inspect esyglob-geocoding_photon_data
```

Confirm the Photon major version matches the database dump (`1.x` with `1.0`
database dumps).

### Backend cannot connect

```sh
curl --fail http://127.0.0.1:8088/status
curl --fail 'http://127.0.0.1:2322/api?q=Delhi&limit=1'
./scripts/healthcheck.sh
```

If these pass, inspect the Node process environment and its network namespace.
Do not open firewall ports 8088/2322 as a workaround.

### Ports are public

Immediately set `GEOCODER_BIND_IP=127.0.0.1`, recreate only the gateway, and
verify with `ss`:

```sh
docker compose --profile gateway up -d --force-recreate gateway
sudo ss -lntp | grep -E ':(8088|2322)'
```

Also deny inbound TCP 5432, 8088, and 2322 in the VPS/provider firewall.
