# Sentinel Grid / KryptoVision — Production Deployment Guide

> **Enterprise Operations & Production Deployment Specification**  
> **Target Scale**: 500+ Branches | 4,000–5,000+ IP/Analog Cameras | Central Monitoring & Edge Hubs  
> **Standard Compliance**: Zero Trust mTLS, FIPS 140-3 & AES-256-GCM, WORM Compliance (RFC 3161)  
> **Release Target**: v1.0.0 Enterprise Production

---

## 1. System Architecture & Topology

Sentinel Grid utilizes a hybrid distributed deployment model:
1. **Central Control Plane**: Manages tenant isolation, ABAC/RBAC authorization, global device catalog, multi-camera correlation, forensic vault, and web dashboard.
2. **Media Gateway**: Handles RTSP fanout, HLS segmentation, WebRTC signaling, and camera streaming sessions.
3. **Recording Engine**: Continuous & motion-triggered writing to NVMe/SAN scratch disks with asynchronous packaging to S3/MinIO WORM object storage.
4. **Edge Agent Hub**: Deployed at each branch or regional cluster. Connects to local NVRs/DVRs/IP cameras over isolated camera VLANs, performs edge AI inference and telemetry sampling, and streams via outbound-only mTLS tunnels to the Central Control Plane.

```
┌─────────────────────────────────────────────────────────────┐
│                       CENTRAL CLUSTER                       │
│  ┌─────────────────┐   ┌─────────────────┐   ┌────────────┐ │
│  │   Dashboard /   │   │  Media Gateway  │   │ Recording  │ │
│  │   App Server    │   │  (WebRTC/HLS)   │   │   Engine   │ │
│  └────────┬────────┘   └────────┬────────┘   └─────┬──────┘ │
│           │                     │                  │        │
│           └──────────┬──────────┴──────────────────┘        │
│                      ▼                                      │
│           PostgreSQL 16 HA + Redis 7.2 Cluster              │
│                      │                                      │
│                      ▼                                      │
│           S3 / MinIO WORM Forensic Vault                    │
└──────────────────────▲──────────────────────────────────────┘
                       │ Mutual TLS (mTLS) v1.3 Tunnel
        ┌──────────────┴──────────────┐
        │                             │
┌───────┴───────────────┐     ┌───────┴───────────────┐
│     BRANCH EDGE 1     │     │     BRANCH EDGE 500   │
│  ┌─────────────────┐  │     │  ┌─────────────────┐  │
│  │ Sentinel Edge   │  │     │  │ Sentinel Edge   │  │
│  │ Agent + ONNX    │  │     │  │ Agent + ONNX    │  │
│  └────────┬────────┘  │     │  └────────┬────────┘  │
│           ▼           │     │           ▼           │
│  ┌─────────────────┐  │     │  ┌─────────────────┐  │
│  │ NVR / DVR / IPC │  │     │  │ NVR / DVR / IPC │  │
│  │ (Hik/Dahua/CP+) │  │     │  │ (Hik/Dahua/CP+) │  │
│  └─────────────────┘  │     │  └─────────────────┘  │
└───────────────────────┘     └───────────────────────┘
```

---

## 2. Infrastructure Sizing Requirements

### 2.1 Central Cluster (Aggregating 500 Branches / 5,000 Cameras)

| Component | Minimum Production Spec | Recommended High-Capacity Spec | High-Availability Configuration |
| :--- | :--- | :--- | :--- |
| **Control Plane Nodes** | 3x 8 vCPU, 32 GB RAM | 3x 16 vCPU, 64 GB RAM | N+1 Active-Active behind load balancer |
| **Media Gateways** | 4x 16 vCPU, 32 GB RAM | 8x 16 vCPU, 64 GB RAM | DNS round-robin / Anycast with WebRTC sticky sessions |
| **Recording Nodes** | 4x 8 vCPU, 32 GB RAM | 6x 16 vCPU, 64 GB RAM | Local 4 TB NVMe tier + S3/MinIO tiering |
| **PostgreSQL 16** | 16 vCPU, 64 GB RAM, NVMe | 32 vCPU, 128 GB RAM, NVMe | Primary + 2x Sync Replicas (Patroni / Cloud RDS Multi-AZ) |
| **Redis 7.2 Cluster** | 3 Master + 3 Replica nodes (16 GB each) | 3 Master + 3 Replica nodes (32 GB each) | Redis Sentinel / Cluster with AOF persistence |
| **Forensic Vault (S3)**| 100 TB Object Lock WORM | 500 TB+ S3 Compliant WORM | Multi-region replication + Object Lock Compliance Mode |

