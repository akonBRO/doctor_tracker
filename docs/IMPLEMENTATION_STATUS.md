# Implementation status

## Stage 2 — Doctor Management (current)

Implemented and locally verified 8 November 2026. Production and development regressions pass. Final GitHub commit/CI state is reported in the handoff and visible in the workflow. Stages 3–6 are not implemented.

- **Data/API:** Doctor model with five required fields, timestamps, derived normalized keys/tokens, schema validation and six purposeful indexes. International names/phone formatting are supported; contact fields are not unique. Creation, directory, detail and bounded real-value suggestion endpoints are all protected by verified administrator/MFA/session checks. No doctor authentication accounts, edits or deletions are introduced.
- **Queries:** Unicode, case-insensitive word-prefix search over name/specialization/hospital; exact normalized practice filters; inclusive UTC creation-date ranges; stable allowlisted name/date sorts with `_id` tie-breaks; database-side projection/lean pagination and exact filtered counts. Page size 1–50, pages 1–10,000, query execution budget 3 seconds. Empty/out-of-range semantics are documented. General API limits remain; writes additionally have a 60-attempt/15-minute per-admin budget.
- **Frontend:** `/doctors`, `/doctors/new`, `/doctors/[doctorId]`; original brand, authentication and shell retained, with nested Doctor navigation active. A compact table becomes structured stacked records on narrow screens. Controlled forms preserve failed-save drafts, focus field errors, prevent duplicate submits, restore access before writes, and never automatically replay writes. Explicit feedback covers unavailable/uncertain service outcomes, expired sessions and successful creation.
- **State:** URL-based criteria, sort and pages; refresh/back/forward/validated return links; 300 ms debounced reads, AbortController and obsolete-result guards. Criteria changes reset page one; filter reset preserves valid sort/page-size preferences. Doctor responses are no-store and no record/token data is persisted in browser storage. The test fixture rejects production web builds pointing outside its disposable API.
- **Security:** All existing Stage 1 controls remain. Doctor schemas allowlist every body/query field and identifier; auth query restrictions remain unchanged. NoSQL/prototype/regex defenses, CSRF/Origin/CORS, resource access, safe DTOs, escaped doctor text, request budgets, hidden production source maps and privacy-conscious logs cover the new surfaces. Uploads, webhooks and arbitrary URL fetchers remain absent.
- **Measured indexing:** The 250-record fixture returns 10 newest records using 10 keys/10 documents, 10 specialization matches using 10/10, and one selective prefix match using 2 keys/1 document. All natural winning plans use IXSCAN; prefix results still sort. No production performance gain is asserted. Exact empty-filter counts use `_id`; suggestions group distinct normalized values with deterministic labels and return at most 20. See `doctor-query-plans.json` and `DOCTOR_MANAGEMENT.md`.
- **Verification passed:** `npm test` — **72 tests** (24 Stage 1 + 48 Doctor cases); `npm run typecheck`; `npm run lint` with zero warnings; `npm run build`; formatting; full and production-only audits with zero vulnerabilities. No new dependencies were added.
- **Production browser verification passed:** **8 Chromium tests** at 1440/768/375/320 px, retaining Stage 1 invitation/MFA/recovery/two-tab refresh/logout checks and adding real doctor creation, empty/directory/detail states, validation, duplicate-submit blocking, draft recovery, combined filters, pagination, date semantics, URL refresh/back/forward, reset preferences, cancellation, safe XSS text rendering, invalid/missing IDs, loading and retry. Successful operations use actual Express/MongoDB; only explicit error/latency scenarios intercept responses. Axe scans of directory/create/detail and existing routes report no WCAG A/AA violations; checked views have no horizontal overflow. Twelve new production screenshots cover all three doctor surfaces at all four widths.
- **Development browser verification passed:** the same **8 expanded browser tests** pass against Next.js development/Strict Mode at all four widths, including cancellation, duplicate-submit blocking, filter history and preserved drafts.
- **Documentation:** README, security checklist, this continuity record, detailed Doctor Management contracts/decisions and captured query plans are updated. Backend checkpoint `a5cf094` was pushed to `origin/main` and passed GitHub Actions. Check the [workflow](https://github.com/akonBRO/doctor_tracker/actions/workflows/ci.yml) and `git log -1` for the full UI/verification commit and final CI state. Updates use normal commits/pushes; no history is rewritten.

### Stage 3 integration and current limits

Doctor details have an explicitly unavailable patient section, with no fabricated rows or counts. Stage 3 should add Patient `_id` plus required indexed `doctorId` referencing Doctor, implement authenticated parent-scoped patient reads/creation/removal, validate both IDs and parent existence, and query patients with both identifiers. Replace the unavailable message only after those APIs and real persistence exist. Exact planned routes and integration contracts are in `DOCTOR_MANAGEMENT.md`.

No Patient model/API, patient analytics, doctor edit/delete, deployment, production Atlas/HTTPS/proxy validation, persistent storage provisioning or multi-instance rate-store configuration is delivered by this stage. Search is word-prefix (not fuzzy/substring/accent-insensitive); offsets/counts may need workload-based changes at scale, and independent row/count reads are not a point-in-time snapshot. Form guards cover unload and explicit cancel/back; deliberate workspace navigation unmounts the draft. Uncertain network writes require checking the directory before resubmission; server idempotency keys are not added. Application-level access currently covers all doctors in one shared admin workspace; future tenancy must add consistent query scoping before use.

## Stage 1 baseline (historical scope and verification)

Updated 8 November 2026. Scope: **Stage 1 of 6 only**. Implementation and local verification complete; deployment-specific checks remain below.

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

Production cookies use Secure, HttpOnly, SameSite=Strict, Path=/, no Domain, and `__Host-` names. Development permits HTTP localhost cookies. No auth state is stored in localStorage/sessionStorage. The server layout checks identity through Express; expired access cookies use a client gate to refresh before revealing the workspace. Safe identity reads can retry after refresh; mutations never automatically replay. Web Locks serialize refreshes across tabs in supported browsers. Older browsers without Web Locks may require signing in again if concurrent refreshes trigger strict replay protection.

## Verification record

- Passed: strict application type checks, ESLint with zero warnings, and production builds of shared package, Express, and Next.js.
- Passed: **24 backend/security integration tests** against an actual disposable MongoDB replica set, with real password hashing, crypto, OTPs, and transactions, including logout when a refresh cookie is missing.
- Passed: production dependency audit with zero known vulnerabilities. A scoped override moves the development-only typescript-eslint minimatch dependency to its patched 11.x release; lint verifies compatibility. ESLint 9 remains for compatibility with Next.js's current React/a11y lint plugins.
- Passed: **8 production Chromium browser tests** at 1440, 768, 375, and 320 pixels, including actual invitation registration, TOTP enrollment, recovery-code acknowledgment and recovery login, access-cookie expiry and two-tab refresh, protected navigation, logout, and unauthenticated redirects. Landing, restricted signup, account signup, login, enrollment, and workspace accessibility scans report zero WCAG A/AA violations. Checked views have no horizontal overflow; keyboard skip navigation works. Production screenshots are committed under `docs/screenshots`.
- Passed: the same **8 browser tests in development mode**, covering Strict Mode's effect replay. Invitation fragment consumption is explicitly guarded against a second effect execution.
- Passed: strict type checking for apps, shared schemas, tests and tooling; lint with zero warnings; formatting; full and production-only audits with zero vulnerabilities. Direct dependency versions are pinned to the tested lockfile versions.
- Passed: standalone compiled API startup and `/health`; privileged invitation CLI link generation and hashed-token persistence against a real local disposable replica set. Temporary CLI test invitation was removed and owned servers stopped afterward. Initial local database startup encountered a transient replica-set initialization failure; the retry and subsequent database/API/CLI operations succeeded.
- Completed: Stage 1 security review against items A–R in `SECURITY.md`. Deployment/infrastructure checks remain explicitly out of scope. GitHub Actions runs the same verification sequence; its first run caught formatting of a generated Next.js declaration file, now excluded from source formatting and Git tracking.

## Limits and next stages

- No deployment has been performed. Atlas connectivity, real HTTPS hosting, horizontal scaling, and production proxy behavior still require deployment-environment validation.
- No persistent local MongoDB is installed in the current workspace. The disposable database supports development/testing; use Atlas or the documented Docker replica set to retain accounts. Docker configuration is provided but has not been run here.
- Rate-limit stores are local to one API process. A shared store is required before multi-instance deployment; see `SECURITY.md`.
- There is no email delivery, password-reset service, MFA-reset endpoint, upload, webhook, external URL fetcher, doctor/patient API, or reporting engine. These are outside this stage.
- Stage 2 can extend the authenticated shell and add Doctor management. Later stages must validate Doctor/Patient IDs and relationships, enforce record authorization in backend queries, and add indexed search/filter/pagination and real analytics.

See `SECURITY.md` for the Stage 1 security checklist and deployment/rotation instructions. The root README contains setup, API usage, architecture decisions, and visual evidence.
