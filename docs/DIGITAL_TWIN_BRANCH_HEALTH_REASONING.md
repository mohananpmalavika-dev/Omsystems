# Digital Twin-Powered Branch Health & Root-Cause Reasoning Engine

## 1. Executive Summary

In conventional surveillance monitoring (such as standard VMS or KVMS software), device health is treated as a set of disconnected sensors. When a network switch fails, the monitoring room is bombarded with dozens of separate alarms (NVR offline, 8 cameras offline, 8 stream failures, 8 recording stopped alarms).

The platform elevates the **Digital Twin** into the authoritative reasoning engine behind branch infrastructure health:
$$\text{Collectors Produce Observations} \longrightarrow \text{Digital Twin Evaluates Topology} \longrightarrow \text{Dependency Walk Pinpoints Root Cause} \longrightarrow \text{1 Incident Created, 24 Downstream Alarms Suppressed}$$

```
                                BRANCH EDGE
┌────────────────────────────────────────────────────────────────────────┐
│  Camera Collector     Recorder Collector      Storage Collector        │
│  Network Collector    Retention Collector     Recording Collector      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                            TwinObservations
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          DIGITAL TWIN                                  │
│                                                                        │
│  Branch (118)                                                          │
│     │ contains                                                         │
│  Router (01)                                                           │
│     │ connectsTo                                                       │
│  Switch (02) ◄────────────── [FAILED: ICMP / SNMP timeout]             │
│     │ connectsTo (DOWNSTREAM DEPENDENCY)                               │
│  ┌──┴────────────────────────────────┐                                 │
│  ▼                                   ▼                                 │
│ DVR (01) [OFFLINE]                Camera-09 [OFFLINE]                  │
│  │ records                           │                                 │
│  ├── CAM-01 ... CAM-08 [OFFLINE]     │                                 │
│  │ storesOn                          │                                 │
│  ▼                                   ▼                                 │
│ HDD-01 [OFFLINE]             Vault Recording [CRITICAL SERVICE IMPACT] │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                        Root Cause Analyzer & Blast Radius
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                SINGLE EXPLAINABLE INFRASTRUCTURE INCIDENT              │
│                                                                        │
│  BRANCH 118: CRITICAL                                                  │
│  Root Cause: Switch-02 unreachable (Started 14:23:17, Duration 8m 41s) │
│  Direct Impact: 1 Recorder                                             │
│  Dependent Impact: 8 Cameras                                           │
│  Operational Impact: Vault Recording, ATM Recording                    │
│  Suppression: 24 Child Alarms Suppressed                               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Principles

### 2.1 Observed vs. Dependency Failures
- **`OBSERVED` Origin**: The physical entity where the primary telemetry failure occurred (e.g. `switch-118-02` failed ICMP/SNMP probe).
- **`DEPENDENCY` Origin**: Downstream entities that are unreachable solely due to an upstream failure (e.g. `dvr-118-01`, `cam-118-01...08`). These nodes point to `rootCauseNodeId: "switch-118-02"` and their child alarms are suppressed.

### 2.2 Business & Compliance Service Impact
The twin does not merely count dead hardware; it tracks business capability degradation:
- `Vault Recording` service disrupted $\implies$ P1 Compliance Incident.
- `ATM Camera Recording` service disrupted $\implies$ P1 Security Threat.

### 2.3 Stabilization Window on Recovery
When the upstream root-cause node recovers, downstream devices must pass operational verification (stream decodable, recording active on disk) before the incident automatically transitions to `RESOLVED` and branch health returns to `HEALTHY`.

---

## 3. REST Control-Plane APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/control-room/branches` | `GET` | Real-time branch mosaic list with root cause, affected counts, and duration. |
| `/api/v1/branches/:id/twin/health` | `GET` | Complete branch health projection read model. |
| `/api/v1/branches/:id/twin/topology` | `GET` | Full branch dependency graph (nodes and relationships). |
| `/api/v1/branches/:id/twin/incidents/current` | `GET` | Active infrastructure incident & impacted business services. |
| `/api/v1/twin/observations` | `POST` | Ingest collector observation into the digital twin. |
