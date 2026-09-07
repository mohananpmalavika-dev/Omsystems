# KRYPTOVISION / SENTINEL GRID — PRODUCTION DEPLOYMENT GUIDE

> **Enterprise Operations & Deployment Engineering Manual**
> **Product**: KryptoVision Hybrid CCTV Control Plane & Forensic Evidence Vault
> **Build Version**: v1.0.0-rc.2 | **Target Runtimes**: Bare Metal Linux (RHEL/Ubuntu), Docker Compose, Kubernetes (EKS/GKE/On-Prem)

---

## 1. System Requirements & Hardware Sizing

### 1.1 Central Control Plane Server (Per 500 Branches / 5,000 Cameras)

| Resource | Minimum (Development) | Recommended (Enterprise Production) | High-Availability Cluster |
| :--- | :---: | :---: | :---: |
| **CPU Architecture** | x86_64 (4 vCPU) | x86_64 (16 vCPU) or AMD EPYC | 3x Nodes (8 vCPU each) |
| **Memory (RAM)** | 8 GB ECC | 32 GB ECC DDR4/DDR5 | 3x 16 GB ECC Nodes |
| **Local Disk** | 100 GB NVMe | 500 GB NVMe (OS + DB WAL) | Mirrored NVMe RAID 10 |
| **Network** | 1 Gbps NIC | 10 Gbps bonded dual-NIC | 10 Gbps dual-port (mTLS) |
| **Operating System** | Ubuntu 22.04 LTS / Debian 12 | RHEL 9 / Rocky Linux 9 / Ubuntu 24.04 LTS | Containerized Linux Kernel $\ge 5.15$ |

### 1.2 Software Dependencies

