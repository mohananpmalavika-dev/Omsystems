# Phase 5: Scale proof, security, HA and rollout

Phase 5 provides the repeatable machinery needed to prove a configured 400-branch camera target. It does not label the platform production-certified merely because the harness exists: certification becomes true only when the full requested camera inventory, 100 dashboard users, API SLOs, reconnect threshold and a continuous 24-hour execution are all present in one measured evidence file.

## Implemented controls

- The obsolete randomized load generator now calls the real branch, camera, edge-agent telemetry, health, drill-down and report-export contracts.
- Progressive stages emit observed request counts, failures, p50/p95/p99, inventory, reconnect/replay percentages, export duration and explicit certification state.
- `/ready` verifies database reachability; `/metrics` exposes process request, latency, in-flight and backpressure metrics.
- Requests are protected by a bounded concurrency guard and database pool, statement and query timeouts.
- PostgreSQL adds query indexes, operational-history retention, partitioned SLO measurements and signed scale-run records.
- Audit events are hash-linked and protected from update/delete by database triggers.
- Production configuration rejects development authentication and placeholder values. Sensitive settings support `_FILE` secret mounts.
- Kubernetes assets provide three replicas, rolling updates, topology spread, PDB, HPA, restricted pod security, network policy, TLS ingress, probes, resource limits and durable report/backup volumes.
- CI runs the cumulative Phase 0-5 gate, high-severity dependency audit and filesystem vulnerability scan.

### Time-bounded dependency exceptions

The July 2026 npm audit has residual high findings in Next.js 16.2.12 (`postcss`/`sharp`) and ExcelJS 4.4.0's archive tree. npm's offered fixes are destructive downgrades to Next 9.3.3 and ExcelJS 3.4.0. The CI gate therefore blocks every new high/critical package while allowing only the enumerated current dependency chains through 2026-08-15; it fails automatically after that date. Trivy still publishes the complete SARIF result. These exceptions require security-owner approval and must be removed as soon as compatible upstream releases exist.

## Execute scale evidence

Use a production-like isolated environment. The test can provision inventory when the test identity has device configuration access.

```powershell
$env:PHASE5_BASE_URL="https://staging-surveillance.example.com"
$env:PHASE5_USER_ID="phase5-load-operator"
$env:PHASE5_PARENT_NODE_ID="region-scale-test"
$env:PHASE5_PROVISION="true"
$env:PHASE5_STAGES="10:300,50:900,100:1800,400:86400"
$env:PHASE5_CAMERAS="10000"
$env:PHASE5_DASHBOARD_USERS="100"
npm.cmd run test:phase5 --prefix load-testing
```

The process exits with code `2` when execution completed but certification for the configured target is still incomplete, and `1` for a harness or target failure. The configured `PHASE5_CAMERAS` value is the certification floor; a 10,000-camera run cannot pass with only 5,000 cameras present. Evidence is written beneath `load-testing/reports`. Preserve its SHA-256 digest and import the approved result into `platform_scale_test_runs`.

## Rollout gates

| Wave | Entry gate | Observe | Rollback trigger |
| --- | --- | --- | --- |
| 10 branches | Backup and restore drill passed; P1 routing verified | 48 hours | Any tenant leak, data loss, or sustained error rate above 1% |
| 50 branches | 10-branch SLOs green | 72 hours | p95 above 500 ms for 15 minutes or health freshness below 95% |
| 100 branches | Provider outage/retry and node-loss exercises passed | 7 days | Notification queue age above 30 seconds for P1 or reconnect below 99% |
| 400 branches | 24-hour 400/configured-camera-target/100-user test approved | 14 days | Availability below 99.9%, integrity failure, or client stop decision |

Rollback uses the prior immutable image digest, pauses new branch enrollment, preserves queues, and restores data only when an integrity incident requires it. Database rollback must use a forward corrective migration unless the incident commander authorizes the tested restore procedure.

## Backup and recovery exercise

1. Run `npm run backup:database -- C:\approved-backups`; copy the dump and manifest to immutable/off-site storage.
2. Provision an isolated recovery database.
3. Set only `RESTORE_DATABASE_URL` to the isolated target.
4. Run `npm run restore:database -- C:\approved-backups\sentinel-....dump --confirm-restore`.
5. Run migrations, `/ready`, tenant-isolation checks, report checksum checks and a sample playback/evidence retrieval.
6. Record actual RPO and RTO, approver, evidence hashes and discrepancies. A documented target is not a demonstrated result.

## Remaining production exercises

The following require client infrastructure and cannot be truthfully completed in a local code change: 24-hour endurance, real WAN impairment, managed-database failover, node termination, provider sandbox outage, media browser 8-hour soak, AI GPU saturation, secret rotation with the deployed secret manager, external penetration testing and client-approved RTO/RPO recovery. The rollout must not advance to 400 branches until their signed evidence is attached.
