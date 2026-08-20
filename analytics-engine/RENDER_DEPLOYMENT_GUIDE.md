# Render Deployment Guide - Analytics Engine

## Current Status

**Service URL:** https://sentinel-grid-analytics-engine-6woo.onrender.com

**Current State:** 🟡 **DEGRADED** (Online but missing AI models)

- ✅ Service is running and responding
- ✅ Can accept external/normalized detections
- ❌ Cannot perform local AI inference
- ❌ 6 required ONNX models are missing

## Understanding AI Engine States

| State | HTTP | Meaning |
|-------|------|---------|
| `AI_OPERATIONAL` | 200 | All required models loaded, full inference capability |
| `AI_DEGRADED` | 200 | Service running but models missing or not fully ready |
| `AI_UNAVAILABLE` | 503 | Pipeline failed to initialize |

Your engine is currently in **AI_DEGRADED** state, which means:
- The service is healthy and accepting requests
- External detection workers can send pre-computed results
- Local frame inference is unavailable (no models loaded)

## Option 1: Continue with External Inference (Current Setup)

**Best for:** Testing, development, or when using edge inference workers

**Current Configuration:**
```yaml
# render.yaml
ANALYTICS_REQUIRE_MODELS=false
```

This allows the service to run without local models. External services can send normalized detections via:
```
POST /internal/frames
POST /internal/detections
```

**No action needed** - your service is already functional in this mode.

---

## Option 2: Deploy Local AI Models (Full Capability)

**Best for:** Production deployments requiring local inference

### Prerequisites

1. **Obtain Licensed ONNX Models**
   - YOLOv8n COCO detector
   - Fire/smoke detector
   - Helmet/head detector
   - Face detector
   - ANPR plate detector
   - ANPR OCR recognizer

2. **Host Models on Secure Storage**
   - Use HTTPS URLs only
   - Options: AWS S3, Azure Blob Storage, Google Cloud Storage, or private CDN
   - Models must be publicly accessible (or configure Render env vars for auth)

### Step-by-Step Deployment

#### Step 1: Configure Environment Variables in Render

