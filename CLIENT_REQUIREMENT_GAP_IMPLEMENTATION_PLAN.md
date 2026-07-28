# Centralized Surveillance Platform

## Client Requirement Gap Assessment and Implementation Plan

**Assessment date:** 28 July 2026  
**Initial target:** Approximately 400 branches  
**Scale objective:** Add branches without redesign through horizontal scaling  
**Reference sizing assumption:** 5,000 cameras, pending confirmation of the actual camera count and stream profiles

## 1. Executive conclusion

The repository contains useful building blocks for a centralized surveillance product: organization and branch models, camera registration and live-session authorization, a grid UI, recording metadata, analytics rules and alerts, acknowledgement/escalation workflows, health/reporting schemas, and a load-test framework.

It does **not** yet meet the client requirement end to end. The largest gap is integration rather than screen count. The running product is the root Fastify control plane, while much of the newer branch-health, DVR/NVR monitoring, WebSocket, central-monitoring, and report implementation is in an unbootstrapped `backend/` Express tree that is not a workspace package and is not mounted by the active application. Several dashboard screens call those inactive endpoints.

The recommended path is to stabilize one production architecture, deliver device health before advanced AI, then add the HO alert console, notification matrix, reporting, and verified scale. “Unlimited branches” should be expressed contractually as **no fixed application limit, horizontally scalable in tested capacity increments**; no system has literally unlimited compute, bandwidth, or storage.

## 2. Evidence-based current-state assessment

### What is reusable

- Organizational hierarchy, tenant scope, branch and camera inventory exist in the active control plane.
- An edge-agent foundation exists for branch registration, ONVIF discovery, camera heartbeat, RTSP probing, and secure live-session setup.
- The control-room grid supports saved layouts up to 12 x 12 (144 positions), with an enhanced grid containing virtualization/adaptive-layout concepts.
- Analytics data contracts support P1-P5 severity, snapshots, clip references, alert acknowledgement, escalation, resolution, false-alarm handling, and incident linkage.
- Recording configuration, segments, gaps, storage-node metadata, retention candidates, and reporting/export foundations exist.
- Role permissions and audit-oriented workflows are present.
- A 400-branch/5,000-camera load-test framework and acceptance thresholds have been drafted.

### Delivery blockers found during assessment

- The active root TypeScript build fails with contract/type errors in health and incident/evidence services.
- Dashboard typecheck fails, including missing real-time hook imports, incompatible camera status types, and legacy `react-router-dom` pages inside a Next.js application.
- Edge-agent typecheck fails because the camera heartbeat module imports a missing logger.
- The full test run produced **20 passing and 13 failing test files; 72 passing and 123 failing tests**. Failures include recording search/playback/export/snapshot APIs, route 404s, retention behavior, and analytics ingestion.
- Analytics typechecks, but runtime logs show missing model files, multiple detectors in simulation mode, a placeholder stream-frame extraction path, and a failing open-model event test.
- Email and SMS provider methods currently log “would send” behavior; real delivery is not implemented. Phone calling is absent.
- Scheduled reports are in-memory/mock in the active reporting route; general PDF export is explicitly not implemented.
- The Operations dashboard polls inactive `/api/v1/operations/*` endpoints. Only the alert and branch-detail subpages exist; links for camera, recording, edge-agent, storage, network, and UPS drill-downs are missing.
- The control room loads every branch and then cameras branch by branch, creating an N+1 request pattern unsuitable for 400 branches.
- The 12 x 12 grid is a UI capacity, not proof that a browser, gateway, WAN, and recorder can deliver 144 simultaneous video streams.
- The repository's load-test documentation marks 400-branch/5,000-camera capacity as unproven, and some reported performance metrics are randomly generated rather than measured.
- Database migration deployment status could not be verified because `DATABASE_URL` is not configured in the assessment environment.

## 3. Requirement traceability and gaps

