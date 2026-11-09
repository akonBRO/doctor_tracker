# Deployment approval gate

Stage 6 implements provider-independent operational safeguards and isolated verification. **No production deployment or infrastructure change has been performed or authorized.** A clean build, push or successful CI run is not deployment approval.

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
