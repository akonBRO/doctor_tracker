# Implementation status

## Stage 5 — quality audit, measured refinements and deployment readiness

Implemented 9 November 2026 from `3695d35f95505be559671936b39c11227a143722` on the selected public `akonBRO/doctor_tracker` main branch. The approved light composition and logo geometry remain. No Stage 6 deployment, Atlas fixture/load operation, environment-file edit, schema migration or unrelated feature was performed.

### Fixed and measured

- Invalid-Origin/CSRF mutations now consume the existing global rate budget before parsing/validation. Deep JSON inspection is iterative with depth/node bounds, fixing the reproduced 9,000-level/54KB input 500. Existing authentication/MFA/body/route limits remain intact.
- Known-disconnected database requests return sanitized 503 instead of buffering for about ten seconds and returning 500. Stateless CSRF issuance and health remain available; in-flight driver failures are not a new circuit breaker.
- Browser HTTP exchanges, including body reads, have a 15-second deadline. Missing/malformed envelopes receive safe messages; cancellations stay distinct, uncertain writes are not replayed, and existing no-store/session rotation behavior remains.
- Doctor-picker keyboard selection, clearing and Escape restore focus to the search input; clicking an already-focused input reopens results. Existing native controls and grouped Bangladesh patient forms are retained.
- The empty dashboard avoids loading the Recharts plot: observed JS transfer **296,809 → 193,275 bytes (34.88% less)**; decoded JS **991,393 → 627,928 bytes**. Populated charts still load the library, with 1,812 extra transfer bytes from the split module. The complete Bengali font changes TTF → WOFF2, preserving glyphs/shaping/license: observed transfer **305,670 → 244,604 bytes (19.98% less)**.
- The disposable 200-doctor/4,000-patient before/after profile records browser requests, page/asset/script/paint/layout metrics, HTTP medians/maxima, seven representative query plans and index inventory. API timing was mixed; no API speedup or production capacity claim is made. Existing indexes, URL/server pagination and no-store/freshness behavior remain justified at this scale. Page 300 examines 3,000 keys / ten documents; growing offset/global-count costs remain documented.
- Doctor date documentation now matches the existing Asia/Dhaka record display. UTC API timestamps, directory date boundaries and analytics buckets remain unchanged. Bangladesh phones, Unicode names, free-text hospitals, dependent division/district selectors, all blood groups/Unknown and sparse legacy updates retain their existing contracts.

### Stage 5 verification

- Baseline: original **204 API tests passed**, production build passed, six production browser baseline checks passed at 1440/320px, and the unchanged-web quality fixture was measured before performance changes.
- Final `npm test`: **214 passed in six files** (59.38s): the original 204 API tests, three new API abuse/outage tests and seven client transport tests. All use disposable databases or controlled transport units; no Atlas connection is loaded by the test fixtures.
- Final `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm run build` passed. The final build used explicit isolated 3100/4100 origins. A CSS formatting warning was corrected before the successful final check; unsuccessful exploratory runs are not counted as passes.
- `npm run test:e2e`: **all 15 production browser checks passed** across 1440, 1024, 768, 375 and 320px. The original auth/CRUD and dashboard cases remain. Successful flows use actual invitation/MFA/cookie sessions, REST APIs and isolated replica-set writes; interception only simulates explicit failures/latency.
- Dedicated `node scripts/test-e2e.mjs tests/e2e/quality.spec.ts --project=desktop`: **one additional production quality check passed** (30.8s test / 37.8s runner on the final recheck). It measures the 200/4,000 fixture, checks larger-data overflow/axe at 320px and asserts doctor-picker selection/reopen/Escape/clear focus. The archived comparison is the earlier completed before/after sample pair; timing variation across reruns is expected.
- Focused development/React Strict Mode dashboard rechecks: **three passed** at 1440, 375 and 320px. Development screenshots remain in ignored `tmp/screenshots-development/`. The full development auth/CRUD suite was not repeated in Stage 5.
- Full and production-only `npm audit --audit-level=moderate` / `npm audit --omit=dev --audit-level=moderate`: **zero vulnerabilities**. No application dependency was added. Temporary font conversion tooling stays ignored and is not shipped.
- The **80 current production screenshots** were refreshed across all five widths. The page/state contact sheets were visually reviewed, with native-width phone sections for directories, Bengali identity fields, grouped forms, record detail and charts. Logo SVG files have no Stage 5 changes. WCAG A/AA, 2.1 AA and 2.2 AA-tag axe checks found no violations in tested states; keyboard review found and fixed the picker defect that axe did not report.

