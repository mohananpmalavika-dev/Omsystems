# Operations, backup, and recovery

## Health and observability

The control plane exposes health/readiness/metrics endpoints in the checked-in
OpenAPI contract. The root and production Compose files define service health
checks. The production Compose file also includes Prometheus, Alertmanager, and
Grafana services with mounted configuration.

Monitor at least:

- API and dependency readiness;
- PostgreSQL capacity, connection health, backups, and migration status;
- Redis availability and persistence configuration;
- recording volume free space, recording continuity, retention, and integrity
  checks;
- edge-agent and camera telemetry freshness;
- media gateway/MediaMTX reachability and playback failures;
- analytics model/pipeline health and alert delivery;
- TLS certificate expiry and external provider failures.

Telemetry values can be stale, estimated, unavailable, or unsupported. Monitor
age and quality as well as value. Configure alert receivers and test delivery;
the presence of Prometheus rules or notification code does not mean alerts are
being delivered.

## Database backup

The root package provides `npm run backup:database`, implemented by
`scripts/backup-postgres.mjs`. It runs `pg_dump` in custom format and writes a
sidecar JSON manifest containing a SHA-256 checksum and an
`encryptedAtRestRequired` marker.

```powershell
npm run backup:database
```

The script does not encrypt the dump, upload it, enforce retention, or verify a
restore. Store dump and manifest in access-controlled encrypted storage; keep
keys separate; define retention and deletion policy; and record backup age and
completion outside the database being protected.

The database backup does not include recording volumes, Redis data, external
object storage, media configuration, model files, secrets, or separately
distributed edge releases. Back those up using the relevant storage/platform
procedure.

## Restore

The restore helper requires:

- a `.dump` file plus matching `<dump>.manifest.json`;
- a `RESTORE_DATABASE_URL` environment variable (it deliberately ignores
  `DATABASE_URL`);
- explicit `--confirm-restore`;
- `pg_restore` available on `PATH`.

Example invocation after verifying the target, backup, and change approval:

```powershell
$env:RESTORE_DATABASE_URL = "postgres://<user>:<password>@<host>:5432/<target>"
node scripts\restore-postgres.mjs .\backups\<backup>.dump --confirm-restore
```

The helper verifies the backup SHA-256 against the manifest and calls
`pg_restore --clean --if-exists --no-owner`. This is destructive to objects in
the target database. Restore first into an isolated database; inspect the
restored schema/data and application compatibility before any cutover. A
successful process exit is not by itself a business-level recovery validation.

## Recovery checklist

1. Declare the incident and identify affected service, tenant, time range, and
   data stores.
2. Isolate or fence the intended recovery target. Confirm it is not the active
   production database.
3. Preserve relevant logs and evidence; avoid overwriting the only known-good
   backup.
4. Verify the dump checksum and required storage/model/configuration backups.
5. Restore and validate in isolation.
6. Reconcile migration status, user access, service connectivity, recordings,
   evidence metadata, and telemetry.
7. Follow approved cutover/failback steps and monitor for divergence.
8. Record outcome, data-loss window, and follow-up actions.

The repository does not set an RPO/RTO or prove that an organization has
completed a recovery drill. Define these with service owners and test them.

## Recording and object storage

Recording engine source includes local and additional storage/failover/export
code paths. Configure persistent storage with appropriate capacity, permissions,
monitoring, backup, and retention. Validate the specific storage backend and
failure path; the local Compose volume is not a production backup strategy.

## Release and rollback

The package includes release preflight, production-release, and rollback
scripts. Review their safeguards and target configuration before use. Avoid
manual rollback of database changes unless the recovery plan explicitly
supports it; many migrations are forward changes.
