# Dashboard analytics — Stage 4

`/dashboard` reads actual Doctor and Patient records through the independent Express API. It provides all-time totals, daily record-creation trends, and a complete paginated distribution of current patient assignments. The existing light UI, authentication/MFA and Bangladesh registration workflows remain. No analytics fixtures are seeded into Atlas.

## Metric and date definitions

| Metric             | Definition                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total doctors      | Exact count of currently stored Doctor records, independent of directory pagination and the selected reporting period.                                                                |
| Total patients     | Exact count of currently stored Patient records, independent of pagination and reporting period.                                                                                      |
| Patients by doctor | Current Patient count for each existing Doctor's `_id`/Patient `doctorId` relationship, including doctors with zero patients. Names are actual stored names; IDs accompany every row. |
| Registrations      | Currently stored Doctor/Patient records grouped by `createdAt`. These are record registrations, not appointments, admissions or consultations.                                        |

The trend supports `7d`, `30d` and `90d`, including the current **UTC calendar day**. For a 7-day report on 9 November, the range is `[3 November 00:00:00Z, 10 November 00:00:00Z)`. `from` and `through` are the inclusive date labels. Date arithmetic uses UTC midnights and fixed UTC days, so month/year changes, leap days and Bangladesh midnight do not shift buckets. Zero-filled buckets mean no saved records have that creation date.

Chart dates use day-first `en-GB` formatting and explicitly say **UTC days**, matching existing directory filters. The totals' update time is shown in `Asia/Dhaka`, labeled Bangladesh time. Display formatting does not change bucket boundaries. A record at 18:00Z belongs to that UTC date even though Bangladesh has entered the next calendar day.

Deletion reduces Total patients, assignment counts **and the historical creation bucket** for the deleted record. This database does not preserve deleted registration events. Editing personal/clinical fields does not change the creation timestamp. Records imported without a valid creation date can contribute to totals but not dated trends; this stage invents no timestamps.

## REST contracts

All paths use the existing `{data: ...}` envelope and require a verified administrator with completed MFA and an active database session. All responses are `Cache-Control: no-store`.

