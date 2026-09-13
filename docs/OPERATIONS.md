# Sentinel Grid / KryptoVision — Enterprise Operations & Runbook Manual

> **Standard Operating Procedures (SOP) & Central Monitoring Operations**  
> **Audience**: Level 1/2/3 SOC Operators, Site Reliability Engineers (SRE), Field Operations, Compliance Auditors  
> **Operational Scale**: 500+ Branches | 4,000–5,000 Cameras | 24x7x365 Central Monitoring  
> **Status**: Production Authoritative Manual

---

## 1. Operational Overview & SOC Triage Workflow

Sentinel Grid operates as a tiered monitoring architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    LEVEL 1: SOC OPERATOR                    │
│  - Live Video Monitoring & Alert Queue Processing           │
│  - Alarm Acknowledgment & Initial Verification (<60s)       │
│  - False Alarm Suppression & Dispatch Initiation            │
└──────────────────────────────┬──────────────────────────────┘
                               │ Escalation (P1 / P2 Confirmed)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 LEVEL 2: INCIDENT SPECIALIST                │
│  - Multi-Camera Correlation & Forensic Timeline Analysis    │
│  - Evidence Vault Preservation (Ed25519 Signing)            │
│  - Branch Manager & Law Enforcement Coordination            │
└──────────────────────────────┬──────────────────────────────┘
                               │ System / Stream Fault
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                LEVEL 3: SRE & FIELD OPERATIONS              │
│  - Predictive Health Risk Mitigation (HDD/Network/CCTV)     │
│  - Edge Agent & Media Gateway Node Maintenance              │
│  - Physical Device Replacement & Camera Calibration         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Telemetry, Metrics & Observability

### 2.1 Health Check Endpoints

All core services expose unified JSON health status:

| Endpoint | Method | Response Codes | Purpose |
| :--- | :--- | :--- | :--- |
| `/health` | GET | `200 OK`, `503 Service Unavailable` | Shallow load-balancer probe. Checks local process liveness. |
| `/health/liveness` | GET | `200 OK`, `500 Internal Error` | Kubernetes / Docker liveness probe. Re-starts stuck processes. |
| `/health/readiness` | GET | `200 OK`, `503 Service Unavailable` | Deep readiness probe. Verifies PostgreSQL pool, Redis ping, and S3 vault accessibility. |
| `/metrics` | GET | `200 OK` (Prometheus text format) | Scraped every 15s by central Prometheus server. |

Example `/health/readiness` Response:
```json
{
  "status": "UP",
  "timestamp": "2026-09-13T07:15:00.000Z",
  "version": "1.0.0",
  "uptimeSeconds": 86420,
  "checks": {
    "database": { "status": "UP", "latencyMs": 1.4, "poolActive": 12, "poolIdle": 38 },
    "redis": { "status": "UP", "latencyMs": 0.8, "mode": "cluster" },
    "storageVault": { "status": "UP", "latencyMs": 14.2, "bucket": "sentinel-evidence-vault" },
    "aiCapabilityRegistry": { "status": "UP", "activeCapabilities": 13, "failedCapabilities": 0 }
  }
}
```

### 2.2 Core Prometheus Metrics

Key operational metrics monitored in Grafana:

- `sentinel_camera_status{camera_id, branch_id, status}`: Current online/offline/degraded state.
- `sentinel_camera_fps{camera_id}`: Real-time received frames per second.
- `sentinel_camera_bitrate_kbps{camera_id}`: Stream ingestion bitrate.
- `sentinel_stream_latency_ms{camera_id}`: End-to-end RTSP to HLS latency.
- `sentinel_ai_inference_duration_ms{capability, model}`: P50/P90/P99 model execution latency.
- `sentinel_ai_inference_total{capability, status}`: Counter of successful vs failed inferences.
- `sentinel_alerts_generated_total{severity, rule_type}`: Rate of alerts created.
- `sentinel_branch_risk_score{branch_id}`: Calculated 0–100 predictive failure risk.

---

## 3. Alert Classification & Escalation Matrix

Sentinel Grid enforces deterministic P1–P4 severity levels with strict SLA response windows:

| Severity | Definition | Examples | SLA Response | Automated Action |
| :--- | :--- | :--- | :--- | :--- |
| **P1 — Critical** | Immediate security breach or catastrophic hardware failure threatening life or banking assets. | Vault door open after-hours; armed intrusion; fire/smoke detected; central recording failure across entire branch. | **< 30 seconds** | Audio-visual SOC klaxon; automated SMS/WhatsApp to Branch Manager & Security Head; camera auto-locks to PTZ preset. |
| **P2 — High** | Serious operational violation, perimeter compromise, or critical equipment degradation. | Cash counter loitering (>180s); unauthorized entry into server room; ANPR blacklist vehicle match; primary NVR HDD failure. | **< 2 minutes** | Push notification to SOC console; auto-generates Incident ticket; starts 60s pre/post event evidence clip buffer. |
| **P3 — Medium** | Policy infraction or hardware telemetry degradation. | Tailgating at access turnstile; camera tampering (obstruction/blur); retention degradation (<30 days remaining). | **< 15 minutes** | Queued in operator triage bucket; logged in Daily Branch Health report; SRE dispatch flagged. |
| **P4 — Low / Info** | Informational event or minor telemetry anomaly. | Camera NTP drift (<5s); routine schedule armed/disarmed; operator login/logout. | **< 2 hours** | Telemetry archive; no operator alert interruption. |

