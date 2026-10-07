# Actual Deployment Steps - Walking Person Fix

## Current Status
❌ Code changes made locally but NOT deployed to GCP yet  
✅ File edited: `analytics-engine/src/detectors/helmet-detector.ts`  
❌ Not compiled, not built, not deployed  

## You Need to Deploy These Changes

### Step 1: Commit the Code Changes

```powershell
# Navigate to project root
cd C:\Omsystems\Omsystems

# Check what changed
git status
git diff analytics-engine/src/detectors/helmet-detector.ts

# Stage the changes
git add analytics-engine/src/detectors/helmet-detector.ts
git add WALKING_PERSON_DETECTION_FIX.md
git add DEPLOY_WALKING_FIX.md

# Commit
git commit -m "fix: detect walking persons with helmets - lower person detection threshold to 0.35"

# Push to trigger Antigravity deployment
git push origin main
```

### Step 2: Wait for Antigravity Build

Antigravity should automatically:
1. ✅ Build TypeScript → JavaScript
2. ✅ Build Docker image
3. ✅ Push to container registry
4. ✅ Deploy to GCP Kubernetes
5. ✅ Restart analytics-engine pods

**This typically takes 5-10 minutes.**

### Step 3: Verify Deployment

```powershell
# Watch pod rollout
kubectl get pods -n sentinel-analytics -l app=analytics-engine -w

# Wait for new pods to be Running (AGE should be < 5 minutes)

# Check logs show new code
kubectl logs -n sentinel-analytics deployment/analytics-engine --tail=20
```

### Step 4: Test Again

Once new pods are running:
1. Person wears helmet
2. Walks across camera view
3. Alert should appear within 10-20 seconds

---

## Alternative: Manual Build (If Antigravity Not Configured)

If Antigravity doesn't auto-deploy, you need to manually build:

```powershell
cd analytics-engine

# Install dependencies (if not done)
npm install

# Build TypeScript to JavaScript
npm run build

# Check build output
ls dist/detectors/helmet-detector.js

# Build Docker image
docker build -t gcr.io/YOUR-PROJECT/analytics-engine:walking-fix .

# Push to registry
docker push gcr.io/YOUR-PROJECT/analytics-engine:walking-fix

# Update Kubernetes deployment
kubectl set image deployment/analytics-engine `
  analytics-engine=gcr.io/YOUR-PROJECT/analytics-engine:walking-fix `
  -n sentinel-analytics

# Wait for rollout
kubectl rollout status deployment/analytics-engine -n sentinel-analytics
```

---

## Check Current Deployment

Run this to see if your changes are actually deployed:

```powershell
# Get the currently running image
kubectl get deployment analytics-engine -n sentinel-analytics -o jsonpath='{.spec.template.spec.containers[0].image}'

# Check pod creation time (should be recent if deployed)
kubectl get pods -n sentinel-analytics -l app=analytics-engine -o wide
```

If the pod AGE is more than 30 minutes, **the new code is NOT deployed yet**.

---

## Summary

**You need to:**
1. ✅ Commit the code changes to Git
2. ✅ Push to trigger Antigravity deployment  
   OR manually build and deploy
3. ✅ Wait for new pods to start (5-10 min)
4. ✅ Test again with person wearing helmet

**The file changes alone don't deploy to production - you need the build/deploy step!**