### 2.2 Branch Edge Appliances (Per Branch / 8–16 Cameras)

| Resource | Low-Density Branch (4–8 Cams) | Standard Branch (8–16 Cams) | High-Density Hub (16–32 Cams + AI) |
| :--- | :--- | :--- | :--- |
| **Hardware** | Intel Core i3 / Celeron J6412 | Intel Core i5/i7 (11th Gen+) / AMD Ryzen 5 | Intel Xeon E / NVIDIA Jetson Orin Nano / RTX 4060 |
| **RAM** | 8 GB DDR4 ECC | 16 GB DDR4/DDR5 ECC | 32 GB DDR5 ECC |
| **Local Storage** | 256 GB NVMe SSD | 512 GB NVMe SSD (Offline buffer) | 1 TB NVMe SSD (72h local retention buffer) |
| **GPU / VPU** | Intel UHD Graphics (OpenVINO) | Intel Iris Xe / OpenVINO | NVIDIA TensorRT / CUDA 12.x or Hailo-8 |
| **Network** | Dual 1 Gbps Ethernet | Dual 1 Gbps Ethernet (VLAN isolation) | Dual 2.5 Gbps Ethernet + 4G/5G Failover WAN |

---

## 3. Environment Variables Reference

A verified `.env` file must be generated before process initialization.

```bash
# ==============================================================================
# 1. CORE APPLICATION RUNTIME
# ==============================================================================
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
PUBLIC_API_URL=https://vms.company.com
DASHBOARD_URL=https://vms.company.com
CORS_ORIGIN=https://vms.company.com

# ==============================================================================
# 2. DATABASE (POSTGRESQL 16 ENTERPRISE)
# ==============================================================================
DATABASE_URL=postgresql://sentinel_user:StrongPasswordHere@postgres-cluster.internal:5432/sentinel_db?sslmode=verify-full&sslrootcert=/etc/sentinel/certs/ca-root.crt
DATABASE_SSL=true
DB_POOL_MIN=10
DB_POOL_MAX=60
DB_STATEMENT_TIMEOUT_MS=30000
DB_IDLE_TIMEOUT_MS=10000

# ==============================================================================
# 3. CACHE & MESSAGE BUS (REDIS 7.2)
# ==============================================================================
REDIS_URL=rediss://:RedisPasswordHere@redis-cluster.internal:6379/0
REDIS_KEY_PREFIX=sentinel:prod:
REDIS_TLS_CA=/etc/sentinel/certs/ca-root.crt
REDIS_SENTINEL_HOSTS=sentinel-01.internal:26379,sentinel-02.internal:26379,sentinel-03.internal:26379
REDIS_SENTINEL_MASTER_NAME=sentinel-master

# ==============================================================================
# 4. ZERO-TRUST SECURITY & ENCRYPTION
# ==============================================================================
JWT_SECRET=super_secret_jwt_hmac512_key_minimum_64_bytes_for_entropy_here_12345
JWT_EXPIRY=8h
JWT_REFRESH_SECRET=refresh_jwt_key_another_64_bytes_minimum_entropy_value_here_67890
JWT_REFRESH_EXPIRY=30d
COOKIE_SECRET=secure_session_cookie_signing_key_32_characters_here
MASTER_ENCRYPTION_KEY_HEX=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
MTLS_SERVER_CERT=/etc/sentinel/certs/server.crt
MTLS_SERVER_KEY=/etc/sentinel/certs/server.key
MTLS_CA_BUNDLE=/etc/sentinel/certs/ca-chain.crt

# ==============================================================================
# 5. FORENSIC EVIDENCE & S3 WORM VAULT
# ==============================================================================
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=sentinel-forensic-vault-production
S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_FORCE_PATH_STYLE=false
EVIDENCE_SIGNING_PRIVATE_KEY_PATH=/etc/sentinel/keys/ed25519-evidence-private.pem
EVIDENCE_SIGNING_PUBLIC_KEY_PATH=/etc/sentinel/keys/ed25519-evidence-public.pem
EVIDENCE_WORM_RETENTION_DAYS=2555

# ==============================================================================
# 6. AI CAPABILITY ENGINE & RUNTIME
# ==============================================================================
AI_EXECUTION_PROVIDER=CUDAExecutionProvider,CPUExecutionProvider
AI_MODEL_BASE_PATH=/opt/sentinel/models
AI_CONFIDENCE_THRESHOLD=0.65
ANPR_MIN_OCR_SCORE=0.75
AI_MAX_BATCH_SIZE=8
AI_GPU_DEVICE_ID=0

# ==============================================================================
# 7. OBSERVABILITY & TELEMETRY
# ==============================================================================
LOG_LEVEL=info
PROMETHEUS_METRICS_PORT=9464
ENABLE_TRACING=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.internal:4318
```

