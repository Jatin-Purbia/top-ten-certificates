# Security assumptions and boundaries

- Administrator identity comes from Supabase Auth. The API validates JWTs and reads the current role from `admin_profiles`; browser role claims are never authoritative.
- All exposed tables use RLS. Candidate PII, claim hashes, sessions, download events and all writes intentionally have no browser policies. Only the backend service role reaches them.
- Claim codes use Argon2id and are returned only at creation/reset. Logs redact credentials, candidate imports, cookies and authorization headers.
- Public errors do not distinguish an unknown participant from an invalid code. Per-IP and hashed-participant throttling locks repeated failures. A production edge/WAF CAPTCHA can be added after the API returns `429`.
- Public sessions are signed, short-lived, HttpOnly, Secure in production and SameSite Strict. Download is additionally bound to a CSRF token.
- PDFs are generated server-side from the approved background with an embedded Noto Sans Devanagari font. No claim credential is placed in the PDF metadata or filename.
- The API CORS allowlist, Helmet headers, body limits, upload allowlists and private buckets must remain enabled in production. Rotate `COOKIE_SECRET` and `INTERNAL_JOB_SECRET` through the deployment secret manager.
- Database backups may contain candidate records until Supabase backup retention expires. The live application irreversibly deletes records at expiry; physical backup destruction follows the provider retention contract and must be reflected in the privacy notice.
