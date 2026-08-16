# Guaranteed Alert Evidence Capture & Forensic Verification Subsystem

## 1. Executive Summary

In banking and high-security surveillance, alert evidence cannot be treated as a best-effort UI convenience. When an incident occurs (e.g. P1 Vault Intrusion, Fire, or Camera Tampering), the evidence package must be guaranteed, policy-driven, forensically audited, and verified.

The platform implements an enterprise **Guaranteed Evidence Capture & Forensic Verification Subsystem** separating what happened (`SurveillanceAlert`) from proof of what happened (`AlertEvidenceRecord`).

```
                              AI Detector / Sensor
                                       │
                         Transactional Outbox Pattern
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 ▼                                           ▼
      SurveillanceAlert (DB)                     EvidenceCaptureJob (Queue)
                 │                                           │
                 │                                           ▼
                 │                             EvidenceCapturePipeline
                 │                                           │
                 │                     ┌─────────────────────┴─────────────────────┐
                 │                     ▼                                           ▼
                 │           Immediate Snapshot (T0)                    Pre/Post Video Extraction
                 │             (Latency < 500 ms)                        (-10s pre + 30s post)
                 │                     │                                           │
                 │                     └─────────────────────┬─────────────────────┘
                 │                                           ▼
                 │                               Multi-Strategy Fallback:
                 │                          1. Recorder Archive (NVR Export)
                 │                          2. Edge Rolling Buffer (60s circular)
                 │                          3. Camera Playback (Edge SD)
                 │                          4. Live Stream Fallback
                 │                                           │
                 │                                           ▼
                 │                              Media & Hash Verification
                 │                              (Duration, ffprobe, SHA-256)
                 │                                           │
                 │                                           ▼
                 │                             Tamper-Evident Manifest
                 │                              (Canonical JSON SHA-256)
                 │                                           │
                 │                                           ▼
                 └────────────────────────────────► Evidence Record: READY
```

---

## 2. Mathematical & Operational Policies

### 2.1 Policy-Driven Time Windows
Evidence extraction is governed by centralized policy based on alert type and severity:
- **P1 Intrusion / Vault Access**: $10\text{s}$ Pre-Event $+ 30\text{s}$ Post-Event $= 40\text{s}$ Total Clip (Min duration $35\text{s}$, $5$ retries, $365$ days retention).
- **P1 Fire / Smoke**: $30\text{s}$ Pre-Event $+ 120\text{s}$ Post-Event $= 150\text{s}$ Total Clip (Min duration $120\text{s}$, $10$ retries, $730$ days retention).
- **P2 Camera Tampering**: $15\text{s}$ Pre-Event $+ 30\text{s}$ Post-Event $= 45\text{s}$ Total Clip.

### 2.2 Strict Terminal State Machine
Every evidence job strictly advances to a terminal state:
$$\text{QUEUED} \longrightarrow \text{WAITING\_FOR\_POST\_EVENT} \longrightarrow \text{CAPTURING} \longrightarrow \text{VERIFYING} \longrightarrow \begin{cases} \text{READY} & (\ge 90\% \text{ duration coverage + valid hash}) \\ \text{PARTIAL} & (\text{Usable media, truncated duration}) \\ \text{FAILED} & (\text{Unretrievable with machine-readable failure code}) \end{cases}$$

### 2.3 Secondary Escalation on P1 Evidence Failure
If a P1 incident fails evidence extraction (e.g. `RECORDER_OFFLINE` or `RECORDING_NOT_FOUND`), the system automatically generates a secondary `P2 EVIDENCE_CAPTURE_FAILURE` alert to notify the SOC that a critical incident has missing footage.

### 2.4 Cryptographic Verification & Tamper-Evident Manifests
- **Asset Hashes**: Every snapshot and MP4 video clip is hashed with SHA-256 upon storage upload.
- **Canonical JSON Manifest**: Combines `evidenceId`, `alertId`, `branchId`, `cameraId`, timestamps, asset hashes, and capture source into a canonical JSON object hashed with SHA-256 (`manifestSha256`).
- **Media Verification**: Verifies minimum size bytes, stream readability, and duration coverage $\ge 90\%$.

---

## 3. REST Control-Plane APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/evidence/jobs` | `POST` | Enqueue guaranteed evidence capture job (idempotent). |
| `/api/v1/evidence/alerts/:alertId` | `GET` | Retrieve complete evidence record for an alert. |
| `/api/v1/evidence/:id/manifest` | `GET` | Get cryptographic tamper-evident evidence manifest. |
| `/api/v1/evidence/:id/verify` | `POST` | Re-verify cryptographic integrity of evidence assets. |
| `/api/v1/evidence/sla/summary` | `GET` | Evidence capture SLA latency & reliability metrics. |