---

## 4. Deterministic Deployment Procedures

### Step 1: System Pre-requisites & OS Hardening

On target host running Ubuntu 24.04 LTS / RHEL 9:

```bash
# Update kernel and security patches
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl ufw chrony libva-dev libva-drm2

# Configure NTP synchronisation (mandatory for video timeline alignment)
sudo systemctl enable chrony --now
chronyc tracking

# Set maximum file descriptors and network socket buffer limits
cat << 'EOF' | sudo tee /etc/sysctl.d/99-sentinel.conf
fs.file-max = 2097152
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
vm.max_map_count = 262144
EOF
sudo sysctl --system
```

### Step 2: PKI & mTLS Certificate Infrastructure Setup

Generate or mount the required x509 certificates for edge-to-cloud mutual TLS:

```bash
# Create cert directory with strict permissions
sudo mkdir -p /etc/sentinel/certs /etc/sentinel/keys
sudo chmod 700 /etc/sentinel/certs /etc/sentinel/keys

# Generate Ed25519 Evidence Signing Keypair (if not using hardware HSM)
openssl genpkey -algorithm ED25519 -out /etc/sentinel/keys/ed25519-evidence-private.pem
openssl pkey -in /etc/sentinel/keys/ed25519-evidence-private.pem -pubout -out /etc/sentinel/keys/ed25519-evidence-public.pem
chmod 400 /etc/sentinel/keys/ed25519-evidence-private.pem
chmod 444 /etc/sentinel/keys/ed25519-evidence-public.pem
```

### Step 3: Database Migrations & Verification

Sentinel Grid enforces transaction-wrapped, checksum-verified schema migrations:

```bash
cd /opt/sentinel/app

# Run schema migrations
npm run migrate

# Verify schema integrity and table constraints
npm run migrate:status
```

### Step 4: Systemd Service Registration

Create standardized systemd unit files for auto-start and crash recovery:

`/etc/systemd/system/sentinel-api.service`:
```ini
[Unit]
Description=Sentinel Grid Core API & Control Plane
After=network.target postgresql.service redis.service
Wants=network-online.target

[Service]
Type=simple
User=sentinel
Group=sentinel
WorkingDirectory=/opt/sentinel/app
EnvironmentFile=/etc/sentinel/sentinel.env
ExecStart=/usr/bin/node dist/src/server.js
Restart=always
RestartSec=3s
LimitNOFILE=65536
KillSignal=SIGTERM
TimeoutStopSec=30s

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/sentinel-media.service`:
```ini
[Unit]
Description=Sentinel Grid Media Gateway
After=network.target sentinel-api.service

[Service]
Type=simple
User=sentinel
Group=sentinel
WorkingDirectory=/opt/sentinel/app/media-gateway
EnvironmentFile=/etc/sentinel/sentinel.env
ExecStart=/usr/bin/node dist/src/index.js
Restart=always
RestartSec=3s
LimitNOFILE=131072

[Install]
WantedBy=multi-user.target
```