| Client requirement | Current evidence | Status | Gap to close |
|---|---|---:|---|
| Centralize about 400 branches | Hierarchy, branch/camera APIs, edge-agent, and draft load tests exist | Partial | Consolidate runtime, bulk/paginated APIs, deploy branch agents, prove 400-branch performance and HA |
| Scale beyond 400 branches | Horizontal-scaling ideas appear in documentation | Unproven | Stateless services, queue/event bus, cache, DB partitioning/read replicas, regional media/analytics workers, capacity runbook |
| Maximum branches/channels on one screen | Grid offers up to 144 camera positions | Partial | Define operator-safe maximum; use 400-branch health mosaic plus on-demand video, substreams, viewport activation, paging and video-wall profiles |
| Branch-wise view with all cameras | Branch and camera APIs/grid exist | Partial | Indexed branch drill-down, filters/search, bulk endpoint, camera health overlays, tested live/playback for CP PLUS devices |
| DVR/NVR online/offline | Active root DVR/NVR monitor routes exist; richer `backend/` service/schema is disconnected | Partial | Vendor adapter, polling/heartbeat scheduler, stale thresholds, last-seen evidence, alert lifecycle, end-to-end tests |
| Camera working status | Camera status, RTSP probe and heartbeat foundations exist | Partial | Define working vs reachable vs streaming vs recording; fix edge heartbeat; tamper/freeze/black-frame checks; real-time propagation |
| HDD health/status | Storage/SMART/RAID concepts and schemas exist | Partial | Collect real CP PLUS SMART/RAID values, normalize disks, thresholds, trend history, replacement alerts |
| Retention days; below policy in red | Retention configuration/gap schemas exist; new unintegrated work is present | Partial | Calculate **actual oldest playable continuous recording** per camera/branch; policy inheritance; red breach UI; daily verification and evidence |
| Local internet connectivity | Edge heartbeat/network score concepts exist | Partial | Active probes from branch, last successful cloud contact, latency/loss/jitter/DNS metrics, ISP outage classification and alert suppression |
| Other critical health | CPU, memory, temperature, firmware, UPS and storage concepts exist | Partial | Approved metric catalog, vendor capability matrix, normalized unknown/unsupported states, thresholds and trend storage |
| Daily exportable reports | JSON/CSV and maintenance report code exist | Partial | Persistent scheduler, operational-health report templates, CSV/XLSX/PDF generation, recipient delivery, audit and retry |
| Total branches and operational summary | Active reporting summary and disconnected Operations summary exist | Partial | One authoritative API and UI; health formula; stale/unknown counts; region/branch filters; drill-down reconciliation |
| AI analytics and real-time alerts | Rules, P1-P5 alerts, acknowledgement/escalation and alert list exist | Partial/prototype | Production inference, model validation, real stream ingestion, alert taxonomy supplied by client, WebSocket delivery, HA and performance |
| Dedicated alert section | Analytics operator queue exists | Partial | HO-wide queue, branch name, severity filters, SLA timers, assignment, deduplication/correlation, P4 log-only behavior |
| Pop-up and sound | No complete HO pop-up/sound workflow found | Missing | Browser notification permission, audible alarm policy, repeat/mute controls, multi-operator claim/ack sync, accessibility |
| Branch name/type/severity | Data exists across camera/branch/rule | Mostly present | Return a denormalized alert projection from one API and render it consistently |
| Live video in alert pop-up | Secure live sessions and grids exist | Partial | Alert-to-camera live-session action, low-latency substream, fallback snapshot, timeout/reconnect and authorization |
| Snapshot and video clip | Alert schema supports references | Partial | Generate signed snapshot/clip artifacts, pre/post roll, retention/legal hold, expiry, playback validation |
| Acknowledge / Escalate buttons | Active analytics routes/UI exist | Mostly present | Operator identity, notes/reason policy, optimistic concurrency, SLA/escalation automation, WebSocket synchronization and tests |
| P1 dashboard + SMS + email + phone | Severity exists; SMS/email are stubs; phone absent | Missing | Durable policy engine, recipient matrix, real providers, call workflow, retries, delivery receipts, fallback and audit |
| P2 dashboard + email | Severity exists; email stub | Missing end to end | Real provider, templates, recipient/on-call configuration, delivery tracking |
| P3 dashboard only | Alert list exists | Partial | Real-time push, deduplication, unread state, multi-operator synchronization |
| P4 system log only | P4 severity exists | Partial | Enforce notification suppression while retaining searchable/auditable log |
| Device-health and segregated alert exports | Some export endpoints exist | Partial | Unified filter contract, asynchronous large exports, XLSX/PDF/CSV, signed downloads, audit and retention |

