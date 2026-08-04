# Enterprise Certificate Distribution & Magazine Results

A TypeScript monorepo for fortnightly Top 10 publication cycles, private certificate claiming, print exports, and irreversible time-based data retention. It includes a Next.js 16 admin/public app, NestJS 11 REST API, Supabase PostgreSQL/Auth/Storage migrations, hourly `pg_cron` integration, Argon2id credentials, and deterministic server-side PDF/QR generation.

Only fictional development data is included. `certificate-demo.jpeg` is preserved as the approved certificate background; `magzine-cutout.jpeg` was used only as a layout reference.

## Repository

```text
apps/web        Next.js App Router, Tailwind, RHF/Zod, TanStack Query
apps/api        NestJS API, Swagger, RBAC, PDF/QR/export and cleanup services
packages/types  Shared Zod contracts and TypeScript types
packages/ui     Accessible shared primitives
packages/config Validated environment model
supabase        Versioned schema, RLS, Storage, cron example, fictional seed
docs            Architecture, request/deletion diagrams, security boundaries
e2e             Playwright browser coverage
```

See [architecture and flows](docs/architecture.md) and [security boundaries](docs/security.md).

## Local setup

Requirements: Node 20.11+ (22 LTS recommended), npm 10+, and optionally Supabase CLI/Docker.

```bash
npm install
cp .env.example .env
npm run dev
```

With `DEMO_MODE=true`, the apps start without external credentials using fictional, process-local data. Open `http://localhost:3000/admin/login` and choose a demo role. This mode is for development only and intentionally does not persist changes.

Production-like Supabase setup:

```bash
supabase link --project-ref YOUR_PROJECT
supabase db push
npm run seed
```

Upload the supplied `certificate-demo.jpeg` to the private `certificate-templates` bucket as `certificate-demo.jpeg` (or mount it at `CERTIFICATE_TEMPLATE_PATH`). The seed command creates/updates the initial Supabase Auth user from `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`, inserts fictional cycles and candidates, and prints one-time demo claim codes. Do not run it against a live dataset.

## Environment variables

Copy `.env.example`. Required outside demo mode:

- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`: browser-visible origins only.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: administrator sign-in only; RLS still applies.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_ISSUER`: API-only. Never use a `NEXT_PUBLIC_` prefix for the service role.
- `PUBLIC_SITE_URL`: base encoded in edition QR codes.
- `WEB_ORIGIN`: comma-separated CORS allowlist.
- `COOKIE_SECRET`: at least 32 random characters.
- `INTERNAL_JOB_SECRET`: independent rotating cleanup credential.
- `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`: seed/bootstrap only; remove from runtime after use.

## Migrations, Cron and Vault

Migrations apply in timestamp order. `202608040001` creates normalized tables, constraints, RLS, import/purge transactions and advisory locking; `002` documents the hourly Vault/cron call; `003` creates private Storage buckets. Uncomment the cron statements only after storing the real API URL and rotating job secret in Vault. The suggested schedule (`17 * * * *`) runs hourly. The API also compares server UTC with `expires_at` for every preview/download, so cron delay never extends access.

The purge deletes private photographs first, then invokes an idempotent per-cycle database transaction. Cascades remove claim hashes, sessions and download events; the cycle retains only non-personal metadata and cleanup counts. A Storage-success/DB-failure retry is safe because removal of missing paths is harmless and the RPC is lock-protected. Purged cycles cannot transition back.

## Commands

```bash
npm run dev             # web :3000 + API :4000
npm run lint
npm run typecheck
npm test                # unit + repository integration tests
npx playwright install chromium
npm run test:e2e
npm run build
docker compose up --build
```

API documentation is at `http://localhost:4000/api/docs`; OpenAPI JSON is `/api/docs/openapi.json`. The public route is `/certificate/claim/{cycle-public-slug}`. Dates are stored in UTC and displayed in `Asia/Kolkata`.

## Certificate and magazine rendering

Certificates are A4 landscape PDFs streamed from the API with the unmodified supplied JPEG as a full-page background and dynamic fields positioned over its blanks. PDFKit embeds licensed Noto Sans Devanagari WOFF2 data so Hindi output is independent of host fonts. Magazine exports are A4 portrait at 2480×3508 pixels/300 DPI and PDF; QR codes use error correction H, four-module quiet space, and contain only the public cycle URL.

Before changing a template, use the admin preview with fictional sample data. Never upload new signatures through this application; approved artwork must arrive from the publication office. Templates referenced by published cycles are protected by foreign keys and application permissions.

## Production deployment

Build the included containers or deploy `apps/web` and `apps/api` separately. Terminate TLS at the platform, set `NODE_ENV=production`, keep API and Supabase secrets server-side, restrict origins, configure structured-log retention without bodies, add edge rate limiting/CAPTCHA, enable Supabase point-in-time recovery, and monitor failed `cleanup_runs`. Set the QR base URL before publishing the first cycle; changing it later does not alter already printed QR artwork.

Database recovery can restore operational state only within the provider backup window. Do not use backup restoration to reintroduce candidate data whose legal eligibility period has expired; after a disaster recovery, immediately run the protected purge job before reopening public traffic. Supabase physical backup retention is a deployment/privacy-policy boundary, not something the application can erase.

## Acceptance workflow

Create a draft, import the CSV template, save the one-time private credential sheet, preview each certificate, publish, export QR/magazine artwork, claim from a private browser, and confirm a PDF download. Then shorten a test cycle through the explicit settings preview, call the cleanup job, and verify both public rejection and a `purged` cycle with zero candidates. CI performs lint, strict type-check, unit/integration tests, production builds and Chromium E2E coverage.
