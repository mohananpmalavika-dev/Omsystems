# Analytics Engine Deployment Guide

**Version:** 2.0.0  
**Last Updated:** 2026-09-15

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Docker Compose Deployment](#docker-compose-deployment)
3. [Kubernetes Deployment](#kubernetes-deployment)
4. [Model Provisioning](#model-provisioning)
5. [Database Migration](#database-migration)
6. [Health Verification](#health-verification)
7. [Monitoring Setup](#monitoring-setup)
8. [Troubleshooting](#troubleshooting)
9. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### System Requirements

- **Docker**: 20.10+ or **Kubernetes**: 1.24+
- **CPU**: 4 cores minimum, 8 cores recommended
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 50GB available
- **Network**: Stable connection for model downloads

### Required Credentials

Generate secure keys:

```bash
# Analytics engine key (min 32 characters)
openssl rand -hex 32

# Analytics source key (min 32 characters)
openssl rand -hex 32

# Database password
openssl rand -base64 24

# Redis password
openssl rand -base64 16
```

### Model Files

Download required model files:

```bash
cd analytics-engine
./scripts/provision-face-models.sh
./scripts/verify-models.ts
```

---

## Docker Compose Deployment

### Step 1: Prepare Environment

```bash
cd analytics-engine

# Copy production environment template
cp .env.production.example .env.production

# Edit configuration
nano .env.production
```

**Update these required values:**
- `ANALYTICS_ENGINE_SHARED_KEY` - From openssl rand -hex 32
- `ANALYTICS_SOURCE_SHARED_KEY` - From openssl rand -hex 32
- `POSTGRES_PASSWORD` - Strong database password
- `REDIS_PASSWORD` - Redis password
- `CONTROL_PLANE_URL` - Your control plane URL
- `GRAFANA_ADMIN_PASSWORD` - Grafana admin password

### Step 2: Provision Models

```bash
# Download and verify models
ANALYTICS_MODEL_LICENSES_ACCEPTED=true npm run models:download
npm run models:verify

# Verify checksums
sha256sum models/detection/yolox_tiny.onnx
```

### Step 3: Initialize Database

```bash
# Start PostgreSQL first
docker-compose -f docker-compose.production.yml up -d postgres

# Wait for PostgreSQL to be ready
docker-compose -f docker-compose.production.yml exec postgres \
  pg_isready -U analytics

# Run migrations
npm run db:migrate
```

### Step 4: Deploy Services

```bash
# Start all services
docker-compose -f docker-compose.production.yml up -d

# Check service health
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f analytics-engine
```

### Step 5: Verify Deployment

```bash
# Health check
curl http://localhost:8092/health

# Expected response:
# {
#   "status": "ok",
#   "aiState": "AI_OPERATIONAL",
#   "pipeline": {"initialized": true}
# }

# Check metrics
curl http://localhost:9092/metrics
```

---

## Kubernetes Deployment

### Step 1: Prepare Cluster

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Verify namespace
kubectl get namespace sentinel-analytics
```

### Step 2: Create Secrets

```bash
# Generate secrets
kubectl create secret generic analytics-engine-secrets \
  --from-literal=ANALYTICS_ENGINE_SHARED_KEY=$(openssl rand -hex 32) \
  --from-literal=ANALYTICS_SOURCE_SHARED_KEY=$(openssl rand -hex 32) \
  --from-literal=DATABASE_URL="postgresql://analytics:$(openssl rand -base64 24)@postgres:5432/sentinel_analytics" \
  --from-literal=REDIS_PASSWORD=$(openssl rand -base64 16) \
  --from-literal=INCIDENT_API_KEY="your-incident-api-key" \
  --from-literal=WEBHOOK_SECRET=$(openssl rand -hex 32) \
  -n sentinel-analytics

# Verify secrets
kubectl get secrets -n sentinel-analytics
```

### Step 3: Deploy Models PVC

```bash
# Create PersistentVolumeClaim for models
kubectl apply -f k8s/pvc.yaml

# Upload models to PVC
kubectl run model-uploader \
  --image=busybox \
  --rm -it \
  --restart=Never \
  -n sentinel-analytics \
  --overrides='
  {
    "spec": {
      "containers": [{
        "name": "model-uploader",
        "image": "busybox",
        "command": ["sh"],
        "stdin": true,
        "tty": true,
        "volumeMounts": [{
          "name": "models",
          "mountPath": "/models"
        }]
      }],
      "volumes": [{
        "name": "models",
        "persistentVolumeClaim": {
          "claimName": "analytics-models-pvc"
        }
      }]
    }
  }'

# Inside the pod, upload models with kubectl cp
kubectl cp models/ sentinel-analytics/model-uploader:/models/
```

### Step 4: Deploy Configuration

```bash
# Apply ConfigMap
kubectl apply -f k8s/configmap.yaml

# Verify ConfigMap
kubectl get configmap analytics-engine-config -n sentinel-analytics -o yaml
```

### Step 5: Deploy Application

```bash
# Deploy ServiceAccount and RBAC
kubectl apply -f k8s/serviceaccount.yaml

# Deploy Service
kubectl apply -f k8s/service.yaml

# Deploy Deployment
kubectl apply -f k8s/deployment.yaml

# Deploy HPA (Horizontal Pod Autoscaler)
kubectl apply -f k8s/hpa.yaml

# Deploy Ingress (optional)
kubectl apply -f k8s/ingress.yaml
```

### Step 6: Verify Deployment

```bash
# Check pod status
kubectl get pods -n sentinel-analytics -w

# Check logs
kubectl logs -f deployment/analytics-engine -n sentinel-analytics

# Check service
kubectl get svc analytics-engine -n sentinel-analytics

# Port forward for testing
kubectl port-forward svc/analytics-engine 8092:8092 -n sentinel-analytics

# Test health
curl http://localhost:8092/health
```

---

## Model Provisioning

### Automated Provisioning

```bash
cd analytics-engine

# Accept model licenses and download
ANALYTICS_MODEL_LICENSES_ACCEPTED=true npm run models:download

# Verify checksums
npm run models:verify
```

### Manual Provisioning

```bash
# Face Recognition Models
wget https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx \
  -O models/face/face-detector.onnx

# Verify SHA-256
sha256sum models/face/face-detector.onnx
# Expected: 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4

# YOLOX Tiny Object Detection
wget https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_tiny.onnx \
  -O models/detection/yolox_tiny.onnx

# Verify
sha256sum models/detection/yolox_tiny.onnx
# Expected: 427cc366d34e27ff7a03e2899b5e3671425c262ea2291f88bb942bc1cc70b0f7
```

---

## Database Migration

### Run Migrations

```bash
# Production migration
NODE_ENV=production npm run db:migrate

# Check migration status
npm run db:migrate:status

# Rollback last migration (if needed)
npm run db:migrate:rollback
```

### Manual Migration

```bash
# Connect to database
psql $DATABASE_URL

# Run migration files
\i migrations/001_journey_tables.sql
\i migrations/002_face_recognition_governance.sql

# Verify tables
\dt
\d face_watchlists
```

---

## Health Verification

### Comprehensive Health Check

```bash
#!/bin/bash
# Save as: scripts/verify-production-health.sh

echo "=== Analytics Engine Health Check ==="

# 1. Service Health
echo "Checking service health..."
HEALTH=$(curl -s http://localhost:8092/health)
echo $HEALTH | jq '.'

AI_STATE=$(echo $HEALTH | jq -r '.aiState')
if [ "$AI_STATE" != "AI_OPERATIONAL" ]; then
  echo "❌ AI State: $AI_STATE (expected AI_OPERATIONAL)"
  exit 1
fi
echo "✅ AI State: $AI_STATE"

# 2. Database Connection
echo "Checking database connection..."
DB_TABLES=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
echo "✅ Database tables: $DB_TABLES"

# 3. Model Files
echo "Checking model files..."
if [ ! -f models/manifest.json ]; then
  echo "❌ Model manifest not found"
  exit 1
fi
echo "✅ Model manifest found"

# 4. Metrics Endpoint
echo "Checking metrics..."
METRICS=$(curl -s http://localhost:9092/metrics | grep "analytics_" | wc -l)
echo "✅ Metrics exposed: $METRICS metrics"

# 5. Camera Status Test
echo "Testing camera status endpoint..."
STATUS=$(curl -s http://localhost:8092/v1/analytics/cameras/test-camera/status)
echo "✅ Camera status API working"

echo ""
echo "=== Health Check Complete ==="
```

---

## Monitoring Setup

### Prometheus Configuration

Create `monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'analytics-engine'
    static_configs:
      - targets: ['analytics-engine:9092']
    metrics_path: /metrics
```

### Grafana Dashboards

1. Access Grafana: `http://localhost:3001`
2. Login: `admin` / your-password
3. Import dashboard from `monitoring/grafana/dashboards/analytics-engine.json`

**Key Metrics:**
- `analytics_detections_total{type}` - Detection counts
- `analytics_processing_latency_seconds` - Frame processing time
- `analytics_active_tracks{detector}` - Active object tracks
- `analytics_model_inference_duration_seconds` - Model inference time

---

## Troubleshooting

### AI State is "AI_DEGRADED"

**Cause:** Models not loaded or failed to initialize

**Solution:**
```bash
# Check model files
ls -lh models/

# Verify checksums
npm run models:verify

# Check logs
docker-compose logs analytics-engine | grep "model"
```

### Database Connection Failed

**Cause:** PostgreSQL not ready or wrong credentials

**Solution:**
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check PostgreSQL logs
docker-compose logs postgres

# Verify credentials in .env.production
```

### High CPU Usage

**Cause:** Too many concurrent streams or high FPS

**Solution:**
```bash
# Reduce concurrent streams
export MAX_CONCURRENT_STREAMS=20

# Reduce frame rate
export FRAME_PROCESSING_RATE=1

# Enable GPU if available
export ENABLE_GPU_ACCELERATION=true
```

### Face Recognition Not Working

**Check BFSI Compliance:**
```bash
# Verify governance audit logs
psql $DATABASE_URL -c "SELECT * FROM face_governance_audit ORDER BY created_at DESC LIMIT 10"

# Common issues:
# - Liveness score < 0.95
# - Less than 3 temporal confirmations
# - No biometric consent
```

---

## Rollback Procedures

### Docker Compose Rollback

```bash
# Stop current version
docker-compose -f docker-compose.production.yml down

# Pull previous version
docker pull aditisentinel/analytics-engine:1.9.0

# Update image tag in docker-compose.production.yml
# Change: image: aditisentinel/analytics-engine:2.0.0
# To: image: aditisentinel/analytics-engine:1.9.0

# Start services
docker-compose -f docker-compose.production.yml up -d

# Rollback database migration
npm run db:migrate:rollback
```

### Kubernetes Rollback

```bash
# Rollback to previous deployment
kubectl rollout undo deployment/analytics-engine -n sentinel-analytics

# Rollback to specific revision
kubectl rollout history deployment/analytics-engine -n sentinel-analytics
kubectl rollout undo deployment/analytics-engine --to-revision=2 -n sentinel-analytics

# Check rollback status
kubectl rollout status deployment/analytics-engine -n sentinel-analytics
```

---

## Post-Deployment Checklist

- [ ] All services are healthy (`docker-compose ps` or `kubectl get pods`)
- [ ] AI state is `AI_OPERATIONAL` (`curl /health`)
- [ ] Database migrations applied (`npm run db:migrate:status`)
- [ ] Model files verified (`npm run models:verify`)
- [ ] Metrics endpoint accessible (`curl /metrics`)
- [ ] Logs are clean (no errors in startup)
- [ ] Test face recognition (if enabled)
- [ ] Test industrial analytics (if enabled)
- [ ] Monitoring dashboards working
- [ ] Alerts configured
- [ ] Backup strategy implemented

---

## Support

- **Documentation**: https://docs.sentinelgrid.com
- **Issues**: https://github.com/sentinel-grid/analytics-engine/issues
- **Email**: support@sentinelgrid.com

---

**Deployment Guide Version:** 2.0.0  
**Last Updated:** 2026-09-15
