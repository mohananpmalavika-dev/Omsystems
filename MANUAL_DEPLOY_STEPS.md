# Manual Deployment Steps for Walking Person Detection Fix

## Your Current Setup
- ✅ GCP VM running Docker Compose (NOT Kubernetes)
- ✅ Code location: `/opt/sentinel-grid/` on GCP VM
- ✅ Analytics engine container: `sentinel-gcp-analytics-engine`
- ✅ Deployment file: `/opt/sentinel-grid/deploy/gcp/docker-compose.gcp.yml`

## What Changed
Modified `analytics-engine/src/detectors/helmet-detector.ts`:
- Person detection threshold: **0.45 → 0.35** (detects walking persons)
- IoU tracking: **0.3 → 0.2** (maintains tracking across movement)
- Spatial proximity: **30% → 40%** (tracks fast-walking persons)
- Height requirements: **0.25 → 0.20** (detects partial visibility)

---

## Deployment Method 1: Automated Script (Recommended)

### Prerequisites
1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
2. Authenticate: `gcloud auth login`
3. Set project: `gcloud config set project YOUR_PROJECT_ID`

### Run Deployment Script
```powershell
cd C:\Omsystems\Omsystems
.\DEPLOY_WALKING_FIX_GCP.ps1
```

This script will:
1. Build TypeScript → JavaScript locally
2. Commit and push changes to Git
3. SSH into GCP VM
4. Pull latest code
5. Rebuild analytics-engine Docker image
6. Restart container

---

## Deployment Method 2: Manual Steps

### Step 1: Build Locally (Optional - Verify Build Works)
```powershell
cd C:\Omsystems\Omsystems\analytics-engine
npm install
npm run build
```

Verify the fix:
```powershell
Select-String -Path "dist\detectors\helmet-detector.js" -Pattern "PERSON_CONFIDENCE\s*=\s*0\.35"
```

Should show: `PERSON_CONFIDENCE = 0.35`

### Step 2: Commit and Push Changes
```powershell
cd C:\Omsystems\Omsystems
git add analytics-engine/src/detectors/helmet-detector.ts
git commit -m "fix: lower person detection threshold to 0.35 for walking persons"
git push origin main
```

### Step 3: SSH into GCP VM
Using GCP Console:
1. Go to https://console.cloud.google.com/compute/instances
2. Find your VM (likely named `sentinel-grid-vm` or similar)
3. Click "SSH" button

Or using gcloud CLI:
```bash
gcloud compute ssh YOUR_VM_NAME --project=YOUR_PROJECT --zone=YOUR_ZONE
```

### Step 4: Update Code on VM
```bash
cd /opt/sentinel-grid
git fetch origin main
git reset --hard origin/main
```

### Step 5: Rebuild Analytics Engine
```bash
cd deploy/gcp
docker compose -f docker-compose.gcp.yml build analytics-engine
```

This will:
- Run `npm run build` inside Docker
- Compile TypeScript → JavaScript with new thresholds
- Create new Docker image

### Step 6: Restart Container
```bash
docker compose -f docker-compose.gcp.yml up -d analytics-engine
```

### Step 7: Verify Deployment
```bash
# Check container is running
docker ps | grep analytics-engine

# Should show:
# sentinel-gcp-analytics-engine   Up X seconds   8092/tcp

# Check logs for successful startup
docker logs sentinel-gcp-analytics-engine --tail=50
```

Look for these log messages:
- ✅ `Helmet detector loaded local ONNX helmet classifier with multi-model verification`
- ✅ `Pose estimation model loaded`
- ✅ `Face detection model loaded`
- ✅ `Analytics engine listening on port 8092`

---

## Deployment Method 3: Quick Rebuild (If Already on VM)

If you're already SSH'd into the GCP VM:

```bash
cd /opt/sentinel-grid/deploy/gcp

# Quick rebuild and restart
docker compose -f docker-compose.gcp.yml build analytics-engine && \
docker compose -f docker-compose.gcp.yml up -d analytics-engine && \
docker logs -f sentinel-gcp-analytics-engine
```

---

## Verify the Fix is Deployed

### Check Container Logs
```bash
docker logs sentinel-gcp-analytics-engine --tail=100
```

### Watch Live Logs
```bash
docker logs -f sentinel-gcp-analytics-engine
```

Look for person detections:
```
[HELMET] person detected: confidence=0.37, bbox={x:0.3, y:0.2, w:0.15, h:0.4}
[HELMET] confirmation 1/3 for person
[HELMET] confirmation 2/3 for person
[HELMET] confirmation 3/3 - triggering alert
[EVENT] helmet-worn detected: confidence=0.82
```

### Test with Real Helmet
1. Have someone wear a helmet
2. Walk across camera view (2-3 seconds)
3. Wait 10-20 seconds
4. Check dashboard for "HELMET WORN" alert

---

## Troubleshooting

### Container Won't Start
```bash
docker ps -a | grep analytics-engine
docker logs sentinel-gcp-analytics-engine
```

