# Security model and checklist

This is an application foundation, not a claim of regulatory compliance or a penetration-test certification. Do not store real patient information until the applicable record security, operating controls, backups, and deployment review are complete.

## Stage 6 production safeguards

Production startup requires explicit proxy hops and one declared API instance, verified MongoDB TLS and a named database, Secure cookies and exact HTTPS origin. Larger process counts, incompatible concurrency/PM2 settings and TLS verification bypasses fail validation. Application declarations do not detect an undisclosed second host; deployment must enforce one API instance until shared rate stores are implemented and tested. Existing global/account/MFA limits remain, including rejected-request accounting.

Production database startup disables automatic collection creation and verifies required indexes without creating, syncing or dropping them. The separately approved privileged preparation CLI requires `--apply-indexes`; it is not invoked against Atlas by tests or deployment automation. No schema/index migration is needed for Stage 6. Production API start uses injected environment and requires production mode; local env-file startup is explicit.

Web build/start requires explicit origins and HTTPS, rejects built API rewrite/security-header transport drift and retains server-only identity checks. Loopback HTTP production testing requires an explicit opt-in that cannot enable remote HTTP origins. Existing no-store behavior, mandatory MFA, rotation, CSRF/CORS, host-only cookies and source-map restrictions remain. Probe responses expose generic status only. Runtime shutdown drains before disconnecting, with bounded failure and sanitized lifecycle/database event logs.

The isolated operational rehearsal uses actual production configuration, explicit-CA TLS, an HTTPS proxy and real browser invitation/MFA/refresh/CRUD/logout/recovery against disposable MongoDB. Restored BSON/index metadata and encrypted MFA are exercised, without any Atlas mutation. Browser trust for the temporary certificate and the local MongoDB TLS bridge are explicitly documented simulation boundaries; final public TLS/proxy/backups require manual verification. See [Stage 6 evidence](STAGE6_DEPLOYMENT_READINESS.md), [approval gate](DEPLOYMENT_READINESS.md) and [release/recovery runbook](PRODUCTION_DEPLOYMENT_RUNBOOK.md). No production deployment or live secret rotation is performed.

## Stage 5 audit and hardening

