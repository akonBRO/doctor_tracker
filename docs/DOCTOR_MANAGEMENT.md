# Doctor management — Stage 2

Doctor records are administrative data. They do not create login accounts. The application remains one independent Next.js frontend and one standalone Express REST API backed by MongoDB. The Stage 2 doctor contracts are retained. Stage 3 adds real patient management beneath doctor details; dashboard analytics remain future work.

## Routes and public API contract

Frontend routes are `/doctors`, `/doctors/new`, and `/doctors/[doctorId]`, inside the existing protected workspace layout. API responses retain the Stage 1 `{ data }` / `{ error }` envelope.

| Method | Endpoint                                              | Response / purpose                                                  |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------- |
| POST   | `/api/v1/doctors`                                     | 201; `{ data: { doctor } }`, persisted doctor                       |
| GET    | `/api/v1/doctors`                                     | `{ data: { items, pagination } }`                                   |
| GET    | `/api/v1/doctors/:doctorId`                           | `{ data: { doctor } }`; 422 for malformed ID, 404 for absent record |
| GET    | `/api/v1/doctors/options?field=specialization&q=card` | `{ data: { values, hasMore } }`; real distinct suggestions          |

All four endpoints require an enabled administrator with completed MFA and a valid database-backed session. No edit/delete endpoints or doctor logins exist. Non-admin callers, revoked sessions, and password-only challenges cannot access doctor data. Services also require the verified admin identity supplied by authorization middleware; no role or identity comes from doctor input.

### Create payload and schema

Only `name`, `specialization`, `hospital`, `phone`, and `email` are accepted. Clients cannot supply `_id`, timestamps, normalized search keys, roles, or other internal properties.

| Field          | Validation and normalization                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Name           | Required; up to 120 characters; Unicode names, including single-character names, are supported                                          |
| Specialization | Required; up to 100 characters; human-readable capitalization retained                                                                  |
| Hospital       | Required; up to 160 characters; no separate hospital entity                                                                             |
| Phone          | Required string; 7–15 digits; optional leading country-code `+`, spaces, parentheses, dots and hyphens; at most 40 formatted characters |
| Email          | Required; valid syntax, trimmed and lowercased; maximum 254 characters                                                                  |

Text fields trim surrounding whitespace, normalize Unicode with NFKC, collapse repeated whitespace, require a letter or number, and reject remaining control characters. Mongoose validates fields as well as the authoritative shared Zod request schema. Email and phone are **not unique**: shared contact details are legitimate and the specification does not impose uniqueness. Bangladesh mobile inputs in local 01 or country-code 880 form must match the valid 013-019 eleven-digit pattern and normalize to `+880...`; local display is preserved in the interface. Legitimate hospital landlines and other international-format numbers remain accepted. Existing stored numbers remain readable without a migration. Phone validation checks reasonable syntax, not actual assignment, ownership, or reachability; extensions are not supported.

MongoDB supplies `_id`, `createdAt`, and `updatedAt`. The public projection exposes `id`, the five fields, and ISO UTC timestamps. Internal version/search fields never appear in the API. The model derives `nameKey`, `specializationKey`, `hospitalKey`, and `searchTokens` for the specific queries below. Future doctor-update code must recompute those fields through the same normalization/model path; no update API is shipped now.

## Search, filters, dates and sorting

