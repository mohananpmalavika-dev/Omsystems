# Control Plane vs. Media Plane Separation Architecture

## 1. Executive Summary

To scale an enterprise banking surveillance operations platform from 400 to 4,000+ branches (20,000 to 200,000 cameras), the central Head Office (HO) must never act as a monolithic VMS server that pulls and processes video continuously.

The platform establishes an authoritative architectural separation:
- **Control Plane**: Decides, coordinates, stores metadata, policies, alerts, digital twin state, and reports over lightweight outbound TLS/mTLS (a few KBs per branch every 30s).
- **Media Plane**: Moves, decodes, and records video **strictly on demand** through ephemeral tokenized media sessions or alert evidence extraction (15s pre / 30s post clips).
- **Edge Plane (Branch Edge Gateway)**: Executes local hardware polling, local recording verification, local AI analytics, local storage, and store-and-forward event queuing.

```
                         HEAD OFFICE / DATA CENTER
 ┌────────────────────────────────────────────────────────────────────┐
 │                         CONTROL PLANE                              │
 │                                                                    │
 │  Inventory        Branch Health         Alerts / Incidents         │
 │  Policies         Users / RBAC          Reports                    │
 │  Device Registry  Digital Twin          Audit                      │
 │  SLA Metrics      Retention Compliance  Notification Policies      │
 └────────────────────────────┬───────────────────────────────────────┘
                              │ Outbound HTTPS / mTLS
                              │ (Metadata, Heartbeats, Event Deltas)
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
       BRANCH EDGE 001   BRANCH EDGE 002   BRANCH EDGE N
       ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
       │ Edge Agent  │   │ Edge Agent  │   │ Edge Agent  │
       │             │   │             │   │             │
       │ Health      │   │ Health      │   │ Health      │
       │ Recording   │   │ Recording   │   │ Recording   │
       │ Retention   │   │ Retention   │   │ Retention   │
       │ Local AI    │   │ Local AI    │   │ Local AI    │
       │ Stream Proxy│   │ Stream Proxy│   │ Stream Proxy│
       └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
              │                 │                 │
        ┌─────┼─────┐     ┌─────┼─────┐     ┌─────┼─────┐
       NVR  Cameras ISP  NVR  Cameras ISP  NVR  Cameras ISP
```

---

## 2. Core Architectural Principles

### 2.1 Bandwidth & Scale Math
- **Monolithic Inefficient Approach**: 200,000 cameras $\times$ 2 Mbps = **400 Gbps** continuous WAN traffic (unsustainable).
- **Control/Media Separation Approach**: 4,000 edge gateways sending a 5 KB heartbeat every 30s = **~5.3 Mbps** total central ingestion bandwidth!

### 2.2 On-Demand Media Sessions & Zero Credential Exposure
- Live video streams are initiated via `POST /api/v1/media/sessions`.
- Playback URLs are tokenized and single-use (`https://media.bank.internal/stream/sess-123?token=mtoken_xyz`).
- Raw camera RTSP passwords never reach frontends, browser clients, or central control-plane payloads.
- Inactive streams are torn down automatically after an idle timeout.

### 2.3 Store-and-Forward Offline Resilience
- During WAN outages, the branch edge gateway buffers state-change events in a durable local queue with monotonic sequence numbering.
- Upon reconnection, events are flushed and ingested losslessly in sequence order.
- The central ingestion API enforces `UNIQUE(edgeId, sequenceNumber)` deduplication.

### 2.4 144-Camera Video Wall Multi-Tier Optimization
- **32 Tiles**: Active WebRTC high-framerate live streams (1500 Kbps).
- **64 Tiles**: 1 FPS low-rate preview streams (200 Kbps).
- **48 Tiles**: Periodic cached snapshots (30 Kbps).
- **Total Wall Bandwidth**: $\sim 62$ Mbps (vs $\sim 288$ Mbps naive full RTSP).

### 2.5 Centralized Governance & Distributed Execution
- HO issues versioned configuration contracts (`EdgeConfiguration`, e.g. v54) covering monitoring cadence, recording policies, mandatory retention days (90 days), and AI intrusion zones.
- Edge gateways report running config version. Drift is automatically flagged when running config $\ne$ desired config.

---

## 3. REST Control-Plane APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/edge/register` | `POST` | Register Edge Gateway and issue versioned configuration. |
| `/api/v1/edge/heartbeat` | `POST` | Ingest lightweight 30s edge heartbeat with system telemetry. |
| `/api/v1/edge/events/batch` | `POST` | Ingest batched state-change events with sequence deduplication. |
| `/api/v1/edge/gateways` | `GET` | List all registered edge gateways and hardware health (CPU, RAM, Disk). |
| `/api/v1/edge/commands` | `POST` | Dispatch HO $\rightarrow$ Edge operational commands. |
| `/api/v1/media/sessions` | `POST` | Allocate on-demand tokenized media session. |
| `/api/v1/media/videowall/plan` | `POST` | Calculate optimal multi-tier bandwidth distribution for video wall. |
