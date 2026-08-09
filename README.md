# Enterprise Certificate Distribution & Magazine Results

A TypeScript monorepo for fortnightly Top 10 publication cycles, private certificate claiming, print exports, and irreversible time-based data retention. It includes a Next.js 16 admin/public app, NestJS 11 REST API, a MongoDB replica set for transactional storage, self-issued admin JWTs with Argon2id password hashing, an OS-level scheduled cleanup job, and deterministic server-side PDF/QR generation.

Only fictional development data is included. `certificate-demo.jpeg` is preserved as the approved certificate background; `magzine-cutout.jpeg` was used only as a layout reference.

## Repository

```text
apps/web        Next.js App Router, Tailwind, RHF/Zod, TanStack Query
apps/api        NestJS API, Swagger, RBAC, PDF/QR/export and cleanup services
packages/types  Shared Zod contracts and TypeScript types
packages/ui     Accessible shared primitives
packages/config Validated environment model
mongo           MongoDB index setup and initial administrator/template bootstrap
docs            Architecture, request/deletion diagrams, security boundaries
e2e             Playwright browser coverage
```

See [architecture and flows](docs/architecture.md) and [security boundaries](docs/security.md).

## Local setup

Requirements: Node 20.11+ (22 LTS recommended), npm 10+, and optionally Docker (for a local MongoDB replica set).

```bash
npm install
cp .env.example .env
npm run dev
```

With `DEMO_MODE=true`, the apps start without external credentials using fictional, process-local data. Open `http://localhost:3000/admin/login` and choose a demo role. This mode is for development only and intentionally does not persist changes.

Production-like MongoDB setup:

```bash
docker compose up mongo mongo-init -d
npm run seed
```

`npm run seed` requires `MONGODB_URI`, `INITIAL_ADMIN_EMAIL`, and `INITIAL_ADMIN_PASSWORD` in `.env`. MongoDB multi-document transactions (used for atomic candidate import and cycle purge) require a replica set; `docker-compose.yml` runs a single-node replica set for local use, which is sufficient — a production deployment should use a proper multi-node replica set for durability (a managed replica set such as MongoDB Atlas already satisfies this). Place the supplied `certificate-demo.jpeg` where `CERTIFICATE_TEMPLATE_PATH` points (defaults to the repo root). The seed script only creates indexes, the initial administrator (from `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD`), the approved certificate template record, and the default availability setting — it inserts no result cycles or candidates. It is safe to run against a real deployment and is idempotent (re-running it does not duplicate the admin or template).

## Environment variables

Copy `.env.example`. Required outside demo mode:

- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`: browser-visible origins only.
- `MONGODB_URI`: API-only, includes `replicaSet=` for transaction support. Never expose to the browser.
- `ADMIN_JWT_SECRET`: API-only, at least 32 random characters; signs and verifies administrator session tokens.
- `CANDIDATE_PHOTO_DIR`: API-only, local/mounted directory holding private candidate photos.
- `PUBLIC_SITE_URL`: base encoded in edition QR codes.
- `WEB_ORIGIN`: comma-separated CORS allowlist.
- `COOKIE_SECRET`: at least 32 random characters; signs public claim-session cookies (kept separate from `ADMIN_JWT_SECRET`).
- `INTERNAL_JOB_SECRET`: independent rotating cleanup credential.
- `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`: seed/bootstrap only; remove from runtime after use.

## Indexes, scheduled cleanup, and transactions

`Store.onModuleInit` creates the required unique/lookup indexes on startup (also mirrored in `mongo/seed/seed.mjs` for standalone seeding). Candidate import and cycle purge run inside MongoDB multi-document transactions (`session.withTransaction`), which is why a replica set is required even for a single node.

There is no in-database cron; schedule an hourly signed call to `POST /api/v1/internal/jobs/purge-expired-certificates` (header `x-internal-job-secret`) from an OS-level scheduler, a container sidecar, or your platform's cron/Task Scheduler equivalent. The API also compares server UTC with `expires_at` for every preview/download, so scheduler delay never extends access.

The purge deletes private photographs from local/mounted storage first, then runs an idempotent per-cycle transaction that removes claim sessions and download events, deletes candidates, and marks the cycle purged. A storage-success/transaction-failure retry is safe because removing already-missing files is harmless and the transaction re-checks the cycle's status before touching it. Purged cycles cannot transition back (enforced in the application layer, since MongoDB has no server-side triggers).

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

Build the included containers or deploy `apps/web` and `apps/api` separately. Terminate TLS at the platform, set `NODE_ENV=production`, keep API, MongoDB, and JWT secrets server-side, restrict origins, configure structured-log retention without bodies, add edge rate limiting/CAPTCHA, run MongoDB as a durable multi-node replica set with point-in-time (oplog) backups enabled, and monitor failed `cleanup_runs`. Set the QR base URL before publishing the first cycle; changing it later does not alter already printed QR artwork.

Database recovery can restore operational state only within the backup/oplog retention window. Do not use backup restoration to reintroduce candidate data whose legal eligibility period has expired; after a disaster recovery, immediately run the protected purge job before reopening public traffic. Physical backup retention is a deployment/privacy-policy boundary, not something the application can erase.

## Acceptance workflow

Create a draft, import the CSV template (including each candidate's mobile number), preview each certificate, publish, export QR/magazine artwork, claim from a private browser using a candidate's mobile number, and confirm a PDF download. Then shorten a test cycle through the explicit settings preview, call the cleanup job, and verify both public rejection and a `purged` cycle with zero candidates. CI performs lint, strict type-check, unit/integration tests, production builds and Chromium E2E coverage.