---

## 4. Banking Security Intelligence & Correlation Playbooks

### Playbook 1: After-Hours Cash Counter / Vault Intrusion
- **Trigger**: Person detected in `Z_VAULT` or `Z_CASH_COUNTER` between 20:00 and 06:00.
- **Correlation Rule**:
  1. Primary camera detects `person` inside restricted polygon with confidence $\ge 0.70$.
  2. Correlator checks branch arming state (`ARMED_AFTER_HOURS`).
  3. Secondary corridor camera cross-verifies motion vector within $\pm 10$ seconds.
- **Action**:
  - Elevates single correlated incident to **P1 Critical**.
  - Merges evidence streams from both cameras into one cryptographic Case File.
  - Suppresses individual person alerts to eliminate alert fatigue.

### Playbook 2: Anti-Tailgating & ATM Vestibule Overcrowding
- **Trigger**: Multiple persons detected entering restricted single-occupancy vestibule or server room.
- **Correlation Rule**:
  1. Entry door magnetic sensor opens.
  2. Edge AI detector tracks centroid count $\ge 2$ within bounded door zone during 5-second entry window.
- **Action**:
  - Flags **P2 High** Tailgating Alert.
  - Captures high-resolution facial snapshots of both primary entrant and tailgater.

---

## 5. Camera Health & Predictive Branch Risk Monitoring

### 5.1 7-Layer Camera Health Score (0–100)

Every camera's health score is calculated continuously from measured telemetry:

$$\text{Health Score} = w_1 \cdot S_{\text{online}} + w_2 \cdot S_{\text{fps}} + w_3 \cdot S_{\text{bitrate}} + w_4 \cdot S_{\text{loss}} + w_5 \cdot S_{\text{clarity}} + w_6 \cdot S_{\text{tamper}} + w_7 \cdot S_{\text{clock}}$$

1. **Online State (25%)**: 100 if RTSP stream open; 0 if unreachable for >3 probes.
2. **FPS Stability (15%)**: Measured FPS vs negotiated profile (e.g. 24.8 vs 25.0 fps $\rightarrow 100\%$).
3. **Bitrate Health (15%)**: Ingestion bitrate within $\pm 20\%$ of expected CBR/VBR profile.
4. **Packet Loss (15%)**: 0% loss = 100; >5% packet loss degrades score to 0.
5. **Image Clarity (10%)**: Laplacian variance measuring blur, overexposure, and darkness.
6. **Tamper / Defocus (10%)**: Scene change detection and optical defocus analysis.
7. **NTP Clock Synchronization (10%)**: Time delta between camera timestamp and system NTP.

### 5.2 Predictive Branch Risk Scoring

SREs monitor predictive branch scores (0–100) to proactively dispatch technicians before outages:
- **Risk Score > 75 (High Risk)**: Requires immediate field technician dispatch within 24h. Typically caused by predictive SMART HDD failures, recurring WAN packet drops, or power supply ripple.
- **Risk Score 40–74 (Moderate Risk)**: Flagged for weekly preventative maintenance review.
- **Risk Score < 40 (Normal)**: Healthy branch operation.

---

## 6. Forensic Evidence Export & Chain of Custody

When exporting evidence for legal proceedings or compliance auditors:

1. **Select Evidence in Dashboard**: Open *Evidence Vault* $\rightarrow$ Select Incident or Case ID.
2. **Cryptographic Verification**:
   - The system validates the SHA-256 hash of the MP4 recording against the immutable ledger record.
   - The system verifies the Ed25519 digital signature generated at the moment of recording.
   - If any tampering or byte alteration occurred, the dashboard flags `INTEGRITY_FAILURE` in red and locks export.
3. **Generate Signed Export Package**:
   - Click **Export Certified Package**.
   - Generates a zip bundle containing:
     - `video_evidence.mp4`: The pristine bitstream recording.
     - `manifest.json`: Metadata, camera ID, GPS coordinates, operator ID, and UTC timestamps.
     - `chain_of_custody.pdf`: Legal certificate with embedded cryptographic hashes and RFC 3161 timestamp.
     - `signature.sig`: Detached Ed25519 signature file.
4. **Audit Logging**:
   - An immutable audit trail entry is written to PostgreSQL recording `OPERATOR_EXPORT_EVIDENCE`, operator badge ID, reason, and client IP.
