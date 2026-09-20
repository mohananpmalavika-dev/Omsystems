# CCTV Feature Coverage Audit

Date: 20 September 2026  
Scope: dashboard, control plane, analytics engine, recorder SDK, Edge Agent, recording, playback, retention, evidence, privacy, health and HA code.

## Verdict

The repository has broad CCTV/VMS coverage, but **all CCTV features are not production-ready**. Most major product areas exist in code. The highest-risk gap is the deployed Windows Edge Agent: the installed executable currently crashes before startup because the staged `sharp` runtime is missing its `semver` dependency. No running edge-agent process was observed during this audit.

The build pipeline has been corrected to stage and verify all direct `sharp` runtime dependencies. A new signed installer must still be built and installed; changing the repository does not repair the already-installed executable.

## Feature matrix

| Area | Status | What exists | Remaining qualification |
| --- | --- | --- | --- |
| Camera inventory and branch mapping | Available | Camera/branch inventory, maps, digital twin, import/export, location and health views. | Requires PostgreSQL and deployment data. Some destructive admin endpoints correctly return 501 without PostgreSQL. |
| ONVIF discovery | Available but deployment-blocked | WS-Discovery, ONVIF client/services, edge discovery, local scanner, discovery review. | Installed Edge Agent is not starting; physical-device certification is still required. |
| Recorder/channel discovery | Available but deployment-blocked | DVR/XVR/NVR channel discovery and vendor adapters. | Must prove against each supported firmware/model; several adapters retain simulation/test fallback paths. |
| Vendor compatibility | Partial | Hikvision ISAPI, Dahua CGI, CP Plus, Uniview, ONVIF and generic RTSP implementations exist. | Formal certified compatibility matrix, firmware ranges and negative tests are required. Recorder SDK credential-resolver injection is not wired consistently into vendor driver instances. |
| Secure credentials | Partial | Credential services, encryption and rotation services exist. | Canonical recorder SDK drivers instantiate HTTP clients without a production credential resolver; authenticated device calls must be integration-tested end to end. |
| Live view | Available, environment-dependent | Camera grids, branch camera wall, control room, video wall, focus view, stream scheduling and snapshot relay. | Needs working Edge Agent/media gateway, Redis coordination and real browser/device testing. |
| Streaming protocols | Partial | RTSP ingestion, MediaMTX RTSP-to-HLS remux, main/substream selection and transcoding/remux selection. | WebRTC/SRT/multicast and full low-latency interoperability were not established as complete product paths. |
| Adaptive quality/capacity | Available | Client capacity profiling, stream admission, priority, main/substream fallback and degradation states. | Requires load tests with actual codecs, browsers, GPUs and branch bandwidth. |
| PTZ | Available | ONVIF PTZ, priorities, optics, presets and tours. | Must validate device-specific coordinate ranges, permissions, audit and competing-operator control on certified cameras. |
| Audio/talkback | Partial | Audio decoding/metering/anomaly monitoring and talkback services exist. | Browser/device permission flow, supported codecs, echo control and real two-way audio were not proven here. |
| Continuous/event/scheduled recording | Available in architecture | Recording schedules, recording engine, NVR search and recording status services exist. | Must prove actual write, restart recovery, storage-full handling and playable media on target hardware. |
| Playback | Available | Single-camera playback, synchronized multi-camera playback, timeline, bookmarks and investigation workflows. | One signature-algorithm representation mismatch was found and fixed. Some legacy investigation-session code contains simulated gap/drift logic and must not be used as authoritative production state. |
| Recording continuity | Available | Gap detection, root-cause analysis, recovery, edge backfill/replenishment and continuity ledger. | Needs fault-injection tests with real NVR/edge outages and restart persistence. |
| Retention | Available | Policy resolution, retention verification, deletion planning, capacity forecasting and reporting. | Authoritative PostgreSQL/legal-hold dependencies must be enabled; branch-specific policy and deletion proof require operational validation. |
| Archive/storage | Available | Local, NAS, SAN, S3 and archive providers; cold archive; disk/SMART and storage failover. | Cloud credentials, immutability/WORM, restore drills and performance/SLA evidence are deployment responsibilities. |
| Evidence case management | Available | Evidence Vault, cases/items, capture pipeline, manifests and custody events. | Banking session source media is not yet automatically attached to its new evidence case. |
| Forensic export | Available; legacy path quarantined | Real export worker, hashing, signing, redaction, watermarking, custody, legal hold and verifier exist. | The old metadata-only pipeline is now fail-closed and cannot fabricate a sealed package. Remove it after all downstream imports are confirmed migrated. |
| Evidence signing | Available | Persistent file, AWS KMS/HSM-compatible signing, SHA-256 and verification paths. | Production must fail closed without provisioned persistent/HSM keys and must prove key rotation/revocation and verifier interoperability. |
| Privacy/redaction | Available | Purpose controls, camera privacy zones, face/plate/people redaction, audio handling, watermarks and audit records. | DPDP applicability, notices, retention, access requests and approvals remain deployment/governance work. |
| Camera health | Available | Online/offline, frame age, keyframe age, FPS, packet loss, freeze, black frame, tamper, obstruction and device evidence. | Requires working telemetry from the Edge Agent and physical fault tests. |
| Recorder/disk health | Available | DVR/NVR status, channels, storage volumes, SMART/disk status and predictive maintenance. | Vendor-specific telemetry coverage and alert thresholds require certification. |
| HA/failover | Partial | Media leases, gateway/node failover, recording failover, storage failover and recovery services exist. | Some chaos methods are explicit simulations; Redis/PostgreSQL fail-closed behaviour and real node failover must be exercised. |
| Alerts and response | Available but connector-dependent | Analytics alerts, incident conversion, notification policies, voice/SMS/email provider abstractions and physical relay siren support. | Delivery receipts, retry/escalation policy and installed relay validation are required. UI no longer claims dispatch without server evidence. |
| AI video analytics | Broad coverage | People, vehicles, ANPR, face/watchlist, re-ID, crowd/queue, tailgating, behaviour, fall, abandoned objects, tamper, obstruction, banking, industrial and investigation/search components. | Model files/readiness, accuracy, drift, false-positive review, camera placement and environment validation must be proven. Some pages are capability surfaces rather than proof of live inference. |
| AI video search | Partial | Natural-language search, summaries, query explanation and playback integration. | A missing tenant boundary on summary camera lookup was fixed. Voice/search provider and model availability remain configuration-dependent. |
| Access control/audit | Available with gaps to test | Tenant/RBAC/ABAC structures, camera permissions and video-access audit services exist. | Add complete endpoint-by-endpoint tenant/branch negative tests, including snapshots, streams, summaries, exports and playback. |
| Time integrity | Available | NTP configuration, clock health, offset tracking and synchronized playback time mapping. | Must prove actual recorder/camera NTP enforcement, timezone correctness, drift alarms and export timestamp provenance. |
| Edge connectivity | Available in design, currently broken locally | Outbound control-plane link, cloudflared tunnel, MediaMTX and branch-specific installer. | Installed agent crash must be repaired by rebuilding/reinstalling the signed release. Managed stable tunnels are required for production. |
| Physical siren | Available in Edge Agent configuration | HTTP relay ON/OFF pulse with duplicate suppression. | Electrical safety, relay authentication, network isolation, delivery audit and real device test are required. |
| Firmware lifecycle | Missing/insufficient | Firmware/model metadata and device configuration exist. | No complete governed firmware inventory, vulnerability mapping, signed upgrade, staged rollout, rollback and success-attestation workflow was established. |
| Fisheye/dewarping | Not established | No complete user-facing dewarping workflow was verified. | Implement only if supported camera estate requires it. |
| Formal electronic-record certificate | Not established | Strong manifests, signatures and custody controls exist. | A complete jurisdiction-specific electronic-record certificate generation/approval workflow was not conclusively found. Legal review is required. |

