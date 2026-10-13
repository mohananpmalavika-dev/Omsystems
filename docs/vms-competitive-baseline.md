# VMS competitive baseline

Historical baseline before the subsequent code changes. See
[engineering progress and current release gates](vms-engineering-progress.md)
for implemented fixes and newer verification evidence.

Review date: 13 October 2026, Asia/Calcutta.
Working-tree base revision: `c0329b3674117f010788827415d796bb27897bbb`.
The workspace contained existing uncommitted files; this is a working-tree
review, not certification of a clean release artifact.

## Initial result

All 32 selected automated tests passed across six files, with no failures or
skips. Root control-plane and dashboard type checks passed. Current source has
fixes for several September audit findings, but also exposes mobile route
authentication and false-success gaps. Real-camera capacity, deployed security,
AI accuracy, external delivery and comparative superiority remain unverified.

The work produced a [competitive improvement plan](vms-competitive-roadmap.md)
and documentation links. Application runtime behavior was not changed by this
review, and no deployment was performed.

## Automated checks

| Check | Result | Boundary |
|---|---:|---|
| `dashboard/test/fleet-requirements.test.ts` | 7 passed | Fixture inventory pagination, bounded AI batches, reachable fleet pages, tile choices, priority filtering and retention rendering |
| `dashboard/test/branch-camera-wall.test.ts` | 4 passed | Wall model, stream budget/status behavior and bounded rendering; no real video decoding |
| `test/notifications/delivery-truth.test.ts` | 6 passed | Injected providers/in-memory outbox; rejection, retry, acceptance vs delivery and unconfigured voice behavior; no real provider receipts |
| `test/recording/recording-gap-recovery-and-backfill.test.ts` | 4 passed | Mock database recovery/coordinator behavior; no real WAN, recorder, storage or decoded-footage acceptance |
| `test/telemetry-freshness.test.ts` | 3 passed | Local freshness behavior; no deployed branch telemetry acceptance |
| `test/phase4-operational-reports.test.ts` | 8 passed | In-memory app/store and local report artifacts with injected email sender; no production database or recipient delivery |
| `npm run typecheck` | Passed, exit 0 | Root TypeScript configuration only |
| `npm run typecheck --workspace dashboard` | Passed, exit 0 | Dashboard TypeScript configuration only |

Raw test evidence: `reports/vc-tech-vms-baseline-tests-2026-10-13.json`.

Reproduction commands from the repository root:

```powershell
npm.cmd test -- dashboard/test/fleet-requirements.test.ts dashboard/test/branch-camera-wall.test.ts test/notifications/delivery-truth.test.ts test/recording/recording-gap-recovery-and-backfill.test.ts test/telemetry-freshness.test.ts test/phase4-operational-reports.test.ts --no-file-parallelism --hookTimeout=60000 --reporter=json --outputFile=reports/vc-tech-vms-baseline-tests-2026-10-13.json
npm.cmd run typecheck
npm.cmd run typecheck --workspace dashboard
```

The first focused test invocation using `npm` hit the host's PowerShell script
execution restriction. It was rerun successfully with `npm.cmd`; execution
policy was not changed. The full test suite, all workspace builds, browser QA,
hardware acceptance and security penetration testing were not run.

## Source findings

| Finding | Current evidence | Interpretation |
|---|---|---|
| Mobile routes bypass normal authentication | All seven routes in `src/routes/mobile-operations.routes.ts` declare `noAuth`; `src/app.ts` returns before session authentication for that flag and calls the registration function in its extended-features block | Correct route authentication and scope. Actual deployed registration, ingress access and exploitability were not verified. |
| Mobile actions report success without persistence | Acknowledge, escalate, assign and notes handlers return fixed success messages | Implement authoritative incident mutations, durable audit and truthful failure responses. These actions were not covered by the passing baseline tests. |
| Mobile data can appear healthy without evidence | Home initializes one online branch and zero critical alerts, swallows read errors; call-branch has a fallback contact | Load scoped evidence and configured contacts; show unavailable data explicitly. |
| Mobile event stream lacks real events | Event handler writes a connected message without subscribing to incident/alert changes | Wire scoped events and reconnect recovery before claiming real-time mobile operation. |
| Notification truth fixes exist | Worker rejects `!accepted`/`FAILED`; voice requires a configured transport and returns unavailable health when absent | September's synthetic-default/rejected-as-sent defects are not current in these source paths; deployment and real delivery still need proof. |
| Fleet and retention fixes exist | Current fleet stage, full inventory loader, AI batching, P4/P5 exclusion and explicit unknown retention rendering | Do not reuse the September first-500/first-144 conclusions for these corrected paths. Compare real stream performance separately. |
| Recorder failures preserve unavailable state | `edge-agent/src/monitoring/recorder-health-collector.ts` reports failed probe and unavailable archive evidence | Previous fabricated collector fallback is absent in reviewed current source; hardware coverage remains conditional. |
| Backfill has implementation and local tests | Recovery routes/services and exported edge-sync agent/journal code; four passing mocked-database tests | Supports prioritizing an actual outage/recovery pilot, not claiming gap-free recording yet. |

The 8 October presentation readiness report documents historical stale branch
frames and degraded fire/smoke inference. Its status must be refreshed against
the live deployed services; it is not a current production assessment.

## Competitor evidence and limits

The [official VC Tech AI product page](https://www.vctech.ai/) describes Smart
VMS and related services. The improvement plan uses that description as a
provisional feature checklist. No competitor login, installation, quote,
performance measurement or client-specific configuration was available. Public
claims and repository feature counts cannot establish that either product is
better for this customer.

The recommended next engineering milestone is the mobile route correction,
followed by a real-device live/playback/outage/notification pilot. Retain an
exact revision, reproducible configuration and customer task measurements for
each acceptance result.
