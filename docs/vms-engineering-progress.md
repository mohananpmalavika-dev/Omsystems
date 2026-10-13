# VMS engineering progress and release gates

Updated 14 October 2026. Verification began on 13 October; evidence filenames
retain that session date. This records local engineering work after the
[initial competitive baseline](vms-competitive-baseline.md). It does not certify
a deployed release, error-free operation or a market ranking.

## Implemented

| Area | Change and verification boundary |
|---|---|
| Mobile incident handling | Authentication, active-user checks, tenant/branch scope, read-only restrictions, persistent actions and audit, conflict detection, configured contacts and bounded scoped reconciliation. Unavailable health and actions surface errors. Mobile proxy strips spoofed identities and enforces same-origin cookie mutations. Tests include HTTP stream disconnect. |
| Mobile interface | Replaced the separate simulated SOC view with the shared command center. Removed fabricated patrol checkpoints and success messages. Unconfigured SOS/check-in actions are disabled. No field-device acceptance has been performed. |
| Authorization and sessions | Administrator privilege derives from explicit roles; usernames, magic IDs and stale flags no longer grant it. Inactive users are denied. Bootstrap access-session expiry matches the one-hour token lifetime. |
| Playback model | Recording indexes must be supplied and validated. Missing recordings/keyframes remain unavailable. Partial camera gaps preserve available tracks; seeking back to footage restores the stream URL. Frame-step requests resolve through the index. This does not prove decoded-frame accuracy or connect the standalone model to a recording engine. |
| Evidence model | Removed manufactured sealed exports, hashes and related-camera/event data. Clip exports require an injected exporter and validate returned identity, time window, cameras, duration and manifest hash. Integration and byte-level evidence verification remain necessary. |
| SQL operational APIs | Health snapshots persist explicit branch identity and metrics; legacy snapshots are backfilled by additive migrations. Health listing aggregates are valid SQL, with latest snapshots and actual issue/correlation rows. ANPR and watchlist mutations return consistent camel-case fields while retaining legacy SQL keys. Detections/violations receive timestamps. Latest watchlist detection fields come from one row. Read-only/inactive users and foreign-tenant branches are rejected in the tested creation paths. |
| Alert truth | Watchlist detections no longer report that a blacklist alert was created when integration is unconfigured. Alert generation/delivery remains an open requirement. |
| Storage truth | Removed invented 15% free-space headroom for full disks. Critical and warning capacity thresholds now affect operational status and generate the corresponding alert reason. Tests preserve actual zero free space and check near-full severity separately from SMART, RAID and write evidence. Recorder overwrite behavior still needs device acceptance. |
| Analytics lifecycle | Core routes load before model initialization and plugin timers. Disabled face recognition avoids unnecessary module loading. Shutdown waits for startup, shares statistics initialization between engines and closes the pool after the last owner; query-failure cleanup releases checked-out clients. Adapter tests use controlled empty model directories and explicit detections, not installed model accuracy as an implicit dependency. |
| Migration safety | A failed migration rolls back and is never marked applied. Checksums are validated by default. Guardian Network's separate schema is excluded. All 205 control-plane migrations succeeded on a fresh isolated PostgreSQL database; a second run validated checksums and reported nothing pending. |
| Dependencies and builds | Applied compatible dependency updates, supplied the offline-player TypeScript configuration and corrected recorder SDK response-type compatibility. Database images include pgvector for the vector extension. Existing installations still require restore/upgrade acceptance before changing images. |
| Secret handling | Removed a hardcoded JWT signing value from a scratch probe; it now requires the environment. Improved scan buffering and test-fixture placeholders. Repository scanning is a heuristic, not proof that deployed credentials are safe. |

## Verification evidence

