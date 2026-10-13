# VMS competitive improvement plan

Prepared 13 October 2026, Asia/Calcutta. Status: proposed engineering and
customer-validation plan; not an approved delivery schedule or release claim.

## Outcome

Make Sentinel Grid the customer's preferred VMS by improving the daily jobs
they perform: watching cameras, finding footage, exporting evidence, identifying
failed devices, and handling incidents. Cover every major buying criterion, but
deliver changes in order of customer impact and prove each improvement.

The customer named VC Tech's VMS but gave no specific reason for preferring it.
VC Tech Smart VMS at [VC Tech AI](https://www.vctech.ai/) is the working comparison;
the exact installed product version, configuration, pricing, and customer
experience have not been supplied. Public descriptions are vendor claims, not
independently measured performance.

## Competitor baseline

VC Tech advertises single-to-64-camera grids, timeline playback at 1x/2x/4x,
screenshots, automatic recording replenishment after network outages,
maker-checker access, hierarchical permissions, and web/Android/iOS access.
Adjacent offerings include device and recording health, scheduled reports,
industry-specific analytics, cloud/hybrid storage, human monitoring, and
maintenance ticketing. Source: [official product descriptions](https://www.vctech.ai/),
reviewed 13 October 2026.

Compare the licensed VMS package first. Price optional analytics, cloud storage,
monitoring staff, and maintenance separately on both sides. A competitor's
managed service cannot be matched through interface changes alone.

## What we have and what still needs proof

Repository evidence and local tests establish implementation, not deployment
acceptance. A larger layout selector does not establish more usable live streams.

| Buying criterion | Sentinel Grid evidence | Improvement and acceptance work | Priority |
|---|---|---|---|
| Live monitoring | Fleet wall, branch filtering, tours, main/sub streams, full inventory loading and stream budgets: `dashboard/components/live-operations-stage.tsx`, `dashboard/components/live-stage-model.ts`, `dashboard/lib/fleet-loading.ts` | Benchmark 1/4/9/16/36/64 actual video feeds; show loaded, playing, paused and failed counts; preserve layouts; verify reconnect and multi-monitor workflows. Existing 144-tile options are not a measured 144-stream capability. | P1 |
| Playback and investigation | Recording engine, playback controller, camera timelines, recovery routes and evidence export | Validate exact time seeking, 1x/2x/4x playback, multiple-camera synchronization, bookmarks, visible gaps and independently playable exports on real footage. | P1 |
| Recording through outages | Gap detector, backfill coordinator and edge journal under `src/recording/recovery/` and `src/edge-sync/` | Test actual WAN loss, edge recording continuity, restart-safe uploads, duplicate prevention and byte/decoded-footage verification. Report unavailable footage honestly. | P0 |
| Trustworthy health and retention | Capability-aware collectors, telemetry freshness and retention views | Verify supported model/firmware combinations; expire old observations; distinguish reachable, recording, playable, stale and unknown. Never infer recording health from a heartbeat alone. | P0 |
| Alerts and response | Command center, severity policies, notification outbox and provider integrations | Prove event-to-popup, real receipts, retry/dead-letter, missed-event recovery, operator concurrency, escalation and evidence readiness. | P0 |
| AI quality | Analytics engine and model/rule infrastructure | Prioritize the customer's three most useful detections. Use held-out footage, measure misses and false alerts per camera-day, and check capture-to-alert delay and per-camera inference freshness. | P1 |
| Access and audit | Identity, authorization, session, hierarchy and evidence packages | Test tenant/branch isolation across every endpoint, stream and export; audit denials; implement or validate explicit two-person approval where required. Maker-checker parity was not established by this review. | P0 |
| Mobile operation | Mobile/PWA UI, manifests, services and routes | Repair the registered mobile routes described below; test scoped live video, playback, durable actions and network recovery on actual Android/iOS devices. Native application parity is unverified. | P0/P1 |
| Device compatibility and installation | Edge agent and recorder adapters | Publish a model/firmware/operation support matrix with live, playback, disk, retention, PTZ and audio results. Test credential rotation, upgrades and rollback. | P1 |
| Reporting and maintenance | Operational report templates, schedules, downloadable artifacts and maintenance modules | Reconcile inventory counts and permissions; verify downloaded files and recipient delivery; validate fault-to-ticket, vendor assignment, escalation and customer-confirmed closure. OTP closure parity is unverified. | P1 |
| Storage, resilience and security | Retention, legal hold, storage tiers, recovery, HA and security modules | Restore actual recordings and database backups; test disk full, service restarts and failover; verify TLS, credential protection and export expiry; get independent security assurance. | P0/P1 |
| Usability, support and total cost | Broad dashboard and deployment documentation | Reduce task steps; publish a supported setup, upgrade process, incident support terms and a transparent three-year cost model. Support staffing and third-party certifications require business work. | P1/P2 |

P0 blocks acceptance of the affected feature. P1 establishes or improves the
core customer experience. P2 differentiates an already dependable product.
These priorities are recommendations, not assertions that every listed feature
currently fails.

## Current findings that change the order of work

### Mobile route behavior needs correction first

`src/routes/mobile-operations.routes.ts` marks all seven endpoints `noAuth`.
The authentication hook in `src/app.ts` returns before normal session checking
for that configuration. `registerMobileOperationsRoutes` is called by the app's
extended-feature registration block; successful registration in a particular
deployed instance has not been checked here.

The acknowledge, escalate, assign and note handlers return fixed success
messages without calling persistent incident operations. Home initializes a
healthy one-branch summary and a zero critical-alert count; exceptions are
swallowed. Call-branch has a fallback phone number. These are source-confirmed
behavioral gaps; deployed exposure and exploitability were not tested.

Required implementation:

1. Require a valid session and tenant/branch authorization for every route and
   event subscription, using the canonical authorization path.
2. Load authoritative scoped health and incidents. Return an explicit unavailable
   state when data cannot be read; derive critical totals from real records.
3. Persist actions through the existing incident workflow, validate inputs and
   assignees, handle conflicts and missing incidents, and record the actor.
4. Return a branch contact only from configured authorized data. Treat a `tel:`
   link as opening the dialer, not a delivered phone call.
5. Back the event stream with scoped real events, reconnect reconciliation and
   cleanup; the current handler only writes a connected message.
6. Verify unauthenticated, wrong-tenant, wrong-branch and forbidden-role requests;
   test persistence after reload and service restart, store failures, audit
   failures and simultaneous operators. Inspect reverse-proxy access as well.

An existing `MobileOperationsService` is not proof that the registered handlers
use it correctly. Review its scope, persistence and data sourcing before wiring it.

### Do not repeat already fixed historical findings

The September customer audit is historical. Current notification worker code
rejects failed provider results; the default voice provider fails without a
configured transport. The recorder collector returns unavailable evidence on
probe failure. Retention UI avoids invented dates/days. Fleet loading batches
inventory and AI requests; the stage now includes a fleet wall and excludes
P4/P5 operational alerts.

Local regression results are recorded in the accompanying
[baseline report](vms-competitive-baseline.md). Actual provider,
camera, recording and browser behavior still require acceptance.

### AI deployment evidence needs a fresh check

The 8 October presentation report documented stale branch collectors and
degraded fire/smoke analytics at that time. It also distinguished training-frame
replays from new live validation. Those observations are historical, not a claim
about today's services. Recheck fresh branch frames, collector continuity,
model health and real operator delivery before demonstrations. A classifier's
confidence score is not a product accuracy measurement.

## Measurable release targets

These are proposed targets to establish in a controlled pilot. No current result
or competitor result is implied. Adjust them using the customer's actual
hardware, bandwidth, workflow and detection risk.

| Measure | Proposed acceptance target | How to measure |
|---|---|---|
| Single-camera startup | p95 first fresh decoded frame within 3 seconds on the agreed LAN, 5 seconds on the agreed WAN | At least 100 cold/warm starts per profile, measured from operator click, including session setup. Record failures; do not measure only successful starts. |
| 64-camera wall | Every eligible tile plays at the declared substream profile for a 60-minute run; no unexplained stalls over 10 seconds | Fix workstation/GPU/browser, codec, resolution, FPS, bitrate and network; measure actual decoded FPS, startup, stalls, CPU/GPU/memory and bandwidth. Test each smaller layout separately. |
| Investigation efficiency | At least 90% task completion and 20% lower median time than the compared VMS | Five operators complete the same find/seek/export tasks, alternating product order. Also compare failure rate, steps and usability feedback. |
| Recording completeness | No unexplained loss in a 72-hour controlled recording trial; every known gap visible | Reconcile segment manifests, timestamps and independent decoded samples. Verify exported footage, not only index rows. |
| Outage recovery | Recover all footage that genuinely exists in the edge buffer after a 30-minute WAN interruption | Reconcile hashes, time coverage and playback; restart during recovery; enforce configured bandwidth limits. Specify buffer capacity. Surface permanently unrecoverable intervals. |
| Health freshness | Missing telemetry changes to stale/unknown by the configured threshold plus one polling interval | Interrupt telemetry and streams independently; test recorder-only, camera-only and WAN failures. Keep recording and reachability evidence separate. |
| Critical alerts | p95 committed-event-to-operator-popup within 5 seconds under agreed load; zero silent loss in the controlled sample | Reconcile unique event IDs through persistence, queue, browser and receipts. Separately measure capture-to-detection and detection-to-commit latency. |
| AI usefulness | Per-use-case precision/recall, false alerts per camera-day and delay meet written customer thresholds | Held-out real-site day/night/occlusion samples with ground truth; separate tuning cameras from evaluation cameras; report sample sizes and uncertainty. |
| Mobile actions | Authorized actions persist and survive reload; every forbidden access test denied | Android/iOS devices, network loss/reconnect, duplicate submissions, session expiry, cross-tenant IDs, scope revocation and backend outage. |
| Reports | Exact authorized inventory/count reconciliation; no undisclosed omissions | Compare source inventory and generated CSV/XLSX/PDF; check timezones, filters, expiry and actual scheduled delivery. |
| Recovery and availability | Define RPO/RTO and trial a 99.9% availability objective before offering an SLA | Restore a backup into an isolated environment; simulate component failures; measure sustained service availability. Define included services and exclusions. |
| Installation and support | Repeatable pilot onboarding, tested rollback and measured response times | Record elapsed engineer time and customer effort; exercise support handoff and after-hours response using agreed staffing. |

## Delivery sequence

Time windows below are planning horizons, not estimates of committed completion.
Assign actual people and effort after reproducing the baseline. Hardware access,
model evaluation, security review and staffing are dependencies.

| Horizon | Deliverables | Responsible role | Exit gate |
|---|---|---|---|
| First week | Reproduce client tasks, pin both versions, correct mobile authentication/action/data gaps, refresh live health evidence, agree scorecard and test environment | Product lead, backend/security engineer, QA | Scoped mobile regression tests pass; no fabricated success in reviewed paths; baseline captured |
| Weeks 2-4 | Resolve live/startup/stall and playback/export defects found in the pilot; validate recorder models, WAN recovery, reports and real notification receipts | Media/edge engineer, backend engineer, QA/operator | Core workflow and failure-injection gates pass on representative real devices |
| Weeks 5-8 | Simplify core workflows, complete mobile/PWA acceptance, validate approval/ticket workflows, evaluate three priority AI use cases | Frontend/mobile engineer, ML engineer, product/operator | Operator comparison and held-out AI targets pass; mobile changes persist and recover |
| Weeks 9-12 | Scale and soak testing, restore/failover drills, security review, cost/support package and customer comparison demo | Platform/security engineer, QA, commercial/support lead | Defined capacity tier passes; risks disclosed; customer accepts measured results |

Reuse current modules before adding new pages or parallel services. Keep a
single authoritative incident, notification, health and recording workflow.
Fix causes demonstrated by evidence rather than adding counters or success
labels that hide failures.

## Fair customer comparison and scoring

Run both products against the same authorized cameras, recording periods,
operators, workstation and network constraints. Capture license tier, product
version and enabled add-ons. Use identical labelled scenarios for AI. If
competitor access is unavailable, mark its outcome unknown; do not declare a win
from a website checklist.

| Category | Initial weight | Sentinel result | VC Tech result |
|---|---:|---|---|
| Recording integrity and outage recovery | 20% | Pending real pilot | Unknown |
| Live monitoring and performance | 15% | Pending real pilot | Unknown |
| Playback, investigation and export | 15% | Pending real pilot | Unknown |
| Health and alert reliability | 15% | Pending real pilot | Unknown |
| Access control and audit | 10% | Source gaps identified; acceptance pending | Unknown |
| AI quality for selected use cases | 10% | Pending held-out evaluation | Unknown |
| Operator and mobile usability | 5% | Acceptance pending | Unknown |
| Device onboarding and compatibility | 5% | Acceptance pending | Unknown |
| Reporting, support and total cost | 5% | Acceptance pending | Unknown |

Weights sum to 100% and should be agreed with the customer. Score each measured
category 0-5: 0 fails the required workflow, 1 requires major workarounds, 2 is
partial, 3 meets the agreed requirement, 4 exceeds it in a measured way, 5 is a
reproducible material improvement accepted by operators. An unknown result is
not zero and must not be included in a claimed overall win. Weighted score is
`sum(weight_percent * score / 5)`.

Regardless of total score, unauthorized access, falsely completed incident
actions, unreported missing footage and silently lost critical alerts block
acceptance. Aim first to pass every required category, then outperform on the
customer's highest-value tasks. An overall win does not prove superiority in
every individual category.

Compare three-year cost at the same branch/camera counts, retention policy and
service levels: licenses, AI, infrastructure, storage/egress, deployment,
maintenance, operator staffing and support. No competitor price advantage is
claimed because no quote was provided.

## Evidence to retain for every release

Record test ID, exact revision/artifact, operator, device model/firmware, workload,
configuration, expected result, actual result, failure count and artifact link.
Keep redacted logs, fresh-frame timestamps, recording checksums, permission
results, real provider receipts and operator task measurements. Track open
defects with owner, priority, acceptance criterion and rollback plan.

The first useful customer demonstration is a completed loop: induce a real
camera fault, identify it with its timestamp, create a ticket, restore service,
confirm recovery, retrieve an incident's footage and export verifiable evidence.
Show both successful and unavailable states. Make a stronger product claim only
after the same workflow is measured against the client's VMS.