## 4. Target operating model

### 4.1 Branch edge

Deploy one managed edge agent per branch (or an HA pair for critical sites). It should:

- discover and inventory CP PLUS DVRs/NVRs/cameras using ONVIF where possible and a CP PLUS/vendor adapter where required;
- collect recorder, camera, disk, recording-retention, network and optional UPS telemetry;
- use camera substreams for wall viewing and AI to protect WAN bandwidth;
- buffer health/events during WAN outages and replay idempotently after reconnect;
- keep recording local unless central recording is explicitly required;
- expose no inbound branch ports; initiate mutually authenticated outbound connections.

### 4.2 Central control plane

Use the current Fastify/PostgreSQL stack as the authoritative control plane and port the valuable disconnected `backend/` functions into it. Do not maintain two competing route/service/data conventions.

The central plane should include:

- tenant/organization, inventory, policy and authorization services;
- a durable event stream/queue for health and analytics events;
- current-state tables plus partitioned time-series history;
- Redis or equivalent for ephemeral presence, rate limiting and dashboard fan-out;
- WebSocket/SSE fan-out for live status and alert updates;
- asynchronous notification, report and clip-generation workers;
- audit logs and observability with SLO dashboards.

### 4.3 Media and AI plane

- Keep live media out of the control-plane process.
- Use regional/media-gateway workers and signed, short-lived live-session URLs.
- Use low-resolution substreams for dense grids; promote only selected/alerted tiles to a higher-quality stream.
- Run AI at the edge or on regional GPU workers according to WAN, privacy and capacity constraints.
- Treat model rollout like software rollout: versioned models, validation dataset, per-alert precision/recall targets, canary deployment and rollback.

### 4.4 Two complementary HO views

1. **Enterprise health mosaic:** all 400 branches can be represented on one screen as compact status tiles (health, cameras, recorder, HDD, retention, internet, alerts). This is feasible and useful.
2. **Video wall:** bounded concurrent video tiles using 1/4/9/16/25/36/64/144 profiles, with viewport activation, paging, alert-driven promotion and bandwidth budgeting. A 144-tile layout must not imply 144 full-resolution streams.

This distinction satisfies centralized visibility without making an unsafe bandwidth/performance promise.

## 5. Phased implementation plan

Estimates assume a cross-functional team of roughly 5-7 people (backend, frontend, edge/media, AI, QA/DevOps) and timely access to CP PLUS test equipment and notification-provider accounts. Re-estimate after discovery.

### Phase 0 — Architecture convergence and release baseline (2 weeks)

**Objective:** Establish one buildable, testable product before adding features.

- Decide and document that root Fastify is the authoritative API runtime.
- Inventory every `backend/` route/service/migration as port, replace, or delete-later; port only against the canonical repository and migration conventions.
- Fix root, dashboard and edge-agent typechecks.
- Separate legacy Next.js-incompatible pages and remove dead route calls.
- Restore a green smoke suite for authentication, branch/camera inventory, live authorization, analytics ingest/alert transitions, recording health, and reports.
- Establish CI gates: typecheck, unit/integration, migration up/down test, API contract test, dashboard build and critical Playwright flows.
- Publish an OpenAPI contract and a requirement-to-test traceability matrix.

**Exit gate:** all production workspaces build; P0 smoke tests pass; one migration path and one API contract are authoritative.

### Phase 1 — Real branch and device health MVP (3-4 weeks)

**Objective:** Deliver trustworthy operational health for a 10-branch pilot.

- Create CP PLUS model/firmware capability matrix and obtain vendor SDK/API documentation.
- Repair and harden edge-agent camera/recorder monitoring.
- Implement normalized telemetry envelopes with device/branch/tenant IDs, observed time, received time, source, quality, and idempotency key.
- Collect recorder reachability, channels, recording state, CPU/memory/temperature/uptime/firmware where supported.
- Collect per-disk SMART/RAID/capacity/write status; show unsupported fields explicitly.
- Implement camera reachability, RTSP availability, stream quality/tamper/freeze checks and recording state.
- Implement branch internet heartbeat plus latency, packet loss, jitter and last-online time.
- Implement actual retention verification based on oldest playable continuous footage, not configured days alone.
- Define health and staleness policy with tenant/branch overrides and reason codes.
- Port/create paginated summary, branch-detail and alert APIs in the active control plane.

