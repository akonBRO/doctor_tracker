# Production deployment and recovery runbook

**Release is not authorized by a successful build, push or CI run.** Stage 7 Phase A performs no deployment. The owner must approve the concrete host/domain/edge/secrets/backup plan and the intended release commit before an operator changes infrastructure or production services.

Stage 7 adds a concrete [infrastructure proposal and environment inventory](PRODUCTION_INFRASTRUCTURE.md), [backup/recovery runbook](BACKUP_RECOVERY_RUNBOOK.md), [verification evidence](STAGE7_PRODUCTION_DEPLOYMENT.md) and updated [approval gate](DEPLOYMENT_READINESS.md). Those documents govern the proposed native Caddy/systemd setup; Stage 6 material below retains the application-level operational contract.

## Serialized native release and rollback

**Phase B only, after explicit approval.** The [infrastructure preparation](PRODUCTION_INFRASTRUCTURE.md#approved-host-preparation-and-release-commands) must be complete, with a built, verified, root-owned release and separately supplied secrets. The source package alone is not deployable. Record the full SHA, source/build/lockfile hashes, exact Node/npm/OS/Caddy versions, non-secret origins, prior release target, environment version identifiers, CI URL, operator and approval. Never record secret values.

Prepare the source package locally without deploying:

```sh
npm run release:prepare -- --commit FULL_40_CHARACTER_COMMIT_SHA --out tmp/approved-release
```

The command refuses short revisions, private/generated tracked paths, symlinks/submodules and existing output files. Check the resulting `SHA256SUMS` and manifest independently. Packaging is a guarded Git source archive, not a content-aware secret scanner or deployment approval. Review the staged diff/history separately. No artifacts or secrets are uploaded by this command.

Propose a **5–15 minute maintenance window for an already prepared release**, subject to measured host rehearsal and owner approval. Initial host/DNS/backup setup can take longer. There is no zero-downtime claim: public traffic is closed while old services stop and the new release is checked. With memory rate stores, restarts reset budgets; no overlapping API process is allowed even briefly.

Approved operator sequence:

1. Confirm backups, recoverable MFA key, incident contact, previous compatible build/config and rollback decision. Check free disk/RAM and that the new artifact has final approved origins, not fixture rewrites. Verify no other API process/host is running. Preserve current data; Stage 7 has no migration.
2. Announce the approved window. Stop public ingress before stopping the web/API. Preserve sanitized lifecycle logs and confirm successful API drain/exit rather than accepting a timeout or forced kill as success.

```sh
sudo systemctl stop doctor-tracker-edge
sudo systemctl stop doctor-tracker-web
sudo systemctl stop doctor-tracker-api
```

3. Verify all three units are inactive and only approved bindings exist. Record `readlink -f /opt/doctor-tracker/current` privately as the rollback target. Select the already verified new release with an atomic same-filesystem symlink switch. The explicit SHA must match approval and an existing root-owned directory:

```sh
RELEASE_SHA=FULL_40_CHARACTER_APPROVED_COMMIT_SHA
test "${#RELEASE_SHA}" -eq 40
case "$RELEASE_SHA" in *[!0-9a-f]*) exit 1 ;; esac
test -d "/opt/doctor-tracker/releases/$RELEASE_SHA"
test ! -e /opt/doctor-tracker/next
test ! -L /opt/doctor-tracker/next
sudo ln -s "/opt/doctor-tracker/releases/$RELEASE_SHA" /opt/doctor-tracker/next
sudo mv -T /opt/doctor-tracker/next /opt/doctor-tracker/current
sudo systemctl start doctor-tracker-api
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4000/api/v1/health/ready
```

Run commands in a fail-fast operator shell. Allow bounded startup time; a failed curl does not authorize continuing. Inspect sanitized startup/index/config events. If a unit failed repeatedly, investigate before an intentional `systemctl reset-failed`; never loop unbounded restarts. Do not auto-prepare indexes to bypass startup failure.

4. When private API readiness succeeds, start web; inspect private web readiness, then start the edge and verify public HTTPS with normal certificate validation. Run the complete manual smoke checklist below, including actual MFA/refresh/CSRF/CORS and independent client IP budgets. Do not add synthetic patients to a live clinical database without separate authorization.

```sh
sudo systemctl start doctor-tracker-web
curl --fail --silent --show-error --output /dev/null --max-time 5 http://127.0.0.1:3000/
sudo systemctl start doctor-tracker-edge
```

5. Stop/rollback on failed startup, auth/session errors, incompatible build/origins, persistent readiness/DB failure, new 5xx, memory exhaustion or failed smoke checks. Keep public traffic closed, stop new services in the same order, set RELEASE_SHA to the **previous approved compatible SHA**, repeat the guarded switch, then start one API/web/edge and verify again. Retain the failed artifact/logs for investigation. Preserve current database and MFA key; do not restore a snapshot for an ordinary code failure.
6. Open the maintenance window only when acceptance checks pass; observe resource/DB/auth/5xx signals with the named owner. Record actual downtime and whether rollback succeeded. Enable boot startup after initial acceptance and verify actual host reboot recovery at an approved time. Check certificate renewal, alerts and backup restore before declaring production ready.

No shell script, CI job or Git push in this repository invokes these service/DNS/cloud operations. The GitHub environments API returned zero configured environments during Phase A inspection; a future deployment workflow must add and verify reviewer protection instead of assuming it exists.

## Architecture and responsibility

Use the same-origin architecture and environment inventory in [Stage 6 readiness](STAGE6_DEPLOYMENT_READINESS.md). Initially run one Next process and one Express process behind the trusted TLS edge; Atlas remains private/restricted and uses verified TLS. Do not expose the development Compose database. No real hostname/provider is assumed here.

The owner chooses the hosting account, public origin, DNS owner, region/data location, TLS terminator and renewal responsibility, secret manager, Atlas access/backup plan, monitoring recipient and recovery objectives. The release operator needs scoped host/deployment access, the approved configuration, database/index preparation access when needed and a separate authorized backup/restore operator. Routine application credentials should have only necessary data permissions; production index verification needs index-list permissions, while index creation is reserved for the approved preparation role.

Secrets are injected outside source/build logs. Preserve the existing MFA encryption key and keep its recoverable copy under separate restricted, audited secret-manager access. A database backup alone cannot decrypt MFA. Follow [Security rotation](SECURITY.md#secret-rotation); this runbook does not rotate anything automatically.

## Approval and preflight

Before release, record and approve:

1. Exact tested commit, lockfile, CI URL and compatible Node 22 patch/runtime image.
2. Hosting/provider/region, one-API process enforcement, private API binding, supervisor behavior and maintenance/traffic-drain plan.
3. Real `APP_ORIGIN`/`WEB_ORIGIN`, private `API_ORIGIN`, intended DNS records, TLS certificate/renewal, HSTS subdomain implications and the exact trusted hop count. Confirm no shorter untrusted route reaches Express.
4. Secret-manager names/access, current signing/CSRF/MFA keys, production Secure-cookie policy and database credential/network/TLS access. Never paste values into the release record.
5. Atlas tier, transaction capability, current index inventory, backup/PITR capability, retention, last verified restore, backup owner and explicitly approved **RPO/RTO**. Neither objective has been supplied or achieved in production by this project.
6. Monitoring/alert destination, incident owner, retention/deletion policies, clinical/privacy/access review and rollback window.
7. Explicit approval to deploy that release. Additional approval is required for DNS, paid resources, credential rotation, backup policy changes, index preparation or production restore; none is implied by Stage 6 implementation.

If any essential input is missing, stop before the production action. Repository preparation and disposable checks may continue. No automatic production deployment on `main` exists.

## Build and prepare an approved release

Run in a clean isolated build environment with the real server-only **build** origins injected. Do not reuse local test artifacts or copy developer environment files.

The build/verification environment needs development tooling: keep `NODE_ENV` unset during `npm ci`, or use `npm ci --include=dev` if the host forces production mode. Inject only the web origins needed for the build; API database/signing/MFA secrets are runtime inputs and are not needed to compile either application.

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm audit
npm audit --omit=dev
```

Browser/operations tests use their own fixture origins and databases. They belong in CI or a separate verification build; `test:operations` creates a new `.next` build for its temporary HTTPS origin. **Build the final release again with approved real origins after fixture tests.** Keep build and runtime `API_ORIGIN` equal. Match HTTPS transport for `APP_ORIGIN`; runtime startup rejects rewrite/header drift. Omit `WEB_ALLOW_LOCAL_HTTP` and test-only variables in release configuration.

For the existing Stage 6 database, no schema/index migration is needed. Production start lists/verifies required indexes without creating them. For a separately approved new database or missing-index repair, verify target identity and backup first, then run the privileged command with approved injected configuration:

```sh
npm run db:prepare -w @doctor-tracker/api -- --apply-indexes
```

This command is **not part of automatic startup/deployment/CI against Atlas**. It creates required indexes only; it never drops conflicting indexes or fixes data automatically. If it fails, inspect the conflict privately and seek a reviewed repair plan. Do not use `syncIndexes`, drop indexes, seed data or clear collections to make startup pass.

## Release sequence after explicit approval

1. Confirm backup/recovery status and approved RPO/RTO. Preserve the previous compatible artifact/configuration and encryption key versions.
2. Drain public traffic or enter an approved maintenance window. With memory rate stores, do not overlap old/new API replicas in a rolling deployment. Restart resets rate budgets; edge protections remain necessary.
3. Stop the old API gracefully using the supervisor's SIGTERM path. Allow more than the ten-second application ceiling; verify successful exit/draining logs. A forced/nonzero shutdown is an incident signal, not a routine success.
4. Start the approved API with injected production configuration, then wait for readiness. Start Next from the approved build using the same build/runtime origins. Typical commands are:

```sh
npm run start -w @doctor-tracker/api
npm run start -w @doctor-tracker/web
```

5. Keep both processes private behind the intended edge. Configure an allowlist for the approved public hostname, fixed forwarded-header handling, request/body limits, header/idle/upstream deadlines, TLS redirects and health probes. Confirm genuine client IP attribution before enabling traffic. The supplied web start script binds loopback for the recommended same-host arrangement; a separately approved container/private-network deployment needs an explicit protected Next bind override with `apps/web` as working directory.
6. Run the smoke checks below, enable public traffic gradually using the host's approved mechanism and observe errors/latency/resource metrics. Do not mark release successful on a health check alone.
7. Record actual artifact, config identifiers, operator, time, smoke outcome and rollback decision. Never record secrets, recovery codes, invitation URLs or patient payloads.

Issue real invitations only from the approved private operator environment using the API workspace's compiled `invite:production` command and injected configuration. Its one-time invitation output is intentionally private operator material; do not run it in CI or attach its output to release logs.

## Production smoke checks — manual verification required

- Public HTTPS certificate/hostname/chain, redirect policy, renewal monitoring, HSTS scope, nonce CSP, frame/MIME/referrer/permissions headers and absence of public source maps.
- Readiness `/api/v1/health/ready` (legacy `/health`) and process liveness `/api/v1/health/live`; generic no-store responses only. Use private low-frequency probes (for example 15–30 seconds), account for the global budget and distinguish 429 from dependency failure. Allow startup time for dependency/index checks before the API begins listening, and configure bounded supervisor restart backoff.
- Controlled approved administrator invitation/login, mandatory MFA, recovery procedure, access expiry/refresh across tabs, logout/session revocation and protected-route rejection. Do not create test patients in the live clinical database without separately authorized data procedures.
- Secure/HttpOnly/Strict/Path=/ host-only `__Host-` cookies, exact CORS, signed CSRF, no local/session-storage authentication tokens and no cacheable private responses.
- Proxy spoofing test through the actual permitted path: edge overwrites `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`; direct API bypass is blocked; real clients get correct independent budgets. Never trust arbitrary forwarded headers.
- Approved doctor/patient reads and bounded search/filter/page; analytics totals/trends/distribution; Bengali fonts/static assets; empty/loading/error states. Use a controlled test database for write/destructive checks.
- Resource limits, restart behavior, traffic drain, database-unavailable/readiness/recovery, alert delivery, log redaction, backups and a documented rollback decision.

Local fixture TLS and CI do not replace any of these host/domain checks. No live smoke test has been executed in Stage 6.

## Monitoring and incident response

Use the host's existing structured stdout collection; no new vendor/library is required. Restrict log access/retention. Application events contain request ID/method/status/duration and named lifecycle/database events, not URLs, bodies, credentials or clinical values. Independently review edge/host access logs and third-party error-reporting configuration before enabling them.

Configure actual alerts and owners after hosting selection. Suggested starting signals, to tune against real traffic rather than claim an SLA:

| Signal                                                    | Initial operational response                                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repeated readiness failures, disconnected/error events    | Check dependency/network/credential health through private tooling; avoid endless restart loops. Keep liveness separate from database readiness. |
| Nonzero exits, deadline-exceeded or frequent restarts     | Inspect sanitized lifecycle timeline and process resource limits; preserve evidence and consider rollback.                                       |
| Sustained 5xx / rising latency                            | Correlate request IDs/status/timing with resource and Atlas metrics. Do not attach payloads to logs.                                             |
| Elevated 401/403/429                                      | Check proxy IP attribution and abuse patterns before changing limits; never disable MFA/CSRF/rate controls to restore service.                   |
| Pool wait/query/socket timeouts                           | Check actual query plans, load, connections, storage and Atlas capacity. Existing 200/4,000 fixture is not a production capacity guarantee.      |
| Backup failure, restore-drill failure, certificate expiry | Escalate to the named backup/TLS owner and suspend risky releases until recovery/renewal is restored.                                            |

On an incident: assign an operator, restrict exposure if necessary, preserve sanitized evidence, determine whether the failure is app/config/network/database/credential related, then execute the reviewed rollback or credential/session-revocation procedure. Do not print raw driver errors/connection strings or rotate the MFA key blindly. Unauthorized-access incidents may require deliberate session revocation and separate recovery handling.

## Backup plan and restore drill

The actual Atlas tier and backup settings are unknown. [Atlas Cloud Backup](https://www.mongodb.com/docs/atlas/backup/cloud-backup/overview/) documents different capabilities for dedicated, Flex and Free deployments; do not assume snapshots or PITR are enabled. A backup operator needs the applicable Atlas backup role/access. Owner approval is required before changing tier, paid capability, retention, region or backup policy.

Set policy from approved RPO/RTO, health-record retention and deletion obligations, budget and available capabilities. Consider short-interval recovery points, daily retention covering operational mistakes, longer archival requirements and a separately protected regional failure copy where justified. Record exact schedule/retention/restore destination and ownership once chosen; none has been configured here. Protect backups with encryption and restricted access, and retain recoverable MFA encryption keys independently for the same recovery window.

Prefer restoring an Atlas snapshot/PITR to a **new isolated cluster/database**, preserving the live source. Confirm version/feature compatibility, topology, users/roles, indexes, document counts, doctor/patient relationships and key availability. Restrict access before starting the app. Revoke restored sessions/challenges deliberately before cutover; users should reauthenticate. Validate real MFA/recovery, reads and approved writes against the restored environment, measure restore duration and actual data-loss interval, then obtain approval before changing traffic/configuration. Do not restore over production or use destructive restore flags by default.

If using logical tools instead of Atlas snapshots, use compatible [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/mongorestore/), explicit target namespace/destination and a reviewed encrypted artifact procedure. Credentials must be supplied through an approved private mechanism, not pasted into shell history or runbooks. `mongorestore` can create collections/indexes; inspect its target and compatibility before execution. No production logical-tool command is supplied with an actual URI, and no tool restore was executed here.

The shipped safe rehearsal is:

```sh
npm run test:operations
```

It only creates its own disposable replica set, HTTPS/TLS fixtures and temporary certificate. API secrets are generated for the fixture and its database URI is constructed internally; no API env file or external database URI is used. Next performs its normal web env loading, with fixture origins explicitly overriding local values; environment files are not modified. BSON and index metadata remain in memory and are restored into a separate fixture database after deleting a fixture patient from the source. It verifies IDs/relationships, encrypted MFA and actual restored-account login. This is **partial application-level restore evidence**, not verification of durable cloud backups, PITR, Atlas permissions or an approved production RPO/RTO. Temporary certificates are removed; successful logs omit credentials and patient payloads.

## Rollback and disaster recovery

**Failed application release:** drain traffic, retain logs, stop the failed artifact and restart the previous compatible artifact/configuration with the same preserved database and MFA key. Verify readiness and controlled auth/reads before reopening. Stage 6 has no schema migration. Do not restore an old database merely to roll back code: that can discard newer legitimate writes.

**Accidental patient deletion/data corruption:** preserve the current source and audit context; identify the last trustworthy recovery point. Restore separately and compare exact affected records/relationships under authorized access. Review a minimal reconciliation plan; never copy whole old collections over newer production data automatically. No deleted-event history or universal undo exists in this application.

**Database/region loss:** follow the approved backup plan to an isolated compatible target, restore required keys/access/indexes, revoke restored sessions, verify the application and measure RPO/RTO. After explicit approval, rebuild/reconfigure the API/web where required and switch traffic/DNS using the approved operator. Keep the source/failed environment isolated for evidence; do not delete it automatically.

Schedule restore rehearsals at an owner-approved cadence and after material backup/key/schema/platform changes. A written runbook is not a passed drill. Record failures, actual timing, data integrity and assigned follow-up work.
