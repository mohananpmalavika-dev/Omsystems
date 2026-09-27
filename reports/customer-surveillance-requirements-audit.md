# Customer surveillance requirements audit

Audit date: 28 September 2026 (Asia/Kolkata).

## Verdict

The project contains substantial implementations of centralized health monitoring, branch drill-down, alert operations and reporting. It does **not** currently satisfy every requirement as a fully verified production solution. Several concrete defects and coverage limits prevent that conclusion. This audit changed no application behavior and sent no external notifications.

Evidence is current repository code, selected automated tests and isolated local notification probes. Existing readiness documents and simulated benchmarks are not treated as deployment acceptance. No 400-branch hardware deployment, real SMS/email/phone delivery, production database failover or AI model accuracy was verified in this audit. The separately promised detailed AI alert list has not been provided, so that list cannot yet be checked.

## Requirement coverage

| Customer requirement | Finding | Evidence / remaining work |
|---|---|---|
| Centralized monitoring for approximately 400 branches | Implemented status dashboard; production capacity unverified | `/operations` uses a paginated branch mosaic and health summary. A 20x20 layout displays 400 status tiles. This is a status wall, not 400 decoded video feeds. |
| Growth beyond 400 branches | Partial; no unlimited-capacity guarantee | Branch mosaic loads all paginated pages, but bounded views, browser capacity and infrastructure still apply. Establish tested capacity tiers and provision additional workers/media nodes. |
| Maximum channels/branches in one screen | Partial | The new Live Operations Stage renders one focused feed, or one camera from each of the first four branches in Overview. Larger grid functionality exists elsewhere, but the normal redesigned live wall does not expose a high-density fleet video mode. |
| Individual branch monitoring with all cameras | Partial / fragmented | Branch inventory and health tables exist, and an existing BranchCameraWall supports decoder budgets and sequencing. The primary branch workspace Live Wall link opens the stage, which focuses one camera. Integrate the all-camera branch wall into the current experience. |
| DVR/NVR online/offline status | Implemented telemetry/UI paths; hardware acceptance pending | Recorder fleet widget, vendor probes and operational health services exist. Model/firmware coverage and failure behavior need real CP PLUS/Dahua/Hikvision testing. A separate collector contains an unsafe synthetic fallback. |
| Camera working status | Implemented health paths; fleet live wall coverage partial | Camera health evaluation, working/recording/stream-loss states and branch tables exist. Live wall inventory fetch is limited to 500 cameras; live AI context uses the first 144. |
| HDD health/status | Implemented capability-aware health paths; hardware acceptance pending | Disk fleet widget, SMART evaluation and recorder HDD probes exist. Verify which metrics each deployed recorder actually exposes; unavailable metrics must remain unknown. |
| Retention days with red highlighting below policy | Implemented in main fleet widget; inconsistent duplicate UI | Retention fleet widget explicitly highlights breaches red and shows unavailable evidence separately. Alternate RetentionSummary contains invented fallback days/dates and treats every non-VIOLATION state as COMPLIANT. It was not found mounted in an app route during this audit, but remains unsafe reusable code. |
| Branch internet connectivity | Implemented health paths; deployment verification pending | Internet fleet widget, connectivity services, WAN/VPN/failover and freshness handling exist. Verify internet reachability separately from LAN/recorder reachability in deployed branches. |
| Other device health parameters | Implemented modules; capability dependent | Edge heartbeat, UPS, temperature, storage, clock drift and stream/recording health exist. Confirm a supported-device matrix and explicit unknown states. |
| Daily downloadable reports | Implemented routes, worker, schedule and CSV/XLSX/PDF renderers; tests not fully green | Operational reports have persistent schedules, filters, artifacts and signed downloads. Existing targeted tests expose catalog/count regressions; reconcile report totals against inventory before acceptance. |
| Total branches and operational-status summary | Implemented | Branch summary widget and health summary API distinguish operational states. Validate freshness, regional permissions and count reconciliation at scale. |
| Dedicated AI real-time alert section | Implemented general alert surfaces; exact requested alert catalog pending | Alerts pages, live ribbon, global alert center and engine integration exist. Add the customer's actual alert list with severity, zone, threshold, evidence and escalation acceptance criteria. Model presence alone does not prove detection quality. |
| Alert branch name, type and severity | Implemented | Enriched command alerts carry branch/camera names, severity and detection type; popup displays this context. |
| Live video popup | Implemented UI/session integration; real gateway test pending | GlobalAlertCenter starts an authorized browser live session and supports unavailable/error states. |
| Snapshot and video clip | Implemented capture/status/reference pipeline; recorder/media dependency | Managed evidence readiness is checked. Actual pre/post-event footage capture requires configured recording/media services and real verification. |
| Acknowledge / Escalate | Implemented global popup/backend actions | GlobalAlertCenter sends both actions to the backend. Verify role enforcement, concurrent operators, persistence and audit trail in deployment. |
| Popup with sound | Partial interpretation | Automatic modal selection is P1/P2 only. P3 stays in dashboard queue; P4 is excluded from the global queue. Audio requires browser activation and enabled preferences. The fallback polling path must be tested for missed SSE events. Clarify whether P3 also requires an automatic modal. |
| P1 Dashboard + SMS + Email + Phone | Exact policy implemented; reliable delivery incomplete | Active dispatcher matrix matches. A separately registered consolidated subsystem has a synthetic default voice transport and a worker that marks rejected provider results as sent. Real recipient/provider/receipt testing remains necessary. |
| P2 Dashboard + Email | Exact policy implemented; provider delivery unverified | No phone call in default matrix. Delivery shares the same subsystem concerns. |
| P3 Dashboard only | Default notification matrix matches | Dashboard queue supports P3. Sound policy plays a single P3 tone; agree whether dashboard-only includes sound. |
| P4 System log only | Matrix/global queue match; stage inconsistent | New stage accepts every scoped alert, including P4, into event ribbon and attention queue. Filter operational presentation to enforce log-only semantics while keeping audit/report access. |
| Export health / segregated alert reports (future option) | Already partly beyond the future request | Templates include camera, recorder, HDD, retention, branch and alert reports; filters include severity/type/status/date/branch/region. Verify complete totals and actual downloaded artifacts. |