**Exit gate:** 10 real branches report for seven days; state changes reach HO within 30 seconds; configured retention breaches render red; no silent unknown-to-healthy conversion.

### Phase 2 — Central dashboard, branch drill-down and video wall (3-4 weeks)

**Objective:** Give HO operators one scalable operational workspace.

- Replace the dashboard's N+1 camera loading with paginated/bulk summary APIs.
- Build the 400-branch health mosaic with region/status/search filters and virtualized rendering.
- Build branch detail with all cameras, recorder/HDD/retention/internet panels, trends and last-seen evidence.
- Wire WebSocket/SSE updates with polling fallback and reconnect/resync semantics.
- Complete missing Operations drill-down pages and consistent navigation.
- Integrate the enhanced grid, saved layouts, video-wall profiles, substream selection and viewport-based session activation.
- Add per-user/role layouts, fullscreen/video-wall mode, stream failure fallback and session limits.
- Measure browser CPU, memory, decode load, WAN and media-gateway capacity for each supported grid profile.

**Exit gate:** 400-branch metadata dashboard loads under 2 seconds at the agreed percentile; branch drill-down under 3 seconds; no O(branches) browser requests; supported video-wall profiles pass an 8-hour soak test.

### Phase 3 — HO real-time alert command center and notification matrix (3-4 weeks)

**Objective:** Implement the requested alert workflow end to end.

- Obtain the client alert catalog and map every type to P1/P2/P3/P4, confidence, schedule, recipients, SLA and clip policy.
- Implement a durable alert state machine with deduplication, suppression, correlation, assignment, acknowledgement, escalation and resolution.
- Build an HO-wide real-time queue and pop-up showing branch, camera, alert type, severity, timestamp, live video, snapshot, clip and SLA timer.
- Implement sound by priority with browser-permission onboarding, repeat/mute policy and acknowledgement synchronization.
- Generate snapshot and pre/post-event clips through asynchronous workers; use signed URLs and evidence retention rules.
- Implement a persistent notification policy and outbox/worker:
  - P1: dashboard + SMS + email + phone call;
  - P2: dashboard + email;
  - P3: dashboard only;
  - P4: system log only.
- Integrate approved SMS, email and voice providers; store attempts, provider IDs, delivery receipts, errors, retries and fallback outcomes.
- Add on-call schedules, recipient groups, quiet-hour rules (never suppress P1 unless expressly approved), rate limits and escalation timers.
- Add multi-operator concurrency protection so only one acknowledgement transition wins and all consoles update immediately.

**Exit gate:** synthetic and real test alerts demonstrate the exact matrix; dashboard alert p95 under 5 seconds; P1 external notification starts within 30 seconds; every attempt is auditable; duplicate storms are controlled.

### Phase 4 — Daily reports and exports (2-3 weeks)

**Objective:** Provide operational and management reporting that survives restarts.

- Persist schedules, recipients, timezone, format, filters, last run, next run and run history.
- Produce daily enterprise and branch reports covering branch/recorder/camera/HDD/retention/internet health, outages, alert counts, acknowledgement/escalation SLA and unresolved exceptions.
- Implement CSV and XLSX for analysis and a formatted PDF for management.
- Support segregated exports by region, branch, device status, alert type, severity, state and date range.
- Run large exports asynchronously with progress, signed download links, expiry and audit logs.
- Add retry/dead-letter behavior for report generation and email distribution.

**Exit gate:** scheduled jobs persist through restart; totals reconcile with dashboard/API data; all formats open correctly; a 5,000-camera daily report completes inside the agreed window.

### Phase 5 — Scale proof, security, HA and rollout (4-6 weeks)

**Objective:** Prove enterprise readiness at the contracted scale.