Common issues:
- **Model files missing**: Check `/opt/sentinel-grid/analytics-engine/models/` exists
- **Build failed**: Check `docker compose build` output for errors
- **Port conflict**: Another service using port 8092

### No Alerts Generated

#### Check 1: Is Person Being Detected?
```bash
docker logs sentinel-gcp-analytics-engine --tail=500 | grep "person"
```

If NO person detections:
- Person confidence too low (need to lower further)
- Camera angle/quality issue
- Person not in frame long enough

If YES person detections but NO helmet:
- Person isn't wearing a helmet (correct behavior!)
- Helmet confidence too low
- Multi-model verification rejecting it

#### Check 2: Are Models Loaded?
```bash
docker logs sentinel-gcp-analytics-engine --tail=200 | grep -E "model|loaded"
```

Should see:
- ✅ Helmet classifier loaded
- ✅ Head localizer loaded
- ✅ Pose estimator loaded
- ✅ Face detector loaded

If models missing:
```bash
# Check models directory
docker exec sentinel-gcp-analytics-engine ls -la /app/models/

# Should show:
# safety/helmet-head-localizer.onnx
# pose/yolov8n-pose.onnx
# face/face-detector.onnx
```

#### Check 3: Environment Variables
```bash
docker exec sentinel-gcp-analytics-engine env | grep HELMET
```

Should show:
```
HELMET_FAST_ALERT=true
HELMET_MULTI_MODEL=true
ENABLE_POSE_ESTIMATION=true
ENABLE_FACE_RECOGNITION=true
```

### Still No Alerts After Walking with Helmet

If you've:
- ✅ Rebuilt and restarted container
- ✅ Verified person detection in logs
- ✅ Confirmed models are loaded
- ✅ Tested with someone ACTUALLY wearing a helmet

Then we need to lower thresholds further or disable multi-model verification temporarily:

```bash
# Edit docker-compose.gcp.yml
cd /opt/sentinel-grid/deploy/gcp
nano docker-compose.gcp.yml

# Change these under analytics-engine environment:
HELMET_MULTI_MODEL: "false"  # Temporarily disable for testing
HELMET_FAST_ALERT: "true"    # Keep fast alerts enabled

# Restart
docker compose -f docker-compose.gcp.yml up -d analytics-engine
```

---

## Rollback (If Needed)

### Quick Rollback via Git
```bash
cd /opt/sentinel-grid
git revert HEAD  # Undo last commit
cd deploy/gcp
docker compose -f docker-compose.gcp.yml build analytics-engine
docker compose -f docker-compose.gcp.yml up -d analytics-engine
```

### Rollback to Specific Commit
```bash
cd /opt/sentinel-grid
git log --oneline  # Find commit hash before the change
git checkout <commit-hash>
cd deploy/gcp
docker compose -f docker-compose.gcp.yml build analytics-engine
docker compose -f docker-compose.gcp.yml up -d analytics-engine
```

---

## Quick Reference Commands

```bash
# Rebuild and restart
cd /opt/sentinel-grid/deploy/gcp
docker compose -f docker-compose.gcp.yml build analytics-engine && \
docker compose -f docker-compose.gcp.yml up -d analytics-engine

# View logs
docker logs -f sentinel-gcp-analytics-engine

# Check container status
docker ps | grep analytics-engine

# Restart without rebuild
docker compose -f docker-compose.gcp.yml restart analytics-engine

# Stop analytics engine
docker compose -f docker-compose.gcp.yml stop analytics-engine

# Start analytics engine
docker compose -f docker-compose.gcp.yml start analytics-engine

# View environment variables
docker exec sentinel-gcp-analytics-engine env | grep -E "HELMET|PERSON|ENABLE"
```

---

## Success Criteria

After deployment, you should see:

### In Logs
```
✅ person detected: confidence=0.37
✅ confirmation 1/3
✅ confirmation 2/3  
✅ confirmation 3/3
✅ helmet-worn alert triggered
```

### In Dashboard
```
✅ "HELMET WORN" alert appears
✅ Bounding box around person
✅ Bounding box around helmet
✅ Confidence score 0.75-0.95
✅ Alert within 10-20 seconds of walking
```

### What Should NOT Happen
```
❌ No alerts on empty chairs
❌ No alerts on bare heads
❌ No alerts on dark objects
❌ No alerts on people WITHOUT helmets
```

---

## Contact Points for Issues

If deployment fails or alerts still don't work:

1. **Share container logs**: `docker logs sentinel-gcp-analytics-engine > debug.log`
2. **Share environment**: `docker exec sentinel-gcp-analytics-engine env > env.log`
3. **Share test video**: Screenshot or recording of person walking with helmet
4. **Share current behavior**: What IS happening vs what SHOULD happen

---

**Last Updated**: 2026-10-07  
**Target System**: GCP VM with Docker Compose  
**Container Name**: sentinel-gcp-analytics-engine  
**Deployment File**: `/opt/sentinel-grid/deploy/gcp/docker-compose.gcp.yml`