## Required corrections, in order

### 1. Delivery truth and failure handling — release blocker

`src/notifications/infrastructure/providers/voice.provider.ts:30` uses a default transport that generates a call ID without calling a PBX/provider. Its health check returns fixed healthy data. `NotificationService.bootstrapProviders()` registers it when no voice provider is supplied; notification routes are registered in `src/app.ts`.

`src/notifications/infrastructure/worker/notification-worker.ts:70` calls `markSent` regardless of `accepted` and failed state. `postgres-notification-outbox.ts:170` maps every non-DELIVERED result to SENT.

The isolated probe reproduced both problems: an email result `{accepted:false,state:'FAILED'}` became `SENT`, and default voice returned `accepted:true,state:'SENT'` without an external call. See `customer-requirements-audit-probes.json` and `tmp/requirements-audit-probes.mjs`.

Required: explicit configured real transport, fail-closed provider health, rejected-result retry/dead-letter handling, confirmed delivery receipts, and one authoritative notification pipeline with documented routing. Test provider outages, missing recipients, restart recovery and acknowledgement cancellation. Do not count accepted/queued as delivered.

### 2. Fleet video and AI coverage — requirement blocker

- `dashboard/app/control-room/page.tsx:395`: camera inventory requests `limit=500` once, without fleet pagination.
- `dashboard/hooks/use-live-ai-wall.ts:49`: AI wall takes `cameras.slice(0,144)`.
- `src/routes/analytics.routes.ts:143`: live-wall query also truncates camera IDs to 144. It selects up to 1,000 tenant alerts before camera filtering, which can omit older relevant branch events during alert storms.
- `dashboard/components/live-operations-stage.tsx:70`: Overview selects only first four branches. Main stage streams one camera.

