# Real-Time Alert Operations Subsystem Architecture

## 1. Executive Summary

The **Global Real-Time Alert Operations System** provides a production-grade, authoritative operational lifecycle for centralized bank branch surveillance (400+ branches):

```
       AI / Device / Security Detectors
                      │
                      ▼
             Alert Ingestion API
                      │
                      ▼
         Normalization & Deduplication
                      │
                      ▼
         Contextual Severity Engine
       (Vault CAM -> P1, Lobby -> P3)
                      │
                      ▼
          Instantaneous Alert Created
             (State: NEW, Ev: QUEUED)
                      │
       ┌──────────────┴──────────────┐
       ▼                             ▼
Real-Time SSE Event Bus    Async Evidence Pipeline
       │                    (Snapshot + 15s/30s Clip)
       ▼                             │
Global Alert Center UI               ▼
(P1 Popup Arbitration)     Evidence State: READY/FAILED
       │
       ▼
Operator Acknowledges (Atomic lock)
       │
       ▼
SLA Response Timer Stopped
       │
       ▼
Escalation / Comments / Assignment
       │
       ▼
Resolution with Mandatory Disposition
 (TRUE_POSITIVE, FALSE_POSITIVE, etc.)
       │
       ▼
SLA Analytics & Immutable Audit Log
```

---

## 2. Canonical Authoritative DTO (`OperationalAlert`)

The backend exposes a single authoritative DTO so the frontend never infers operational states from UI heuristics:
- **`severity`**: `"P1" | "P2" | "P3" | "P4"`
- **`status`**: `"NEW" | "ACKNOWLEDGED" | "INVESTIGATING" | "ESCALATED" | "RESOLVED" | "DISMISSED"`
- **`evidence`**:
  - `state`: `"QUEUED" | "CAPTURING" | "READY" | "PARTIAL" | "FAILED"`
  - `snapshotUrl`, `clipUrl`, `clipDurationSeconds` (45s: 15s pre + 30s post)
  - `failure`: `{ stage, reason, message }` (e.g. `NO_RECORDING_FOUND`)
- **`acknowledgement`**: `{ acknowledgedAt, acknowledgedBy, responseTimeSeconds, slaBreached }`
- **`resolution`**: `{ resolvedAt, resolvedBy, disposition, notes, slaBreached }`
- **`revision`**: Monotonically increasing integer for out-of-order SSE rejection.

---

## 3. Strict Server-Authoritative State Machine

State transitions are strictly verified and protected with concurrency locks:
- **`NEW`** $\rightarrow$ `ACKNOWLEDGED` $\rightarrow$ `INVESTIGATING` $\rightarrow$ `ESCALATED` / `RESOLVED`.
- **Double Acknowledgement Protection**: If Operator A acknowledges at 12:04:09 and Operator B clicks simultaneously at 12:04:09, Operator B receives an explicit `409 Conflict` stating the alert was already acknowledged by Operator A.

---

## 4. Contextual Severity & Intelligent Deduplication

### 4.1 Contextual Severity
- **Vault/Strongroom Intrusion**: Always **P1** (Critical).
- **Vault/Cash Counter Camera Offline**: **P1** (Critical surveillance blindspot).
- **Lobby Decorative Camera Offline**: **P3** (Minor operational warning).
- **Total WAN Outage**: **P1**.
- **Perimeter Breach**: **P2**.

### 4.2 Deduplication Suppression Windows
- Intrusion / Motion: **30 seconds**
- Camera Offline: **5 minutes**
- Recorder Offline: **5 minutes**
- HDD Warning: **30 minutes**
- Retention Violation: **24 hours**
Matching events within the window increment `occurrenceCount` and update `lastSeenAt` rather than spawning duplicate operator popups.

---

## 5. REST Control-Plane APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/alerts` | `GET` | Query alerts (filters: severity, status, branch, SLA) |
| `/api/v1/alerts/:id` | `GET` | Detailed `OperationalAlert` snapshot |
| `/api/v1/alerts/ingest` | `POST` | Ingest raw detector events |
| `/api/v1/alerts/:id/acknowledge` | `POST` | Atomic operator acknowledgement |
| `/api/v1/alerts/:id/escalate` | `POST` | Tiered escalation workflow |
| `/api/v1/alerts/:id/assign` | `POST` | Operator ownership assignment |
| `/api/v1/alerts/:id/comment` | `POST` | Add investigation notes |
| `/api/v1/alerts/:id/resolve` | `POST` | Resolve with mandatory disposition |
| `/api/v1/alerts/:id/live-session` | `POST` | Short-lived WebRTC/RTSP stream token |
| `/api/v1/alerts/:id/timeline` | `GET` | Immutable audit event log |
| `/api/v1/alerts/reports/daily` | `GET` | Daily SLA compliance & resolution metrics |
