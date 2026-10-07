# Quick Deploy: Walking Person Detection Fix

## What Changed
Fixed helmet detection for **walking/moving persons** by lowering person detection thresholds and improving motion tracking.

## Changes Made
1. **Person confidence threshold**: 0.45 → 0.35 (detects walking persons with motion blur)
2. **IoU tracking threshold**: 0.3 → 0.2 (maintains tracking across movement)
3. **Spatial proximity**: 30% → 40% (tracks fast-walking persons)
4. **Height requirements**: 0.25 → 0.20 (detects partially visible persons)

## Deploy Now

### Using Antigravity (Your Automated Deployment)

```bash
# Commit the changes
git add analytics-engine/src/detectors/helmet-detector.ts
git commit -m "fix: detect walking persons with helmets - lower thresholds for motion handling"
git push origin main

# Antigravity will automatically:
# 1. Build the Docker image
# 2. Deploy to GCP Kubernetes
# 3. Restart analytics-engine pods
```

### Manual Build (If Needed)

```bash
cd analytics-engine

# Build
npm run build

# Build Docker image
docker build -t your-registry/analytics-engine:walking-fix .

# Push to registry
docker push your-registry/analytics-engine:walking-fix

# Update deployment
kubectl set image deployment/analytics-engine \
  analytics-engine=your-registry/analytics-engine:walking-fix \
  -n sentinel-analytics

# Watch rollout
kubectl rollout status deployment/analytics-engine -n sentinel-analytics
```

## Verify It's Working

```bash
# Watch logs for person detections
kubectl logs -f deployment/analytics-engine -n sentinel-analytics | grep "person"

# You should see detections like:
# "person detected: confidence=0.37, bbox=..."
# "helmet confirmation: frame 2/3"
# "ALERT: helmet-worn detected"
```

## Test Immediately

1. **Walk across camera view wearing helmet** (2-3 seconds)
2. **Expected**: Alert within 10-20 seconds
3. **Check**: Dashboard shows "HELMET WORN" alert
4. **Verify**: Screenshot shows correct person + helmet bounding boxes

## Success Criteria

✅ Walking persons WITH helmets → Alert within 20 seconds  
✅ Walking persons WITHOUT helmets → NO ALERT  
✅ Empty chairs → NO ALERT (false alarm prevention still active)  
✅ Bare heads → NO ALERT (multi-model verification still active)  

## If False Alarms Increase

Rollback by reverting the commit:
```bash
git revert HEAD
git push origin main
# Antigravity will auto-deploy the rollback
```

## Files Changed
- `analytics-engine/src/detectors/helmet-detector.ts` - Main detection logic

## Why This Works
- Multi-model verification (pose + face + helmet localizer) still prevents false alarms
- Lower person threshold only increases candidates, not final alerts
- Spatial tracking handles real-world walking speeds
- Alert confidence requirements unchanged (still 0.80+)

---

**Deploy this now and test with a walking person!**