## P0 blockers

1. **Rebuild and reinstall the Windows Edge Agent.** The installed executable fails with `Cannot find module 'semver'` while loading `sharp`.
2. **Wire the production secret/credential resolver into recorder SDK drivers** and prove authenticated calls against supported recorders.
3. **Prove actual media end to end:** camera/recorder → Edge Agent → tunnel/media gateway → live view → recording index → playback → signed export.
4. **Make service degradation explicit:** distinguish no cameras/no recordings from unavailable Edge Agent, database, Redis, storage, recorder or model.
5. **Run cross-tenant/branch access tests** for every media and evidence endpoint.
6. **Disable simulation paths in production** and add production startup assertions for any class that can create simulated gaps, drift, device state, hash or package status.

## Changes made during this audit

- Windows native-module staging now includes `semver` and `@img/colour`, in addition to `sharp`, `detect-libc` and the Windows native binary.
- Windows package verification now refuses a release missing any direct `sharp` runtime dependency.
- Added a regression test for the Windows runtime dependency manifest.
- AI video summary camera lookup now includes authenticated tenant ownership.
- Added a route regression test for cross-tenant summary access.
- Normalised forensic package Ed25519 algorithm naming so the synchronized investigation/evidence contract passes consistently.
- Quarantined the legacy metadata-only export pipeline so it fails closed instead of returning a fixed hash, signature and sealed URL.

## Verification performed

- Edge Agent TypeScript check: passed.
- CCTV-focused unit suites: 110 tests executed initially; 109 passed and one Ed25519 casing mismatch failed. The mismatch was corrected and is covered in the final verification run.
- The installed Edge Agent `--version` smoke check failed before argument handling because of the missing module.
- In-app browser connection timed out, so authenticated live UI click-through could not be completed in this environment.
- PostgreSQL/device-dependent integration tests and physical camera/recorder tests remain release gates.

## Release acceptance checklist

1. Build a signed Windows release from a clean workspace; package verification must pass on Windows.
2. Install it on a clean branch PC and confirm service/task restart, heartbeat and no missing-module errors.
3. Discover at least one ONVIF camera and one supported DVR/NVR; validate credentials, channel mapping and clock health.
4. Verify main/substream live playback over LAN and managed outbound tunnel.
5. Record continuous, scheduled and event clips; restart the agent/recorder and verify continuity/backfill.
6. Perform single and synchronized playback with a deliberate gap and clock drift.
7. Trigger health, tamper, obstruction and analytics alerts using controlled physical scenarios.
8. Convert an alert to an incident, preserve source media, apply legal hold, export, verify signature/hash and replay offline.
9. Exercise storage full, database down, Redis down, tunnel loss, recorder loss and media-node failover.
10. Run tenant/branch isolation, privilege, audit, privacy, retention and deletion-proof tests.

Only after these gates pass should the deployment be described as a production-complete CCTV/VMS implementation.
