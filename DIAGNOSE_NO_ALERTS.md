# No Alerts Troubleshooting Guide

## Immediate Diagnostic Steps

### 1. Check if Analytics Engine is Running

```powershell
# Check pod status
kubectl get pods -n sentinel-analytics -l app=analytics-engine

# Should show:
# NAME                                READY   STATUS    RESTARTS   AGE
# analytics-engine-xxxxxxxxxx-xxxxx   1/1     Running   0          10m
```

**If pods are not running:**
- Apply the ConfigMap first
- Then restart the deployment

### 2. Check Analytics Engine Logs

```powershell
# Check for errors
kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=100

# Look for:
# - "Analytics engine started"
# - "Helmet detector loaded"
# - "Processing frame from camera"
# - Any ERROR or WARNING messages
```

### 3. Check if Cameras are Connected

```powershell
# Check camera registration
kubectl exec -it deployment/analytics-engine -n sentinel-analytics -- \
  curl -s http://localhost:8092/v1/analytics/cameras | jq .

# Or from your control plane
curl http://<control-plane-url>/v1/cameras | jq .
```

### 4. Check if Analytics Rules are Enabled

The most common reason for "no alerts" is **analytics rules not configured for the cameras**.

```powershell
# Check if cameras have analytics rules enabled
kubectl logs deployment/analytics-engine -n sentinel-analytics | Select-String "camera.*rule"
```

---

## Common Causes of "No Alerts"

### Cause 1: Analytics Rules Not Enabled on Cameras ⚠️

**Problem:** Even with models loaded, cameras need analytics rules configured.

**Solution:**

1. **Go to Control Plane Dashboard**
2. **Navigate to:** Analytics → Camera Rules
3. **For each camera:**
   - Enable "Helmet Detection" rule
   - Enable "Face Recognition" rule (if using)
   - Set appropriate zones (optional)
   - Save configuration

**Or via API:**
```powershell
# Enable helmet detection rule for a camera
curl -X POST http://<control-plane-url>/v1/analytics/rules `
  -H "Content-Type: application/json" `
  -d '{
    "cameraId": "your-camera-id",
    "ruleType": "helmet",
    "enabled": true,
    "confidence": 0.88
  }'
```

### Cause 2: Camera Frames Not Reaching Analytics Engine

**Check frame submission:**
```powershell
# Check if frames are being processed
kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=50 | Select-String "frame"

# Should see messages like:
# "Processing frame from camera: camera-id"
# "Frame processed in Xms"
```

**If no frame messages:**
- Cameras may not be streaming to analytics engine
- Check camera → control plane → analytics engine pipeline

### Cause 3: Models Not Loaded

```powershell
# Check model loading
kubectl logs deployment/analytics-engine -n sentinel-analytics | Select-String "model|onnx"

# Should see:
# "Helmet detector loaded local ONNX helmet classifier with multi-model verification"
# "Pose estimation model loaded: yolov8n-pose.onnx"
```

**If models not loaded:**
- Check models exist in PVC
- Check ConfigMap has correct model paths

### Cause 4: Detection Confidence Too High

**Current thresholds might be too strict.**

Check current settings:
```powershell
kubectl get configmap analytics-engine-config -n sentinel-analytics -o jsonpath='{.data.HELMET_CONFIDENCE_THRESHOLD}'
kubectl get configmap analytics-engine-config -n sentinel-analytics -o jsonpath='{.data.PERSON_CONFIDENCE_THRESHOLD}'
```

**If too high (>0.9):**
- Lower HELMET_CONFIDENCE_THRESHOLD to 0.75
- Lower PERSON_CONFIDENCE_THRESHOLD to 0.4

### Cause 5: Analytics Engine Not Receiving Camera Feed

**Check connection:**
```powershell
# Check analytics engine health
kubectl port-forward deployment/analytics-engine -n sentinel-analytics 8092:8092

# In another window:
Invoke-RestMethod http://localhost:8092/health | ConvertTo-Json

# Should return:
# {
#   "status": "healthy",
#   "aiState": "AI_OPERATIONAL"
# }
```

---

## Quick Fix Checklist

Run these commands in order:

```powershell
# 1. Verify ConfigMap is applied
kubectl get configmap analytics-engine-config -n sentinel-analytics -o yaml | Select-String "HELMET_MULTI_MODEL"
# Should output: HELMET_MULTI_MODEL: "true"

# 2. Verify pods are running
kubectl get pods -n sentinel-analytics -l app=analytics-engine
# All should be "Running" 1/1

# 3. Check recent logs for errors
kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=100 | Select-String "error|warn" -CaseSensitive

# 4. Verify frame processing
kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=20 | Select-String "frame|detection"

# 5. Check if ANY analytics rules exist
kubectl logs deployment/analytics-engine -n sentinel-analytics | Select-String "rule" | Select-Object -First 10
```

