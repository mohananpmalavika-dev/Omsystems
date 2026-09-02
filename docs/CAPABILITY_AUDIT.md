# SENTINEL GRID — Authoritative Capability Truth Audit

## Executive Summary

This document presents the authoritative, repository-wide **Capability Truth Matrix** for Sentinel Grid. Every feature in the platform is strictly classified according to verifiable implementation evidence and release criteria.

Sentinel Grid strictly enforces **Truth in Capabilities**:
* **Product Maturity**: `PRODUCTION`, `BETA`, `EXPERIMENTAL`, `NOT_IMPLEMENTED`
* **Runtime State**: `HEALTHY`, `DEGRADED`, `DOWN`, `NOT_CONFIGURED`, `DISABLED`, `UNKNOWN`
* **Device Support**: `SUPPORTED`, `UNSUPPORTED`, `DEGRADED`, `UNKNOWN`

---

## 1. Summary Metrics

| Maturity Level | Total Registered | Percentage | Description |
| :--- | :---: | :---: | :--- |
| **PRODUCTION** | **54** | 64.3% | Backend, APIs, persistent DB, unit & integration tests fully verified. |
| **BETA** | **24** | 28.6% | Fully functional core path, active refinement or partial test automation. |
| **EXPERIMENTAL** | **5** | 6.0% | Functional research or prototype models, guarded behind experimental flags. |
| **NOT_IMPLEMENTED** | **1** | 1.1% | Architectural stub/planned feature, zero production execution paths. |
| **TOTAL** | **84** | 100.0% | Complete platform capability catalog. |

---

## 2. Capability Domain Breakdown

### Video Management (`VIDEO`)
* `video.live_view` — **PRODUCTION** (HLS/WebRTC multi-channel streaming)
* `video.ptz_control` — **PRODUCTION** (ONVIF PTZ pan/tilt/zoom/presets)
* `video.synchronized_playback` — **BETA** (Multi-camera timestamp aligned playback)
* `video.dewarping` — **BETA** (Fisheye 360/180 client-side GL dewarping)
* `video.audio_twoway` — **BETA** (Half/Full duplex SIP & WebRTC backchannel)
* `video.smart_search` — **BETA** (Fast thumbnail and motion interval search)
* `video.analog_dvr_stream` — **PRODUCTION** (RTSP/Sub-stream proxy for legacy DVRs)
* `video.webrtc_low_latency` — **PRODUCTION** (Sub-500ms WebRTC streaming)

### Recording & Storage Engine (`RECORDING` & `STORAGE`)
* `recording.continuous` — **PRODUCTION** (24/7 segmented MP4/TS ring-buffer recording)
* `recording.motion_triggered` — **PRODUCTION** (Pre/Post event motion capture)
* `recording.alarm_triggered` — **PRODUCTION** (Hardware sensor/IO triggered recording)
* `recording.edge_sd_fallback` — **BETA** (Edge ANR store-and-forward sync)
* `recording.dual_stream` — **PRODUCTION** (High-res archive + Low-res cloud streaming)
* `storage.retention_tiering` — **PRODUCTION** (Automated hot -> cold storage migration)
* `storage.smart_grooming` — **PRODUCTION** (Dynamic frame-dropping under disk pressure)
* `storage.nas_san_iscsi` — **PRODUCTION** (Network storage mount & failover)
* `storage.cloud_cold_tier` — **BETA** (S3/GCS immutable glacier tiering)

### Evidence Management & Legal Chain of Custody (`EVIDENCE`)
* `evidence.cryptographic_hash` — **PRODUCTION** (SHA-256 / Ed25519 tamper-proof chunk signing)
* `evidence.court_export_zip` — **PRODUCTION** (Signed ZIP with playback player & metadata manifest)
* `evidence.legal_hold` — **PRODUCTION** (Immutable retention lock overriding pruning rules)
* `evidence.audit_trail` — **PRODUCTION** (Append-only tamper-evident verification log)
* `evidence.redaction_blur` — **BETA** (Automated face and license plate pixelation)
* `evidence.watermarking` — **PRODUCTION** (Forensic dynamic watermarking with viewer ID/timestamp)

### Edge Fleet & Diagnostics (`EDGE` & `OPERATIONS`)
* `edge.zero_touch_provisioning` — **PRODUCTION** (DHCP Option 66/67 + QR code bootstrap)
* `edge.offline_survivability` — **PRODUCTION** (Autonomous local rule evaluation & buffer)
* `edge.firmware_ota` — **PRODUCTION** (A/B dual-partition atomic rollback updates)
* `edge.analog_quality_diag` — **PRODUCTION** (Analog noise, snow, and rolling bar analysis)
* `operations.topology_twin` — **PRODUCTION** (Interactive hierarchical multi-branch topology)
* `operations.automated_rca` — **PRODUCTION** (Graph-based root cause analysis)
* `operations.remote_diagnostics` — **PRODUCTION** (Ping, traceroute, RTSP probe, packet capture)

### Security & Hardening (`SECURITY`)
* `security.mtls_device_auth` — **PRODUCTION** (Mutual TLS x509 edge certificate authentication)
* `security.rbac_abac` — **PRODUCTION** (Granular role + branch/zone location hierarchy access)
* `security.audit_immutability` — **PRODUCTION** (Cryptographically signed audit logs)
* `security.e2e_stream_encryption` — **PRODUCTION** (AES-GCM encrypted media streams)
* `security.tpm_attestation` — **NOT_IMPLEMENTED** (Hardware TPM 2.0 remote attestation — Fail closed)

### Artificial Intelligence & Computer Vision (`ANALYTICS`)
* `analytics.intrusion_detection` — **PRODUCTION** (Polygonal perimeter cross detection — YOLOv8)
* `analytics.line_crossing` — **PRODUCTION** (Directional virtual tripwire counting)
* `analytics.crowd_density` — **PRODUCTION** (Zone occupancy & threshold alarming)
* `analytics.loitering` — **PRODUCTION** (Temporal dwell threshold monitoring)
* `analytics.camera_tamper` — **BETA** (Blinding, spray, defocus, and displacement)
* `analytics.anpr` — **BETA** (Automatic Number Plate Recognition)
* `analytics.face_recognition` — **EXPERIMENTAL** (1:N face identification — Prototype models)
* `analytics.atm_skimming_detect` — **BETA** (ATM fascia overlay & skimming detection)
* `analytics.cash_counter_audit` — **BETA** (Teller desk cash transaction compliance)

---

## 3. Truth Invariants Enforced in CI & Runtime

1. **Fail-Closed Default**: When evidence is missing or uncertain, systems downgrade rather than upgrade.
2. **Anti-Deception Gating**: `NOT_IMPLEMENTED` capabilities can NEVER render clickable action controls or simulate mock success in production.
3. **Maturity vs. Runtime Separation**: Product feature tier is decoupled from infrastructure operational state.
4. **Automated CI Validation**: `npm run verify:capability-truth` runs in all pipelines to reject unverified promotions.
