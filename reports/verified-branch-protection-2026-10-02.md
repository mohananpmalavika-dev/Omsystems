# Verified Branch Protection — 2 October 2026

Implemented all five product workflows in the application source. This is a local implementation and verification report, not production deployment or hardware acceptance.

## Customer entry point

Operations → Branch workspace → **Verified Protection**. The panel shows Protected / At Risk / Unknown, fresh playback coverage, per-camera evidence, indexed gaps, indexed retention, critical cameras, linked incidents, provider delivery status, offline backlog, policy settings and SOP reviews. It supports background verification and a downloadable daily JSON audit report.

## Implemented behavior

- Recording assurance queries tenant-scoped ready archive segments, merges overlaps and measures 24-hour index gaps. For configured local archive roots, FFmpeg decodes a recent sample and verifies multiple progressing frame timestamps. Missing retrieval configuration or a missing decoder stays Unknown. Actual missing/corrupt accessible media fails verification. Archive index presence alone no longer reports decoded frames in the legacy continuity service.
- Branch protection combines authorized camera evidence with fresh camera, recorder, storage, network and retention observations. Missing/stale telemetry, incomplete critical-camera inventory or mandatory SOP review cannot yield Protected. Indexed retention is labelled as indexed evidence; the branch retention dimension must also be compliant.
- Repeated camera recording failures share one incident until verified recovery. Durable incident IDs allow creation retry after an outage without losing the incident intent. Checks become incident evidence. Permission-scoped nearby critical analytics alerts can be correlated. Configured response deadlines escalate unassigned incidents when the acting user has escalation permission. External notifications use configured tenant recipients and the existing durable worker. Queued/sent jobs are distinguished from confirmed provider delivery.
- Incident closure requires assigned ownership, fresh decoded playback, progressing timestamps, no disallowed indexed gaps and the required indexed retention. Generic incident closure/status routes cannot bypass this workflow. Recovery cancels pending related notification jobs.
- Low-bandwidth mode forces substreams in canonical and compatibility live grants. The branch-scoped control room applies the configured viewer stream budget. This does not alter local recording. The existing encrypted edge outbox now replays critical incidents/evidence, audit and recording metadata before routine telemetry, persists individual acknowledgements and serializes concurrent mutations.
- Configurable opening, closing, restricted-access and after-hours SOP windows support camera scoping, branch time zones and windows crossing midnight. Decoded samples in a matching window can become pending review evidence; they never automatically certify SOP compliance. Manual evidence must reference an actual authorized recording segment at the event time. Human pass/fail decisions and notes enter the audit ledger. A previous local day's pass cannot satisfy today's review.
- PostgreSQL row locks serialize policy/evidence mutations; durable verification leases prevent simultaneous workers. Policy changes invalidate incompatible prior checks. Verification failures appear in protection reasons. Background scheduling is opt-in and runs under an existing scoped service user.

## Deployment configuration

1. Apply `database/migrations/20261002_verified_branch_protection.sql` through the existing migration workflow. Existing recording, offline-sync and notification migrations are also required. This report does not apply migrations to a running database.
2. Set `PROTECTION_ARCHIVE_ROOTS` to server-accessible archive directories. Separate roots with `;` on Windows or `:` on Linux. Set `FFMPEG_PATH` if FFmpeg is not on PATH. The process must have read access to those directories.
3. For scheduling, set `PROTECTION_SERVICE_USER_ID` to an existing user with `recording:view` and `incident:create` on enrolled branches. Grant `incident:escalate`, `analytics:view` and `incident:update` only when those automated actions are intended. Enable scheduling per branch in the policy panel.
4. Configure real notification recipients, transports and provider callbacks in the existing notification subsystem. Missing recipients do not become fabricated destinations. Delivery remains unconfirmed until a receipt is recorded.
5. Deploy the edge-agent source update to obtain priority replay. Existing installations keep their current behavior until updated.

## Verified locally

- 23 tests passed across branch protection and encrypted edge state. Coverage includes real FFmpeg sample decoding and corrupt-media rejection, gap merging, unknown/stale states, tenant/action denial, recovery gates, durable incident retry, concurrent verification, SOP time zones/day boundaries, notification escalation/recipient truth and encrypted priority replay after restart.
- The recording-continuity runner passed all 36 checks after replacing its implicit imaginary-camera expectations with explicit index fixtures and truthful decode expectations.
- The existing bulk-video queue regression passed with priority-order expectations updated. A broader legacy stub test file had an unrelated firmware-executor configuration failure; this implementation does not claim that full file or the repository-wide suite passes.
- Backend, dashboard and edge-agent type checks passed during implementation; final checks are recorded in the task response.
- Isolated Chromium QA of the actual panel passed desktop and mobile rendering, policy/SOP editing, failed-delivery presentation and background verification. Fixtures were used; production APIs and real devices were not accessed. Screenshots: `qa-artifacts/branch-protection/desktop.png` and `mobile.png`.

## Limits

The new decode adapter supports server-accessible local archive files. Edge-only DVR archives and cloud objects without a configured retrieval adapter remain Unknown; no remote retrieval capability is fabricated. A recent sample does not prove every frame in the retention period is decodable. Gap recovery remains conservative: a 24-hour indexed gap must be repaired or leave the evaluated window before gap-free closure can pass. Viewer budgeting applies to the branch-scoped control-room UI, rather than a fleet-wide server connection quota. Existing local recording/outbox facilities are reused; no production internet-outage drill, camera/DVR compatibility test, database migration, real provider delivery or deployed branch acceptance was performed.
