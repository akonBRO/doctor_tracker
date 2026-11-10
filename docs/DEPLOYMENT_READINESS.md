# Deployment approval gate

Stage 7 Phase A prepares a concrete native deployment package on top of Stage 6 safeguards. **No production deployment or infrastructure change has been performed or authorized.** A clean build, push or successful CI run is not deployment approval. The user's Stage 7 instructions, section 17, require a separate deployment approval and mandatory stop here.

## Stage 7 concrete approval record

Recommended: DigitalOcean Basic regular **2 vCPU / 4 GiB / Singapore SGP1**, Ubuntu 24.04, pinned Caddy → private Next → private Express → existing Atlas. Published VM price $24/month; proposed daily host backup $7.20, **$31.20/month before Atlas, domain, tax and overages**, checked 10 November 2026. See dated sources and alternatives in [Production Infrastructure](PRODUCTION_INFRASTRUCTURE.md).

| Approval item                 | Phase A result / answer still required                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider/account/billing      | Recommendation prepared; owner must identify the account, accept region/data location and spending limit. Nothing provisioned.                                                       |
| Domain and DNS                | **Missing** exact hostname, zone access owner and intended records. No DNS changed.                                                                                                  |
| TLS/renewal                   | Review-only Caddy template and local certificate tests; owner must supply contact, accept HSTS subdomain scope and assign renewal/expiry owner. Public issuance unperformed.         |
| Release                       | Explicit full-SHA source archive + checksums and verification-only CI; owner must approve the final pushed SHA/CI and built artifact/config record. No deployment trigger.           |
| Secret supply                 | Separate private vault-to-root-0600 files, separate runtime UIDs; owner must designate secure operator/vault and confirm recoverable **existing MFA key**. No values in chat/Git/CI. |
| Atlas access                  | Actual tier/region/transaction capability, network restrictions, least-privileged account and existing indexes require private verification. No live changes performed.              |
| Backup/PITR                   | **Unverified**; owner must choose funded capability, schedule/retention/region, backup operator and a successful isolated restore record. Host backup excludes Atlas.                |
| RPO/RTO                       | Propose ≤1h / ≤4h; **not approved or achieved**. Reconcile with real capability and timed drill before release.                                                                      |
| Processes/rate limits         | One API, serialized maintenance stop/start. No managed rolling overlap, PM2 cluster or CDN shortcut; shared stores required before scaling.                                          |
| Host verification             | Unit syntax and local Caddy integration tests only. Actual filesystem/cgroup hardening, Node patch, firewall/IPv6, termination/reboot and resource headroom remain to verify.        |
| Monitoring/operations         | Thresholds and procedures prepared; incident, TLS, patch and backup owners/alert destinations **unassigned**. No alert delivered.                                                    |
| Privacy/clinical operations   | Owner must accept access, location, record retention/deletion and log/backup policy. Automated axe checks are not a manual accessibility or compliance certification.                |
| Maintenance/rollback approval | Owner must approve operator, exact operations/window, prior compatible artifact and rollback/smoke procedure. Proposed prepared-release window 5–15 minutes is an estimate.          |

Authoritative Stage 7 evidence: [delivery record](STAGE7_PRODUCTION_DEPLOYMENT.md), [infrastructure](PRODUCTION_INFRASTRUCTURE.md), [backup/recovery](BACKUP_RECOVERY_RUNBOOK.md), [serialized release/rollback](PRODUCTION_DEPLOYMENT_RUNBOOK.md#serialized-native-release-and-rollback). Do not close production conditions based on local fixtures.

The canonical technical inventory and evidence are in [Stage 6 readiness](STAGE6_DEPLOYMENT_READINESS.md). The [Production Deployment Runbook](PRODUCTION_DEPLOYMENT_RUNBOOK.md) contains release, smoke, monitoring, backup/restore, rollback and incident procedures. [Implementation status](IMPLEMENTATION_STATUS.md) records actual commands/results; Stage 5 measurements remain in the [quality audit](STAGE5_QUALITY_AUDIT.md).

## Implemented safeguards

- Production API requires injected production mode, secure cookies, exact HTTPS origin, verified MongoDB TLS, explicit database/proxy/process settings and one declared API instance.
- Production web requires explicit origins and HTTPS. Startup checks the baked API rewrite and security-header transport. Local HTTP needs explicit loopback-only test opt-in.
- API startup verifies existing indexes without automatically creating/syncing/dropping them. Privileged preparation is a separate explicit approved operation.
- Dependency-aware readiness, process liveness, draining shutdown, bounded HTTP/pool behavior and sanitized lifecycle/connection logs are implemented and tested.
- Existing mandatory MFA, rotation/revocation, CSRF/CORS, authorization, global/account budgets, no-store data handling, UI and Stage 5 asset improvements remain.
- CI is verification-only and includes isolated production-like HTTPS/recovery checks. No production deployment trigger, resource or GitHub secret is added.

These controls do not configure or prove the actual hosting topology, backups, public TLS or privacy/compliance acceptance.

## Decisions required before deployment approval

| Owner input         | Required concrete answer                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosting             | Provider/account/region, Node runtime, process supervisor, private network/binding and resource limits.                                    |
| Public origin / DNS | Real hostname, DNS owner and intended records; none is invented here.                                                                      |
| TLS / proxy         | TLS terminator/renewal owner, exact trusted hop count, forwarded-header overwrite policy, direct API isolation and HSTS scope.             |
| Secrets             | Secret-manager access/injection and recoverable current MFA key. No live key is regenerated or rotated in Stage 6.                         |
| Atlas               | Actual tier, replica-set/transaction capability, least-privileged access, network restrictions, verified TLS and existing index inventory. |
| Backup / recovery   | Capabilities, retention/schedule/PITR, protected destination, backup operator, approved RPO/RTO and measured successful restore.           |
| Rate limits         | One API process enforced, no rolling overlap; a tested shared store is required before scaling beyond one.                                 |
| Operations          | Monitoring/alert recipient, incident owner, maintenance/rollback plan and privacy/clinical-record policies.                                |
| Release approval    | Exact tested commit, intended operations, operator, smoke/rollback plan and explicit owner authorization.                                  |

## Still requires manual production verification

Actual domain/certificate/proxy IP attribution; Secure-cookie/CSRF/CORS/CSP behavior through that path; database permissions/TLS/failover; supervisor termination and traffic drain; resource sizing; alert delivery; backup/PITR restoration; approved RPO/RTO; applicable health-data/access/retention controls. The disposable BSON/HTTPS rehearsal does not substitute for these checks.

No Atlas data, local environment contents, production credentials, live DNS or cloud resources are changed by repository readiness work. Do not deploy until the missing inputs and concrete release plan have been approved.