The final commit and exact-SHA Actions result are reported in the delivery message. This update uses a normal commit/push without rewriting history or deploying.

See [Stage 5 quality audit](STAGE5_QUALITY_AUDIT.md) for the baseline/findings, page-by-page review, localization, full 20-control security matrix, measured trade-offs, evidence methodology and limits; [quality metrics](quality-metrics.json) for sanitized samples; and [Deployment Readiness](DEPLOYMENT_READINESS.md) for Stage 6 prerequisites. README, Security, Doctor/Patient Management, Dashboard Analytics and Design Redesign are updated to match.

### Remaining limits

No production HTTPS/proxy/cookie smoke test, Atlas load/failover test, larger-scale capacity guarantee, physical-device/assistive-technology audit, full Lighthouse/React Profiler run or certification is claimed. Administrators still share a workspace; tenancy must scope every query/aggregate if introduced. Single-process rate stores need a verified shared store before scaling. Exact counts/global ranking and offset costs grow; independent datasets are not one transactional snapshot. Password/MFA reset, email delivery, uploads and webhooks remain absent. Stage 6 must configure real build/runtime origins, secrets, TLS/proxy trust, least-privileged database access, backups/restore, operator recovery and hosting observability.

## Stage 4 — admin dashboard and analytics

The dashboard now reads exact Doctor/Patient totals, current assignments per doctor and bounded 7/30/90-day registration trends from secure Express/MongoDB endpoints. Totals remain all-time. Registration buckets use inclusive UTC calendar days including today, with an exclusive next-midnight upper bound; chart labels explicitly say UTC. The update time uses Bangladesh time. Deleted patients leave all metrics, including their historical creation bucket.

The corrected light UI is retained: two totals, a Recharts registration chart with a daily-count table, and paginated horizontal patient-count bars with actual doctor links. Zero-patient doctors remain included. Full names wrap, each subset is labeled, and bar scales remain constant across pages. There are no fabricated metrics or unrelated analytics sections.

Endpoints are `GET /api/v1/dashboard/overview`, `GET /api/v1/dashboard/patients-by-doctor`, and `GET /api/v1/dashboard/trends`. Verified admin/MFA/session guards, strict query schemas, a per-admin read budget and no-store responses protect every endpoint. Only counts, dates and necessary doctor IDs/names are projected. Exact counts use `_id_`; dates use the existing creation-date indexes; assignment count lookups use the existing Patient `doctorId` index prefix. No indexes, migrations, Atlas mutations or environment edits are required.

Data loads concurrently using the existing client/query hook, with runtime response validation, cancellation, independent retries, safe session refresh and bounded visible-tab revalidation. Period changes do not change totals. Record changes invalidate mounted dashboards, and re-entry/manual refresh fetch current data. No server/browser persistent cache, WebSockets or per-second polling is added.

### Stage 4 verification

- `npm test`: **204 passing integration/security tests** in four suites: authentication (24), doctors (56), patients (92) and dashboard analytics (32). The final focused dashboard rerun also passed all 32 cases after the lint-only helper correction.
- `npm run typecheck`, `npm run lint`, `npm run format:check` and the production `npm run build` passed. The build used isolated test origins on 3100/4100, without editing environment files.
- `npm run test:e2e`: **15 production browser checks passed**, covering the original auth/CRUD suite and the new dashboard suite at 1440, 1024, 768, 375 and 320px. Successful operations use actual APIs/database writes; only deliberate failures/latency are intercepted.
- After final empty-state spacing and response-validation refinements, the dashboard suite passed **all five production rechecks**. It also passed **three development/React Strict Mode checks** at 1440, 375 and 320px. The full prior-stage development CRUD suite was not repeated in Stage 4.
- **15 new production dashboard captures** show populated, empty and unavailable-total states at every required width. These were visually reviewed alongside native-width chart/doctor-label layouts. Existing auth/CRUD captures were refreshed by the regression suite. Keyboard chart navigation, the daily table, all periods, URL restoration, loading, retries, invalid/absent data envelopes, expired sessions and unwanted horizontal overflow were checked.
- The 200-doctor/4,000-patient disposable fixture verified indexed date aggregation and indexed assignment lookups without fetching patient documents. Query-plan observations and trade-offs are documented in [Dashboard Analytics](DASHBOARD_ANALYTICS.md); no production benchmark or improvement claim is made.
- Full and production-only dependency audits reported **0 vulnerabilities**. The new runtime chart dependency is Recharts 3.10.1 with its React-is peer; no CSS framework or state-management library was added for application state.