---

## Test Alert Manually

### Option 1: Via API (Test Endpoint)

```powershell
# Submit a test frame with a person
curl -X POST http://localhost:8092/v1/analytics/detect `
  -H "Content-Type: application/json" `
  -d '{
    "cameraId": "test-camera",
    "timestamp": "'$(Get-Date -Format o)'",
    "objects": [
      {
        "label": "person",
        "confidence": 0.95,
        "boundingBox": {"x": 0.3, "y": 0.2, "width": 0.2, "height": 0.6}
      },
      {
        "label": "helmet",
        "confidence": 0.92,
        "boundingBox": {"x": 0.35, "y": 0.2, "width": 0.1, "height": 0.15}
      }
    ]
  }'
```

**Expected:** Should receive detection result immediately

### Option 2: Check Database for Recent Detections

```powershell
# Connect to database
kubectl exec -it deployment/analytics-engine -n sentinel-analytics -- \
  psql $DATABASE_URL -c "SELECT detection_type, camera_id, occurred_at FROM analytics_events ORDER BY occurred_at DESC LIMIT 10;"
```

---

## Specific Fixes

### Fix 1: Enable Analytics Rules (Most Common)

**If rules are not enabled, NO alerts will trigger even with perfect detection.**

1. **Access Control Plane Dashboard**
2. **Go to: Analytics → Camera Configuration**
3. **For EACH camera showing in "Live branch coverage":**
   - Enable "Helmet Detection"
   - Enable "Person Detection"
   - Enable "Face Recognition" (if using)
   - Set confidence thresholds (0.7 for helmet, 0.5 for person)
   - Click "Save"

4. **Verify rules applied:**
```powershell
kubectl logs deployment/analytics-engine -n sentinel-analytics | Select-String "rule.*enabled"
```

### Fix 2: Lower Detection Thresholds (If Too Strict)

Update ConfigMap:
```powershell
kubectl patch configmap analytics-engine-config -n sentinel-analytics --type merge -p '{
  "data": {
    "HELMET_CONFIDENCE_THRESHOLD": "0.75",
    "PERSON_CONFIDENCE_THRESHOLD": "0.4"
  }
}'

kubectl rollout restart deployment/analytics-engine -n sentinel-analytics
```

### Fix 3: Verify Camera is Streaming

```powershell
# Check if camera is registered and streaming
kubectl exec -it deployment/analytics-engine -n sentinel-analytics -- \
  curl http://localhost:8092/v1/analytics/cameras/status
```

---

## Debug Output Commands

Run these and share output if issue persists:

```powershell
# 1. Pod status
kubectl get pods -n sentinel-analytics -l app=analytics-engine

# 2. Recent logs
kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=100 > analytics-logs.txt

# 3. ConfigMap
kubectl get configmap analytics-engine-config -n sentinel-analytics -o yaml > configmap-current.yaml

# 4. Health check
kubectl port-forward deployment/analytics-engine -n sentinel-analytics 8092:8092 &
Start-Sleep 3
Invoke-RestMethod http://localhost:8092/health | ConvertTo-Json > health.json

# 5. Check database for any detections
kubectl exec -it deployment/analytics-engine -n sentinel-analytics -- \
  psql $DATABASE_URL -c "SELECT COUNT(*) as detection_count, detection_type FROM analytics_events WHERE occurred_at > NOW() - INTERVAL '1 hour' GROUP BY detection_type;" > recent-detections.txt
```

---

## Most Likely Issue

Based on "no alerts" symptom, **99% of the time it's**:

### ⚠️ Analytics Rules Not Enabled on Cameras

**Quick Check:**
1. Go to your Control Plane dashboard
2. Navigate to Analytics → Camera Rules
3. Check if your cameras (from the screenshot) have ANY rules enabled
4. If all rules show "Disabled", that's your issue

**Quick Fix:**
Enable rules for each camera via dashboard or API.

---

## Contact Support With:

If still no alerts after enabling rules:

1. `analytics-logs.txt`
2. `configmap-current.yaml`
3. `health.json`
4. `recent-detections.txt`
5. Screenshot of Camera Rules configuration
6. Screenshot showing "no alerts"

---

**Most Common Solution:** Enable analytics rules on cameras in Control Plane dashboard → Analytics → Camera Rules
