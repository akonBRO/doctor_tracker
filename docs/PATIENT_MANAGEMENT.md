# Patient Management - Stage 3

## Records and relationship

MongoDB Patient stores `_id`, required `name` (1-120 characters), required free-text `condition` (1-160), required `doctorId` ObjectId referencing Doctor, `createdAt` and `updatedAt`. Names and conditions accept international text, normalize NFKC/whitespace and retain display case. Internal `nameKey`, `conditionKey` and multikey `searchTokens` support normalized queries and are excluded from DTOs. A patient belongs to exactly one doctor. There are no embedded patient arrays or patient/doctor login accounts.

Creation validates the path doctor ID and checks that doctor exists before persisting. The body accepts only name and condition. Doctor removal is not exposed by the application; direct database operators must preserve references. Assignment cannot change through PATCH. No migration, reset, seed or database replacement is needed. Startup creates additive indexes and keeps the existing connection URI/database and all authentication records.

## REST contract

All routes have the `/api/v1` prefix, return the existing `{data: ...}` envelope, and require a verified administrator with completed MFA and an active database-backed session.

| Method and path                                 | Result                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /doctors/:doctorId/patients`              | 201 `{patient}`; strict `{name, condition}` body; assignment derives from the parent path |
| `GET /doctors/:doctorId/patients`               | Paginated patient directory restricted to that existing doctor                            |
| `DELETE /doctors/:doctorId/patients/:patientId` | Permanent deletion only when both identifiers match one record                            |
| `GET /patients`                                 | Global directory with the filters below                                                   |
| `GET /patients/:patientId`                      | `{patient}` with minimal assigned-doctor projection                                       |
| `PATCH /patients/:patientId`                    | `{patient}`; nonempty strict subset of name/condition                                     |
| `DELETE /patients/:patientId`                   | Permanent deletion from the workspace and doctor's list                                   |

DELETE accepts an empty JSON object, requires CSRF protection and returns `{deleted:true,id}` only after a real deletion. It does not unassign or reassign the patient. Missing/already-deleted records and nested parent mismatches return 404; malformed IDs/fields return 422, operator/prototype injection returns 400, and authentication/CSRF failures retain existing 401/403 contracts. Detail and mutation query strings are forbidden.

Global list query parameters: `q`, `condition`, `doctorId`, `from`, `to`, `page`, `limit`, `sort`. Nested lists accept the same parameters except `doctorId`; an attempted scope override is rejected. A missing or malformed parent/filter never becomes a global query. A valid but nonexistent doctor returns 404.

`q` matches case-insensitive Unicode word prefixes across name and condition; at most five words and 120 search characters. Each term must match a word. Regex syntax is escaped and punctuation-only queries match nothing. Condition is an exact normalized case-insensitive match, with no predefined dropdown restriction. Dates filter creation time: `from` is inclusive UTC midnight, `to` includes that whole UTC calendar day using the next midnight as an exclusive boundary. Invalid dates and reversed ranges are rejected.

`page` defaults to 1 (maximum 10,000), `limit` defaults to 10 (1-50), and `sort` allows newest/oldest/name-asc/name-desc. All sorts have a stable `_id` tie break. Metadata contains page, limit, totalItems, totalPages, hasNextPage and hasPreviousPage. Empty results have totalPages 0; out-of-range pages retain accurate filtered totals and return no rows. Independent find/count reads are not a transactional snapshot during concurrent changes.

Patient DTO: `id`, `name`, `condition`, `doctorId`, `doctor: {id,name,specialization}`, and ISO timestamps. List reads project only these patient fields and perform one bounded doctor lookup for the entire page, avoiding N+1 reads. No doctor contact/authentication fields are included.

## Indexing and atomic changes

Indexes: `(createdAt desc, _id desc)`, `(nameKey asc, _id asc)`, `(doctorId asc, createdAt desc, _id desc)`, `(conditionKey asc, createdAt desc, _id desc)`, `(doctorId asc, conditionKey asc, createdAt desc, _id desc)`, and multikey `(searchTokens asc)`. Lists and parent/detail reads use a 3-second query budget, lean projection and database pagination. No production latency claim is made. Prefix token filters can require an additional sort; exact counts and offset pagination should be reviewed under actual workload in Stage 5.

PATCH uses a single atomic update pipeline with already validated literal values. It derives search tokens from the resulting name and condition in the same operation. Disjoint parallel edits therefore preserve each other's fields. Same-field edits use last-writer semantics. Deletion is an atomic find-and-delete with both IDs for a nested request; a repeated/concurrent loser returns 404. A concurrent edit cannot recreate a deleted record. No automatic mutation replay or upsert is allowed.

## Interface and state

`/patients` provides debounced search, condition/date/doctor filters, stable sort and pagination. Doctor selection uses bounded real directory lookup; users select a name rather than entering an ObjectId. URL criteria survive refresh and back/forward. Reset retains valid sort/page-size choices. A new global record first selects its doctor; a doctor's Add patient action locks that assignment automatically.

Doctor details show an exact database-derived patient count, paginated records, creation and permanent removal, and a link to the global directory with that doctor filter. Global records link to details and prefilled editing. The same responsive record styles, date formatter, abortable no-store query hook and typed API transport serve both modules. Tables become labeled records on narrow screens.

Successful changes refresh the mounted list or navigate to a freshly fetched detail/directory with explicit success feedback. Doctor-scoped creation returns to the first patient page; global creation opens the saved record. No patient state is stored in localStorage/sessionStorage or a persistent query cache. Pending refs block duplicate submission, field errors receive focus, explicit cancellation/unload guards protect drafts, and recoverable failures retain form values. Deliberate navigation away can discard an unsaved draft. Expired sessions can be restored in a separate tab. Uncertain network outcomes require checking the registry before another write. Delete confirmation traps focus with a native dialog, starts on Cancel, supports Escape and explains irreversible removal from both lists.

## Security and verification

The shared admin workspace boundary is enforced by JWT/MFA/session middleware and service guards. Strict body/query schemas, validated IDs, escaped search expressions, unsafe-key rejection, CSRF on every mutation and exact Origin/CORS remain active. Patient writes share a per-admin 100-attempt/15-minute budget in addition to the global API limit. React escapes stored text and the existing nonce CSP remains. Sensitive record values never enter application logs. Future tenancy must add tenant scope consistently; MongoDB is not presented as PostgreSQL RLS.

The API suite adds 43 disposable MongoDB integration cases to the 72 existing cases: persistence, international text, validation, MFA/admin/CSRF, parent scope, filters/dates, bounded pages/sorts, atomic updates, permanent deletion, injection and concurrency. Browser flows use real API/database writes for successful operations and intercept only intentional failure/latency scenarios. Browser coverage includes creation, assigned/global lists, doctor selection, combined filters, refresh, edit draft recovery, cancel/confirm deletion, stored-text escaping and error retry. All destructive fixture operations use test-server supplied ephemeral databases; tests never load the Atlas `.env` URI.

## Stage 4 readiness

Doctor IDs, patient doctorId and immutable creation timestamps provide the grouping/date keys for real counts, doctor distribution and condition reports. Stage 4 should aggregate Patient directly and apply the same administrator/tenant scope, rather than derive totals from a paginated browser page. Reporting endpoints/dashboard charts are intentionally not implemented. Stage 5 workload refinements and Stage 6 deployment remain future work.
