# Sentinel Grid: Enterprise Production Deployment Guide

**Document Version:** 1.0.0-PROD  
**Target Environments:** Development, Staging, Enterprise Production  
**Deployment Modalities:** Docker Compose, High-Availability Kubernetes, Distributed Edge  

---

## 1. System Requirements & Hardware Sizing

### Central Cloud / On-Premise Datacenter (500–1,000 Branches, 4,000 Cameras)
- **Control Plane API Nodes (x3 HA):** 8 vCPU, 16 GB RAM each.
- **Media Gateway Stream Workers (x4 HA):** 16 vCPU, 32 GB RAM, 10 Gbps NIC.
- **Analytics Engine GPU Workers (x2–x4):** 16 vCPU, 64 GB RAM, NVIDIA A10G / L4 (24GB VRAM) or RTX 4090.
- **PostgreSQL Database Cluster:** Primary + Standby Replica, 16 vCPU, 64 GB RAM, NVMe SSD (RAID 10).
- **Object Storage (MinIO / S3):** 50 TB–200 TB usable storage for hot/warm video and evidence retention.

### Branch Edge Agent (Per Branch, 6–10 Cameras)
- **Hardware:** Dedicated Compact Edge Gateway (Fanless IPC or existing Branch NVR host).
- **OS:** Windows 10/11 IoT Enterprise, Ubuntu 22.04 LTS, or Debian 12.
- **Specs:** 4 Cores (Intel Core i3/i5 or Celeron N5105), 8 GB RAM, 256 GB SSD (local buffer).

---

## 2. Environment Configuration Matrix

The central system requires the following core environment variables (`.env.production`):

```bash
# General
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
CONTROL_PLANE_URL=https://cctv.bankdomain.com

# Database & Cache
DATABASE_URL=postgresql://sentinel_prod:SecurePassword123@postgres-ha:5432/sentinel_db?sslmode=require
REDIS_URL=redis://:RedisPassword123@redis-ha:6379

# Inter-Service Shared Secrets
MEDIA_GATEWAY_SHARED_KEY=mg_sec_a83f9e7102b4c6e8d2a1049b
RECORDING_ENGINE_SHARED_KEY=re_sec_73b190f84a6c201e9d4a821e
ANALYTICS_ENGINE_SHARED_KEY=ae_sec_51e92d04ba71309f8c4e201b
EDGE_BRIDGE_SHARED_KEY=eb_sec_991f82b7c4a10e30d92b740a
REPORT_DOWNLOAD_SECRET=rp_sec_c04918e72ba610d48f2a9301

# Media Streaming
PUBLIC_WEBRTC_BASE_URL=https://media.bankdomain.com/webrtc
PUBLIC_HLS_BASE_URL=https://media.bankdomain.com/hls
MEDIAMTX_API_URL=http://mediamtx:9997

# Compliance & Security
EVIDENCE_CHECKSUM_ENABLED=true
ENABLE_SECTION_65B_EXPORT=true
MAX_RETENTION_DAYS=90
```

---

## 3. Quick Start Deployment Commands

### Step 1: Initialize Database & Run Migrations
```bash
npm run migrate
```

### Step 2: Launch Production Stack via Docker Compose
```bash
docker compose -f compose.yaml up -d --build
```

### Step 3: Verify Core Health Endpoints
```bash
curl -f http://localhost:8080/health
curl -f http://localhost:8090/health
curl -f http://localhost:8091/health
curl -f http://localhost:8092/health
curl -f http://localhost:3000/health
```

### Step 4: Branch Edge Agent Activation
Execute on branch gateway:
```powershell
.\START_SCANNER.bat --tenant-id <TENANT_UUID> --branch-id <BRANCH_UUID> --token <ACTIVATION_TOKEN>
```
