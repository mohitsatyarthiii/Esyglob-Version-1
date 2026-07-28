# EsyGlob self-hosted address platform

This stack keeps Photon and Nominatim private. Web, mobile, and admin clients
must call the EsyGlob backend only. The backend is the public HTTPS boundary.

## Capacity planning

Start with the countries/regions EsyGlob serves. A worldwide Nominatim import
currently needs roughly 1 TB of fast NVMe storage and a high-memory host; Photon
adds roughly 95 GB. For a full planet deployment, use a dedicated geocoding VPS
with at least 128 GB RAM. Do not attempt a planet import on the application VPS.

## Fresh VPS deployment

Requirements: Ubuntu 24.04, Docker Engine with Compose v2, `curl`, and adequate
NVMe storage.

```sh
cd infrastructure/geocoding
cp .env.example .env
# Edit every value, especially POSTGRES_PASSWORD and the selected OSM extract.
chmod +x scripts/*.sh nominatim/entrypoint.sh photon/entrypoint.sh
./scripts/download-osm.sh
./scripts/import-nominatim.sh
./scripts/import-photon.sh
docker compose up -d
./scripts/healthcheck.sh
```

The imports are intentionally explicit and idempotence-protected by persistent
Docker volumes. Back up `postgis_data`, `nominatim_project`, and `photon_data`
before upgrades. Never run `docker compose down -v` in production.

## Backend configuration

When the backend is on the same VPS:

```dotenv
PHOTON_BASE_URL=http://127.0.0.1:2322
NOMINATIM_BASE_URL=http://127.0.0.1:8088
ADDRESS_SERVICE_TIMEOUT_MS=6500
ADDRESS_CACHE_TTL_SECONDS=900
ADDRESS_CACHE_MAX_KEYS=5000
ADDRESS_TOKEN_SECRET=CHANGE_ME_32_OR_MORE_RANDOM_CHARACTERS
```

When both are attached to the Compose `geocoding` network, use service names:
`http://photon:2322` and `http://nominatim:8088`. If geocoders are on another
VPS, expose them only over a private VPN/firewall network and use private HTTPS
hostnames. Do not expose ports 2322, 8088, or 5432 to the public internet.

After updating backend environment variables, restart the backend and verify:

```sh
curl --fail https://api.esyglob.in/api/location/autocomplete/capabilities \
  -H "Authorization: Bearer <test-token>"
```

## Updates and rollback

OSM extracts change daily. Test new Nominatim and Photon volumes alongside the
active stack, run health checks and representative searches, then switch the
backend URLs. Retain the previous volumes until production checks pass. Pin
container and Photon versions; never deploy `latest`.
