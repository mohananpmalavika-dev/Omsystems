# CP PLUS Compatibility Layer - Production Engineering & Operations Guide

## 1. Executive Summary & Core Principle

**Core Rule**: **Never implement `CP PLUS = Dahua` as a permanent vendor branch.** 

The configured vendor string (e.g. `cp-plus`) is treated strictly as an initial probe ordering hint. The OmSystems Sentinel Grid compatibility layer converts recorder integration into an **evidence-based device profiling process**:

```
                       Recorder Configuration
                 (host, ports, credentials, hint)
                               │
                               ▼
            +─────────────────────────────────────+
            |  Recorder Fingerprint Orchestrator  |
            +──────────────────┬──────────────────+
                               │
        +──────────────────────┼──────────────────────+
        │                      │                      │
        ▼                      ▼                      ▼
+───────────────+      +───────────────+      +───────────────+
| HTTP Evidence |      | ONVIF Identity|      |  API Probes   |
|   Headers &   |      | & Services    |      | (Dahua / ISAPI|
|   Redirects   |      | (SOAP 1.2)    |      |  Proprietary) |
+───────┬───────+      +───────┬───────+      +───────┬───────+
        │                      │                      │
        +──────────────────────┼──────────────────────+
                               │
                               ▼
            +─────────────────────────────────────+
            |    Evidence Aggregator & Scorer     |
            |     - Separate Identity from API    |
            |     - Contradiction Penalties       |
            +──────────────────┬──────────────────+
                               │
                               ▼
            +─────────────────────────────────────+
            |     Concrete Capability Detector    |
            |   (SUPPORTED / PARTIAL / UNKNOWN)   |
            +──────────────────┬──────────────────+
                               │
                               ▼
            +─────────────────────────────────────+
            |      Persisted Device Profile       |
            |   (Signature Hash & Vault Secrets)  |
            +──────────────────┬──────────────────+
                               │
                               ▼
            +─────────────────────────────────────+
            |   Operation-Level Protocol Router   |
            | - Channels: Dahua CGI               |
            | - Live: RTSP / ONVIF                |
            | - Storage: Dahua CGI                |
            | - Clock: ONVIF                      |
            +─────────────────────────────────────+
```

---

## 2. Multi-Stage Fingerprinting Pipeline

### Step 0: Input Validation & Bounded Probing Budget
- Timeouts: 1500ms connect timeout, 3500ms request timeout, 20s total budget.
- Concurrency bounded to 4 simultaneous requests to prevent overloading older NVR embedded CPUs.
- Credentials loaded from secure vault references; raw passwords never appear in evidence payloads or logs.

### Step 1: Low-Cost HTTP Probing
- Safe GET queries on `/` and `/favicon.ico`.
- Captures `Server` header, `WWW-Authenticate` scheme/realm, and TLS certificate metadata.

### Step 2: ONVIF Service Discovery
- Probes `GetDeviceInformation` and `GetServices` using WS-Security UsernameToken.
- Establishes independent manufacturer/model baseline.

### Step 3: API-Family Marker Probing
- **Dahua CGI**: `/cgi-bin/magicBox.cgi?action=getSystemInfo` and `/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle`.
- **Hikvision ISAPI**: `/ISAPI/System/deviceInfo` and `/ISAPI/System/Video/inputs/channels`.
- **Generic RTSP**: `OPTIONS` / `DESCRIBE` handshakes.
- **Proprietary Registry**: Known CP PLUS firmware signature matches.

### Step 4: Identity & Family Reconciliation
- Separates manufacturer branding (`CP PLUS`) from underlying API protocol (`DAHUA_CGI`).

### Step 5: Capability Detection
- Enforces four-state support semantics: `SUPPORTED`, `PARTIAL`, `UNSUPPORTED`, `UNKNOWN`.
- **SMART Health**: Marked `PARTIAL` when basic volume state is readable but deep S.M.A.R.T. register attributes are absent (never falsely assumed `SUPPORTED`).

### Step 6: Confidence Scoring
$$\text{Confidence} = \max\Big(0, \min\big(1, \sum \text{weight}_{i} - 0.15 \times \text{contradictions}\big)\Big)$$

| Score Range | Category | Action |
|---|---|---|
| **0.85 – 1.00** | `CONFIRMED` | Persist profile and route operations automatically |
| **0.60 – 0.84** | `USABLE` | Use profile with diagnostic telemetry flags |
| **0.30 – 0.59** | `TENTATIVE` | Prefer generic protocols; schedule re-fingerprinting |
| **< 0.30** | `UNKNOWN` | Degrade safely; flag protocol mismatch |

---

## 3. Operation-Level Adapter Routing

Rather than binding a recorder to a single protocol, the `RecorderProtocolRouter` dispatches each operation independently:

```json
{
  "operationRoutes": {
    "deviceInfo": "ONVIF",
    "channels": "DAHUA_CGI",
    "liveStream": "RTSP",
    "recordingStatus": "DAHUA_CGI",
    "playbackSearch": "DAHUA_CGI",
    "storage": "DAHUA_CGI",
    "smart": "DAHUA_CGI",
    "deviceTime": "ONVIF"
  }
}
```

### Fallback & Lockout Safety
1. **Endpoint Error (404/501)**: Dynamically falls back to alternate confirmed families (`DAHUA_CGI` $\rightarrow$ `ONVIF` $\rightarrow$ `RTSP`).
2. **Authentication Failure (401/403)**: **Immediately halts retry pipeline** to prevent NVR brute-force lockout.

---

## 4. Backend Control-Plane REST API

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/v1/recorders/:id/profile` | Returns full persisted `RecorderDeviceProfile` |
| `POST` | `/api/v1/recorders/:id/fingerprint` | Ingests and saves edge-agent fingerprint |
| `GET` | `/api/v1/recorders/:id/capabilities` | Returns normalized 14-point capability matrix |
| `GET` | `/api/v1/recorders/:id/compatibility-diagnostics` | Aggregated view for UI diagnostics drawer |
| `POST` | `/api/v1/recorders/:id/refingerprint` | Queues re-detection (`MANUAL`, `FIRMWARE_CHANGE`, `FAILURE_DRIFT`) |
| `GET` | `/api/v1/compatibility/models` | Fleet-wide compatibility catalog and probabilities |

---

## 5. Dashboard UI Integration

The Branch Command Center (`dashboard/components/branch-command-center/`) features:
1. **Recorder Health Panel**: Displays live device profile, channel counts, storage, NTP sync, and CP PLUS compliance status.
2. **Protocol Diagnostics Modal (`recorder-diagnostics-modal.tsx`)**:
   - Hardware & Firmware identity card.
   - Live visual confidence score bar.
   - Operation-level route mapping grid.
   - Concrete capability support matrix.
   - Interactive **"Re-Fingerprint Device"** trigger.

---

## 6. Automated Test Verification

All suites verified passing with 0 errors:

- `npm run test:recorder:formal` (31/31 passed)
- `npm run test:recorder:compatibility` (22/22 passed)
- `npm run test:recorder:adapters` (29/29 passed)
- `npm run test:branch:command-center` (21/21 passed)
