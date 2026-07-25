# AI Analytics Engine - Deployment Guide

## 🚀 Production Deployment Guide

This guide covers deploying the AI Analytics Engine to production with all 11 modules.

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Model Setup](#model-setup)
5. [Integration with Main System](#integration)
6. [API Endpoints](#api-endpoints)
7. [Performance Tuning](#performance-tuning)
8. [Monitoring & Maintenance](#monitoring)
9. [Troubleshooting](#troubleshooting)

---

## System Requirements

### Minimum Requirements (Testing)
- **CPU:** 4 cores (Intel i5 or equivalent)
- **RAM:** 8 GB
- **GPU:** Optional (CPU-only mode supported)
- **Storage:** 20 GB for models + recorded footage
- **OS:** Linux (Ubuntu 20.04+), Windows 10+, macOS 10.15+

### Recommended (Production)
- **CPU:** 8+ cores (Intel Xeon or AMD EPYC)
- **RAM:** 16-32 GB
- **GPU:** NVIDIA GPU with 8+ GB VRAM (RTX 3060 or better)
- **Storage:** 100+ GB SSD for models + NAS/cloud for footage
- **OS:** Ubuntu 22.04 LTS (recommended)

### Large-Scale Deployment (500+ cameras)
- **CPU:** 16+ cores
- **RAM:** 64+ GB
- **GPU:** Multiple NVIDIA GPUs (RTX 4090 or A100)
- **Storage:** 1+ TB NVMe SSD + distributed storage
- **Network:** 10 Gbps

---

## Installation

### 1. Install Dependencies

#### Node.js & npm
```bash
# Install Node.js 18+ LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

#### Python (for AI models)
```bash
# Install Python 3.10+
sudo apt-get update
sudo apt-get install -y python3.10 python3-pip

# Verify installation
python3 --version
```

#### System Libraries
```bash
# Install required system libraries
sudo apt-get install -y \
  build-essential \
  libopencv-dev \
  ffmpeg \
  libgl1-mesa-glx \
  libglib2.0-0
```

### 2. Clone Repository
```bash
git clone https://github.com/yourusername/Omsystems.git
cd Omsystems/analytics-engine
```

### 3. Install Node Modules
```bash
npm install

# Install TensorFlow.js Node bindings
npm install @tensorflow/tfjs-node

# For GPU support (optional)
npm install @tensorflow/tfjs-node-gpu
```

### 4. Install Python Dependencies
```bash
cd models
pip3 install -r requirements.txt
cd ..
```

---

## Configuration

### 1. Environment Variables

Create `.env` file in `analytics-engine/` directory:

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/vms
REDIS_URL=redis://localhost:6379

# Storage
STORAGE_PATH=/var/vms/recordings
MODEL_PATH=/var/vms/models

# Analytics Configuration
MAX_CONCURRENT_STREAMS=50
FRAME_PROCESSING_FPS=5
DETECTION_CONFIDENCE_THRESHOLD=0.6

# Feature Flags
ENABLE_HUMAN_ANALYTICS=true
ENABLE_VEHICLE_ANALYTICS=true
ENABLE_FACE_ANALYTICS=true
ENABLE_SAFETY_ANALYTICS=true
ENABLE_BANKING_ANALYTICS=true
ENABLE_AI_SEARCH=true
ENABLE_SECURITY_ANALYTICS=true
ENABLE_INVESTIGATION_TOOLS=true
ENABLE_RETAIL_ANALYTICS=true
ENABLE_PREDICTION_ENGINE=true
ENABLE_REPORTING_ENGINE=true

# GPU Configuration
USE_GPU=true
GPU_MEMORY_LIMIT=8192

# Logging
LOG_LEVEL=info
LOG_PATH=/var/log/analytics-engine

# API Keys (if using external services)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASSWORD=your-password
```

### 2. TypeScript Configuration

Already configured in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

---

## Model Setup

### 1. Download AI Models

Run the automated download script:

```bash
# Make script executable
chmod +x scripts/download-models.sh

# Download all models (this may take 30-60 minutes)
./scripts/download-models.sh
```

Models will be downloaded to `models/` directory:
- `yolov8n.pt` (11 MB) - Object detection
- `yolov8n-pose.pt` (6 MB) - Pose estimation
- `osnet_x1_0_msmt17.pth` (25 MB) - Person Re-ID
- `retinaface_mobilenet.pth` (2 MB) - Face detection
- `arcface_r100.pth` (249 MB) - Face recognition
- `paddleocr_det.pth` (3 MB) - ANPR detection
- `paddleocr_rec.pth` (8 MB) - ANPR recognition
- `vehicle_reid.pth` (45 MB) - Vehicle Re-ID
- `clip-vit-b32.pth` (338 MB) - Visual search

**Total Size:** ~700 MB

### 2. Model Verification

```bash
# Verify models are downloaded
npm run verify-models

# Expected output:
# ✓ YOLOv8 detection model found
# ✓ YOLOv8 pose model found
# ✓ OSNet Re-ID model found
# ✓ RetinaFace model found
# ✓ ArcFace model found
# ✓ PaddleOCR models found
# ✓ Vehicle Re-ID model found
# ✓ CLIP model found
# All models verified successfully!
```

---

## Integration with Main System

### 1. Update Main Backend

Edit `backend/src/app.ts` to include analytics routes:

```typescript
import express from 'express';
import { analyticsRouter } from './routes/analytics.routes';

const app = express();

// ... other middleware ...

// Analytics Engine Integration
app.use('/api/analytics', analyticsRouter);

// Health check for analytics
app.get('/api/analytics/health', (req, res) => {
  res.json({
    status: 'healthy',
    modules: {
      human: true,
      vehicle: true,
      face: true,
      safety: true,
      banking: true,
      search: true,
      security: true,
      investigation: true,
      retail: true,
      prediction: true,
      reporting: true
    }
  });
});
```

### 2. Create Analytics Routes

Create `backend/src/routes/analytics.routes.ts`:

```typescript
import { Router } from 'express';
import axios from 'axios';

const router = Router();
const ANALYTICS_ENGINE_URL = process.env.ANALYTICS_ENGINE_URL || 'http://localhost:3000';

// Start analytics for camera
router.post('/camera/:cameraId/start', async (req, res) => {
  try {
    const { cameraId } = req.params;
    const { streamUrl, modules } = req.body;
    
    const response = await axios.post(`${ANALYTICS_ENGINE_URL}/analytics/start`, {
      cameraId,
      streamUrl,
      modules: modules || ['human', 'vehicle', 'face', 'safety']
    });
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop analytics for camera
router.post('/camera/:cameraId/stop', async (req, res) => {
  try {
    const { cameraId } = req.params;
    
    const response = await axios.post(`${ANALYTICS_ENGINE_URL}/analytics/stop`, {
      cameraId
    });
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get real-time analytics
router.get('/camera/:cameraId/live', async (req, res) => {
  try {
    const { cameraId } = req.params;
    
    const response = await axios.get(`${ANALYTICS_ENGINE_URL}/analytics/${cameraId}/live`);
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search (AI Search Engine)
router.post('/search', async (req, res) => {
  try {
    const { query, timeRange, cameras } = req.body;
    
    const response = await axios.post(`${ANALYTICS_ENGINE_URL}/search`, {
      query,
      timeRange,
      cameras
    });
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Investigation
router.post('/investigate', async (req, res) => {
  try {
    const { type, subjectId, params } = req.body;
    
    const response = await axios.post(`${ANALYTICS_ENGINE_URL}/investigate`, {
      type,
      subjectId,
      params
    });
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Predictions
router.get('/predictions', async (req, res) => {
  try {
    const { type, minProbability } = req.query;
    
    const response = await axios.get(`${ANALYTICS_ENGINE_URL}/predictions`, {
      params: { type, minProbability }
    });
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reports
router.get('/reports/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { date } = req.query;
    
    const response = await axios.get(`${ANALYTICS_ENGINE_URL}/reports/${type}`, {
      params: { date }
    });
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export { router as analyticsRouter };
```

### 3. Update Frontend Dashboard

Create `dashboard/app/analytics/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);
  
  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/analytics/dashboard');
      const data = await response.json();
      setAnalytics(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Active People</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">{analytics?.people?.count || 0}</div>
          <p className="text-sm text-muted-foreground">
            {analytics?.people?.unique || 0} unique visitors
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Vehicles Detected</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">{analytics?.vehicles?.count || 0}</div>
          <p className="text-sm text-muted-foreground">
            {analytics?.vehicles?.plates || 0} plates recognized
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Active Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">{analytics?.incidents?.active || 0}</div>
          <p className="text-sm text-muted-foreground">
            {analytics?.incidents?.critical || 0} critical
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">{analytics?.health?.score || 0}%</div>
          <p className="text-sm text-muted-foreground">
            {analytics?.health?.cameras || 0} cameras online
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## API Endpoints

### Analytics Processing

```
POST /analytics/start
POST /analytics/stop
GET  /analytics/:cameraId/live
GET  /analytics/:cameraId/history
```

### AI Search

```
POST /search
GET  /search/:queryId/results
```

### Investigation

```
POST /investigate/origin
POST /investigate/cameras
POST /investigate/route
POST /investigate/last-seen
GET  /investigate/journeys
```

### Predictions

```
GET  /predictions
GET  /predictions/:predictionId
POST /predictions/hardware-health
POST /predictions/storage-metrics
```

### Reporting

```
GET  /reports/daily
GET  /reports/weekly
GET  /reports/monthly
POST /reports/custom
GET  /reports/dashboard
```

Full API documentation available at: `/api/docs` (Swagger)

---

## Performance Tuning

### 1. GPU Acceleration

Enable GPU in `.env`:
```bash
USE_GPU=true
GPU_MEMORY_LIMIT=8192  # MB
```

Verify GPU usage:
```bash
nvidia-smi
```

### 2. Concurrent Stream Processing

Adjust based on hardware:
```bash
# For 8-core CPU
MAX_CONCURRENT_STREAMS=10

# For 16-core CPU + GPU
MAX_CONCURRENT_STREAMS=50

# For multiple GPUs
MAX_CONCURRENT_STREAMS=100
```

### 3. Frame Processing Rate

Balance accuracy vs performance:
```bash
# High accuracy (resource intensive)
FRAME_PROCESSING_FPS=10

# Balanced (recommended)
FRAME_PROCESSING_FPS=5

# Performance (lower accuracy)
FRAME_PROCESSING_FPS=2
```

### 4. Redis Caching

Enable Redis for faster lookups:
```bash
REDIS_URL=redis://localhost:6379
REDIS_CACHE_TTL=3600
```

---

## Monitoring & Maintenance

### 1. Health Checks

```bash
# Check analytics engine health
curl http://localhost:3000/health

# Check specific module
curl http://localhost:3000/health/human-analytics
```

### 2. Logs

```bash
# View real-time logs
tail -f /var/log/analytics-engine/app.log

# View error logs
tail -f /var/log/analytics-engine/error.log
```

### 3. Metrics

Access Prometheus metrics at:
```
http://localhost:3000/metrics
```

Key metrics to monitor:
- `analytics_fps` - Frames processed per second
- `analytics_latency_ms` - Processing latency
- `analytics_detections_total` - Total detections
- `analytics_errors_total` - Error count
- `gpu_utilization` - GPU usage %
- `memory_usage_mb` - RAM usage

### 4. Alerts

Configure alerts for:
- Analytics processing failures
- GPU/CPU overload (>90%)
- Model loading failures
- High error rates (>5%)
- Camera stream disconnections

---

## Troubleshooting

### Common Issues

#### 1. Models Not Found
```bash
Error: Model file not found: models/yolov8n.pt
```

**Solution:**
```bash
./scripts/download-models.sh
```

#### 2. GPU Out of Memory
```bash
Error: CUDA out of memory
```

**Solution:**
- Reduce `MAX_CONCURRENT_STREAMS`
- Lower `FRAME_PROCESSING_FPS`
- Reduce `GPU_MEMORY_LIMIT`

#### 3. Low FPS
```bash
Warning: Processing FPS: 2.3 (target: 5)
```

**Solution:**
- Enable GPU acceleration
- Reduce number of active modules
- Lower frame resolution
- Increase hardware resources

#### 4. High CPU Usage
```bash
Warning: CPU usage: 95%
```

**Solution:**
- Enable GPU processing
- Reduce concurrent streams
- Lower frame processing rate
- Scale horizontally (multiple instances)

---

## Docker Deployment

### Build Image
```bash
docker build -t ai-analytics-engine:latest .
```

### Run Container
```bash
docker run -d \
  --name analytics-engine \
  --gpus all \
  -p 3000:3000 \
  -v /var/vms/models:/app/models \
  -v /var/vms/recordings:/app/recordings \
  -e USE_GPU=true \
  ai-analytics-engine:latest
```

### Docker Compose
```yaml
version: '3.8'

services:
  analytics-engine:
    build: .
    container_name: analytics-engine
    ports:
      - "3000:3000"
    volumes:
      - ./models:/app/models
      - ./recordings:/app/recordings
    environment:
      - USE_GPU=true
      - MAX_CONCURRENT_STREAMS=50
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

---

## Production Checklist

- [ ] All AI models downloaded and verified
- [ ] Environment variables configured
- [ ] Database connection tested
- [ ] Redis configured (optional)
- [ ] GPU drivers installed (if using GPU)
- [ ] Logging configured
- [ ] Monitoring setup (Prometheus/Grafana)
- [ ] Backup strategy in place
- [ ] Load balancing configured (if needed)
- [ ] SSL/TLS certificates installed
- [ ] Firewall rules configured
- [ ] Health checks passing
- [ ] Performance tests completed
- [ ] Documentation reviewed

---

## Support & Resources

- **Documentation:** See `docs/` directory
- **API Reference:** `/api/docs`
- **Model Guide:** `ZERO_COST_AI_MODELS.md`
- **Architecture:** `ARCHITECTURE.md`
- **Issues:** GitHub Issues
- **Community:** Discord/Slack (if applicable)

---

**Deployment Status:** Ready for Production ✅
