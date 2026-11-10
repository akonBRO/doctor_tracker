# Stage 7 — production preparation and approval package

**Phase A only; no production deployment.** Prepared 10 November 2026 from synchronized, clean `main` at `374634b568f758fcb79a64bf600caac309950c41`. The known Stage 6 CI run is [42696912283](https://github.com/akonBRO/doctor_tracker/actions/runs/42696912283). Repository remote remains the owner-selected public `akonBRO/doctor_tracker`.

## What changed

- Concrete [hosting/topology/cost comparison](PRODUCTION_INFRASTRUCTURE.md), recommending a 4 GiB Singapore VPS with native Caddy/systemd and existing Atlas; no container or shared-store complexity introduced.
- Review-only Caddy and three hardened, distinct-UID service templates, separate placeholder environment examples, bounded startup/restart/stop and memory limits. Actual host enforcement is unverified.
- Checksum-pinned Caddy test tooling, validated rendering and actual proxy integration over temporary HTTPS, including canonical-host rejection, fixed-origin redirects, forwarding overwrite, shared client budgets and failure-log privacy. No public certificate request.
- Explicit full-SHA source archive, archive/lockfile checksums and a non-authorizing manifest. Packaging refuses private/generated tracked filenames, links/submodules and overwrites. It never reads developer env values, uploads or deploys. Content-aware diff/history review remains necessary.
- Test-only numeric CPU/RSS sampling and sanitized authentication rejection events. Auth semantics, models, data, API contracts, fonts, CSS, logo, frontend architecture and all 80 screenshot assets are unchanged.
- [Serialized release/rollback procedure](PRODUCTION_DEPLOYMENT_RUNBOOK.md#serialized-native-release-and-rollback), [backup/recovery plan](BACKUP_RECOVERY_RUNBOOK.md) and [concrete approval checklist](DEPLOYMENT_READINESS.md). CI remains verification-only and now executes the operational suite through real Caddy plus structural systemd checks.

## Infrastructure decision

Recommend Ubuntu 24.04 LTS x86-64, DigitalOcean Basic regular **2 vCPU / 4 GiB / 80 GiB / Singapore SGP1**, Caddy **2.11.9**, one private Next process and **one private API process**, existing Atlas over verified TLS. The fixed Caddy → Next → Express path uses two trusted proxy hops. Only 80/443 and restricted administrator SSH are exposed; no CDN or direct API ingress is included.

Published compute **$24/month**, proposed daily host backup **$7.20**, combined **$31.20/month** before Atlas/domain/tax/overages. Prices checked 10 November 2026; [dated sources and managed/container alternatives](PRODUCTION_INFRASTRUCTURE.md#hosting-comparison-and-recommendation) explain uncertainty. Host backup does not cover Atlas. The region recommendation is geographic inference: Bangladesh and Atlas latency remain unmeasured. VM sizing is a starting proposal, not an SLA.

No cloud account/resource/environment/secret, paid plan, DNS, real TLS certificate, production service, Atlas index/schema/data, invitation or key rotation was created or changed. The GitHub API listed zero environments; a future deployment workflow must explicitly configure reviewer protection. No deployment workflow is added now.

## Verification record

All application/database fixtures are disposable and owned by their test process. No API env file or externally supplied database URI is used by operational/browser fixtures. Next loads its normal web environment with explicit fixture-origin overrides; `.env` contents remain unchanged, checked privately by SHA-256. Early exploratory failures are recorded below and do not count as successful verification.

| Check                                    | Stage 7 result                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh Stage 6 baseline `npm test`        | **249 passed / 8 files**, 60.52s.                                                                                                                                                                                                                                                  |
| Final `npm test`                         | **259 passed / 10 files**, 60.63s. All original tests retained; nine infrastructure/preparation cases plus one authentication-log privacy case added.                                                                                                                              |
| Typecheck / lint                         | Passed. Plain typecheck preserves local HTTP development configuration through the existing development-only route generator.                                                                                                                                                      |
| Production build                         | Passed with explicit disposable 3100/4100 loopback origins and local-HTTP opt-in; not a production-domain artifact.                                                                                                                                                                |
| Formatting                               | Passed; repeated after final documentation updates.                                                                                                                                                                                                                                |
| Five-width production E2E                | **15 passed** at 1440, 1024, 768, 375 and 320px, including actual auth/MFA/session/CRUD/analytics, error recovery, overflow and automated WCAG-tag checks. Screenshots unchanged.                                                                                                  |
| Dedicated 200/4,000 quality profile      | **One passed**, 31.7s test / 38.3s runner; local metrics below. No external Atlas load.                                                                                                                                                                                            |
| Development dashboard / Strict Mode      | **Three passed** at 1440, 375 and 320px (17.9s / 16.0s / 16.5s tests), each with its own real fixture. Complete development CRUD suite was not repeated.                                                                                                                           |
| `npm run test:infrastructure`            | **16 local Windows checks passed**, retaining all 12 prior operational checks and adding four proxy checks. Linux CI additionally exercises the real SIGINT path (17 checks in that path); actual exact-SHA result belongs in delivery handoff.                                    |
| systemd structural validation            | Passed in WSL Ubuntu 24.04 using the actual pinned Linux Caddy and an explicit `/usr/bin/true` executable stand-in because WSL has no Node. This validates syntax only. CI uses its real installed Node path; no units are installed/started.                                      |
| Full / production-only dependency audits | Both passed, **zero vulnerabilities**, using `--audit-level=moderate`; lockfile and runtime dependencies unchanged.                                                                                                                                                                |
| Release package                          | Unit fixture proves repeated source archive hashes match on the tested Git toolchain, requires explicit full SHA, rejects private/generated tracked files and refuses overwrites. Final commit-specific archive/checksum is produced locally after commit and reported in handoff. |

### Actual proxy and security evidence

The Caddy rehearsal validates the real rendered configuration with its temporary certificate, starts owned Caddy/Next/compiled Express processes, and checks verified-CA HTTPS, HSTS/CSP, invitation enrollment, actual mandatory MFA, Secure/HttpOnly/host-only cookies, CSRF/CORS rejection, refresh rotation, doctor/patient persistence with Bengali input, analytics, logout and protected redirects. It preserves gated missing-index preparation, verified MongoDB TLS, private API binding, startup/config rejection, BSON/index restoration with encrypted MFA and actual recovery login, database outage/readiness recovery and absence of public browser/API source maps.

Additional proxy checks reject unrecognized Host with canonical SNI, require fixed-origin redirects, exhaust one real client budget despite forged X-Forwarded-For/Host/Proto/Forwarded values, and verify an unavailable upstream gives an opaque 502 without a URL/query/cookie/authorization sentinel in runtime logs. No auth/CSRF/MFA/rate limit is disabled. HTTP Host policy is tested separately from TLS SNI so unknown certificate names cannot mask the routing assertion.

An early test preload used a Windows path instead of a file URL and failed; this was corrected without changing app behavior. A first HTTPS fixture used an IP without the required DNS SNI; it now uses localhost with canonical SNI. The resulting host test found that Caddy's named site leaves unmatched HTTP authorities without an explicit rejection; the template now adds a listener catch-all returning 421, verified in the full rehearsal. A lint-only bracket-regex escape was corrected. None of these unsuccessful attempts is counted as a passing rehearsal. The production-form hostname/email configuration also passed Caddy adaptation without service startup or certificate provisioning. A PowerShell npm wrapper consumed valued flags on an initial CLI smoke attempt; `npm.cmd` forwards them correctly and is documented. A production tablet E2E run also exposed a test timing race: the doctor picker's existing next-frame focus restoration received the following fill instead of the patient-name field. The trace showed the literal fixture name in doctor search. The helper now awaits the existing focus contract before entering the name; no UI/validation behavior or assertion was removed.

### Bounded resource observations

Successful Caddy rehearsal, Windows x64 / Node **22.16.0**, one-second numeric samples plus exit snapshots, no sustained load generation:

| Process                | Largest observed individual peak RSS                       | Sampled process CPU / elapsed                                   |
| ---------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| Healthy source API     | 162.3 MiB                                                  | 608 ms CPU over 16.2s elapsed                                   |
| Restored API           | 164.9 MiB                                                  | 624 ms CPU over 13.3s elapsed                                   |
| Next runtime           | 132.4 MiB                                                  | 640 ms CPU over 20.3s elapsed                                   |
| Next build and workers | 263.1 MiB largest individual process, 12 sampled processes | Largest individual sampled CPU 875 ms; worker durations differ. |

These are process observations from a small operational fixture, **not simultaneous whole-server RAM, CPU saturation, production throughput or the 200/4,000 quality workload**. Windows forced cleanup may leave last sampled values rather than final exits; Caddy, MongoDB fixture, browser, OS and unsampled native processes are outside this Node-only sampler. Do not sum individual lifetime peaks into a capacity claim. CI prints a comparable numeric summary for Linux. Real 4 GiB VM/build pressure, cgroup enforcement, p95 latency, Atlas pool use/failover and Bangladesh routing must still be measured after approval. No uncontrolled Atlas stress test was run.

### Larger-data quality profile

The separate bounded quality fixture passed with **200 doctors / 4,000 patients**, Node 22.16.0, Chromium 158.0.8127.18, Windows loopback, no throttling, fresh browser contexts and warm API/database. Three page samples and five API samples are observations, not a load test or production SLA.

- Empty dashboard JS **193,275 bytes**, populated dashboard **298,621 bytes**, Bengali font **244,604 bytes** transferred: exactly the retained Stage 5 asset sizes. No new asset optimization is claimed.
- Median ready time (including 500ms network-idle stabilization): empty dashboard **939.7ms**, populated dashboard **1,058.0ms**. Dashboard median CLS **0.0577**; no field CWV claim.
- Seven representative winning query plans retain the expected indexes. Page 300 examines **3,000 keys / 10 documents** for ten rows; growing offset/count cost remains a scaling limitation. No schema/index/query change was made.
- Larger-data dashboard/patient/edit automated WCAG-tag scans report **zero violations**; 320px overflow and doctor-picker keyboard focus checks pass. This does not replace manual screen-reader, clinical privacy or production accessibility review.

| API sample         | Median ms | Maximum ms | Response bytes |
| ------------------ | --------- | ---------- | -------------- |
| Dashboard overview | 10.58     | 17.77      | 84             |
| Distribution       | 41.87     | 43.53      | 2,126          |
| Trends             | 15.58     | 16.18      | 1,613          |
| Doctor page        | 11.20     | 12.81      | 2,852          |
| Doctor search      | 9.34      | 13.12      | 396            |
| Patient page       | 11.61     | 12.69      | 4,183          |
| Patient filter     | 11.81     | 13.28      | 4,179          |
| Patient deep page  | 11.97     | 13.42      | 4,184          |

The configured pool remains bounded to ten connections; sustained pool high-water/queue saturation, realistic concurrency and real Atlas/network latency were not measured. The profile does not establish production capacity or a new API speedup.

## Recovery and release safety

The rehearsal's BSON/index restore proves partial application integrity and preserved MFA against a second local database. **Atlas backup/PITR status, durable encryption, restore permissions, geographic recovery and actual RPO/RTO are unverified.** Proposed ≤1-hour RPO / ≤4-hour RTO and illustrative retention require owner acceptance, capability/cost review and a timed isolated cloud restore before production.

Keep the current MFA key escrow separately from database backups. Ordinary application rollback switches to the previous compatible verified build/config with the same live database and preserved key; it does not rewind clinical records. Serialized stop/start prevents overlapping API rate stores, with an approved maintenance window rather than a zero-downtime claim. The source archive must be built with real approved origins after fixture tests; do not deploy the workstation's fixture `.next` output.

## Mandatory deployment approval

The user's Stage 7 section 17 explicitly requires stopping after safe preparation. The [approval table](DEPLOYMENT_READINESS.md#stage-7-concrete-approval-record) names each unresolved item: provider/account/budget, public hostname/DNS owner, TLS contact/HSTS acceptance, secure vault/operator, actual Atlas access/backup/PITR/restore evidence, RPO/RTO/retention, monitoring/incident owners, resource/runtime validation, privacy/location policy, exact release SHA and maintenance/rollback authorization. Secrets must be supplied privately, never pasted into chat.

No production result is inferred from local tests or CI. The delivery handoff records the final commit, exact Actions run, working-tree state and source archive identity. Phase B remains a separately authorized operation.
