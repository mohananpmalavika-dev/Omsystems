# KRYPTOVISION / SENTINEL GRID — SYSTEM ARCHITECTURE

> **Enterprise Architecture & Systems Engineering Specification**
> **Product**: KryptoVision Hybrid CCTV Control Plane & Forensic Evidence Vault
> **Author**: Sentinel Engineering Team | **Version**: v1.0.0-rc.2

---

## 1. System Overview

Sentinel Grid is an enterprise-grade, distributed Hybrid Video Management System (VMS) and AI Surveillance Platform purpose-built for financial institutions, multi-branch commercial networks, and mission-critical infrastructure.

The architecture strictly decouples:
1. **Control Plane**: Manages state, device configurations, health heartbeats, AI event routing, digital twin RCA, and forensic audit ledgers.
2. **Media Plane**: Handles high-bandwidth RTSP/WebRTC video streams, local edge buffering, and encrypted forensic segment export.
3. **Edge Agents**: Autonomous gateway processes deployed on branch hardware that execute local discovery, device health polling, and offline buffering without depending on central cloud connectivity.

---

## 2. High-Level Architecture Diagram

\`\`\`mermaid
graph TB
    subgraph Central_Cloud_Datacenter["Sentinel Central Control Plane (Cloud / Enterprise DC)"]
        LB[Envoy / NGINX Load Balancer - TLS 1.3 / mTLS]
        
        subgraph Core_Services["Microservices & Daemons"]
            API[Fastify Central Control Plane]
            MGW[Media Gateway - WebRTC / HLS Proxy]
            REC[Recording & Retention Engine]
            AI_ENG[Analytics & Alert Aggregator]
            EVID[Forensic Evidence & Vault Worker]
        end

        subgraph Data_Storage["Enterprise Persistence Layer"]
            PG[(PostgreSQL 16 - Multi-Tenant / RLS)]
            RD[(Redis 7.2 - PubSub & Ingest Queue)]
            OBJ[(MinIO / S3 - WORM Encrypted Cold Archive)]
        end
        
        LB --> API
        LB --> MGW
        API --> PG
        API --> RD
        REC --> PG
        REC --> OBJ
        EVID --> OBJ
    end

    subgraph Branch_Networks["Distributed Branch Infrastructure (500+ Branches)"]
        subgraph Branch_A["Branch 101 (Retail Bank)"]
            EA_1[Sentinel Edge Agent Daemon]
            NVR_1[Hikvision NVR / DVR]
            CAM_1[Vault Camera - IP]
            CAM_2[ATM Camera - RTSP]
            
            EA_1 -->|ISAPI / CGI / ONVIF| NVR_1
            EA_1 -->|Direct RTSP| CAM_1
            EA_1 -->|Direct RTSP| CAM_2
        end

        subgraph Branch_B["Branch 102 (Regional Office)"]
            EA_2[Sentinel Edge Agent Daemon]
            DVR_2[CP PLUS / Dahua DVR]
            CAM_3[Teller Camera]
            CAM_4[Main Gate Camera]
            
            EA_2 -->|CGI / SDK| DVR_2
            EA_2 -->|Direct RTSP| CAM_3
            EA_2 -->|Direct RTSP| CAM_4
        end
    end

    EA_1 <==>|mTLS WireGuard / HTTPS| LB
    EA_2 <==>|mTLS WireGuard / HTTPS| LB

    subgraph Operators["Central Monitoring Operations"]
        SOC[SOC Video Wall & Mosaic Dashboard]
        EXEC[Executive C-Suite KPI Screen]
        SOC --> LB
        EXEC --> LB
    end

    style Central_Cloud_Datacenter fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff
    style Branch_Networks fill:#022c22,stroke:#10b981,stroke-width:2px,color:#fff
    style Operators fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#fff
\`\`\`

---

## 3. Core Subsystems

### 3.1 Fastify Central Control Plane (\`src/app.ts\`)
- **Framework**: Fastify 5.x with native schema validation via Zod and JSON Schema.
- **Port**: \`3000\` (HTTP API) / \`8443\` (mTLS Control Port).
- **Core Responsibilities**:
  - Multi-tenant authentication, session lifecycle, and RBAC authorization.
  - Zero-touch branch bootstrapping and signed config deployment.
  - Telemetry ingestion pipeline with guaranteed zero-loss delivery.
  - Dynamic Topological Root Cause Analysis (RCA).
  - Single-query branch mosaic aggregation across 500+ locations.

### 3.2 Media Gateway (\`media-gateway/\`)
- **Port**: \`8554\` (RTSP) / \`8889\` (WebRTC WHEP) / \`8888\` (HLS).
- **Technology**: Go/C++ native RTSP demuxer with WebRTC / MSE pass-through.
- **Key Invariants**:
  - Control plane and media plane are physically decoupled: high video bandwidth never interferes with telemetry or alert delivery.
  - Automatic stream profile adaptation (Main Stream 4K/1080p for full-screen recording; Sub Stream 720p/360p for 16-tile mosaic walls).

### 3.3 Edge Agent Daemon (\`edge-agent/\`)
- **Execution Target**: Compact Go/Node binary running as a systemd service or Windows Service on branch NVR servers or industrial edge PCs.
- **Key Invariants**:
  - **Offline Survivability**: Buffers telemetry and video clips locally (SQLite + local disk ring buffer) up to 72 hours during WAN outages.
  - **Zero-Touch Provisioning**: Bootstraps via DHCP Option 66/67 or QR-code pairing, downloading cryptographic keys over mTLS.
  - **Local Vendor SDK Drivers**: Direct ONVIF, Hikvision ISAPI, Dahua CGI, and CP PLUS driver probing.

### 3.4 Forensic Evidence Vault & Legal Chain of Custody (\`src/evidence/\`)
- **Cryptographic Engine**: SHA-256 block hashing with Ed25519 digital signatures.
- **Tamper-Proof Chaining**: Every custody event records \`previous_block_hash\`, forming a Merkle audit tree.
- **Container Format**: Court-admissible ZIP archive containing:
  - Canonical MP4 video file with forensic watermarking.
  - Cryptographic JSON manifest with hardware metadata, camera serial, and NTP timestamp.
  - PKCS#7 / Ed25519 verification certificate.

---

## 4. Multi-Tenancy & Isolation Guarantees

Sentinel Grid implements multi-layered enterprise multi-tenancy:
1. **Logical Isolation**: Every database entity contains an indexed \`tenant_id\` column. All ORM repositories enforce mandatory \`tenant_id\` parameters on every \`SELECT\`, \`UPDATE\`, and \`DELETE\` query.
2. **Row-Level Security (RLS)**: PostgreSQL session variables (\`SET LOCAL app.current_tenant_id = '...' \`) enforce database-level isolation. Cross-tenant reads are prevented at the engine level.
3. **Cryptographic Key Isolation**: Each tenant has an independent Ed25519 signing keypair stored in HashiCorp Vault or AWS KMS for evidence signing.
4. **Media Path Isolation**: Storage buckets and directories are segregated by \`/${tenant_id}/${branch_id}/${camera_id}/\`.

---

## 5. High Availability & Disaster Recovery Topology

- **Database**: PostgreSQL 16 active-standby cluster managed by Patroni and etcd with automated failover in $< 30$ seconds.
- **Event Bus / Cache**: Redis 7.2 Sentinel cluster with automatic master election.
- **Fencing & Split-Brain Protection**: Implemented via PostgreSQL advisory locks and distributed leases (\`src/ha/distributed-fencing.ts\`). Only one active master control plane instance can acquire write leases.

---

## 6. Communication Protocols

| Link | Protocol | Security | Payload |
| :--- | :---: | :---: | :--- |
| **Operator Browser $\rightarrow$ Control Plane** | HTTPS / WebSocket | TLS 1.3, JWT Bearer | JSON API, Server-Sent Events |
| **Operator Browser $\rightarrow$ Media Gateway** | WebRTC (WHEP) | DTLS-SRTP | H.264 / H.265 Raw Video |
| **Edge Agent $\rightarrow$ Control Plane** | HTTPS / WebSocket | mTLS (X.509 Device Certs) | Telemetry Envelopes, Config Sync |
| **Edge Agent $\rightarrow$ Local Cameras/NVRs** | RTSP / HTTP ISAPI | Digest Auth / Private VLAN | RTSP H.264/H.265, XML/JSON Telemetry |
| **Central $\rightarrow$ MinIO / S3 Vault** | HTTPS (S3 API) | TLS 1.3, AWS Signature v4 | Encrypted MP4 Segments & Proof Manifests |