| Check | Evidence |
|---|---|
| Operational PostgreSQL tests | 33 passed, no failures: `reports/vms-qa-integration-tests-2026-10-13.json` |
| Mobile, authorization, playback and release-gate assertions | 42 passed: `reports/vms-continued-regression-2026-10-13.json`; native process exit is independently captured by `scripts/run-vms-check.mjs` |
| Full migration sequence and repeat/checksum validation | `reports/vms-fresh-migrations-2026-10-13.log` |
| Compiler checks and root build | Root build, test type check and analytics type check passed with native exit 0: `reports/vms-root-build-check-2026-10-13.json`, `reports/vms-test-types-check-2026-10-13.json`, `reports/vms-analytics-types-check-2026-10-13.json`. Earlier unchanged-workspace checks are in `reports/vms-typecheck-continued-2026-10-13.log`. |
| Broader smoke checks | Final run: 158 passed, zero failed, one skipped across 18 files, including statistics lifecycle cases. `reports/vms-smoke-2026-10-13.json` and `.log`. The skipped test concerns actual deployment capacity. |
| Documentation and tracked-source secret scan | Strict MkDocs build passed. Secret scan passed with native exit 0: `reports/vms-secret-scan-check-2026-10-13.json`. The scan covers tracked source patterns, not deployed credential validity or repository history. |
| Production dependency audit | One high, zero critical, zero moderate: `reports/vms-security-audit-continued-2026-10-13.json`. The security gate correctly exits nonzero. |

PowerShell can turn native stderr into an error record during redirection even
when assertions pass. The check runner captures stdout/stderr directly and
records the native exit code separately; a JSON test count alone is insufficient.

## Open release blockers

1. The production dependency audit reports the high-severity
   [node-forge certificate-validation advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
   with no registry fix available in the refreshed audit. Replace affected
   validation paths or take a verified upstream fix, then rerun security tests
   and the audit. No package-wide exemption was added.
2. A clean full-suite run has not been established. The earlier diagnostic
   contained 461 failing assertions across 98 active-source files, after
   excluding temporary copies (3,948 assertions total). That is historical
   diagnostic evidence, not the current failure count: selected defects and
   obsolete fixtures have since been corrected. Communications SQL/service
   contract tests, analytics/collector failures and other remaining suites need
   triage and verification.
3. Review organizational grant enforcement across all SQL operational routes,
   including list filtering and update/detection scope, beyond the tested tenant,
   inactive-account and read-only checks. Mobile's canonical scope tests do not
   certify every other API.
4. Connect and verify actual clip export, blacklist alert generation, emergency
   workflows and notification delivery. A truthful unavailable state is useful
   but does not complete the capability.
5. Run a real-camera pilot: live-view latency, synchronized playback/decoded
   frame accuracy, recording gaps, WAN outage/backfill, retention, storage
   failure, recipient delivery, evidence integrity and restart recovery. Run
   multi-day soak/capacity tests against the approved recorder/camera matrix.
   The existing smoke case `returns a capacity assessment based on actual
   deployment` remains skipped; no measured deployment capacity is certified.
6. Benchmark representative customer tasks against the exact VC Tech product
   and deployment. Public feature claims and local test counts cannot establish
   competitive superiority.
7. Rotate the formerly hardcoded JWT signing value wherever it was used and
   revoke associated tokens. Removing it from the scratch file does not remove
   repository history or invalidate previously signed tokens.

## Reproduce safely

The QA stack binds PostgreSQL to `127.0.0.1:55432` and Redis to
`127.0.0.1:56379`. The script generates an ignored `.env.vms-qa` credential file;
it does not use production database credentials. Fresh migration verification
creates an additional disposable database inside that QA container.

```powershell
node scripts/vms-qa-stack.mjs start
node scripts/vms-qa-stack.mjs migrate
node scripts/vms-qa-stack.mjs verify-migrations
node scripts/vms-qa-stack.mjs test test/anpr-logistics.routes.test.ts test/device-health-correlation.routes.test.ts test/nbfc-watchlist.routes.test.ts
node scripts/vms-qa-stack.mjs smoke
node scripts/run-vms-check.mjs regression
node scripts/run-vms-check.mjs root-build
node scripts/run-vms-check.mjs test-types
node scripts/run-vms-check.mjs analytics-types
node scripts/run-vms-check.mjs secret-scan
```

Production has not been deployed or migrated by this work. Preserve existing
customer data and validate upgrades using a restored staging database before
release. Release requires passing checks and the pilot evidence above.
