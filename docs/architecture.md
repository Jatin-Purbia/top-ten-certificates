# Architecture and operational flows

```mermaid
flowchart LR
  Parent[Parent / candidate] --> Web[Next.js public portal]
  Admin[Administrator] --> Web
  Web -->|REST /api/v1| API[NestJS API]
  API --> Auth[Self-issued admin JWT + Argon2id]
  API --> DB[(MongoDB replica set)]
  API --> Storage[Private local/mounted photo storage]
  API --> PDF[Deterministic PDF / QR renderers]
  Cron[External scheduler] -->|signed hourly POST| API
```

## Entity relationship overview

```mermaid
erDiagram
  ADMIN_PROFILES ||--o{ RESULT_CYCLES : creates
  CERTIFICATE_TEMPLATES ||--o{ RESULT_CYCLES : renders
  RESULT_CYCLES ||--o{ CANDIDATES : contains
  CANDIDATES ||--o{ CLAIM_SESSIONS : authorizes
  CANDIDATES ||--o{ CERTIFICATE_DOWNLOAD_EVENTS : records
  RESULT_CYCLES ||--o{ CLEANUP_RUNS : purges
  ADMIN_PROFILES ||--o{ AUDIT_LOGS : performs
```

Each box is a MongoDB collection rather than a SQL table; `CANDIDATES` documents are looked up directly by `cycleId` + `phone` (a unique compound index), so there is no separate credentials collection.

## Claim request flow

```mermaid
sequenceDiagram
  participant P as Parent
  participant W as Web
  participant A as API
  participant D as MongoDB
  P->>W: Scan edition QR
  W->>A: Read public cycle metadata
  P->>A: Mobile number
  A->>A: Rate limit
  A->>D: Look up candidate by cycleId + phone
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
  B -- yes --> S[Delete private photo files]
  S --> T[MongoDB multi-document transaction]
  T --> C[Cascade-delete sessions and download events]
  C --> P[Mark cycle purged; retain non-PII count]
  S -. retry is safe .-> S
  T -. re-checks status; returns zero after purge .-> T
```

Photo deletion happens before the database transaction. Removing already-missing private files is retry-safe. The transaction re-reads the cycle's status before mutating anything, so a retry after a failed transaction is safe and a repeat call after a successful purge is a no-op. PDFs are streamed on demand, so there is no certificate cache to purge.