- **Node.js**: Version $\ge 22.0.0$ (LTS recommended).
- **PostgreSQL**: Version $16.x$ with \`pg_stat_statements\`, \`btree_gist\`, and \`uuid-ossp\` extensions.
- **Redis**: Version $7.2+$ with AOF persistence enabled.
- **FFmpeg**: Version $6.0+$ with \`libx264\`, \`libx265\`, and \`npp\` / VAAPI hardware acceleration.
- **Object Storage**: AWS S3 or on-premise MinIO with Object Lock (WORM) support.

---

## 2. Environment Configuration Reference

Create \`.env\` in the project root:

\`\`\`bash
# ==============================================================================
# SERVER & NETWORK
# ==============================================================================
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
PUBLIC_API_URL=https://sentinel.internal.bank.com
CORS_ORIGIN=https://sentinel.internal.bank.com

# ==============================================================================
# DATABASE (POSTGRESQL 16)
# ==============================================================================
DATABASE_URL=postgresql://sentinel_app:SecretPassw0rd!@pg-cluster.internal:5432/sentinel_db?sslmode=verify-full&sslrootcert=/etc/sentinel/certs/pg-ca.pem
DB_POOL_MIN=10
DB_POOL_MAX=50
DB_STATEMENT_TIMEOUT_MS=30000

# ==============================================================================
# CACHE & EVENT BUS (REDIS 7.2)
# ==============================================================================
REDIS_URL=rediss://:RedisAuthPassw0rd!@redis-cluster.internal:6379/0
REDIS_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379,sentinel3:26379
REDIS_SENTINEL_MASTER_NAME=mymaster

# ==============================================================================
# SECURITY & AUTHENTICATION
# ==============================================================================
JWT_SECRET=c3VwZXJzZWNyZXRqd3RrZXlmb3JzZW50aW5lbDEwLzEw==
JWT_EXPIRY=8h
JWT_REFRESH_SECRET=YW5vdGhlcnN1cGVyc2VjcmV0cmVmcmVzaGtleQ==
JWT_REFRESH_EXPIRY=30d
COOKIE_SECRET=Y29va2llc2VjcmV0Zm9yc2VjdXJlc2Vzc2lvbnM=
ENCRYPTION_KEY_HEX=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# ==============================================================================
# FORENSIC EVIDENCE & OBJECT STORAGE (S3 / MINIO)
# ==============================================================================
S3_ENDPOINT=https://minio-vault.internal:9000
S3_REGION=us-east-1
S3_BUCKET=sentinel-evidence-vault
S3_ACCESS_KEY=SentinelVaultWriter
S3_SECRET_KEY=VaultSuperSecretKey99!
S3_FORCE_PATH_STYLE=true
EVIDENCE_SIGNING_PRIVATE_KEY_PEM_PATH=/etc/sentinel/keys/ed25519-evidence-private.pem
EVIDENCE_SIGNING_PUBLIC_KEY_PEM_PATH=/etc/sentinel/keys/ed25519-evidence-public.pem

# ==============================================================================
# OBSERVABILITY & TELEMETRY
# ==============================================================================
OTEL_EXPORTER_PROMETHEUS_PORT=9464
LOG_LEVEL=info
\`\`\`

---

## 3. Database Initialization & Schema Migrations

Sentinel Grid uses an immutable, SHA-256 checksum-verified migration runner.

\`\`\`bash
# 1. Verify connection and examine pending migrations
npm run migrate:status

# 2. Apply all pending database migrations in transaction
npm run migrate

# 3. Verify schema tables and indexes
psql $DATABASE_URL -c "\dt"
\`\`\`

---

## 4. Docker Compose Deployment (Single-Node / Branch POC)

Create \`docker-compose.yml\`:

\`\`\`yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: sentinel-postgres
    restart: always
    environment:
      POSTGRES_USER: sentinel_app
      POSTGRES_PASSWORD: SecretPassw0rd!
      POSTGRES_DB: sentinel_db
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - sentinel-net

  redis:
    image: redis:7.2-alpine
    container_name: sentinel-redis
    restart: always
    command: ["redis-server", "--appendonly", "yes", "--requirepass", "RedisAuthPassw0rd!"]
    volumes:
      - redisdata:/data
    networks:
      - sentinel-net

  minio:
    image: minio/minio:RELEASE.2024-05-10T01-41-38Z
    container_name: sentinel-minio
    restart: always
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: SentinelVaultWriter
      MINIO_ROOT_PASSWORD: VaultSuperSecretKey99!
    volumes:
      - miniodata:/data
    networks:
      - sentinel-net

  control-plane:
    image: sentinel-grid/control-plane:v1.0.0-rc.2
    container_name: sentinel-control-plane
    restart: always
    depends_on:
      - postgres
      - redis
      - minio
    ports:
      - "3000:3000"
      - "9464:9464"
    env_file:
      - .env
    networks:
      - sentinel-net

volumes:
  pgdata:
  redisdata:
  miniodata:

networks:
  sentinel-net:
    driver: bridge
\`\`\`

Start the stack:
\`\`\`bash
docker compose up -d
docker compose logs -f control-plane
\`\`\`

---

## 5. Kubernetes Production Deployment (HA Multi-Node)

Deploy using the Sentinel Helm chart or Kubernetes manifests:

\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sentinel-control-plane
  namespace: sentinel-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: sentinel-control-plane
  template:
    metadata:
      labels:
        app: sentinel-control-plane
    spec:
      containers:
        - name: control-plane
          image: sentinel-grid/control-plane:v1.0.0-rc.2
          ports:
            - containerPort: 3000
            - containerPort: 9464
          envFrom:
            - configMapRef:
                name: sentinel-config
            - secretRef:
                name: sentinel-secrets
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 15
          resources:
            requests:
              cpu: "2"
              memory: "4Gi"
            limits:
              cpu: "4"
              memory: "8Gi"
\`\`\`

---

## 6. Verification & Health Check Probes

Verify deployment endpoints:

\`\`\`bash
# 1. Platform Liveness Probe
curl -i http://localhost:3000/live
# Expected: HTTP/1.1 200 OK {"status":"alive"}

# 2. Platform Readiness Probe (verifies PostgreSQL and Redis pools)
curl -i http://localhost:3000/ready
# Expected: HTTP/1.1 200 OK {"status":"ready","database":"connected","redis":"connected"}

# 3. Overall System Health API
curl -i http://localhost:3000/health
# Expected: HTTP/1.1 200 OK {"status":"ok","version":"1.0.0-rc.2"}

# 4. Capability Truth Verification
npm run verify:capability-truth
# Expected: 95 capabilities verified, 0 violations
\`\`\`