- Correct the existing load generator to call the real API contract and replace random metrics with measured values.
- Execute progressive tests: 10, 50, 100 and 400 branches; 5,000 cameras; 100 dashboard users; burst alerts; mass offline/reconnect; large exports.
- Test media separately at supported grid sizes and AI workers at the contracted percentage of enabled cameras.
- Add database partitioning/retention, query plans, indexes, caching, backpressure, queue sizing and autoscaling based on measured bottlenecks.
- Run WAN outage/replay, node loss, database failover, queue recovery, notification-provider outage and disaster-recovery tests.
- Complete TLS/mTLS, secret rotation, RBAC review, audit immutability, vulnerability scanning and penetration testing.
- Roll out 10 -> 50 -> 100 -> 400 branches with rollback gates and field-support runbooks.

**Exit gate:** agreed SLOs pass at 400 branches/5,000 cameras, including a 24-hour endurance test and documented RTO/RPO recovery exercise.

## 6. Proposed non-functional acceptance criteria

These are starting targets for client approval, not current claims.

| Area | Proposed release criterion |
|---|---|
| Scale | 400 branches, 5,000 cameras, 400 edge agents, 100 concurrent dashboard users |
| Availability | 99.9% monthly for control-plane APIs/dashboard; media availability measured separately |
| Health freshness | 95% of online branch/device status updates visible at HO within 30 seconds; stale after an agreed threshold |
| Alert latency | Detection accepted to HO display p95 < 5 seconds, excluding model inference time where separately measured |
| API performance | Summary API p95 < 500 ms and p99 < 1 second at target load |
| Dashboard | Initial 400-branch health view < 2 seconds at agreed test network/client specification |
| Branch drill-down | < 3 seconds with agreed maximum cameras per branch |
| Notifications | P1 dispatch initiated < 30 seconds; delivery result/audit recorded; retry and fallback tested |
| Recording/retention | Daily verification of 100% enabled cameras; breach based on playable footage; red status and alert generated |
| Reconnect | At least 99% of branches reconnect and replay buffered events without duplication after simulated outage |
| Video wall | Each supported profile passes 8-hour browser/gateway soak within CPU, memory, dropped-frame and bandwidth limits |
| DR | Client-approved RPO/RTO demonstrated in a recovery exercise |

## 7. Priority backlog

### Must have for first production release

- One active API/runtime and green CI
- 400-branch summary and branch drill-down
- Recorder, camera, HDD, recording, retention and internet health
- Health alerts with real-time updates
- HO alert queue/pop-up with sound, live view, snapshot/clip, acknowledge/escalate
- Exact P1-P4 notification matrix with real provider delivery
- Daily reports and filtered export
- RBAC, audit, HA, monitoring, backup/restore and proven 400-branch capacity

### Should follow after the operational core

- Predictive device failure
- Advanced alert correlation and investigations
- Geospatial views
- Automated remediation and work-order integration
- Additional AI alert types after model validation

### Do not position as delivered yet

- “Unlimited” capacity
- 144 simultaneous production video streams
- 99% enterprise-VMS parity
- Production AI inference across all documented detectors
- Real SMS/email/phone delivery
- 400-branch readiness

## 8. Decisions and inputs required from the client

1. Exact branch and camera counts now and for years 1, 3 and 5; maximum cameras per branch.
2. CP PLUS DVR/NVR/camera models, firmware versions, ONVIF support, SDK/API access and available substreams.
3. Required recording retention by branch/camera category and whether it means calendar days or continuous playable days.
4. Branch WAN bandwidth, static/dynamic IP, proxy/firewall rules, outage expectations and whether local edge hardware is allowed.
5. Whether recordings remain on DVR/NVR, are duplicated locally, or must be centralized.
6. The AI alert list, target zones/schedules, severity, acceptable false-positive rate and evidence clip duration.
7. P1/P2 recipient groups, escalation timers, on-call schedule, SMS/email/voice provider, language and call acknowledgement behavior.
8. Required maximum video tiles per physical HO screen and number/specification of operator workstations/video-wall controllers.
9. SSO/identity provider, data residency, privacy, audit and regulatory requirements.
10. Availability target, support window, RPO/RTO and disaster-recovery site expectations.

## 9. Immediate next sprint

The next sprint should be Phase 0 plus a thin vertical slice: one real CP PLUS branch -> edge telemetry -> active Fastify API -> PostgreSQL -> WebSocket -> HO branch tile -> retention breach alert -> acknowledgement -> audit record. This will retire the highest integration risks before expanding feature breadth.

