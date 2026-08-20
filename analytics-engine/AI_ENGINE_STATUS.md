# AI Engine Status - Quick Reference

## Current Deployment

**Service URL:** https://sentinel-grid-analytics-engine-6woo.onrender.com  
**Current State:** 🟡 **AI_DEGRADED** (Functional but no local inference)  
**Date Checked:** 2026-08-20

## What's Working ✅

- Service is online and responding
- Health endpoint accessible: `/health`
- Can accept external detections: `POST /internal/detections`
- Can accept normalized frames: `POST /internal/frames`
- Pipeline initialized successfully
- Motion, zone, and camera health detectors operational
- Queue, heatmap, and tracking systems working
- Analog camera quality/aging analytics active

## What's Missing ❌

**6 Required ONNX Models Not Found:**

| Model | Purpose | Path |
|-------|---------|------|
| yolov8n | General object detection (person, vehicle, etc.) | `/app/models/detection/yolov8n.onnx` |
| fire-smoke | Fire and smoke detection | `/app/models/safety/fire-smoke.onnx` |
| helmet | Helmet and head detection | `/app/models/safety/helmet.onnx` |
| face-detector | Face detection | `/app/models/face/face-detector.onnx` |
| anpr-detector | License plate detection | `/app/models/vehicle/license-plate-detector.onnx` |
| anpr-recognizer | License plate OCR | `/app/models/vehicle/license-plate-recognizer.onnx` |

## Understanding the Status

### AI States Explained

| Status | What It Means | Your Service |
|--------|---------------|--------------|
| **AI_OPERATIONAL** | All models loaded, full local inference | ❌ Not yet |
| **AI_DEGRADED** | Service working but models missing | ✅ Current state |
| **AI_UNAVAILABLE** | Pipeline initialization failed | ❌ Not applicable |

**Degraded mode is intentional** - your service is configured to work without models by accepting external detections.

## Quick Health Check

```bash
# Check overall status
curl https://sentinel-grid-analytics-engine-6woo.onrender.com/health | jq '.aiState'

# Expected output: "AI_DEGRADED"
```

## How to Make It Fully Operational

### Quick Answer
You need to either:

**Option 1:** Deploy ONNX model files to Render (see RENDER_DEPLOYMENT_GUIDE.md)  
**Option 2:** Continue using external inference workers (current setup, no changes needed)

### Which Option Should You Choose?

**Use Option 1 (Deploy Models) if:**
- You need local frame analysis
- You have ONNX model files ready
- You want standalone operation
- You have model hosting (S3, etc.)

**Use Option 2 (External Inference) if:**
- You're testing or developing
- Models aren't ready yet
- You have edge workers doing inference
- You want to keep costs low

## Current Configuration

```yaml
# From render.yaml
ANALYTICS_REQUIRE_MODELS: false  # Allows degraded state
ENABLE_GPU_ACCELERATION: false
PORT: 3000
NODE_ENV: production

# Models would need to be downloaded from:
# - Environment variables: *_MODEL_URL
# - Verified with: *_MODEL_SHA256
```

## Next Steps (If Deploying Models)

1. **Get Model Files** (with licenses)
   - Train custom models OR
   - Use public models (review licenses) OR
   - Purchase commercial models

2. **Upload to Secure Storage**
   - AWS S3, Google Cloud Storage, Azure Blob, etc.
   - Must be HTTPS accessible

3. **Configure Render Environment**
   - Add `*_MODEL_URL` variables
   - Add `*_MODEL_SHA256` checksums
   - Set `ANALYTICS_MODEL_LICENSES_ACCEPTED=true`
   - Set `ANALYTICS_REQUIRE_MODELS=true`

4. **Update Build Command**
   ```bash
   npm install && npm run models:download && npm run build
   ```

5. **Deploy & Verify**
   ```bash
   curl https://sentinel-grid-analytics-engine-6woo.onrender.com/health | jq '.aiState'
   # Should return: "AI_OPERATIONAL"
   ```

## Important Notes

⚠️ **The service is NOT broken** - it's working as designed in external inference mode

⚠️ **Don't panic about "degraded"** - it's a valid operational state when models aren't needed

⚠️ **Authentication required** - Most endpoints need `x-analytics-source-key` header (except `/health`)

## Troubleshooting

### Issue: Can't access the service
**Check:** Are you trying to access authenticated endpoints?  
**Solution:** Use `/health` endpoint or provide `x-analytics-source-key` header

### Issue: Want to test with local models
**Check:** See RENDER_DEPLOYMENT_GUIDE.md  
**Solution:** Follow model deployment steps

### Issue: Need to verify what's working
**Check:** Review `/health` endpoint JSON  
**Solution:** Look at `pipeline.detectors` for detailed status of each component

## Monitoring Commands

```bash
# Full health report
curl https://sentinel-grid-analytics-engine-6woo.onrender.com/health | jq

# Just AI state
curl https://sentinel-grid-analytics-engine-6woo.onrender.com/health | jq '.aiState'

# Model status
curl https://sentinel-grid-analytics-engine-u2sf.onrender.com/health | jq '.pipeline.models'

# Active detectors
curl https://sentinel-grid-analytics-engine-u2sf.onrender.com/health | jq '.pipeline.detectors | with_entries(select(.value.status == "healthy"))'
```

## Documentation

- 📘 **Full Deployment Guide:** [RENDER_DEPLOYMENT_GUIDE.md](./RENDER_DEPLOYMENT_GUIDE.md)
- 📋 **Model Manifest:** [models/manifest.json](./models/manifest.json)
- 📝 **Model Documentation:** [models/README.md](./models/README.md)
- ⚙️ **Environment Variables:** [.env.example](./.env.example)
- 🔧 **Provisioning Script:** [scripts/provision-models.ts](./scripts/provision-models.ts)

---

**Last Updated:** 2026-08-15  
**Service Version:** 0.1.0  
**Deployment:** Render (Oregon region)