Review fixes included the period selector's size/style, retaining the open daily table across period changes, preserving chart/table focus during background refresh, and treating missing response envelopes as errors. The test runner now isolates each viewport/workflow in its own actual server/database fixture after combined rapid automation reached the existing global rate budget. Application security limits were retained. A lint issue in the new test helper was corrected; unsuccessful exploratory runs are not counted above.

See [Dashboard Analytics](DASHBOARD_ANALYTICS.md) for metric definitions, response contracts, query strategies, fixture observations, screenshots, freshness and limits. Independent datasets are not one transactional snapshot; exact global ranking/counting still scales with the stored population. There is no deleted-event ledger, and future tenancy must scope every aggregation. Stage 5 workload optimization and Stage 6 deployment remain deferred.

## Stage 3 correction - light UI and Bangladesh patient records (previous delivery)

Implemented 8-9 November 2026. This is the Stage 3 correction, not Stage 4. No analytics, deployment, appointments, billing or prescribing workflow is included.

### Delivered behavior

- Entire application uses white/light-blue navigation and surfaces, readable typography, clear controls and a blue primary action. Landing, authentication, dashboard, directories, doctor profiles and patient forms/details have changed composition. The rejected rust/graphite theme, redundant copy and placeholder analytics section are removed. Original logo paths/geometry remain.
- Patient registration adds optional Bangla name, actual DOB or explicitly approximate age, gender, all eight blood groups plus Unknown, mobile/email, real Bangladesh division/district choices, address, emergency contact and concise clinical fields. New records require name, condition, mobile, gender, age information and an actual doctor. Optional identifiers such as NID are not collected.
- Legacy three-field records remain readable/editable without invented values. Optional fields are nullable/absent. PATCH submits only changed fields, validates coupled field groups atomically and protects doctor references. Unknown allergies and no known allergies are distinct.
- Doctor management retains its five fields, search, filters, sorts and pagination. Names open dedicated profiles with actual searchable assigned patients. New Bangladesh mobile contacts normalize safely; landlines, international formats and historical records are retained.
- Protected list projections include only needed directory data. Full optional clinical/emergency/address fields are loaded on protected record reads. Patient POST/PATCH bodies allow bounded 64 KiB multilingual JSON; ordinary routes retain 16 KiB.
- Existing JWT/database sessions, mandatory MFA, invitation signup, CSRF, exact Origin/CORS, authorization, rate limits, escaping, CSP and privacy-conscious logs remain. No runtime library or CSS framework was added. Noto Sans Bengali is self-hosted with its license.
- Atlas configuration, existing data and account/MFA settings are preserved. This correction performs no Atlas seed/reset/backfill/database replacement. Automated tests supply disposable replica sets and never read the Atlas environment connection. The original Stage 3 read-only connection check is historical evidence, not a new connectivity claim.

### Verification record

- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm run build` passed. The production build used the isolated browser-test origins below.
- `npm test`: **172 passing integration/security tests** across authentication (24), doctors (56) and patients (92), using disposable MongoDB replica sets.
- Full Chromium workflow suites: **10 production and 10 development checks passed**, covering 1440, 1024, 768, 375 and 320px. These exercise real invitations/MFA/sessions, doctor creation/filtering/pagination, expanded patient creation/detail/edit/delete, legacy records, doctor-scoped search, failure recovery, keyboard/mobile navigation, overflow and axe WCAG A/AA-tag checks.
- After the final phone-filter spacing and route-scroll adjustment, the production build passed again and both phone viewports passed all **4 production plus 4 development rechecks**. The refreshed phone screenshots were visually inspected.
- **65 production screenshots** cover 13 page states at all five widths. Desktop, laptop, tablet and phone captures were visually reviewed, with tall phone forms/directories inspected in sections. No unintended horizontal scrolling was found. Development captures are kept separately in ignored `tmp/screenshots-development/`.
- Full and production-only dependency audits both report **0 vulnerabilities**. The added diff was checked for credential patterns and tracked local environment files; no matches or tracked `.env` files were found. Original SVG path geometry was compared against the prior commit and retained.

Earlier concurrent local checks exhausted available host memory, and one development navigation reported Chromium `ERR_INSUFFICIENT_RESOURCES`. The completed runs above used sequential checks; the full development rerun passed. These failed attempts are not counted as successful verification.

Browser verification uses dedicated 127.0.0.1 web 3100/API 4100 ports, rejects occupied ports and checks a random test-process response identity before starting workflows. Each viewport receives its own actual API/database fixture and normal auth limits. The development suite uses a separate ignored `.next-e2e` output; normal local development remains on 3000/4000. Successful operations use actual API/database writes; interception only simulates deliberate 401/503/latency failures.

The screenshot matrix in [Design redesign](DESIGN_REDESIGN.md) covers landing, login, signup, MFA setup/challenge, dashboard, doctor directory/create/detail, patient directory/create/detail/edit. Rejected Stage 3 images are retained under `docs/screenshots/before-correction/`; earlier Stage 2 images remain under `before/`. Only fictional disposable records are captured, and MFA setup keys are masked.

The first visual/axe review found low contrast in tinted table headings and it was corrected. Input boundaries were also strengthened. Final phone review widened directory filters to one column through 480px so date controls and labels have enough room; Next.js route transitions now explicitly coordinate with the existing smooth-scroll setting. Independent review tightened malformed Bangladesh-mobile creation while retaining landlines and old records. The test server was moved off normal development ports after detecting that localhost could reach an existing dev frontend; final production results use the corrected isolation checks.

### Boundaries

All administrators still share one workspace. Future tenancy must scope every query. Direct database operators must preserve doctor references. Same-field/group edits use last-writer semantics; independent list/count reads are not a transactional snapshot. Search matches prefixes in the original name/condition fields, not all clinical text. Exact counts and offset pagination need real workload measurements before performance claims. The clinical fields are registration context, not a complete EHR. Upazila/thana remains validated text, not a complete dependent national lookup.

New registrations use the expanded required-field policy; old clients issuing three-field POST requests must update. Existing stored records and sparse legacy PATCH operations remain compatible. Explicit cancel/unload guards protect drafts; deliberate route navigation can discard them. Network-uncertain writes require checking records before resubmitting, without automatic replay.

No production-scale performance benchmark, physical-device coverage, full accessibility certification, legal/clinical certification or deployment is claimed. Stage 4 analytics, Stage 5 performance work and Stage 6 deployment remain deferred. See [Patient Management](PATIENT_MANAGEMENT.md), [Doctor Management](DOCTOR_MANAGEMENT.md) and [Security](SECURITY.md) for contracts and operational limits.

Normal commit/push targets the public [akonBRO/doctor_tracker](https://github.com/akonBRO/doctor_tracker) main branch. The final commit and [GitHub Actions](https://github.com/akonBRO/doctor_tracker/actions/workflows/ci.yml) result are reported in the handoff; history is not rewritten.

## Prior delivery

Stage 1 established standalone Next.js/Express, invited administrator signup, Argon2id, TOTP/recovery codes, rotating sessions, CSRF/CORS/CSP and the care-path mark. Stage 2 added the five-field Doctor directory. Stage 3 added protected Patient CRUD and doctor integration. Its commit `81fb328` passed 115 API integration cases and its historical CI run; the owner's rejected visual direction is superseded by this correction. Earlier detailed counts are historical, not a substitute for the current verification above.