| Query parameter  | Meaning                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`              | Optional, trimmed; up to 120 characters / five Unicode words; AND-combined case-insensitive word-prefix search across name, specialization and hospital |
| `specialization` | Exact normalized specialization match, case-insensitive                                                                                                 |
| `hospital`       | Exact normalized hospital match, case-insensitive                                                                                                       |
| `from`           | Valid `YYYY-MM-DD`; record created at or after 00:00:00.000 UTC on that date                                                                            |
| `to`             | Valid `YYYY-MM-DD`; record created before 00:00:00.000 UTC on the following date                                                                        |
| `sort`           | `newest` (default), `oldest`, `name-asc`, `name-desc`                                                                                                   |
| `page`           | Integer 1–10,000; default 1                                                                                                                             |
| `limit`          | Integer 1–50; default 10; UI offers 10, 25, 50 and respects valid custom URL sizes                                                                      |

Both date boundaries are inclusive **calendar days in UTC**. The UI says “Added from (UTC)” and “Added through (UTC)”; these are record-creation dates, not appointment dates. Impossible dates and reversed ranges receive 422. Dates displayed in records are also UTC, independent of browser/host timezone.

Example (illustrative query, not seeded production data):

```http
GET /api/v1/doctors?q=rah&specialization=Cardiology&hospital=City%20Medical%20Center&from=2026-01-01&to=2026-12-31&page=1&limit=10&sort=newest
```

All supplied criteria combine with AND. A word can match any of the three searchable fields, so `rah card` can match a name beginning “Rahman” and specialization “Cardiology”. Words split at punctuation, preserving Unicode letters, combining marks and numbers. Empty/whitespace search applies no search constraint; punctuation-only search returns no matches. There is no arbitrary substring, fuzzy, phone/email, accent-insensitive, or external Atlas Search behavior.

Sorting uses normalized name or creation timestamp with `_id` in the same direction as a deterministic tie-breaker. Queries filter, sort and paginate in MongoDB, project only public fields and use `lean()` for reads. Total counts use the identical filter. Metadata includes `page`, `limit`, `totalItems`, `totalPages`, `hasNextPage`, and `hasPreviousPage`.

An empty result has `items: []` and `totalPages: 0`. A page beyond the available result count returns 200 with an empty `items` array and the requested page; the UI offers return to page one. Deep offsets are capped and queries have a 3-second MongoDB execution budget; timeout responses are safe 503 errors. Offset pages can shift if another administrator creates records between requests. List and count are separate reads, not a promised point-in-time snapshot.

## Indexing decisions and measured evidence

The model creates these indexes during the existing database initialization:

```text
{ createdAt: -1, _id: -1 }
{ nameKey: 1, _id: 1 }
{ specializationKey: 1, createdAt: -1, _id: -1 }
{ hospitalKey: 1, createdAt: -1, _id: -1 }
{ specializationKey: 1, hospitalKey: 1, createdAt: -1, _id: -1 }
{ searchTokens: 1 }  // multikey
```

Normalization lets search use escaped, anchored **case-sensitive** prefix expressions over already-lowercased tokens. This deliberately avoids user-authored regex and the index limitations of case-insensitive regex. Date/name order and the common individual/combined exact filters have dedicated indexes; other combinations may require filtering or sorting after an index scan. No claim is made that every combination is covered by one index. See the primary [MongoDB regex/index documentation](https://www.mongodb.com/docs/manual/reference/operator/query/regex/) and [compound-index guidance](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-compound/).

On an isolated 250-record fixture, natural `explain('executionStats')` plans showed:

| Query, limit 10               | Returned | Keys examined | Documents examined | Winning access                         |
| ----------------------------- | -------- | ------------- | ------------------ | -------------------------------------- |
| Newest records                | 10       | 10            | 10                 | Creation-date index                    |
| Exact specialization + newest | 10       | 10            | 10                 | Specialization/date index              |
| Selective word prefix         | 1        | 2             | 1                  | Multikey token index, then result sort |

These demonstrate index use on representative test data, not production performance improvements or a production benchmark. Captured plans are in [doctor-query-plans.json](doctor-query-plans.json); `npm test` regenerates raw evidence under ignored `tmp/doctor-query-plans.json`. Unfiltered exact counts explicitly use the `_id` index; counts still traverse matching keys/documents and are not free at large scale. Cursor pagination, production-size query measurement and any further indexes should be evaluated against real workload measurements before extending this design.

Filter suggestions use actual stored values, grouped by normalized key, with a deterministic real display label. `field` is strictly allowlisted to specialization/hospital; `q` is a bounded escaped full-value prefix. Results contain at most 20 values plus `hasMore`. Aggregation is used here because `distinct()` does not support a result limit; the main directory uses ordinary find/count queries. The grouping operation can inspect all prefix matches before limiting distinct values and has the same execution budget. Suggestions span the directory rather than inheriting unrelated active filters. Free text remains available for values outside the first 20 suggestions; nothing is blocked by a hardcoded list.

## Frontend state and recovery

The existing typed fetch client is extended, rather than replaced. API responses remain `no-store`, and doctor query state lives only in the mounted page. Returning from creation/details fetches current records; no clinical records or auth tokens are persisted in browser storage. Creation navigates directly to the saved detail with success feedback, without a full page reload.

Meaningful state lives in URL search parameters. Native History API calls integrate with Next.js routing: text changes replace the current entry, while date/sort/page changes push entries. Back/forward, refresh, shareable internal links, and validated directory return links work. Changing criteria resets page one; resetting filters preserves valid sort/page-size preferences. Search/suggestion requests debounce for 300 ms, use AbortController, and ignore responses from obsolete requests. Retry changes only the current read, not the filter values.

The table becomes structured stacked records on tablet/narrow screens. Inputs, pagination, Add Doctor and detail actions remain available at 1440, 1024, 768, 375 and 320 pixels. Add Doctor uses a dedicated route, controlled fields, inline errors, focused validation, immediate duplicate-submit protection, pending feedback, deliberate discard/cancel handling, and a browser unload guard. Form entries survive service/session errors. Expired-access restoration happens before a write; a submitted mutation is never automatically replayed. Re-login can occur in a new tab while keeping the form open. If a network failure makes a write outcome uncertain, the UI asks the administrator to check the directory before resubmitting; server-side idempotency keys are not introduced in this stage.

The list distinguishes loading, a genuinely empty directory, no matches, out-of-range pages, and safe service/validation errors. Details distinguish invalid links, absent records, unavailable service and authorization failures. Doctor text is escaped by React, including link labels. No raw HTML is rendered. The Stage 3 correction uses white navigation, readable sky-blue controls, a five-column directory and a concise profile header leading into real assigned-patient search; logo geometry and route behavior remain.

## Verification and local execution

The existing setup and invitation commands remain unchanged. Run:

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:e2e
npm audit
```

