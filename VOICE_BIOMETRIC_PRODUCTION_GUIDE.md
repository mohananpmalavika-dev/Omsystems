# Voice Biometric Authentication - Production Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying and operating the production-grade voice biometric authentication system. The system includes speaker embedding extraction, anti-spoofing detection, liveness verification, and secure voice profile management.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Prerequisites](#prerequisites)
3. [Model Setup](#model-setup)
4. [Environment Configuration](#environment-configuration)
5. [Deployment](#deployment)
6. [Security Configuration](#security-configuration)
7. [Monitoring and Alerts](#monitoring-and-alerts)
8. [Performance Tuning](#performance-tuning)
9. [Operational Procedures](#operational-procedures)
10. [Troubleshooting](#troubleshooting)

---

## System Architecture

### Components

1. **Voice Model Manager** - Manages ONNX models with health checks and versioning
2. **Audio Processor** - FFmpeg-based audio processing pipeline
3. **Anti-Spoofing Service** - Multi-layer spoofing detection system
4. **Voice Processing Service** - Core voice biometric operations
5. **Error Handler** - Circuit breakers and retry logic
6. **Metrics Service** - Prometheus-compatible monitoring

### Operating Modes

- **Full Mode**: All models loaded (embedding, VAD, anti-spoofing, liveness)
- **Fallback Mode**: Acoustic features when models unavailable
- **Degraded Mode**: Limited functionality with warnings

---

## Prerequisites

### System Requirements

**Minimum:**
- CPU: 4 cores, 2.5 GHz+
- RAM: 8 GB
- Storage: 50 GB SSD
- Network: 100 Mbps

**Recommended:**
- CPU: 8+ cores, 3.0 GHz+
- RAM: 16 GB
- Storage: 100 GB NVMe SSD
- Network: 1 Gbps

### Software Dependencies

```bash
# Node.js and npm
node --version  # v18+ required
npm --version   # v9+ required

# FFmpeg (required for production audio processing)
ffmpeg -version  # v4.4+ required
ffprobe -version

# PostgreSQL (with pgvector extension)
psql --version  # v14+ required

# Optional: CUDA for GPU acceleration
nvidia-smi  # if using GPU models
```

### Install FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y ffmpeg
```

**RHEL/CentOS:**
```bash
sudo yum install -y ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Docker:**
```dockerfile
FROM node:18-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
```

---

## Model Setup

### Required Models

#### 1. Speaker Embedding Model (ECAPA-TDNN)

**Download:**
```bash
mkdir -p models/voice
cd models/voice

# Option A: Use pre-trained ECAPA-TDNN from SpeechBrain
wget https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb/resolve/main/embedding_model.onnx \
  -O ecapa-tdnn-512.onnx

# Option B: Convert your own model
# python convert_to_onnx.py --model ecapa_tdnn --output ecapa-tdnn-512.onnx
```

**Verify checksum:**
```bash
sha256sum ecapa-tdnn-512.onnx
# Save this checksum for VOICE_EMBEDDING_MODEL_CHECKSUM
```

**Model specs:**
- Input: [batch_size, audio_length] float32
- Output: [batch_size, 512] float32 (speaker embedding)
- Sample rate: 16kHz

#### 2. Voice Activity Detection (Silero VAD)

**Download:**
```bash
wget https://github.com/snakers4/silero-vad/raw/master/files/silero_vad.onnx \
  -O silero-vad.onnx
```

#### 3. Anti-Spoofing Model (RawNet2 or LFCC-LCNN)

**Option A: RawNet2**
```bash
# Download from ASVspoof challenge or convert from PyTorch
wget [ANTISPOOFING_MODEL_URL] -O rawnet2-antispoofing.onnx
```

**Option B: LFCC-LCNN**
```bash
# Convert from trained model
# python convert_antispoofing.py --model lfcc_lcnn --output lfcc-lcnn.onnx
```

#### 4. Liveness Detection Model (Optional)

```bash
# Custom liveness detection model
# python train_liveness_detector.py --output liveness-detector.onnx
```

### Model Directory Structure

```
models/
└── voice/
    ├── ecapa-tdnn-512.onnx           (Required)
    ├── silero-vad.onnx                (Recommended)
    ├── rawnet2-antispoofing.onnx      (Recommended)
    └── liveness-detector.onnx         (Optional)
```

### Model Checksums

Generate and store checksums for model integrity verification:

```bash
cd models/voice
sha256sum *.onnx > checksums.txt
cat checksums.txt
```

---

## Environment Configuration

### Required Environment Variables

Create `.env` file:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/vms_db

# Voice Model Paths
VOICE_EMBEDDING_MODEL_PATH=models/voice/ecapa-tdnn-512.onnx
VOICE_EMBEDDING_MODEL_VERSION=1.0.0
VOICE_EMBEDDING_MODEL_CHECKSUM=<sha256_checksum>

VOICE_VAD_MODEL_PATH=models/voice/silero-vad.onnx
VOICE_VAD_MODEL_VERSION=1.0.0
VOICE_VAD_MODEL_CHECKSUM=<sha256_checksum>

VOICE_ANTISPOOFING_MODEL_PATH=models/voice/rawnet2-antispoofing.onnx
VOICE_ANTISPOOFING_MODEL_VERSION=1.0.0
VOICE_ANTISPOOFING_MODEL_CHECKSUM=<sha256_checksum>

VOICE_LIVENESS_MODEL_PATH=models/voice/liveness-detector.onnx
VOICE_LIVENESS_MODEL_VERSION=1.0.0
VOICE_LIVENESS_MODEL_CHECKSUM=<sha256_checksum>

# FFmpeg Paths (optional if in PATH)
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe

# Storage Configuration
VOICE_AUDIO_STORAGE_TYPE=s3  # or 'local'
VOICE_AUDIO_STORAGE_BUCKET=voice-biometric-audio
VOICE_AUDIO_STORAGE_REGION=us-east-1
VOICE_AUDIO_ENCRYPTION_KEY=<base64_encoded_key>

# AWS Credentials (if using S3)
AWS_ACCESS_KEY_ID=<access_key>
AWS_SECRET_ACCESS_KEY=<secret_key>

# Rate Limiting
VOICE_RATE_LIMIT_WINDOW_MS=60000
VOICE_RATE_LIMIT_MAX_ATTEMPTS=10

# Security
VOICE_SESSION_TIMEOUT_MINUTES=60
VOICE_MAX_FAILED_ATTEMPTS=5
VOICE_LOCKOUT_DURATION_MINUTES=15

# Monitoring
PROMETHEUS_METRICS_ENABLED=true
PROMETHEUS_METRICS_PORT=9090
```

### Database Migration

Run the voice biometric migration:

```bash
psql $DATABASE_URL -f database/migrations/20260917_voice_biometric_authentication.sql
```

Verify tables:

```sql
\dt voice_*

-- Should show:
-- voice_profiles
-- voice_enrollment_samples
-- voice_authentication_attempts
-- voice_authentication_settings
-- voice_anti_spoofing_logs
```

---

## Deployment

### Development Deployment

```bash
# Install dependencies
npm install

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

### Production Deployment

#### Option 1: PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start npm --name "vms-voice-auth" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 startup
pm2 startup
```

**PM2 Configuration (ecosystem.config.js):**

```javascript
module.exports = {
  apps: [{
    name: 'vms-voice-auth',
    script: 'npm',
    args: 'start',
    instances: 4,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    max_memory_restart: '2G',
    error_file: './logs/voice-auth-error.log',
    out_file: './logs/voice-auth-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
```

#### Option 2: Docker

**Dockerfile:**

```dockerfile
FROM node:18-slim

# Install FFmpeg and system dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Copy models
COPY models/ /app/models/

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  voice-auth:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:password@postgres:5432/vms_db
    volumes:
      - ./models:/app/models:ro
      - voice-temp:/tmp/voice-processing
    depends_on:
      - postgres
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: vms_db
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres-data:
  voice-temp:
```

#### Option 3: Kubernetes

**deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: voice-auth
spec:
  replicas: 3
  selector:
    matchLabels:
      app: voice-auth
  template:
    metadata:
      labels:
        app: voice-auth
    spec:
      containers:
      - name: voice-auth
        image: your-registry/voice-auth:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: voice-auth-secrets
              key: database-url
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        volumeMounts:
        - name: models
          mountPath: /app/models
          readOnly: true
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 60
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
      volumes:
      - name: models
        persistentVolumeClaim:
          claimName: voice-models-pvc
```

---

## Security Configuration

### 1. Consent Management

Ensure users provide explicit consent before enrollment:

```sql
UPDATE voice_authentication_settings
SET require_consent = true
WHERE tenant_id = '<tenant_id>';
```

### 2. Encryption at Rest

Voice profiles and audio samples are encrypted using AES-256:

```bash
# Generate encryption key
openssl rand -base64 32
# Set as VOICE_AUDIO_ENCRYPTION_KEY
```

### 3. Access Control

Configure tenant-level settings:

```sql
UPDATE voice_authentication_settings
SET 
  enabled = true,
  require_liveness_check = true,
  require_anti_spoofing = true,
  similarity_threshold = 0.75,
  max_failed_attempts = 5,
  lockout_duration_minutes = 30
WHERE tenant_id = '<tenant_id>';
```

### 4. Rate Limiting

Voice authentication routes are automatically rate-limited. Configure per-tenant:

```typescript
// In application code
app.register(fastifyRateLimit, {
  max: 10, // max requests
  timeWindow: '1 minute',
  keyGenerator: (req) => req.currentUser?.id || req.ip
});
```

### 5. Audit Logging

All voice authentication attempts are logged to `voice_authentication_attempts` and `audit_events` tables.

---

## Monitoring and Alerts

### Metrics Endpoint

Access Prometheus-compatible metrics:

```bash
curl http://localhost:3000/metrics/voice
```

### Key Metrics to Monitor

| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| `voice.auth.success_rate` | < 80% | Investigate model quality |
| `voice.security.spoofing.blocked` | > 10/min | Security review |
| `voice.model.embedding.duration` | > 2000ms | Scale resources |
| `voice.circuit_breaker.trips` | > 0 | Check service health |
| `voice.model.embedding.errors` | > 5/min | Check model files |

### Grafana Dashboard

Import the provided Grafana dashboard:

```bash
# Import dashboard/voice-biometric-dashboard.json
```

### Alert Configuration (Prometheus)

**alerts.yml:**

```yaml
groups:
  - name: voice_biometric_alerts
    interval: 30s
    rules:
      - alert: VoiceAuthSuccessRateLow
        expr: voice_auth_success_rate < 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Voice authentication success rate below 80%"
          description: "Success rate: {{ $value }}%"

      - alert: VoiceSpoofingAttackDetected
        expr: rate(voice_security_spoofing_blocked[5m]) > 0.5
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High rate of spoofing attacks detected"
          description: "{{ $value }} attacks/sec in last 5 minutes"

      - alert: VoiceModelInferenceErrors
        expr: rate(voice_model_embedding_errors[5m]) > 0.1
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "Voice model inference errors detected"
          description: "Error rate: {{ $value }}/sec"

      - alert: VoiceCircuitBreakerOpen
        expr: voice_circuit_breaker_state{state="OPEN"} == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Circuit breaker open for {{ $labels.service }}"
          description: "Service {{ $labels.service }} is unavailable"
```

---

## Performance Tuning

### 1. Model Optimization

**Quantization (reduces model size and improves speed):**

```python
# Convert FP32 model to FP16
import onnx
from onnxruntime.quantization import quantize_dynamic

quantize_dynamic(
    "ecapa-tdnn-512.onnx",
    "ecapa-tdnn-512-quantized.onnx",
    weight_type=QuantType.QUInt8
)
```

### 2. Audio Processing

Configure FFmpeg for optimal performance:

```bash
# Use hardware acceleration (if available)
ffmpeg -hwaccel auto -i input.wav ...

# Or set in environment
export FFMPEG_HWACCEL=cuda  # or videotoolbox, qsv, etc.
```

### 3. Database Optimization

**Indexes:**

```sql
-- Already created in migration, but verify:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_voice_profiles_embedding 
ON voice_profiles USING ivfflat (speaker_embedding_vector vector_cosine_ops)
WITH (lists = 100);

-- Vacuum and analyze
VACUUM ANALYZE voice_profiles;
VACUUM ANALYZE voice_authentication_attempts;
```

**Connection Pooling:**

```javascript
// In database config
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 4. Caching

Implement Redis caching for voice profiles:

```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  lazyConnect: true,
});

// Cache voice profile
await redis.setex(
  `voice:profile:${userId}`,
  3600, // 1 hour TTL
  JSON.stringify(voiceProfile)
);
```

### 5. Load Balancing

Use Nginx for load balancing:

**nginx.conf:**

```nginx
upstream voice_auth_backend {
    least_conn;
    server localhost:3001;
    server localhost:3002;
    server localhost:3003;
    server localhost:3004;
}

server {
    listen 80;
    server_name voice-auth.example.com;

    location /v1/auth/voice- {
        proxy_pass http://voice_auth_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Increase timeout for voice processing
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        
        # Limit request size (audio uploads)
        client_max_body_size 10M;
    }
}
```

---

## Operational Procedures

### Health Check Endpoints

```bash
# Overall health
curl http://localhost:3000/health

# Voice system health
curl http://localhost:3000/health/voice

# Model health
curl http://localhost:3000/api/control/v1/voice/health
```

### Model Hot-Reload

Reload models without downtime:

```bash
# Update model file
cp new-ecapa-tdnn-512.onnx models/voice/ecapa-tdnn-512.onnx

# Trigger reload via API
curl -X POST http://localhost:3000/api/control/v1/voice/models/reload \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"modelName": "embedding"}'
```

### Backup Procedures

**Daily Backup:**

```bash
#!/bin/bash
# backup-voice-data.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/voice-biometric"

# Backup database
pg_dump $DATABASE_URL \
  --table=voice_profiles \
  --table=voice_enrollment_samples \
  --table=voice_authentication_attempts \
  --table=voice_authentication_settings \
  > "$BACKUP_DIR/voice_db_$DATE.sql"

# Backup models
tar -czf "$BACKUP_DIR/voice_models_$DATE.tar.gz" models/voice/

# Backup audio samples (if stored locally)
if [ "$VOICE_AUDIO_STORAGE_TYPE" = "local" ]; then
  tar -czf "$BACKUP_DIR/voice_audio_$DATE.tar.gz" audio-storage/
fi

# Encrypt backups
gpg --encrypt --recipient admin@example.com "$BACKUP_DIR/voice_db_$DATE.sql"

# Upload to S3
aws s3 cp "$BACKUP_DIR/" s3://backups/voice-biometric/ --recursive

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -type f -mtime +30 -delete
```

### Disaster Recovery

**Recovery Procedure:**

1. Restore database:
```bash
psql $DATABASE_URL < voice_db_YYYYMMDD_HHMMSS.sql
```

2. Restore models:
```bash
tar -xzf voice_models_YYYYMMDD_HHMMSS.tar.gz -C /
```

3. Verify model checksums:
```bash
cd models/voice
sha256sum -c checksums.txt
```

4. Restart services:
```bash
pm2 restart vms-voice-auth
```

---

## Troubleshooting

### Common Issues

#### 1. Model Not Loading

**Symptoms:**
- Error: "Voice embedding model not found"
- Voice authentication returns 503

**Solutions:**

```bash
# Check model file exists
ls -lh models/voice/ecapa-tdnn-512.onnx

# Verify checksum
sha256sum models/voice/ecapa-tdnn-512.onnx

# Check file permissions
chmod 644 models/voice/*.onnx

# Check ONNX Runtime installation
npm list onnxruntime-node

# View model health
curl http://localhost:3000/api/control/v1/voice/health
```

#### 2. FFmpeg Not Found

**Symptoms:**
- Error: "FFmpeg not available"
- Audio processing falls back to basic mode

**Solutions:**

```bash
# Install FFmpeg
sudo apt-get install ffmpeg  # Ubuntu/Debian
brew install ffmpeg          # macOS

# Verify installation
which ffmpeg
ffmpeg -version

# Set path explicitly
export FFMPEG_PATH=/usr/bin/ffmpeg
```

#### 3. Poor Authentication Accuracy

**Symptoms:**
- High false rejection rate
- Low confidence scores

**Solutions:**

```sql
-- Lower similarity threshold
UPDATE voice_authentication_settings
SET similarity_threshold = 0.70
WHERE tenant_id = '<tenant_id>';

-- Check enrollment quality
SELECT AVG(enrollment_quality_score) 
FROM voice_profiles 
WHERE enrollment_status = 'completed';

-- Re-enroll users with low quality scores
SELECT user_id, enrollment_quality_score
FROM voice_profiles
WHERE enrollment_quality_score < 0.6;
```

#### 4. High Spoofing False Positives

**Symptoms:**
- Legitimate users blocked
- High `spoofing_detected` rate

**Solutions:**

```sql
-- Reduce anti-spoofing sensitivity
UPDATE voice_authentication_settings
SET require_anti_spoofing = false
WHERE tenant_id = '<tenant_id>';

-- Or tune confidence threshold
-- (requires code change to anti-spoofing service)
```

#### 5. Slow Performance

**Symptoms:**
- High latency (>5 seconds)
- Timeouts

**Solutions:**

```bash
# Check system resources
top
free -h
df -h

# Check model inference time
curl http://localhost:3000/metrics/voice | grep model_duration

# Scale horizontally
pm2 scale vms-voice-auth +2

# Enable model quantization
# (see Performance Tuning section)
```

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=debug
export VOICE_DEBUG=true
npm start
```

View detailed logs:

```bash
tail -f logs/voice-auth-debug.log
```

### Support Contacts

- Technical Issues: tech-support@example.com
- Security Concerns: security@example.com
- Model Updates: ml-team@example.com

---

## Appendix

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/voice/enrollment/start` | POST | Start enrollment |
| `/v1/voice/enrollment/sample` | POST | Submit sample |
| `/v1/voice/enrollment/complete` | POST | Complete enrollment |
| `/v1/voice/enrollment/status` | GET | Get enrollment status |
| `/v1/auth/voice-login` | POST | Voice authentication |
| `/v1/auth/voice-verify` | POST | Voice verification |
| `/v1/voice/analytics` | GET | Analytics (admin) |
| `/v1/voice/settings` | GET/PATCH | Settings (admin) |

### Database Schema

See `database/migrations/20260917_voice_biometric_authentication.sql` for complete schema.

### Performance Benchmarks

**Typical Latencies (on recommended hardware):**

- Enrollment sample processing: 500-1000ms
- Authentication (full mode): 1000-2000ms
- Authentication (fallback mode): 300-500ms
- Model inference (embedding): 200-400ms
- Anti-spoofing detection: 300-600ms

### License Information

Ensure compliance with model licenses:
- ECAPA-TDNN: Apache 2.0
- Silero VAD: MIT
- Custom models: Check individual licenses

---

## Changelog

### Version 1.0.0 (2026-09-17)

- Initial production release
- Multi-layer anti-spoofing
- FFmpeg audio processing
- Prometheus metrics
- Circuit breakers and retry logic

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-09-17  
**Maintained By:** Voice Biometric Team