In your Render dashboard (https://dashboard.render.com):

1. Navigate to your service: `sentinel-analytics-engine`
2. Go to **Environment** tab
3. Add these variables:

```bash
# Model Provisioning
ANALYTICS_MODEL_LICENSES_ACCEPTED=true
ANALYTICS_REQUIRE_MODELS=true

# YOLOv8n Object Detector
YOLO_MODEL_URL=https://your-storage.com/models/yolov8n.onnx
YOLO_MODEL_SHA256=<64-character-hex-checksum>

# Fire/Smoke Detector
FIRE_SMOKE_MODEL_URL=https://your-storage.com/models/fire-smoke.onnx
FIRE_SMOKE_MODEL_SHA256=<64-character-hex-checksum>

# Helmet Detector
HELMET_MODEL_URL=https://your-storage.com/models/helmet.onnx
HELMET_MODEL_SHA256=<64-character-hex-checksum>

# Face Detector
FACE_DETECTION_MODEL_URL=https://your-storage.com/models/face-detector.onnx
FACE_DETECTION_MODEL_SHA256=<64-character-hex-checksum>

# ANPR Detector
ANPR_DETECTION_MODEL_URL=https://your-storage.com/models/license-plate-detector.onnx
ANPR_DETECTION_MODEL_SHA256=<64-character-hex-checksum>

# ANPR Recognizer
ANPR_RECOGNITION_MODEL_URL=https://your-storage.com/models/license-plate-recognizer.onnx
ANPR_RECOGNITION_MODEL_SHA256=<64-character-hex-checksum>
```

#### Step 2: Update Build Command

In Render dashboard, update the **Build Command**:

```bash
npm install && npm run models:download && npm run models:verify && npm run build
```

This will:
1. Install dependencies
2. Download models from configured URLs
3. Verify SHA-256 checksums
4. Verify models can be loaded by ONNX Runtime
5. Build TypeScript

#### Step 3: Verify Disk Storage

Your `render.yaml` already configures persistent disk:
```yaml
disk:
  name: analytics-models
  mountPath: /opt/render/project/src/analytics-engine/models
  sizeGB: 10
```

✅ This is sufficient for all required models (typically 50-200MB each)

#### Step 4: Deploy

1. Click **Manual Deploy** → **Deploy latest commit**
2. Watch build logs for:
   ```
   OK   yolov8n: downloaded and verified
   OK   fire-smoke: downloaded and verified
   OK   helmet: downloaded and verified
   OK   face-detector: downloaded and verified
   OK   anpr-detector: downloaded and verified
   OK   anpr-recognizer: downloaded and verified
   Provisioned and checksum-verified 6 model(s)
   ```

#### Step 5: Verify AI State

```bash
curl https://sentinel-grid-analytics-engine-6woo.onrender.com/health | jq '.aiState'
# Should return: "AI_OPERATIONAL"
```

---

## Option 3: Hybrid Deployment (Pragmatic)

Deploy only essential models locally, use external workers for specialized tasks.

**Local Models (Deploy):**
- YOLOv8n (general object/person/vehicle detection)
- Fire/smoke (high-priority safety)

**External Workers (Keep using /internal/frames):**
- Face detection (privacy-sensitive, may need specialized hardware)
- ANPR (country-specific, specialized)
- Helmet detection (unless critical for your use case)

**Configuration:**
```bash
ANALYTICS_REQUIRE_MODELS=false  # Allow degraded state
# Only configure URLs for essential models:
YOLO_MODEL_URL=...
YOLO_MODEL_SHA256=...
FIRE_SMOKE_MODEL_URL=...
FIRE_SMOKE_MODEL_SHA256=...
```

---

## Obtaining ONNX Models

### Option A: Pre-trained Public Models (with License Review)

1. **YOLOv8n:** [Ultralytics](https://github.com/ultralytics/ultralytics)
   - Export: `yolo export model=yolov8n.pt format=onnx`
   - License: AGPL-3.0 (review for commercial use)

2. **Specialized Detectors:**
   - Train custom models or use commercial providers
   - Ensure license compatibility with your deployment

### Option B: Commercial Model Providers

- AWS Marketplace
- Azure AI Gallery  
- NVIDIA NGC Catalog
- Roboflow Universe (with export)

### Option C: Internal Training

Train custom YOLOv8 models:
```bash
yolo detect train data=your-dataset.yaml model=yolov8n.pt epochs=100
yolo export model=runs/detect/train/weights/best.pt format=onnx
```

---

## Generating SHA-256 Checksums

After obtaining model files:

**Linux/macOS:**
```bash
sha256sum yolov8n.onnx
```

**Windows PowerShell:**
```powershell
Get-FileHash -Algorithm SHA256 yolov8n.onnx
```

**Node.js:**
```javascript
import { createHash } from 'crypto';
import { createReadStream } from 'fs';

const hash = createHash('sha256');
const stream = createReadStream('yolov8n.onnx');
stream.on('data', chunk => hash.update(chunk));
stream.on('end', () => console.log(hash.digest('hex')));
```

---

## Monitoring and Troubleshooting

### Check Current Status

```bash
# Quick status
curl https://sentinel-grid-analytics-engine-6woo.onrender.com/health | jq '.aiState'

# Full health check
curl https://sentinel-grid-analytics-engine-6woo.onrender.com/health | jq

# Per-camera status (requires authentication)
curl -H "x-analytics-source-key: YOUR_KEY" \
  https://sentinel-grid-analytics-engine-6woo.onrender.com/v1/analytics/cameras/cam123/status
```

### Common Issues

#### Issue: Models fail to download
**Symptoms:** Build fails with "download returned HTTP 403" or "checksum mismatch"

**Solutions:**
- Verify URLs are publicly accessible (test in browser)
- Check SHA-256 checksums are correct (64 hex characters)
- Ensure HTTPS protocol (HTTP is rejected)
- Verify `ANALYTICS_MODEL_LICENSES_ACCEPTED=true`

#### Issue: Out of memory during build
**Symptoms:** Build fails with "JavaScript heap out of memory"

**Solutions:**
- Upgrade to Render Standard plan or higher
- Download models sequentially: `npm run models:download -- yolov8n && npm run models:download -- fire-smoke`
- Reduce concurrent model downloads

#### Issue: Models downloaded but not loaded
**Symptoms:** `aiState: "AI_DEGRADED"` with `modelsLoaded: 0`

**Solutions:**
- Check Render logs for ONNX Runtime errors
- Verify model format is ONNX (not PyTorch .pt)
- Ensure models match expected input shapes (see manifest.json)
- Check disk mount path is correct

#### Issue: Service returns 503
**Symptoms:** Health endpoint returns 503 status

**Solutions:**
- Check `ANALYTICS_REQUIRE_MODELS` setting
- If `true`, ensure all required models are present
- If `false`, check pipeline initialization logs

---

## Performance Optimization

### CPU-Only Deployment (Current)

```bash
ENABLE_GPU_ACCELERATION=false
WORKER_THREADS=4
MAX_CONCURRENT_STREAMS=10
FRAME_PROCESSING_RATE=1
```

**Expected Performance:**
- 1-2 FPS per stream on Render Starter plan
- 10-15 concurrent streams max

### GPU-Enabled Deployment

Requires Render plan with GPU support:

```bash
ENABLE_GPU_ACCELERATION=true
MAX_CONCURRENT_STREAMS=50
FRAME_PROCESSING_RATE=2
```

**Expected Performance:**
- 5-10 FPS per stream
- 50+ concurrent streams

---

## Rollback Plan

If model deployment fails or causes issues:

1. **Immediate Rollback:**
   ```bash
   # In Render dashboard: Environment
   ANALYTICS_REQUIRE_MODELS=false
   ```
   Redeploy → Service returns to degraded but functional state

2. **Remove Specific Models:**
   ```bash
   # Remove problematic model URL/SHA256 variables
   # Keep essential models only
   ```

3. **Full Revert:**
   - Use Render's "Rollback" feature to previous deployment
   - Service returns to original degraded state

---

## Next Steps

**Current Recommendation:** Continue with external inference mode (no action needed)

**When ready for local inference:**
1. Obtain licensed ONNX models
2. Upload to secure HTTPS storage
3. Configure environment variables in Render
4. Update build command
5. Deploy and verify

**Questions?**
- Check build logs in Render dashboard
- Review `/health` endpoint for detailed status
- Test model provisioning locally first: `npm run models:download`

---

## Reference Links

- [Render Dashboard](https://dashboard.render.com)
- [Model Manifest](./models/manifest.json)
- [Provisioning Script](./scripts/provision-models.ts)
- [Health Check Script](./scripts/check-render-status.sh)
- [Environment Variables](./.env.example)