The [Stage 5 quality audit](STAGE5_QUALITY_AUDIT.md#security-audit-matrix--all-20-controls) records all 20 requested controls, source/test evidence, remediation and remaining limits. This is a local code/integration/browser audit, not a penetration-test or compliance certification.

Three reproduced availability defects were fixed: global rate limiting now runs before CORS/body/CSRF processing so rejected mutations consume the budget; unsafe-key inspection is iterative and bounded to depth 32 / 10,000 object nodes; known-disconnected database requests return sanitized 503 before Mongoose buffering. Health remains available and stateless CSRF issuance remains possible. Existing body sizes, endpoint/account/MFA budgets, authentication and authorization remain intact. The single-process memory-store limitation remains.

Each browser HTTP exchange, including response-body parsing, now has a 15-second deadline. Caller cancellation stays distinct. Missing/malformed envelopes return sanitized errors; uncertain writes require checking current state and are never automatically replayed. A refresh chain can contain multiple bounded exchanges. Existing no-store behavior, HttpOnly cookies and in-memory-only CSRF handling are retained.

The original 204 API cases remain, with three new abuse/outage cases and seven client transport regressions (214 total tests). Browser accessibility checks include WCAG 2.2 AA-tag rules. Full and production-only npm audits reported zero vulnerabilities on 9 November 2026; this is not a guarantee against future advisories. No runtime dependency, persistent environment value, secret, Atlas record or encryption key was changed. See [Deployment Readiness](DEPLOYMENT_READINESS.md) for the Stage 6 HTTPS/proxy/cookie, process-count, backup/recovery and operational gates.

## Stage 4 analytics controls

Every analytics endpoint uses the existing verified administrator/MFA/database-session guard, plus service-level role checks. The authorization scope remains the shared admin workspace; query parameters cannot supply tenant/resource scopes or arbitrary aggregate stages. Strict schemas bound periods to 7/30/90 days and distribution pages to at most 20 doctors. Unsupported query keys, operators, repeated parameters, arbitrary sort fields and identifiers are rejected.

Analytics uses read-only GET routes, no-store responses and a 60-request/minute per-admin budget alongside the existing global rate limit. Safe reads reuse the existing single-flight session rotation; mutations retain CSRF, exact Origin and no automatic replay. Existing restricted CORS, nonce CSP, secure-cookie configuration, hashing, MFA and environment secrets remain.

Responses project only aggregate counts/date buckets and necessary doctor ID/name labels. Patient identities, phones, addresses, conditions, medical text and emergency details are absent from DTOs/logs. Joins count inside MongoDB rather than returning Patient arrays. Three-second query limits, bounded output and sanitized retriable errors contain failures without leaking raw database messages. Runtime frontend schemas reject malformed/negative chart data, and dynamic labels render as escaped text.

No persistent analytics cache or browser token storage is added. Hidden tabs do not poll. Query-plan and browser tests use disposable replica sets with fictional fixtures; Atlas data/configuration are untouched. External operators must preserve doctor references; deleted records are not retained as event history. See [Dashboard Analytics](DASHBOARD_ANALYTICS.md) for exact definitions, performance limits and verification. This stage performs no deployment or production-load experiment.

## Stage 3 patient controls and correction

Patient create/read/edit/delete require the same verified administrator, completed MFA and active database session. Services enforce role checks; nested queries validate the existing doctor and bind deletion to both IDs. Assignments are immutable and strict bodies reject IDs, timestamps, roles and other properties. Global/nested filters are bounded, literal prefix regexes are escaped, MongoDB/prototype keys are rejected, and all record text is escaped by React under the retained nonce CSP.

POST/PATCH/DELETE require the signed CSRF header/cookie pair, exact trusted Origin and JSON. CORS permits GET/POST/PATCH/DELETE only for the configured origin, with credentials. Patient mutations share a 100-attempt/15-minute per-admin limit; the global limit and existing auth limits remain. Safe reads may refresh sessions; mutations are never automatically replayed. Logs omit request bodies, URLs and patient data.

Expanded registration fields remain optional on stored legacy records. New registrations validate required contact/demographic information; no NID is collected. Directory responses omit optional clinical notes, allergies, emergency contacts, address and email; protected detail/edit reads retrieve them only when needed. Patient POST/PATCH JSON is bounded to 64 KiB for multilingual content, while authentication and ordinary endpoints retain 16 KiB. Size/validation/server error responses and logs never echo patient field values.

Atomic updates derive keys/tokens from the resulting document and do not upsert; atomic deletion returns success only for an actually removed record. Tests cover cross-parent deletion, malformed filters, CSRF/auth, injection, permanent removal and concurrent edits/deletion using disposable replica sets. Screenshot fixtures never use Atlas and mask MFA setup keys. Atlas connectivity was verified read-only in the original Stage 3 delivery with indexing/creation disabled; this correction uses disposable databases only; no configured data or environment files were changed.

This remains one shared admin workspace, with no per-admin record ownership. Future tenant isolation must be enforced consistently at query level. No uploads, webhooks, arbitrary URL fetchers or default credentials were introduced. Deployment edge controls, persistent backups and shared rate stores remain operational requirements below.

## Stage 2 doctor controls

All doctor reads, detail lookups, filter suggestions and creation require the same verified JWT/MFA/database-session administrator identity as the existing protected API. Services guard that verified identity as well; clients never supply roles or ownership. Administrators currently share one workspace and can access its doctor records. Patient relationship checks are implemented in Stage 3; future tenancy must scope every query before multi-workspace use.

Doctor creation retains JSON size/content-type, exact Origin, signed CSRF and restrictive CORS controls, plus a new 60-attempt/15-minute **per-admin** write limit; ordinary browsing keeps the existing API budget. Strict body/query/ID schemas prevent internal-field assignment, unbounded pagination, arbitrary sort fields, operator injection and unsafe regex. Authentication endpoints continue to reject all query parameters. Text uses Unicode-aware normalization and safe React rendering. Timestamps, query budgets, projections and lean reads stay on Express; no browser database connection or new Next.js backend is introduced.

Stage 2 tests exercise invalid/forged/revoked/non-admin/password-only sessions on the new endpoints, CSRF/Origin failures, injection/prototype payloads, malformed input/IDs, active write limiting, real persistence and representative index use. Production browser flows also verify stored-text escaping and preserve form drafts on explicit session/service failures. Safe reads can restore access; writes never automatically replay after an uncertain outcome. No doctor contacts are attached to application logs. No dependencies, authentication storage, password/MFA mechanism, JWT key, CORS origin policy or source-map setting is replaced by this stage.

For the Stage 2 A–T concerns, uploads (M), webhooks (N) and user-supplied URL fetching/SSRF surfaces (O) remain absent; there are no default credentials (Q). Record permissions (D/K/L) are enforced by verified administrator access to the current shared workspace, with validated IDs and no public doctor reads. The unchanged foundation below covers JWT/password/MFA/cookies/CORS/storage/source maps (F–J/P); scoped queries, validation and budgets cover A/E/G/K. React escaping and existing CSP cover B; CSRF covers C; privacy-conscious logs cover R; unchanged pinned dependencies/audits cover S; real database/browser verification covers T. Production shared rate stores and edge configuration remain the deployment contract below.

See [Doctor Management](DOCTOR_MANAGEMENT.md) for current endpoints, measured index plans and the exact future parent/patient authorization contract.

## Stage 1 foundation checklist

| Requirement              | Stage 1 control / applicability                                                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Injection / pollution | Strict shared Zod objects; bounded JSON; iterative depth/node-bounded operator, dotted-key, prototype-key rejection; scalar query construction; no untrusted objects passed to Mongoose. No SQL component.                                                           |
| B. XSS                   | React text escaping; no raw HTML rendering; nonce-based production script/style CSP; frame and MIME protections; self-hosted fonts; no remote scripts. Development allows eval/style injection for Next tooling only.                                                |
| C. CSRF                  | HMAC-signed double-submit token, constant-time comparison, HttpOnly host-only cookie, exact Origin checks, JSON-only mutations, SameSite=Strict. Login/signup/logout/refresh/MFA are all covered.                                                                    |
| D. BOLA/IDOR             | Identity comes from verified tokens and database state. `/me` cannot select another admin by ID. Doctor endpoints require verified admin access to the shared workspace; patient relationships and future tenancy require scoped queries.                            |
| E. Rate limits           | General API budget; independent signup/login/refresh/logout limits; login per-account limit; MFA per-IP and per-account limits; challenge-attempt ceiling. Configure exact proxy hops. Shared store required for multiple API instances.                             |
| F. JWT / secrets         | Required independent 32-byte random keys; strong-secret checks; algorithm/issuer/audience/expiry validation; five-minute access lifetime; no keys in frontend; production HTTPS/cookie enforcement.                                                                  |
| G. CORS                  | One exact approved frontend origin; credentials permitted without wildcard; constrained methods and headers; forbidden origins get 403.                                                                                                                              |
| H. Passwords / MFA       | Argon2id; real mandatory TOTP; authenticated encryption at rest; expiring password challenge; replay prevention; atomically consumed hashed recovery codes.                                                                                                          |
| I. Record security       | Application-level authorization in Express. MongoDB is not claimed to offer PostgreSQL RLS. Doctor services enforce the shared-workspace admin boundary; Stage 3 scopes patient operations to their validated doctor relationship.                                   |
| J. Server boundaries     | Only standalone Express owns authentication and MongoDB. Next rewrites HTTP; its protected layout asks Express to verify identity. Browser gets only projected identity.                                                                                             |
| K. Upload validation     | Not applicable: no upload endpoint or feature. Validate bytes/MIME/size/storage and permissions if introduced later.                                                                                                                                                 |
| L. Webhooks              | Not applicable: no webhook. Future handlers must verify signatures and replay windows.                                                                                                                                                                               |
| M. SSRF                  | No user-supplied server URL fetching. API destination is trusted server configuration. Future fetchers must block private/internal destinations and redirects.                                                                                                       |
| N. Source maps           | Public production browser source maps disabled; API build emits no source maps. Serve only the intended web assets.                                                                                                                                                  |
| O. Default credentials   | None. Trusted local CLI creates expiring email-bound invitations; no seeded administrator.                                                                                                                                                                           |
| P. Logs                  | Only request ID, method, status, timing and named lifecycle events. No request URLs, bodies, cookies, credentials, raw DB errors, MFA secrets, codes, or patient information. The trusted invite CLI intentionally displays the one-time invitation to its operator. |
| Q. Dependencies          | Lockfile, audit scripts/CI, minimal runtime dependencies. Audit all dependencies and production subset before release.                                                                                                                                               |
| R. Verification          | Real MongoDB transaction tests, Argon2/TOTP/crypto integration tests, browser smoke/accessibility tests. Deployment-specific review remains separate.                                                                                                                |

## Production deployment contract

1. Use a persistent, backed-up Atlas cluster or replica set with TLS and a least-privileged database account. Keep connection strings in your secret manager.
2. Terminate HTTPS at a trusted edge and expose only the frontend origin; route `/api/v1/*` to the independent API. Do not make health/auth response data cacheable. Match `WEB_ORIGIN` and `APP_ORIGIN` exactly; set `COOKIE_SECURE=true`.
3. If an edge proxy is present, set `TRUST_PROXY_HOPS` to the actual fixed proxy count, and have the edge overwrite untrusted forwarded headers. Keep the API unreachable through bypass paths. Never use arbitrary `trust proxy=true`.
4. Enforce one API process while using memory stores. Before multiple processes, replace each express-rate-limit memory store with its own namespaced shared Store for general, credentials, account, MFA, signup, refresh and logout budgets, then test through the real edge. No shared-store service is required for ordinary local development; independent per-process memory stores are not a horizontal-scaling solution.
5. Keep invitations and recovery codes private. Issue invitations from a trusted operator terminal with database access; never paste invitation URLs into public issues or CI logs. Reloading a signup page after fragment removal requires reopening the invitation link.
6. Limit shell/secret-manager access because the invitation CLI is deliberately a privileged provisioning tool. No HTTP provisioning API is available.
7. Run dependency audit, security tests, production browser tests, HTTPS cookie checks, backup/restore drills, and infrastructure access review before use with real health data.

## Secret rotation

- **JWT key:** replace `JWT_SECRET` with a freshly generated independent key. This invalidates existing access tokens. A valid refresh cookie can obtain an access token with the new key. For incident response, also revoke/delete active sessions before restart so refresh cannot restore them.
- **CSRF key:** replace `CSRF_SECRET`; existing CSRF cookies become invalid. Clients must reload/retry explicitly to acquire a new token. Mutations are not silently retried.
- **MFA encryption key:** do not simply replace `MFA_ENCRYPTION_KEY`: existing secrets will become unreadable. In a maintenance window, back up encrypted records, decrypt each using the old key in a trusted migration process, re-encrypt using the new key with fresh IVs, atomically persist, and switch the server configuration. Verify with a controlled account, then remove the old key from active access. No automatic migration command is shipped in Stage 1.
- **MongoDB credential:** rotate in Atlas/database administration, update the server secret manager, restart the API, and revoke the old credential. Never put credentials in frontend variables.

Generate an independent secret each time:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## Recovery limits

Use a saved recovery code with the normal password login if an authenticator is lost. Recovery codes are shown only once during enrollment. If all factors are lost, contact the trusted workspace operator. A self-service password or MFA reset route is deliberately absent; define and review identity verification and audit procedures before adding one. Account deletion, password/MFA mutation, and global sign-out are not public endpoints in this stage.
