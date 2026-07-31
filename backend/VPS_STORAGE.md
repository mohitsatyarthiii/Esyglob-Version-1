# VPS media storage

The Express backend owns all marketplace media through `StorageService`. In Linux production the default root is `/var/www/esyglob/storage`; development defaults to `backend/storage`.

## Deployment

Provision the root once for the same non-root account that runs PM2:

```bash
sudo install -d -m 0750 -o <pm2-user> -g <pm2-group> /var/www/esyglob/storage
```

Set these values in the deployed backend environment when the defaults do not match the host:

```dotenv
VPS_STORAGE_ROOT=/var/www/esyglob/storage
STORAGE_PUBLIC_BASE_URL=https://api.esyglob.in/storage
REMOTE_IMAGE_TIMEOUT_MS=12000
```

On every startup the backend creates all required child folders and performs a write probe. Public media is served only by Express under `/storage`; `verification` and `temp` are excluded and verification documents are streamed only after owner/admin authorization. Do not add a separate Nginx alias that bypasses these checks.

Runtime media and the seller-verification JSON backup are ignored by Git. Include both the storage root and `backups/seller-verification-backup.json` in encrypted VPS backups.

## Operational checks

```bash
npm run storage:validate:http
npm run storage:validate
```

The first command verifies optimized media delivery, cache/security headers, private-folder denial, and deletion. The second checks the migrated database and preserved account counts.
