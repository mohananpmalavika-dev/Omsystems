# Testing, deployment, and troubleshooting

## Testing

The repository uses Vitest for many root and workspace tests and provides
specialized TypeScript runners. Useful root commands include:

```powershell
npm run typecheck
npm run typecheck:all
npm test
npm run test:smoke
npm run test:integration
npm run test:security
npm run test:tls
npm run test:config
npm run test:media:on-demand
npm run release:preflight
```

For a focused test, run the specific Vitest file or documented npm script for
the changed domain. Tests may require PostgreSQL, Redis, external services,
model assets, device fixtures, or host-specific runtimes. Record skipped tests
and missing prerequisites; do not report them as passed.

The root test suite does not automatically represent all workspace suites.
Inspect each workspace's package scripts and CI workflow before release.
CI configuration includes separate type/build/test and dependency-scan
workflows. Verify status for the exact commit intended for deployment.

Performance, scale, chaos, and acceptance runner presence is not a verified
capacity/availability result. Execute with controlled infrastructure and
retain the measurements.

## Deployment options

### Root Compose stack

`compose.yaml` builds and runs API, dashboard, media gateway, recording engine,
analytics engine, MediaMTX, Redis, and PostgreSQL. It is a convenient integrated
stack but its ports and database setup are not a complete hardened public
deployment. See [Installation](getting-started.md).

### Production Compose file

`docker-compose.production.yml` defines PostgreSQL 16, password-protected Redis,
control plane, dashboard, media gateway, recording engine, analytics engine,
and Prometheus/Alertmanager/Grafana. It requires additional secrets and external
configuration; review the file and `.env.production.example` before use.
Database TLS settings and certificate values must be supplied and validated.
Add an approved TLS ingress/network policy and verify published ports are not
reachable from unauthorized networks.

These two Compose files differ in ports, versions, services, and required
environment. They are not interchangeable without reviewing those differences.
The repository also includes Kubernetes and cloud/platform deployment
artifacts; this manual does not certify them.

### Image build constraints

The root Dockerfile uses Node.js 22 Alpine stages, compiles the root
application, builds communications code, and verifies a separately supplied
Windows edge-agent release. The Windows executable is not tracked in Git and
must match its release manifest. A build that fails this verification is
expected until a valid release artifact is supplied.

The production image entrypoint downloads the ArcFace model if missing, runs
migrations, and starts the API. Model download access and checksum configuration
must be reviewed. Do not assume a successful image build means the model,
database, or external dependencies will be available at runtime.

## Release checklist

- Pin the exact source revision and built artifacts.
- Review secrets/configuration and TLS/network boundaries.
- Validate database connectivity and migration status; back up before schema
  changes.
- Confirm edge release checksum and model availability/integrity.
- Build and test every target workspace, including focused integration tests.
- Review dependency and secret scans for the exact revision.
- Validate health/readiness, dashboard login/scope, media, recording, alerting,
  backup, and restore in a staging environment.
- Obtain operator/security/privacy approval for the production cutover.

## Troubleshooting

| Symptom | Checks |
|---|---|
| API exits before listening | Check `DATABASE_URL`, database DNS/network, credentials, database availability, and migration logs. The entrypoint runs migrations before app startup. |
| Migration fails or appears skipped | Run `npm run migrate:status`; review exact migration name/logs; verify PostgreSQL version/extensions and backup. The runner can mark certain already-existing-object errors as applied, so inspect actual schema. |
| Dashboard loads but data is missing | Check dashboard-to-control-plane URL, authentication/session, tenant/branch scope, feature settings, and API readiness. |
| Live video unavailable | Verify camera reachability and credentials, access grant, media gateway/control-plane keys, MediaMTX URLs, supported stream format, and browser transport/network. |
| Recording missing or stops | Check recording engine health, assigned storage path/permissions/free space, camera stream input, shared keys, retention, and segment/continuity health. |
| Analytics/AI unavailable | Check analytics engine health, model/rule/configuration, required model files and runtime dependencies, and analytics shared keys. |
| Alerts not delivered | Inspect alert policy, recipient resolution, provider credentials/network, and notification attempt history. |
| Stale device status | Check telemetry timestamps, edge-agent presence/network, device reachability, and whether the displayed reading is estimated/unavailable. |
| Docker build fails at edge release check | Supply the required separately distributed Windows release and matching manifest; do not bypass verification. |
| Database restore refuses to run | Confirm dump and sidecar manifest match, `RESTORE_DATABASE_URL` is set, `pg_restore` is installed, and `--confirm-restore` is explicitly supplied. |

Capture timestamps and redacted logs when escalating. Never include secrets,
tokens, camera credentials, or unredacted recordings in logs or tickets.
