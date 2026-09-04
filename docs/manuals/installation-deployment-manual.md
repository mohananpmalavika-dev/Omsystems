# Sentinel Grid — Installation & Deployment Manual

**Product Version:** Sentinel Grid 0.1.0  
**Dashboard Version:** @sentinel/dashboard 0.1.0  
**Edge Agent Version:** @sentinel/edge-agent 0.1.18  
**Recording Engine Version:** @sentinel/recording-engine 0.1.0  
**Analytics Engine Version:** @sentinel/analytics-engine 0.1.0  
**Document Version:** 1.0.0  
**Last Updated:** September 5, 2026  
**Audience:** DevOps Engineers, Cloud Architects, Infrastructure Administrators, On-Premises Systems Engineers  

---

## Table of Contents

1. [Architecture & Topology Overview](#1-architecture--topology-overview)
2. [Hardware & Software Prerequisites](#2-hardware--software-prerequisites)
3. [Network & Firewall Requirements](#3-network--firewall-requirements)
4. [Environment Configuration Reference](#4-environment-configuration-reference)
5. [Docker Compose Production Deployment](#5-docker-compose-production-deployment)
6. [Bare Metal Production Installation](#6-bare-metal-production-installation)
7. [Storage Mounts & High-Assurance Retention Setup](#7-storage-mounts--high-assurance-retention-setup)
8. [Edge Agent Deployment & ZTP Bootstrap](#8-edge-agent-deployment--ztp-bootstrap)
9. [Pre-Flight Verification & Health Probes](#9-pre-flight-verification--health-probes)
10. [Production Hardening Checklist](#10-production-hardening-checklist)

---

## 1. Architecture & Topology Overview

Sentinel Grid employs a microservices-based distributed architecture designed for multi-branch failover and edge survivability:

```mermaid
graph TD
    Client[Web Browser / Mobile App] -->|HTTPS :443 / WSS| Caddy[Caddy Edge Proxy & SSL]
    
    subgraph Core Platform Services
        Caddy -->|Reverse Proxy| Dash[Dashboard Next.js :10000]
        Caddy -->|Reverse Proxy| CP[Control Plane API :8080]
        Caddy -->|Reverse Proxy| MGW[Media Gateway :8090 / :8888]
        
        CP <--> DB[(PostgreSQL 16 + pgvector)]
        CP <--> Cache[(Redis 7 Cluster)]
        
        MGW <--> Cache
        RecEng[Recording Engine :8091] <--> CP
        RecEng <--> DB
        RecEng <--> Cache
        
        AI[Analytics Engine :8092] <--> CP
        AI <--> Cache
    end

    subgraph Branch Infrastructure
        Cam1[IP Camera 1 / ONVIF] -->|RTSP| Edge[Sentinel Edge Agent]
        Cam2[IP Camera 2 / RTSP] -->|RTSP| Edge
        NVR[Branch DVR/NVR] -->|SDK/RTSP| Edge
        Edge -->|Encrypted Tunnel / WebRTC| MGW
        Edge -->|Telemetry / Events| CP
    end

    subgraph Storage Subsystem
        RecEng -->|Atomic Direct I/O| LocalDisk[NVMe / Local Disk]
        RecEng -->|NFSv4 / SMB3| NAS[Enterprise NAS / SAN]
        RecEng -->|S3 API| CloudStore[AWS S3 / MinIO Glacier]
    end
```

---

## 2. Hardware & Software Prerequisites

The platform runtime standard is strictly enforced according to `ARCHITECTURE_AUTHORITY.md`:

### Software Stack
* **Node.js Runtime:** **Node.js 22.x LTS** exclusively (earlier or odd-numbered versions are rejected in CI).
* **Database:** **PostgreSQL 16** with `pgvector` extension (for spatial/vector indexing).
* **Distributed Cache & State:** **Redis 7.x** (configured with Append-Only File `AOF` persistence).
* **Media Streaming Pipeline:** **FFmpeg 6.x+** and **MediaMTX** (integrated inside Media Gateway).
* **Container Orchestration:** **Docker Engine 24.x+** and **Docker Compose v2.20+**.
* **AI Computer Vision Runtimes:**
  * CPU Inference: **ONNX Runtime (CPU)**
  * GPU Inference: **NVIDIA CUDA 12.x**, **cuDNN 8.9+**, **TensorRT 8.6+** (optional, recommended for >16 concurrent AI streams per node).

### Minimum Hardware Sizing Guidelines

| Deployment Tier | Camera Channels | CPU Cores | RAM | Local OS / DB Disk | High-Speed Video Buffer |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Small Branch / PoC** | 1 – 16 | 4 Cores | 16 GB | 100 GB SSD | 1 TB NVMe |
| **Regional Hub** | 16 – 64 | 8 Cores | 32 GB | 250 GB SSD | 4 TB NVMe / Direct SAS |
| **Central SOC / Cloud** | 64 – 256+ | 16–32 Cores | 64–128 GB | 500 GB NVMe | Scaled NAS / SAN / S3 |

---

## 3. Network & Firewall Requirements

The following ports must be permitted across host firewalls, cloud security groups, and branch routers:

| Port | Protocol | Direction | Source | Destination | Purpose |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **80** | TCP | Inbound | Any / Internet | Caddy Proxy | HTTP challenge & ACME certificate issuance. |
| **443** | TCP / UDP | Inbound | Any / Internet | Caddy Proxy | HTTPS dashboard, APIs, and HTTP/3 QUIC transport. |
| **8080** | TCP | Internal | Caddy / Containers | Control Plane | REST API & administrative control plane. |
| **10000** | TCP | Internal | Caddy / Containers | Dashboard | Next.js operator and administration frontend. |
| **8090** | TCP | Inbound | Operators / Gateways| Media Gateway | WebRTC signaling & HLS streaming. |
| **8189** | UDP | Inbound | Operators / Gateways| Media Gateway | WebRTC ICE / media data transport. |
| **8554** | TCP | Inbound / Internal | Cameras / Edge | Media Gateway | RTSP ingestion server. |
| **8888** | TCP | Inbound / Internal | Operators | Media Gateway | WebRTC HTTP endpoint. |
| **8091** | TCP | Internal | Control Plane | Recording Engine| Recording orchestration and segment control. |
| **8092** | TCP | Internal | Control Plane | Analytics Engine| AI inference and visual rule processing. |
| **5432** | TCP | Internal | Services Only | PostgreSQL | Primary relational database (never expose publicly). |
| **6379** | TCP | Internal | Services Only | Redis | Distributed state, leases, and cache. |

---

## 4. Environment Configuration Reference

Create a production `.env` file based on the authoritative configuration below.

> [!CAUTION]
> Never deploy default credentials (`admin`, `password`, `localhost`) to production environments. Rotate all cryptographic keys before going live.

```env
# ==============================================================================
# Sentinel Grid Production Environment Variables
# ==============================================================================

# Node Environment
NODE_ENV=production
LOG_LEVEL=info

# Domain & Edge Proxy Settings
DOMAIN_NAME=sentinel.yourdomain.com
ADMIN_EMAIL=security-admin@yourdomain.com

# PostgreSQL Connection
DATABASE_URL=postgresql://sentinel_admin:REPLACE_WITH_STRONG_DB_PASS@postgres:5432/sentinel_grid
POSTGRES_DB=sentinel_grid
POSTGRES_USER=sentinel_admin
POSTGRES_PASSWORD=REPLACE_WITH_STRONG_DB_PASS

# Redis Connection
REDIS_URL=redis://redis:6379/0

# Internal Service Interconnect URLs (Do NOT use localhost in Docker)
CONTROL_API_URL=http://control-plane:8080
MEDIA_GATEWAY_URL=http://media-gateway:8090
RECORDING_ENGINE_URL=http://recording-engine:8091
ANALYTICS_ENGINE_URL=http://analytics-engine:8092

# Cryptographic Secrets (Minimum 32 random characters)
JWT_SECRET=REPLACE_WITH_RANDOM_SHA256_HEX_SECRET_FOR_JWT_SIGNING
COOKIE_SECRET=REPLACE_WITH_RANDOM_SHA256_HEX_SECRET_FOR_COOKIES
EVIDENCE_SIGNING_PASSPHRASE=REPLACE_WITH_STRONG_PASSPHRASE_FOR_ED25519

# Superadmin Bootstrap Credentials
BOOTSTRAP_SUPERADMIN_PASSWORD=REPLACE_WITH_SECURE_ADMIN_PASS_2026!

# Storage Paths & Mounts
RECORDING_PATH=/var/lib/sentinel/recordings
EVIDENCE_PATH=/var/lib/sentinel/evidence

# Optional S3 Cloud Tiering (AWS S3 or MinIO)
S3_ENABLED=false
S3_REGION=ap-south-1
S3_BUCKET=sentinel-cold-archive
S3_ACCESS_KEY=
S3_SECRET_KEY=

# Notification Settings
SMTP_HOST=mail.yourbank.com
SMTP_PORT=587
SMTP_USER=sentinel-alerts@yourbank.com
SMTP_PASSWORD=
VOICE_TOKEN_SECRET=
```

---

## 5. Docker Compose Production Deployment

The standard deployment package is located in `deploy/aws/docker-compose.aws.yml`.

### Step 1: Clone Repository & Prepare Host
```bash
git clone https://github.com/mohananpmalavika-dev/Omsystems.git /opt/sentinel-grid
cd /opt/sentinel-grid
```

### Step 2: Configure Environment
```bash
cp .env.production.example deploy/aws/.env
nano deploy/aws/.env  # Update domain, database credentials, and secrets
```

### Step 3: Launch Production Containers
```bash
cd deploy/aws
docker compose -f docker-compose.aws.yml up -d --build
```

### Step 4: Verify Container Health
```bash
docker compose -f docker-compose.aws.yml ps
```

Expected healthy output:
```text
NAME                            STATUS                  PORTS
sentinel-aws-caddy              Up (healthy)            0.0.0.0:80->80, 443->443/tcp, 443->443/udp
sentinel-aws-control-plane      Up (healthy)            0.0.0.0:8080->8080/tcp
sentinel-aws-dashboard          Up                      0.0.0.0:10000->10000/tcp
sentinel-aws-analytics-engine   Up (healthy)            0.0.0.0:8092->8092/tcp
sentinel-aws-media-gateway      Up                      0.0.0.0:8090, 8554, 8888, 8189/udp
sentinel-aws-recording-engine   Up                      0.0.0.0:8091->8091/tcp
sentinel-aws-postgres           Up (healthy)            127.0.0.1:5432->5432/tcp
sentinel-aws-redis              Up (healthy)            127.0.0.1:6379->6379/tcp
```

### Step 5: Apply Database Migrations
Database migrations execute automatically on control-plane bootstrap. To verify schema status manually:
```bash
docker exec -it sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT count(*) FROM nbfc_rule_templates;"
```
*(Should return `36` indicating all NBFC regulatory templates are populated).*

---

## 6. Bare Metal Production Installation

For high-density on-premises installations running directly on Ubuntu 22.04 / 24.04 LTS:

### Step 1: Install System Dependencies
```bash
# Update repositories
sudo apt-get update && sudo apt-get install -y curl git ffmpeg build-essential chrony

# Install Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node version (Must be 22.x)
node -v  # e.g., v22.14.0
```

### Step 2: Install PostgreSQL 16 & Redis
```bash
sudo apt-get install -y postgresql-16 postgresql-16-pgvector redis-server

# Enable services
sudo systemctl enable postgresql redis-server
sudo systemctl start postgresql redis-server
```

### Step 3: Install & Build Sentinel Grid
```bash
cd /opt/sentinel-grid
npm ci
npm run build

# Build Dashboard
cd dashboard
npm ci
npm run build
cd ..
```

### Step 4: Configure Systemd Units
Deploy systemd unit files for `sentinel-control-plane.service`, `sentinel-dashboard.service`, `sentinel-recording.service`, and `sentinel-analytics.service` under `/etc/systemd/system/`.

---

## 7. Storage Mounts & High-Assurance Retention Setup

Sentinel Grid requires dedicated, fast storage for circular ring buffer recordings:

### Recommended Directory Structure
```text
/var/lib/sentinel/
├── recordings/          # Hot video segments (10-60s MP4 files)
│    └── {tenantId}/{branchId}/{cameraId}/{YYYY-MM-DD}/
├── evidence/            # Cryptographically signed court export packages
└── staging/             # Temporary .partial write staging buffer
```

### NFS Mount Best Practice (`MountIdentityVerifier`)
When mounting network storage, configure `/etc/fstab` with hardened mount options:
```text
nas.corp.internal:/volume1/sentinel  /var/lib/sentinel/recordings  nfs4  rw,hard,intr,noatime,rsize=1048576,wsize=1048576  0 0
```
> [!IMPORTANT]
> The `NfsStorageBackend` verifies `/proc/mounts` prior to every write batch. If the NFS share drops or unmounts, Sentinel Grid halts writes immediately (`MountDisappearedError`) to prevent catastrophic exhaustion of the host root filesystem.

---

## 8. Edge Agent Deployment & ZTP Bootstrap

For remote branch surveillance without dedicated server hardware, deploy the **Sentinel Edge Agent** on lightweight Linux appliances or industrial gateways (Intel NUC, Raspberry Pi 5):

```bash
# Download and install edge agent package
curl -fsSL https://sentinel.yourdomain.com/api/edge-agent/install.sh | sudo bash -s -- \
  --endpoint https://sentinel.yourdomain.com \
  --token <ONE_TIME_BOOTSTRAP_TOKEN> \
  --branch-id BLR-IND-01
```

Once provisioned, the Edge Agent communicates over mutual TLS (`mTLS`), buffers up to 72 hours of video locally on MicroSD/NVMe during WAN outages, and automatically store-and-forwards recordings upon link restoration.

---

## 9. Pre-Flight Verification & Health Probes

Verify deployment health using automated HTTP probes:

```bash
# 1. Control Plane Probe
curl -s https://sentinel.yourdomain.com/health
# Response: {"status":"ok","service":"sentinel-control-plane"}

# 2. Dashboard Probe
curl -s https://sentinel.yourdomain.com/api/health
# Response: {"status":"ok","service":"sentinel-grid-dashboard"}

# 3. Media Gateway WebRTC Readiness
curl -s https://sentinel.yourdomain.com/ready
# Response: HTTP 200 OK

# 4. End-to-End Automated Test Suite
npm test
# Result: 11/11 test suites passing (Rule engine, persistence, deduplication, schedules)
```

---

## 10. Production Hardening Checklist

Before authorizing operational go-live:

- [ ] **SSL / TLS Termination:** Valid certificates active via Caddy / Let's Encrypt (A+ rating on SSL Labs).
- [ ] **Default Passwords Changed:** `BOOTSTRAP_SUPERADMIN_PASSWORD` rotated; `POSTGRES_PASSWORD` updated.
- [ ] **Clock Synchronization (NTP):** `chronyd` active on all hosts; time offset < 50ms.
- [ ] **Firewall Hardened:** Database port `5432` and Redis port `6379` blocked from external networks.
- [ ] **Storage Backup Configured:** Automated daily backup of PostgreSQL database and Merkle audit ledgers.
- [ ] **Redis Persistence Active:** `appendonly yes` enabled in `redis.conf` to protect active stream leases.
- [ ] **Camera VLAN Isolation:** Surveillance cameras deployed on dedicated, isolated VLANs without public internet routing.
- [ ] **Monitoring & Alerting:** Host CPU, RAM, disk space, and container restarts monitored via Prometheus / Grafana.