Browser tests use dedicated 127.0.0.1 ports 3100/4100 and fail if occupied; normal development ports 3000/4000 are left alone. The fixture verifies its own API identity before any workflow. The fixture creates its own replica set, real invitations, MFA sessions and doctor records, then tears them down. Successful persistence/search/details use actual Express/MongoDB, while explicitly intercepted 401/503/slow responses exercise UI recovery and cancellation. They do not substitute mocked data for successful operations.

**For browser verification, build in a dedicated test terminal with `API_ORIGIN=http://127.0.0.1:4100` and `APP_ORIGIN=http://127.0.0.1:3100`.** Rewrites are baked into Next.js builds. The fixture checks the production rewrite before starting and refuses to target another environment. GitHub Actions supplies these test-only origin values. No environment file is modified.

In PowerShell:

```powershell
$env:API_ORIGIN = 'http://127.0.0.1:4100'
$env:APP_ORIGIN = 'http://127.0.0.1:3100'
npm run build
npm run test:e2e
```

Set `E2E_WEB_MODE=development` to exercise the same suite in Next.js development/Strict Mode. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for actual completed checks rather than assuming a command above has been run.

## Stage 3 patient integration - implemented

Doctor details now query real paginated Patient records using the validated parent ID, show the actual count, and expose Add patient plus permanent scoped deletion. The global patient directory link preserves `doctorId`. Both IDs must match for nested deletion; an invalid/missing doctor never falls back to global records. The five doctor fields and directory query contracts remain; new Bangladesh-mobile writes gain normalization and format validation.

See [PATIENT_MANAGEMENT.md](PATIENT_MANAGEMENT.md) for exact routes, schema, immutable assignments, deletion semantics, query budgets and security. The Stage 3 redesign restyles all Doctor pages and replaces the prior unavailable patient placeholder. The symbol geometry and Stage 2 URL/filter/form behavior remain.

Doctor editing/deletion and analytics are outside this stage. Administrators share one workspace; future tenancy must scope both Doctor and Patient queries consistently. Atlas connectivity is verified read-only; deployment, HTTPS/proxy operational checks and multi-instance shared rate stores remain future work.
