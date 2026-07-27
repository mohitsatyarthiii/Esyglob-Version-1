# EsyGlob Admin Dashboard

Enterprise marketplace operations dashboard for EsyGlob.

## Local development

1. Start the existing backend on port `5000`.
2. The tracked `.env.development` sends browser requests to the same-origin
   `/api` path and configures Vite to proxy it to the local backend. Override
   `ADMIN_API_PROXY` in `.env.local` only when the backend uses another local
   address:

   ```env
   ADMIN_API_PROXY=http://localhost:5000
   ```

3. Run:

   ```bash
   npm install
   npm run dev
   ```

The dashboard uses the existing EsyGlob session cookie and only permits users with the `admin` role.

## Netlify production

The repository-level `netlify.toml` builds this directory and publishes `dist`.
Production browser requests use `/api`; Netlify securely proxies those requests
to `https://api.esyglob.in/api`. Do not point the frontend at
`api.esyglob.com`: that hostname is not present on the API server certificate.

Netlify compression is automatic. Hashed Vite assets use immutable caching,
while `index.html` is revalidated so new deployments are picked up immediately.

## Phase 1 modules

- Operational dashboard
- Users and sellers
- Seller verification
- Products and categories
- Orders and payments
- Coupons and gift cards

CRUD workflows use shared data-table, drawer and confirmation components. All admin APIs are mounted below `/api/admin` and protected by the existing authentication and role middleware.
