# Branch Internet & WAN Connectivity Monitoring Architecture

## 1. Executive Summary & Control Room Semantic Model

**Core Rule**: **Never reduce branch network connectivity to a single boolean `internetOnline: boolean`.**

In centralized multi-branch surveillance (400+ branches), network monitoring is **evidence-driven**, **multi-layer**, and **path-aware**:

$$\text{Physical Interface} \rightarrow \text{Default Gateway} \rightarrow \text{External IPs} \rightarrow \text{DNS} \rightarrow \text{Central Platform} \rightarrow \text{VPN Tunnel}$$

```
                           Branch Edge Device
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
         Primary ISP                                Backup ISP
       (e.g., Jio Fiber)                        (e.g., Airtel LTE)
              │                                         │
              ├─ Physical NIC                           ├─ Physical NIC
              ├─ Gateway Reachability                   ├─ Gateway Reachability
              ├─ IP Probes (1.1.1.1, 8.8.8.8)          ├─ IP Probes (1.1.1.1, 8.8.8.8)
              ├─ DNS Resolution                         ├─ DNS Resolution
              ├─ Latency, Loss & Jitter                 ├─ Latency, Loss & Jitter
              └─ Public IP Detection                    └─ Public IP Detection
              │                                         │
              └────────────────────┬────────────────────┘
                                   │
                                   ▼
                        Routing Table Inspection
                         (`ip route show default`)
                                   │
                                   ▼
                       WireGuard VPN Telemetry
                   (Handshake timestamp & transfer)
                                   │
                                   ▼
                   Branch Connectivity State Machine
                 (3-strike hysteresis against flapping)
                                   │
         ┌──────────────┬──────────┴──────────┬──────────────┐
         ▼              ▼                     ▼              ▼
       ONLINE        DEGRADED              FAILOVER       OFFLINE
     (Primary WAN)  (High loss/latency)  (Backup LTE)  (No WAN path)
```

---

## 2. Operational States & Visual Semantics

| State | Color | Definition | Operational Impact |
|---|---|---|---|
| **`ONLINE`** | 🟢 Green | Primary ISP is healthy and carrying active WAN traffic. | Normal full-bandwidth surveillance operation. |
| **`DEGRADED`** | 🟡 Amber | Active link is functioning, but latency or packet loss exceeds threshold (e.g. loss $\ge 5\%$ or latency $\ge 150$ms). | Video streaming may stutter or drop frames. |
| **`FAILOVER`** | 🟠 Orange | Primary ISP is offline, but Backup LTE is healthy and carrying traffic. | CCTV monitoring is active, but **redundancy has been lost** and bandwidth may be metered. |
| **`OFFLINE`** | 🔴 Red | Both Primary and Backup links are down. | Central platform cannot communicate with the branch. |
| **`UNKNOWN`** | ⚪ Grey | Insufficient or stale telemetry. | Awaiting fresh edge probe heartbeat. |

> [!IMPORTANT]
> **`FAILOVER` $\neq$ `ONLINE`**: While surveillance may still function over backup LTE, redundancy is lost.
> **`UNKNOWN` $\neq$ `ONLINE`**: Missing telemetry is never synthesized as healthy.

---

## 3. Independent VPN Monitoring

WireGuard VPN status is measured independently of raw ISP reachability:
- **`CONNECTED`**: Recent handshake within 90 seconds.
- **`DEGRADED`**: Handshake age between 90–180 seconds.
- **`DISCONNECTED`**: Handshake age $>180$ seconds or interface missing.

---

## 4. Root-Cause Correlation & Blast-Radius Suppression

When a branch transitions to `OFFLINE`:
- The central operational health engine correlates downstream CCTV symptoms:
  - Generates **1** root-cause alert: `Branch Internet Outage`.
  - Suppresses **16** individual camera offline alerts and DVR unreachable alarms.

---

## 5. Branch Network SLA & Outage Persistence

Every state transition records an entry in `branch_network_outages`:
- `startedAt`, `endedAt`, `durationSeconds`, `affectedPath` (`PRIMARY` vs `ALL`), `failoverSuccessful`.
- Monthly SLA calculation provides:
  - Primary ISP Uptime %
  - Backup ISP Uptime %
  - Effective Branch Uptime %
  - VPN Availability %
  - Total Failover Counts & Duration
  - P95 Latency & Average Packet Loss %

---

## 6. REST Control-Plane APIs

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/operational-health/network` | `GET` | Fleet connectivity summary count |
| `/api/v1/branches/:id/connectivity` | `GET` | Complete `BranchConnectivityHealth` snapshot |
| `/api/v1/branches/:id/connectivity/history` | `GET` | Time-series measurements |
| `/api/v1/branches/:id/connectivity/outages` | `GET` | Historical outage logs |
| `/api/v1/branches/:id/connectivity/sla` | `GET` | Monthly and daily SLA analytics |
| `/api/v1/edge-agents/:id/connectivity/telemetry` | `POST` | Ingestion endpoint for edge agent probes |
