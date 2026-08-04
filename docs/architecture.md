# Architecture and operational flows

```mermaid
flowchart LR
  Parent[Parent / candidate] --> Web[Next.js public portal]
  Admin[Administrator] --> Web
  Web -->|REST /api/v1| API[NestJS API]
  API --> Auth[Supabase Auth]
  API --> DB[(Supabase PostgreSQL + RLS)]
  API --> Storage[Private Supabase Storage]
  API --> PDF[Deterministic PDF / QR renderers]
  Cron[pg_cron + Vault] -->|signed hourly POST| API
```

## Entity relationship overview

```mermaid
erDiagram
  ADMIN_PROFILES ||--o{ RESULT_CYCLES : creates
  CERTIFICATE_TEMPLATES ||--o{ RESULT_CYCLES : renders
  RESULT_CYCLES ||--o{ CANDIDATES : contains
  CANDIDATES ||--|| CANDIDATE_CLAIM_CREDENTIALS : protects
  CANDIDATES ||--o{ CLAIM_SESSIONS : authorizes
  CANDIDATES ||--o{ CERTIFICATE_DOWNLOAD_EVENTS : records
  RESULT_CYCLES ||--o{ CLEANUP_RUNS : purges
  ADMIN_PROFILES ||--o{ AUDIT_LOGS : performs
```

## Claim request flow

```mermaid
sequenceDiagram
  participant P as Parent
  participant W as Web
  participant A as API
  participant D as PostgreSQL
  P->>W: Scan edition QR
  W->>A: Read public cycle metadata
  P->>A: Reference ID + private code
  A->>A: Rate limit + Argon2id verify
  A->>D: Store hash of short-lived session
  A-->>P: Signed HttpOnly SameSite cookie + CSRF token
  P->>A: Preview / download
  A->>A: Check server time on every request
  A-->>P: Stream candidate-scoped A4 PDF
```

## Deletion and retry flow

```mermaid
flowchart TD
  A[Hourly signed job] --> B{Cycle expired by server UTC?}
  B -- no --> Z[Skip]
  B -- yes --> L[Acquire per-cycle advisory lock]
  L --> S[Delete private Storage objects]
  S --> T[Transactional DB purge RPC]
  T --> C[Cascade credentials, sessions and events]
  C --> P[Mark cycle purged; retain non-PII count]
  S -. retry is safe .-> S
  T -. retry returns zero after purge .-> T
```

Storage deletion happens before the database transaction. Removing already-missing private objects is retry-safe. If the DB transaction fails, a retry finishes the purge. PDFs are streamed on demand, so there is no certificate cache to purge.
