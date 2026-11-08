# Implementation status

Updated 8 November 2026. Scope: **Stage 1 of 6 only**.

## Completed foundation

- npm workspaces; independently runnable Next.js App Router frontend and Express REST API.
- TypeScript with strict checking, shared Zod schemas, ESLint, Prettier, lockfile, and local configuration generator.
- Original editable SVG care-path / D identity: horizontal and inverse lockups, compact mark, browser icon, and shared React brand component.
- Warm paper surfaces, dark ink, restrained forest green, self-hosted DM Sans and Manrope, editorial type hierarchy, responsive CSS, visible focus, reduced-motion support.
- Public landing page; login, invitation signup, manual TOTP enrollment, MFA challenge, recovery-code flow; responsive protected navigation for dashboard, doctors, and patients.
- No doctor/patient CRUD, fabricated clinical records, statistics, or analytics. Reserved routes clearly identify their future scope.
- Public GitHub source: <https://github.com/akonBRO/doctor_tracker>. The owner selected the existing underscore repository as `origin`. Commit and push completed updates there.

## Architecture and dependencies

`apps/web` uses Next.js 16.4.5 / React, CSS custom properties, Lucide icons, and a small typed fetch client. Browser requests to `/api/v1/*` are rewritten to `apps/api`; there are no Next.js backend routes, Server Actions, or database clients. `API_ORIGIN` is server-only.

`apps/api` uses Express 5.3, Mongoose 9.12, Zod, Argon2, JOSE, otplib 13.6, Helmet, express-rate-limit, and privacy-conscious Pino logging. Shared input schemas/types live in `packages/shared`. Production dependency versions are fixed by `package-lock.json`.

MongoDB must be Atlas or a replica set: transactions make invitation consumption, MFA challenge consumption, recovery-code use, and session rotation atomic. Startup checks transaction support, connects a bounded pool, creates required indexes, and fails closed. SIGINT/SIGTERM close HTTP and database connections.

## Models and indexes

- `Admin`: unique normalized email, Argon2id hash, admin role, disabled flag, MFA state, AES-256-GCM encrypted secret, monotonic last-accepted TOTP step, hashed recovery codes. Sensitive fields are excluded from ordinary queries.
- `Invitation`: unique token hash, bound email, explicit expiry, consumed timestamp, TTL index.
- `Challenge`: unique token hash, admin reference, enroll/verify purpose, five-minute expiry, attempt counter, TTL index.
- `Session`: unique refresh hash, admin reference, indexed family identifier, rotation and revocation timestamps, absolute expiry, TTL index. Retain rotated receipts until absolute family expiry for replay detection.

Expiry is checked in queries; TTL cleanup is not an authorization check. Doctors and Patients will be managed records, each with its own MongoDB identifier; Patients will reference a validated Doctor identifier. Neither will be an authentication account.

## API contract

All responses use `{ data }` or `{ error: { code, message, fields?, requestId? } }`. Auth responses and health are not cached.

| Method | Endpoint                     | Behavior                                                             |
| ------ | ---------------------------- | -------------------------------------------------------------------- |
| GET    | `/api/v1/health`             | Database readiness; 503 if disconnected                              |
| GET    | `/api/v1/auth/csrf`          | Signed double-submit token and HttpOnly cookie                       |
| POST   | `/api/v1/auth/signup`        | Atomically consume email-bound invitation and create pre-MFA admin   |
| POST   | `/api/v1/auth/login`         | Password verification; pre-MFA challenge only                        |
| GET    | `/api/v1/auth/mfa/challenge` | Validate challenge and return enrollment/verification step           |
| POST   | `/api/v1/auth/mfa/setup`     | Authenticator-compatible manual setup key; enrollment challenge only |
| POST   | `/api/v1/auth/mfa/verify`    | Real TOTP verification; session only after success                   |
| POST   | `/api/v1/auth/mfa/recovery`  | Consume one hashed recovery code after password verification         |
| POST   | `/api/v1/auth/refresh`       | Rotate opaque refresh token; replay revokes whole family             |
| POST   | `/api/v1/auth/logout`        | Revoke session family, invalidate challenge, clear cookies           |
| GET    | `/api/v1/auth/me`            | Verify JWT, active database session, admin role and enabled MFA      |

