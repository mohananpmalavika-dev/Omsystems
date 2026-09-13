# Sentinel Grid / KryptoVision — Enterprise VMS System Architecture

> **Product**: Sentinel Grid CCTV Control Plane & Forensic Evidence Vault  
> **Deployment Model**: Hybrid Edge-Cloud with Centralized SOC Command Center  
> **Scale**: 500+ Branches | 5,000+ CCTV Channels | Real Hardware NVR/DVR Protocol Drivers  
> **Status**: AUTHORITATIVE SYSTEM ARCHITECTURE

---

## 1. Architectural Topology

Sentinel Grid decouples the **Control Plane** (identity, configuration, alert correlation, and incident orchestration) from the **Media Plane** (RTSP, WebRTC, HLS ingestion and segmented recording), ensuring that media streaming bandwidth does not degrade control and alerting responsiveness.

```text
                               ┌────────────────────────┐
                               │ Central Operations UI  │
                               │ Next.js 16 / React 19  │
                               └───────────▲────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        │ REST / WebSocket / SSE / mTLS       │
                        ▼                                     ▼
        ┌───────────────────────────────┐     ┌───────────────────────────────┐
        │     Control Plane Cluster     │     │      Media Gateway Cluster    │
        │   Fastify + Express Modules   │     │   MediaMTX + WebRTC / HLS     │
        └───────────────┬───────────────┘     └───────────────┬───────────────┘
                        │                                     │
           ┌────────────┴────────────┐                        │
           ▼                         ▼                        ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ PostgreSQL Cluster  │   │    Redis Cluster    │   │ NVMe / S3 Storage   │
│ RLS / Outbox / Aud. │   │ Epoch Stream Leases │   │ Continuous Segments │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
           ▲                         ▲                        ▲
           └─────────────────────────┼────────────────────────┘
                                     │ Mutual TLS 1.3
                                     │
                    ┌────────────────┴────────────────┐
                    │ Distributed Edge Agent Daemons  │
                    │ 500+ Branches (Windows / Linux) │
                    └────────────────┬────────────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            ▼                        ▼                        ▼
  ┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
  │  Hikvision ISAPI  │    │  Dahua RPC / CGI  │    │  CP PLUS Indigo   │
  │  NVR / IP Cameras │    │  NVR / DVR / IPC  │    │  UVR / Hybrid BNC │
  └───────────────────┘    └───────────────────┘    └───────────────────┘
```

---

## 2. Core Subsystems

### 2.1 Identity & Access Management (`src/identity/`)
- Authenticates via SAML 2.0 (Okta, Azure AD, Ping Identity), OIDC, or mTLS certificate authentication.
- Evaluates RBAC/ABAC permissions per camera, branch, area, and region before issuing media playback or PTZ control tokens.

### 2.2 Media Orchestration (`src/media/`)
- Dispatches on-demand live streams with strict viewer budgeting (e.g. max 5 concurrent streams per branch WAN uplink).
- Uses Redis distributed leasing with incrementing epoch counters (`currentEpoch >= activeEpoch`) to fence expired worker nodes.

### 2.3 Recording Engine & Continuity Ledger (`src/recording/`)
- Ingests 60-second video segments sealed with SHA-256 digests.
- Tracks millisecond continuity in PostgreSQL; detects and alerts on gap anomalies (`recording_continuity_segments`).

### 2.4 Cryptographic Evidence Vault (`src/evidence/`)
- Exports tamper-evident ZIP packages containing MP4 segments, SHA-256 manifests, audit trails, and detached `Ed25519` / `RSA-PSS` signatures.
- Verified by `@kryptovision/evidence-verifier` CLI.

### 2.5 Alert & Incident Engine (`src/alerts/`, `src/incidents/`)
- Contextual severity evaluation (e.g. Vault camera offline = P1; General hallway offline = P3).
- Suppresses redundant alert bursts (>97% suppression in alert storms).
- Escalates unresolved P1 alerts via transactional outbox to SMS, Voice, and Push.

### 2.6 Local Computer Vision Engine (`src/ai/`, `analytics-engine/`)
- Runs 100% locally via ONNX Runtime without external cloud AI costs.
- Normalized events from native hardware NPUs (CP PLUS IVS, Dahua SMD Plus, Hikvision AcuSense).
- Open-source local vision models: YOLOX Tiny, YuNet, SFace, LPD-YuNet, CRNN, PULC Safety Helmet.

---

## 3. Technology Stack & Runtime Standards

- **Runtime**: Node.js >= 22.x (ES Modules, TypeScript 5.7)
- **Database**: PostgreSQL 16+ with Row-Level Security (RLS)
- **Cache / Distributed State**: Redis 7.x with Sentinel / Cluster
- **Media Ingestion**: MediaMTX (RTSP, HLS, WebRTC)
- **Local AI Runtime**: ONNX Runtime Node.js (`onnxruntime-node` 1.29+)
- **Frontend Dashboard**: Next.js 16.3, React 19, TailwindCSS, Recharts
