# Enterprise AI Alert Deduplication & Temporal Aggregation Architecture

## 1. Executive Summary

In a multi-branch surveillance estate (400+ branches, 12,000+ cameras), raw computer vision detectors naturally produce continuous frame-by-frame detections (10–30 FPS). Without aggregation and deduplication, a single 30-second intrusion event would generate 300 distinct alerts, 300 popups, 300 SMS notifications, and 300 evidence jobs, completely overwhelming SOC operators.

The platform establishes a strict architectural pipeline enforcing:
$$\text{DETECTION} \neq \text{EVENT} \neq \text{ALERT}$$

```
Camera / AI Detector (10-30 FPS)
        │
        │  raw detections
        ▼
┌───────────────────────────┐
│ NormalizedDetection       │
│ normalize detector output │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ Temporal Aggregator       │
│ group adjacent detections │ (collapses frame bursts into discrete events)
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ Deduplication Engine      │
│ same real-world event?    │ (multi-strategy keys + atomic sliding windows)
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ Correlation Engine        │
│ multi-camera incident?    │ (links cross-camera movement into 1 incident)
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ SurveillanceAlert         │
│ create/update ONE alert   │ (tracks duration, occurrence count, max confidence)
└─────────────┬─────────────┘
              │
              ├── Single Dashboard Card
              ├── Single Evidence Package
              ├── Policy-Governed Notifications
              └── Incident Management
```

---

## 2. Multi-Strategy Deduplication Keys

| Strategy | Alert Types | Deduplication Key Pattern | Window |
|---|---|---|---|
| `TRACKED_OBJECT` | Intrusion, Loitering, Restricted Area | `${tenant}:${branch}:${camera}:${type}:${trackId}` | 60–300s |
| `CAMERA_ZONE` | Fire, Smoke | `${tenant}:${branch}:${camera}:${type}:${zone}` | 120s |
| `CAMERA_EVENT` | Camera Tamper, Obstruction | `${tenant}:${branch}:${camera}:${type}` | 300s |
| `LICENSE_PLATE` | ANPR, Hotlist Vehicle | `${tenant}:${branch}:${plateNumber}` | 30s |
| `IDENTITY` | Facial Recognition, Blacklist | `${tenant}:${branch}:${personId}` | 120s |
| `DEVICE_HEALTH` | Camera Offline, Recorder Outage | `${tenant}:${branch}:${deviceId}:${metric}` | 600s (3-failure hysteresis) |

---

## 3. Operational Behavior: Create vs. Update

- **Initial Detection**: Generates `action: "CREATED"`, spawns a new `SurveillanceAlert` and triggers initial SOC popups/notifications.
- **Continuous Detection**: Generates `action: "MERGED"`, updates `lastSeenAt`, `durationSeconds`, `occurrenceCount`, and `maxConfidence` on the active alert. **Does not resend SMS or trigger duplicate alarms.**
- **Post-Resolution Cooldown**: Re-appearance within cooldown period generates `action: "REOPENED"`.
- **Window Expiry**: Observations after window + cooldown generate a fresh incident window.

---

## 4. REST Control-Plane APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/alerts/detections/ingest` | `POST` | Ingest raw high-frequency detection stream. |
| `/api/v1/alerts/deduplication/metrics` | `GET` | View suppression ratios and processing metrics. |
| `/api/v1/alerts/deduplication/policies` | `GET` | Retrieve active deduplication window policies. |
| `/api/v1/alerts/events/active` | `GET` | Inspect active aggregated event windows. |