## Authentication and authorization

Invitations are issued only through a trusted local CLI with database access. No default admin or public privilege-granting endpoint exists. Invitation URLs use fragments so the token is not transmitted in URL paths/query strings; the frontend removes the fragment after loading and holds it only in memory.

Passwords require 12–128 characters, letters, and numbers/symbols. Argon2id uses 64 MiB, three iterations, one lane. Unknown accounts run a dummy password verification; login messages are generic. Challenges expire after five minutes and allow at most five verification attempts, with per-IP and per-account limits.

TOTP uses 30-second SHA-1 six-digit codes with a 30-second clock tolerance. A monotonic, atomically updated counter blocks accepted-code replay. Secrets are encrypted using AES-256-GCM with independent environment keys. Eight 64-bit random recovery codes are returned once; only SHA-256 hashes persist. Recovery still requires a valid password challenge.

Access JWTs expire after five minutes by default and validate HS256, issuer, audience, expiry, subject, session, role, and MFA claims. Every protected API read also checks the database account and session, so revocation is immediate. Refresh tokens are 256-bit random opaque values, stored as SHA-256 hashes, with a seven-day absolute family lifetime by default. Refresh cannot extend that absolute lifetime.

Production cookies use Secure, HttpOnly, SameSite=Strict, Path=/, no Domain, and `__Host-` names. Development permits HTTP localhost cookies. No auth state is stored in localStorage/sessionStorage. The server layout checks identity through Express; expired access cookies use a client gate to refresh before revealing the workspace. Safe identity reads can retry after refresh; mutations never automatically replay.

## Verification record

- Passed: strict application type checks, ESLint with zero warnings, and production builds of shared package, Express, and Next.js.
- Passed: **23 backend/security integration tests** against an actual disposable MongoDB replica set, with real password hashing, crypto, OTPs, and transactions.
- Passed: production dependency audit with zero known vulnerabilities. A scoped override moves the development-only typescript-eslint minimatch dependency to its patched 11.x release; lint verifies compatibility. ESLint 9 remains for compatibility with Next.js's current React/a11y lint plugins.
- Passed: **8 production Chromium browser tests** at 1440, 768, 375, and 320 pixels, including actual invitation registration, TOTP enrollment, recovery-code acknowledgment, access-cookie expiry and refresh, protected navigation, logout, and unauthenticated redirects. Landing/workspace accessibility scans report zero WCAG A/AA violations and all checked views have no horizontal overflow. Screenshots are committed under `docs/screenshots`.
- Passed: strict type checking includes test and tooling sources. Final security review and command-line startup/provisioning smoke checks are being completed before the final handoff.

## Limits and next stages

- No deployment has been performed. Atlas connectivity, real HTTPS hosting, horizontal scaling, and production proxy behavior still require deployment-environment validation.
- No persistent local MongoDB is installed in the current workspace. The disposable database supports development/testing; use Atlas or the documented Docker replica set to retain accounts. Docker configuration is provided but has not been run here.
- Rate-limit stores are local to one API process. A shared store is required before multi-instance deployment; see `SECURITY.md`.
- There is no email delivery, password-reset service, MFA-reset endpoint, upload, webhook, external URL fetcher, doctor/patient API, or reporting engine. These are outside this stage.
- Stage 2 can extend the authenticated shell and add Doctor management. Later stages must validate Doctor/Patient IDs and relationships, enforce record authorization in backend queries, and add indexed search/filter/pagination and real analytics.

See `SECURITY.md` for the Stage 1 security checklist and deployment/rotation instructions. The root README contains setup, API usage, architecture decisions, and visual evidence.
