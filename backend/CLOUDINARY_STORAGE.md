# Multi-account Cloudinary storage

All backend uploads use `src/services/upload.service.js`. It preserves the existing
upload result contract (`url`, `storageProvider`, `storageKey`, file metadata) while
routing uploads through any number of configured Cloudinary accounts.

## Configuration

The existing single-account variables remain supported and are treated as the
highest-priority account:

```env
CLOUDINARY_CLOUD_NAME=primary-cloud
CLOUDINARY_API_KEY=replace-me
CLOUDINARY_API_SECRET=replace-me
```

Additional accounts can be supplied with numbered variables. Account numbers are
sorted numerically and there is no fixed upper limit:

```env
CLOUDINARY_ACCOUNT_2_CLOUD_NAME=secondary-cloud
CLOUDINARY_ACCOUNT_2_API_KEY=replace-me
CLOUDINARY_ACCOUNT_2_API_SECRET=replace-me
CLOUDINARY_ACCOUNT_2_ENABLED=true

CLOUDINARY_ACCOUNT_3_CLOUD_NAME=tertiary-cloud
CLOUDINARY_ACCOUNT_3_API_KEY=replace-me
CLOUDINARY_ACCOUNT_3_API_SECRET=replace-me
```

For container and secret-manager deployments, an unlimited JSON list is also
supported:

```env
CLOUDINARY_ACCOUNTS_JSON=[{"id":"cloud-a","cloudName":"cloud-a","apiKey":"replace-me","apiSecret":"replace-me"},{"id":"cloud-b","cloudName":"cloud-b","apiKey":"replace-me","apiSecret":"replace-me"}]
```

The legacy account is attempted first, followed by JSON accounts and then numbered
accounts. Duplicate cloud-name/API-key pairs are removed automatically.

Optional tuning:

```env
# Time before an account that hit a quota or transient failure is attempted again.
CLOUDINARY_FAILOVER_COOLDOWN_MS=300000

# Maximum time for one Cloudinary upload attempt.
CLOUDINARY_UPLOAD_TIMEOUT_MS=30000
```

## Failover behavior

- Uploads start with the first healthy account.
- Quota, storage, bandwidth, rate-limit, account/API availability, timeout and
  Cloudinary 5xx failures move immediately to the next account.
- Invalid upload requests are returned without repeating the same bad request
  against every account.
- An unhealthy account enters a configurable cooldown, avoiding repeated slow
  failures on subsequent requests.
- If every account is cooling down, the service makes a best-effort pass rather
  than rejecting an upload without trying.
- If all configured accounts fail, the API returns HTTP 503 with
  `CLOUDINARY_ACCOUNTS_EXHAUSTED`.

Health is tracked in process memory and is available through
`UploadService.getAccountHealth()` for a future authenticated admin/monitoring
endpoint. It includes status, last success, last failure, total and consecutive
failure counts, cooldown time and the last sanitized error. Credentials are never
logged or returned.

Structured attempt logs use the `[UploadService]` prefix and include request ID,
account ID, cloud name, folder, attempt/retry count, duration and outcome.

Existing Cloudinary URLs and public IDs are unchanged and require no migration.
