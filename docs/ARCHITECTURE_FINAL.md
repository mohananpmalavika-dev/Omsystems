# Sentinel Grid: Final Architecture Specification

**Document Version:** 1.0.0-PROD  
**System Classification:** Enterprise Hybrid CCTV & AI Operations Platform  
**Target Sector:** Banking, NBFCs, Currency Chests, Gold Loan Branches, Microfinance, ATMs  
**Target Scale:** 500–1,000+ Branches, 3,000–10,000+ Heterogeneous Video Feeds  

---

## 1. System Topology Overview

Sentinel Grid employs an air-gapped, zero-trust hybrid architecture specifically designed for regulated environments with unstable branch WAN links and zero inbound port-forwarding requirements:

```
+---------------------------------------------------------------------------------------------------+
|                                          BRANCH LAN                                               |
|                                                                                                   |
|  +-----------------------+     +-----------------------+     +---------------------------------+  |
|  | IP Cameras / ONVIF    |     | Analog DVR / NVR      |     | Access Control / Alarm Sensors  |  |
|  | Hikvision/CP Plus/    |     | Multi-Channel Coax    |     | RFID, Biometrics, Vault Door    |  |
|  | Dahua (RTSP Streams)  |     | RTSP Bridge           |     | Magnetic Reed Switches          |  |
|  +-----------+-----------+     +-----------+-----------+     +----------------+----------------+  |
|              |                             |                                  |                   |
|              +-----------------------------+----------------------------------+                   |
|                                            |                                                      |
|                                            v                                                      |
|                             +-----------------------------+                                       |
|                             |    SENTINEL EDGE AGENT      |                                       |
|                             |  - ONVIF Discovery Engine   |                                       |
|                             |  - Local Offline Buffer     |                                       |
|                             |  - Signed Config Validator  |                                       |
|                             |  - Hardware Fingerprinter   |                                       |
|                             +--------------+--------------+                                       |
+--------------------------------------------|------------------------------------------------------+
                                             |  Outbound-Only Encrypted TLS / mTLS Tunnel
                                             |  (Zero public camera ports / Zero inbound NAT)
                                             v
+---------------------------------------------------------------------------------------------------+
|                                     SENTINEL CLOUD CONTROL PLANE                                  |
|                                                                                                   |
|     +-------------------------+     +--------------------------+     +-------------------------+  |
|     | Fastify Control Plane   |     | Media Gateway / MediaMTX |     | Recording Engine        |  |
|     | - RBAC / Tenancy Router |     | - WebRTC / HLS Proxy     |     | - Hot/Warm/Cold Tiers   |  |
|     | - 150+ Micro-Routes     |     | - Token-Gated Sessions   |     | - S3 / MinIO Archival   |  |
|     | - Event Bus & Alerts    |     | - Adaptive Streamer      |     | - Legal Hold Enforcer   |  |
|     +------------+------------+     +------------+-------------+     +------------+------------+  |
|                  |                               |                                |               |
|                  +-------------------------------+--------------------------------+               |
|                                                  |                                                |
|                                                  v                                                |
|     +---------------------------------------------------------------------------------------+     |
|     |                              SHARED ENTERPRISE STORAGE                                |     |
|     |  - PostgreSQL 16 (Authoritative Metadata, 183 Migrations, Timescale/PGVector)          |     |
|     |  - Redis 7 (Distributed Locks, Viewer Sessions, Real-time Stream Leases)              |     |
|     |  - Object Storage (MinIO / AWS S3 for Video Clips, Manifests, Forensic Evidence)      |     |
|     +--------------------------------------------+------------------------------------------+     |
|                                                  |                                                |
|                                                  v                                                |
|     +---------------------------------------------------------------------------------------+     |
|     |                         ANALYTICS ENGINE (Microservice / ONNX)                        |     |
|     |  - Pluggable YOLOv8 / YOLOv5 Decoders (Person, Vehicle, PPE, Fire/Smoke)              |     |
|     |  - Banking Intelligence (Dual-Control Vault, Cash Counter, ATM Tampering)             |     |
|     |  - Anti-Simulation Contract Enforcement (Strict Null Confidence if model missing)     |     |
|     |  - GPU/CPU Priority Queuing & Frame Rate Sampling                                     |     |
|     +--------------------------------------------+------------------------------------------+     |
|                                                  |                                                |
|                                                  v                                                |
|     +---------------------------------------------------------------------------------------+     |
|     |                            SENTINEL SOC DASHBOARD (Next.js 14)                        |     |
|     |  - Command Center & Smart Video Wall (P1 > P2 > Fault Prioritization)                |     |
|     |  - Bank & NBFC Security Operations Workspace                                          |     |
|     |  - Evidence Vault & Section 65B Digital Certificate Exporter                          |     |
|     |  - Security AI Copilot & Natural Language Video Search                                |     |
|     +---------------------------------------------------------------------------------------+     |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Component Boundaries & Core Invariants

### 2.1 Media Plane vs Control Plane Separation
1. **Zero Credential Exposure:** Camera RTSP credentials never cross from the Edge Agent or Control Plane to the browser client.
2. **Session Token Gating:** Clients receive time-limited (300s TTL) cryptographically signed session tokens (`MediaSessionToken`) generated by the Control Plane and validated by the Media Gateway.
3. **No Direct RTSP to Browser:** All live feeds are transmuxed by MediaMTX into low-latency WebRTC (sub-500ms) or adaptive HLS.

### 2.2 WAN Outage Resilience & Offline Survivability
1. **Local Edge Queue:** When branch internet fails, the Sentinel Edge Agent switches to local buffer mode (SQLite-backed ring buffer).
2. **Event Sequence Numbers:** Every telemetry packet, alert, and health heartbeat is assigned a monotonic sequence number.
3. **Idempotent Backfill:** Upon WAN reconnection, the Edge Agent pushes queued events to `/api/v1/edge/sync`. The Control Plane deduplicates on `(agent_id, sequence_number)` preventing alert storms or duplicated incidents.

### 2.3 Tiered Recording & Legal Hold Protection
1. **Storage Tiers:**
   - **HOT (0–30 days):** Local NVMe/SSD on recording nodes for instant playback.
   - **WARM (31–90 days):** High-density NAS/NFS storage for regulatory retention.
   - **COLD (91–180+ days):** S3/MinIO Glacier-compatible archive.
2. **Legal Hold Override:** When an incident or evidence clip is placed under `legal_hold = true`, the retention background sweep worker is cryptographically blocked from executing FIFO purges on the underlying segments until an authorized Evidence Officer explicitly signs a release.

---

## 3. Scale & Sizing Specifications

| Metric | Minimum Target | Enterprise Scale | Ultra-Scale Architecture |
| :--- | :--- | :--- | :--- |
| **Branches** | 500 | 1,000 | 5,000+ |
| **Cameras** | 3,000–4,000 | 10,000 | 50,000+ |
| **Concurrent SOC Viewers** | 50 | 250 | 1,000+ |
| **Live Stream Latency** | < 1,000 ms | < 500 ms (WebRTC) | < 350 ms |
| **P1 Alert Dispatch Latency** | < 2.0 s | < 1.0 s | < 500 ms |
| **Daily Video Ingest** | 15 TB / day | 45 TB / day | 250 TB / day |
| **Audit Log Durability** | 7 Years | 10 Years | Permanent Tamper-Chained |