Required: complete authorized inventory pagination, branch/region-scoped queries, scalable event subscriptions, priority-first fleet viewing, and a separate dense live-video mode with substreams, actual decoder budgets, sequencing and optional multi-monitor distribution. Display how many branches/cameras are loaded, monitored and currently playing. Do not advertise unlimited simultaneous video.

### 3. Health and retention truth — release blocker for affected paths

`edge-agent/src/monitoring/recorder-health-collector.ts:17` probes a recorder, then on failure manufactures online recorder metrics, channel recording states, HDD values and verified 61-day archive evidence. Search found use in the canonical driver test runner, but no production caller of this particular collector was found; do not assume it is the currently deployed path. Remove or isolate the fallback before exposing/reusing it.

`dashboard/components/branch-command-center/retention-summary.tsx:13` supplies 61/90 days, fixed dates and gap counts when evidence is missing; UNKNOWN/WARNING become COMPLIANT. Remove invented values and render authoritative COMPLIANT/WARNING/VIOLATION/UNKNOWN states. Its current route reachability was not established.

### 4. Alert presentation consistency

Keep P4 out of the normal attention queue/ribbon to honor log-only policy. Add a clear alert-popup severity policy (currently P1/P2 automatic), audible readiness indicator, missed-event reconciliation and event-storm queue coverage. Preserve per-operator acknowledgement and audit history. Verify that all critical branches are visible even when newer low-priority alerts flood the system.

### 5. Reports and real rollout acceptance

Resolve report regression failures and reconcile counts against accessible branch/camera inventory. Existing report templates cover much of the optional export requirement; improving these is more useful than adding duplicate report pages.

Execute a production-like 400-branch soak test using PostgreSQL/Redis, genuine telemetry, representative streams, model inference and external notification receipts. Include WAN loss, reconnect storms, unavailable disks/recorders, recording gaps, stale telemetry, service restarts and failover. Measure UI/API/alert latency, stream startup, resource consumption and lost alerts. Existing 400/500 runners contain simulations and in-memory evaluation; their presence does not establish 400 real-branch acceptance.

## Validation performed

Initial selected Vitest run: 6 files, 32 tests; 27 passed, 5 failed. Four files passed: branch mosaic model, global alert center model, durable notification tests and retention compliance guards. Alert/report integration startup hooks hit 20-second timeouts. Report tests also asserted outdated template count (7 expected, 8 returned) and mismatched inventory totals (10 expected, 1 observed; 5,000 expected, 0 observed). These are failed checks, not proof that every production report has those totals.

A serial integration rerun with a 60-second hook timeout completed: 14 tests, 11 passed, 3 failed. All 8 HO alert command-center tests passed, including the P1–P4 matrix using injected fixture providers. Startup timeouts disappeared. Three report tests still failed: template count and both inventory-total assertions above. Results are recorded in `customer-requirements-targeted-tests.json`. This separates load-sensitive test startup from reproducible report assertion failures; it does not establish real provider delivery. Local notification probes conclusively reproduced the rejected-delivery and synthetic-default-call defects. They made no external calls.

Latest previously run dashboard typecheck recorded 44 project errors with no errors in the Live Operations Stage change files. A clean full build and hardware/provider acceptance are still prerequisites for a production sign-off.

## Recommended acceptance wording

“Centralized monitoring designed for an initial 400-branch deployment, with capacity expanded through additional infrastructure after measured acceptance. A 400-branch status wall is supported; simultaneous live video is bounded by tested client/server capacity. Production approval follows vendor telemetry, retention evidence, AI accuracy and notification delivery acceptance.”

Do not describe the current repository as fully implemented, unlimited-capacity or fully production-verified.