| Endpoint                                   | Inputs and result                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/dashboard/overview`           | No query parameters. `{totalDoctors,totalPatients,asOf}`.                                                                                      |
| `GET /api/v1/dashboard/patients-by-doctor` | `page` defaults to 1 (1–10,000); `limit` defaults to 5 (1–20). `{items:[{doctorId,doctorName,patientCount}],maxPatientCount,pagination,asOf}`. |
| `GET /api/v1/dashboard/trends`             | `period=7d\|30d\|90d`, default `30d`. `{period,timezone:'UTC',interval:'day',from,through,points:[{date,doctors,patients}],asOf}`.             |

Pagination returns `page`, `limit`, `totalItems`, `totalPages`, `hasNextPage`, and `hasPreviousPage`. Empty collections have no items and zero pages. A valid out-of-range page retains its requested page and totals; the UI offers a first-page action. The complete distribution includes zero-patient doctors and sorts by patient count descending, then `_id` ascending for deterministic ties. `maxPatientCount` is the maximum across **all doctors**, keeping bar scales consistent between pages. The UI explicitly labels the displayed subset, for example “Showing 1–5 of 9 doctors”.

Strict schemas reject unknown query keys, arbitrary sorting, identifiers, custom dates, operators, repeated/array parameters and invalid or excessive pagination. User input never becomes an aggregate stage. Malformed queries use the existing 400/422 error envelope; unauthenticated/password-only/forged/revoked sessions receive 401. Unsupported mutation routes remain absent. Analytics read requests share a 60-per-minute per-admin budget in addition to the existing global API budget; excess receives 429.

Aggregation failures/timeouts return a sanitized retriable 503 `DASHBOARD_UNAVAILABLE`, without raw database messages. Authentication database failures retain the existing sanitized application error handling. No error includes record contents. `asOf` identifies each dataset's read time; independent operations are **not a common transactional snapshot** during concurrent mutations.

## MongoDB strategy and indexes

Totals use `countDocuments({})` with an explicit `_id_` index hint; these are exact counts, not estimates or counts of a paginated result.

Distribution starts from Doctor documents, projecting only `_id` and name. A database `$lookup` joins by `doctorId` and executes `$count` inside the lookup. It creates at most one tiny count object per doctor rather than an array of patient records. Missing counts become zero. The pipeline projects ID/name/count, applies a stable sort, and uses `$facet` for the requested page plus total/max metadata. This is one database command, with no application N+1 requests or Node.js document-counting loop. Finding global leaders still requires counting assignments across all doctors before pagination.

Each trend pipeline applies the bounded `createdAt` `$match`, `$group` by UTC date, `$sort`, and compact `$project`. Independent Doctor and Patient aggregations run concurrently. Node.js merges **at most 90 aggregate buckets per series** and fills missing days; it never loads source documents to compute statistics.

Existing indexes suffice:

- Doctor and Patient `(createdAt desc, _id desc)` for date range scans.
- Patient `(doctorId asc, createdAt desc, _id desc)` for assignment count lookups.
- Each collection's `_id_` index for exact total counts.

No index, schema migration, backfill or persistent database operation is introduced. Queries have a three-second `maxTimeMS` budget. Distribution has no disk-spilling allowance, and response pages are bounded to 20. Totals still require index traversal, and global ranking still scales with the doctor/assignment population. Offset pagination and repeated exact ranking require real-workload review in Stage 5; this is not an O(1) reporting system.

### Measured fixture evidence

The isolated MongoDB integration test stores 200 fictional doctors and 4,000 fictional patients (160 doctors with 25 patients each, 40 with zero). It checks bounded output, all-doctor totals, counts and explain plans. Raw test plans are written only to ignored `tmp/analytics-query-plans.json`.

The first local sample showed the assignment lookup using `doctorId_1_createdAt_-1__id_-1`, zero foreign collection scans, zero patient documents examined and 4,200 foreign index keys examined. The Doctor side read 200 names. Both date aggregations used `createdAt_-1__id_-1`, examining 200 and 4,000 index keys respectively with zero source documents examined. Observed cursor execution times were 33ms for the distribution source cursor, 1ms for doctors' date aggregation, and 4ms for patients' date aggregation. Cursor timing is not a full HTTP/request benchmark. Results vary by host/cache and do not establish production performance or a measured improvement over a previous dashboard.

## Frontend and freshness

The dashboard uses a two-value summary strip and two focused analytics sections. It adds no colorful KPI grid, growth percentages, medical outcomes, activity feed or unrelated widgets. Doctor links open existing profiles; total links open the existing directories. At narrower widths sections stack, with readable controls and labels.

The registration line chart uses [Recharts 3.10.1](https://github.com/recharts/recharts), one React-compatible chart library. Its [accessibility layer](https://github.com/recharts/recharts/wiki/Recharts-and-accessibility) enables keyboard arrow navigation and tooltip interpretation. Blue solid and green dashed series remain distinguishable without relying only on color. Animation is disabled. The period selector is native and keyboard accessible. A daily-count table provides the full textual alternative, including zero days. Empty periods show an explicit empty state instead of a fabricated curve.

Patient distribution uses semantic doctor links and exact counts with restrained horizontal data bars. Full doctor names wrap on phones. The text list is the accessible alternative to its visual bars; zero counts remain visible and pagination makes the complete distribution available. All chart labels render as escaped text.

The existing typed API client and abortable query hook are reused. Runtime response schemas reject malformed, negative, nonfinite, oversized or incorrectly bucketed chart data rather than plotting it. Changing `period` updates only the trend request; totals keep their all-time meaning. `period` and distribution `doctorPage` are preserved in the URL. Invalid URL selections have a recoverable message rather than silently falling back.

Freshness is explicit:

- Fetch on mount/re-entry, plus a manual **Refresh data** action.
- Successful browser record mutations emit a data-only invalidation event; mounted dashboards refetch. New mounts fetch regardless of previous values.
- Refetch at most once per minute while the document is visible; focus/visibility return also refetches if the last scheduled refresh is at least a minute old. Hidden tabs do not poll.
- Other-tab/operator changes appear on re-entry, focus, manual refresh or the next visible refresh. No WebSockets or per-second polling is used.
- No server analytics cache, browser persistent cache or authentication-token storage is added. Independent datasets load concurrently and retry independently.

Obsolete reads are aborted and their responses cannot overwrite a new period/page/refresh. While refreshing the same dataset, its last valid data remains mounted with busy semantics and a disabled “Refreshing…” action, preserving keyboard/chart focus. A different period/page hides the previous dataset until the matching response arrives. The daily table stays open when its period changes. Missing/malformed envelopes are errors, not empty data. Safe analytics GETs may use the existing single-flight, browser-lock-protected session rotation. Mutations are never replayed automatically. Expired sessions redirect to login. Loading, partial errors, invalid responses and empty collections are distinct; failed data is never replaced with invented zero totals.

## Security and operating limits

The existing Express authentication/MFA/session guard and service-level admin checks protect every endpoint. The current authorization scope is the existing shared admin workspace. No tenant identifier is accepted from the client. Future tenancy must scope **every** total, join and trend consistently.

Responses contain only counts/date buckets and necessary doctor IDs/names. Patient names, phone numbers, addresses, conditions, histories, allergies, medications, emergency contacts and identifiers never enter analytics DTOs or ordinary logs. Existing CSRF for mutations, exact CORS, secure-cookie policies, nonce CSP, unsafe-key rejection, hashing and privacy-conscious logging remain. No arbitrary external URLs, uploads, webhooks, SQL component, default account, source maps or deployment are added.

Database operators must preserve doctor references. An externally orphaned Patient still contributes to the exact global Patient total and its dated bucket, but cannot be assigned to an existing doctor's distribution row. The application does not expose doctor deletion or patient reassignment. This stage does not repair or delete persistent records to reconcile operator-created inconsistencies.

## Verification and visual evidence

The new backend integration suite passed **32 tests** covering auth/MFA/roles/revocation, counts, CRUD effects, zero-patient doctors, deterministic ties/pagination, periods, missing days, leap/month/year/UTC boundaries, privacy, invalid query/response data, read-only routes, rate limits, failure recovery and index plans. The full backend run passed 204 tests. Complete commands and current checks are recorded in [Implementation status](IMPLEMENTATION_STATUS.md).

Browser workflows use actual invitation/MFA sessions and REST/database responses on isolated 3100/4100 fixtures. Each viewport runs the existing auth/CRUD suite and the dashboard suite in separate fresh processes/databases, keeping real security rate limits intact during rapid automation. They create a doctor and patient through the existing UI, verify totals on return, create historical fictional fixtures through REST, verify charts/periods/pagination and deletion, then exercise loading, unavailable/invalid data and expired sessions. Only deliberate errors/latency are intercepted. Fixture timestamps are adjusted only in the disposable test database to exercise real historical buckets.

| State              | 1440px                                          | 1024px                                         | 768px                                          | 375px                                          | 320px                                                |
| ------------------ | ----------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Populated          | [View](screenshots/dashboard-desktop.png)       | [View](screenshots/dashboard-laptop.png)       | [View](screenshots/dashboard-tablet.png)       | [View](screenshots/dashboard-mobile.png)       | [View](screenshots/dashboard-small-mobile.png)       |
| Empty              | [View](screenshots/dashboard-empty-desktop.png) | [View](screenshots/dashboard-empty-laptop.png) | [View](screenshots/dashboard-empty-tablet.png) | [View](screenshots/dashboard-empty-mobile.png) | [View](screenshots/dashboard-empty-small-mobile.png) |
| Unavailable totals | [View](screenshots/dashboard-error-desktop.png) | [View](screenshots/dashboard-error-laptop.png) | [View](screenshots/dashboard-error-tablet.png) | [View](screenshots/dashboard-error-mobile.png) | [View](screenshots/dashboard-error-small-mobile.png) |

All 15 production browser checks passed across the five required widths, followed by five dashboard rechecks after final refinements. Three dashboard development/Strict Mode checks passed at 1440, 375 and 320px. Populated, empty and error captures were visually reviewed; native-width phone charts and wrapping doctor names were inspected. The empty chart state was made compact, and the period selector uses a readable 46px control. Screenshots use fictional disposable data only. Physical devices, full accessibility certification, Atlas load testing and legal/clinical certification are not claimed. Stage 5 profiling/cache/pagination refinements and Stage 6 deployment remain deferred.
