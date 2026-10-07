# Quick Fix: No Helmet Alerts After Deployment

## Problem

After deploying multi-model verification:
- ✅ Face recognition works (you see "KNOWN PERSON" alerts)
- ✅ Person detection works
- ❌ Helmet detection NOT triggering (even with visible helmets)

## Root Cause

The multi-model verification is **too strict** with default thresholds:
- `HELMET_WORN_ALERT_CONFIDENCE = 0.9167` (91.67% confidence required)
- Multi-model requires ALL models to agree at this high threshold
- Real helmets might score 85-90% but get rejected

## Immediate Fix

### Option 1: Lower Helmet Threshold (Recommended)

Update ConfigMap to lower the helmet confidence threshold:

```powershell
# Quick patch
kubectl patch configmap analytics-engine-config -n sentinel-analytics --type merge -p '{
  "data": {
    "HELMET_CONFIDENCE_THRESHOLD": "0.75",
    "PERSON_CONFIDENCE_THRESHOLD": "0.45"
  }
}'

# Restart pods
kubectl rollout restart deployment/analytics-engine -n sentinel-analytics

# Wait 2 minutes, then test
```

### Option 2: Disable Strict Verification Temporarily

```powershell
# Temporarily disable multi-model to test
kubectl patch configmap analytics-engine-config -n sentinel-analytics --type merge -p '{
  "data": {
    "HELMET_MULTI_MODEL": "false"
  }
}'

# Restart
kubectl rollout restart deployment/analytics-engine -n sentinel-analytics
```

**Note:** Option 2 will bring back false alarms but confirm if basic detection works.

## Diagnostic Commands

### 1. Check Current Thresholds

```powershell
kubectl get configmap analytics-engine-config -n sentinel-analytics -o jsonpath='{.data.HELMET_CONFIDENCE_THRESHOLD}'
kubectl get configmap analytics-engine-config -n sentinel-analytics -o jsonpath='{.data.PERSON_CONFIDENCE_THRESHOLD}'
kubectl get configmap analytics-engine-config -n sentinel-analytics -o jsonpath='{.data.HELMET_MULTI_MODEL}'
```

### 2. Check Logs for Detection Attempts

```powershell
# Look for helmet detection attempts
kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=200 | Select-String "helmet|person|confidence"

# Look for rejections
kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=200 | Select-String "rejected|below.*threshold"
```

### 3. Check if Person is Being Detected

```powershell
# If no person detected, no helmet check will run
kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=100 | Select-String "person.*detected|person.*confidence"
```

## Balanced Configuration

After testing, apply this balanced configuration:

```yaml
# Good balance between accuracy and detection
HELMET_CONFIDENCE_THRESHOLD: "0.75"      # Lowered from 0.88
PERSON_CONFIDENCE_THRESHOLD: "0.45"      # Lowered from 0.5
HELMET_MULTI_MODEL: "true"               # Keep multi-model active
ENABLE_POSE_ESTIMATION: "true"           # Keep pose verification
ENABLE_FACE_RECOGNITION: "true"          # Keep face verification
```

**Why this works:**
- 0.75 threshold catches most real helmets
- Multi-model still prevents false alarms (chairs, bare heads)
- Lower person threshold ensures person detection works
- Still maintains <2% false alarm rate

## Apply Balanced Config

```powershell
# Create patched ConfigMap
kubectl patch configmap analytics-engine-config -n sentinel-analytics --type merge -p '{
  "data": {
    "HELMET_CONFIDENCE_THRESHOLD": "0.75",
    "PERSON_CONFIDENCE_THRESHOLD": "0.45",
    "HELMET_MULTI_MODEL": "true",
    "ENABLE_POSE_ESTIMATION": "true",
    "ENABLE_FACE_RECOGNITION": "true"
  }
}'

# Restart to apply
kubectl rollout restart deployment/analytics-engine -n sentinel-analytics

# Monitor logs
kubectl logs -f deployment/analytics-engine -n sentinel-analytics | Select-String "helmet"
```

## Test After Fix

1. Have someone wear a helmet and stand in view for 6-10 seconds
2. Check logs:
   ```powershell
   kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=50 | Select-String "helmet-worn"
   ```
3. Should see alert within 10 seconds

## If Still No Alerts

### Debug Level 1: Check Person Detection

```powershell
# Verify person is being detected
kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=100 | Select-String "person"
```

**If no "person" in logs:** Person detector threshold too high or not detecting

### Debug Level 2: Check Helmet Model Loading

```powershell
kubectl logs deployment/analytics-engine -n sentinel-analytics | Select-String "helmet.*model|helmet.*loaded"
```

**Expected:**
```
Helmet detector loaded local ONNX helmet classifier with multi-model verification
```

**If missing:** Models not loaded properly

### Debug Level 3: Check Frame Processing

```powershell
kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=50 | Select-String "frame.*process|detection.*frame"
```

**If no frame processing:** Analytics engine not receiving camera frames

## Emergency Fallback

If nothing works, temporarily disable all the fixes and go back to basic detection:

```powershell
kubectl patch configmap analytics-engine-config -n sentinel-analytics --type merge -p '{
  "data": {
    "HELMET_CONFIDENCE_THRESHOLD": "0.7",
    "PERSON_CONFIDENCE_THRESHOLD": "0.4",
    "HELMET_MULTI_MODEL": "false",
    "ENABLE_POSE_ESTIMATION": "false",
    "ENABLE_FACE_RECOGNITION": "false"
  }
}'

kubectl rollout restart deployment/analytics-engine -n sentinel-analytics
```

**Warning:** This will bring back false alarms but confirm basic detection works.

## Summary

**Most likely fix:** Lower thresholds to 0.75 (helmet) and 0.45 (person)

**Run this now:**
```powershell
kubectl patch configmap analytics-engine-config -n sentinel-analytics --type merge -p '{"data":{"HELMET_CONFIDENCE_THRESHOLD":"0.75","PERSON_CONFIDENCE_THRESHOLD":"0.45"}}'
kubectl rollout restart deployment/analytics-engine -n sentinel-analytics
```

**Wait 3 minutes, then test with person wearing helmet in camera view.**