Enable and start services:
```bash
sudo systemctl daemon-reload
sudo systemctl enable sentinel-api sentinel-media
sudo systemctl start sentinel-api sentinel-media
sudo systemctl status sentinel-api sentinel-media
```

---

## 5. Reverse Proxy & Ingress Configuration (Nginx / Caddy)

Production ingress requires HTTPS/WSS termination, HTTP/2, and low-latency chunked HLS/WebRTC streaming:

`/etc/nginx/sites-available/sentinel.conf`:
```nginx
upstream sentinel_api {
    server 127.0.0.1:3000;
    keepalive 64;
}

upstream sentinel_media {
    server 127.0.0.1:8554;
    keepalive 128;
}

upstream sentinel_dashboard {
    server 127.0.0.1:5173;
    keepalive 32;
}

server {
    listen 80;
    server_name vms.company.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name vms.company.com;

    ssl_certificate /etc/letsencrypt/live/vms.company.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vms.company.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:50m;
    ssl_session_timeout 1d;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Dashboard UI
    location / {
        proxy_pass http://sentinel_dashboard;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # API Backend
    location /api/ {
        proxy_pass http://sentinel_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket Realtime Subscriptions
    location /ws {
        proxy_pass http://sentinel_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Live HLS Video Stream Endpoints
    location /stream/ {
        proxy_pass http://sentinel_media;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Host $host;
        add_header Access-Control-Allow-Origin *;
    }
}
```

---

## 6. Edge Appliance Deployment (On-Premise Branch)

Each branch receives an edge agent installed on a dedicated gateway box:

```bash
# 1. Install Node.js runtime and FFmpeg on edge box
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs ffmpeg libonnxruntime

# 2. Extract edge bundle
sudo mkdir -p /opt/sentinel-edge
sudo tar -xzf sentinel-edge-release.tar.gz -C /opt/sentinel-edge

# 3. Mount signed branch certificate and bootstrap config
sudo cp branch-142.crt /opt/sentinel-edge/certs/client.crt
sudo cp branch-142.key /opt/sentinel-edge/certs/client.key
sudo cp root-ca.crt /opt/sentinel-edge/certs/ca.crt

# 4. Verify Edge Configuration & mTLS Handshake
cd /opt/sentinel-edge
npm run edge:verify

# 5. Start systemd service
sudo systemctl enable sentinel-edge --now
sudo systemctl status sentinel-edge
```

---

## 7. Production Verification & Smoke Test

Execute the automated end-to-end verification gate immediately after deployment:

```bash
# 1. Zero Critical/High Vulnerability Check
npm audit

# 2. Production Truth Verification (No Fake AI/Mocks)
npm run verify:production-truth
npm run verify:capability-truth

# 3. Security Compliance Verifiers
npm run verify:tls-security
npm run verify:no-production-localhost
npm run security:secret-scan

# 4. Acceptance Test Lifecycle (26/26 Steps)
npm run test:acceptance:master

# 5. Edge Chaos & Failover Test (12 Vectors)
npm run test:chaos:12vectors

# 6. High-Capacity Scale Ingestion Test
npm run test:scale:500
```

---

## 8. Rollback & Disaster Recovery

If an issue occurs during migration or node deployment:

1. **Database Rollback**:
   ```bash
   npm run migrate:down
   ```
2. **Binary Version Revert**:
   ```bash
   sudo systemctl stop sentinel-api sentinel-media
   sudo ln -sfn /opt/sentinel/releases/v0.9.8 /opt/sentinel/current
   sudo systemctl start sentinel-api sentinel-media
   ```
3. **Health State Check**:
   ```bash
   curl -f http://127.0.0.1:3000/health/readiness || exit 1
   ```
