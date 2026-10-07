# Build and Deploy Analytics Engine to GCP

## Changes Applied

1. **Multi-model verification** - Eliminates false alarms from bare heads/chairs
2. **Moving person fix** - Handles helmet wearers who are walking/running

---

## Quick Deploy (Automated)

```powershell
cd C:\Omsystems\Omsystems\analytics-engine

# Step 1: Build the application
npm run build

# Step 2: Build Docker image
docker build -t aditisentinel/analytics-engine:2.0.1-helmet-fix .

# Step 3: Push to registry (requires docker login)
docker push aditisentinel/analytics-engine:2.0.1-helmet-fix

# Step 4: Apply ConfigMap changes
kubectl apply -f k8s/configmap-helmet-fix.yaml

# Step 5: Update deployment
kubectl set image deployment/analytics-engine `
  analytics-engine=aditisentinel/analytics-engine:2.0.1-helmet-fix `
  -n sentinel-analytics

# Step 6: Monitor rollout
kubectl rollout status deployment/analytics-engine -n sentinel-analytics
```

---

## Step-by-Step Instructions

### Prerequisites

1. **Docker installed and logged in:**
   ```powershell
   docker --version
   docker login
   ```

2. **kubectl configured for GCP:**
   ```powershell
   kubectl cluster-info
   kubectl config current-context
   ```

3. **Node.js dependencies installed:**
   ```powershell
   cd analytics-engine
   npm install
   ```

---

### Step 1: Build TypeScript to JavaScript

```powershell
cd C:\Omsystems\Omsystems\analytics-engine
npm run build
```

**Expected output:**
```
> analytics-engine@2.0.0 build
> tsc && node fix-imports.mjs

✓ TypeScript compilation complete
✓ Import paths fixed
✓ Build artifacts in /dist
```

**Verify build:**
```powershell
dir dist\detectors\helmet-detector.js
```

---

### Step 2: Build Docker Image

```powershell
docker build -t aditisentinel/analytics-engine:2.0.1-helmet-fix .
```

**This will:**
- Copy built JavaScript to image
- Copy models to image
- Install production dependencies
- Create optimized image

**Expected output:**
```
[+] Building 120.5s
=> [internal] load build definition
=> => transferring dockerfile
=> [1/8] FROM node:18-alpine
=> [2/8] WORKDIR /app
=> [3/8] COPY package*.json ./
=> [4/8] RUN npm ci --only=production
=> [5/8] COPY dist/ ./dist/
=> [6/8] COPY models/ ./models/
=> [7/8] EXPOSE 8092 9092
=> exporting to image
=> => naming to aditisentinel/analytics-engine:2.0.1-helmet-fix
```

**Verify image:**
```powershell
docker images | findstr analytics-engine
```

---

### Step 3: Test Image Locally (Optional but Recommended)

```powershell
# Run locally
docker run -p 8092:8092 `
  -e HELMET_MULTI_MODEL=true `
  -e ENABLE_POSE_ESTIMATION=true `
  -e ENABLE_FACE_RECOGNITION=true `
  aditisentinel/analytics-engine:2.0.1-helmet-fix

# In another PowerShell window, test health
Invoke-RestMethod http://localhost:8092/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "aiState": "AI_OPERATIONAL"
}
```

**Stop container:**
```powershell
docker ps  # Get container ID
docker stop <container-id>
```

---

### Step 4: Push to Docker Registry

```powershell
docker push aditisentinel/analytics-engine:2.0.1-helmet-fix
```

**This will:**
- Push image to Docker Hub or GCP Container Registry
- Make image available to Kubernetes cluster

**Expected output:**
```
The push refers to repository [docker.io/aditisentinel/analytics-engine]
2.0.1-helmet-fix: digest: sha256:abc123... size: 1234
```

---

### Step 5: Apply ConfigMap

```powershell
kubectl apply -f k8s\configmap-helmet-fix.yaml
```

**Verify:**
```powershell
kubectl get configmap analytics-engine-config -n sentinel-analytics -o jsonpath='{.data.HELMET_MULTI_MODEL}'
# Should output: true
```

---

### Step 6: Update Deployment Image

```powershell
kubectl set image deployment/analytics-engine `
  analytics-engine=aditisentinel/analytics-engine:2.0.1-helmet-fix `
  -n sentinel-analytics
```

**Alternative: Edit deployment YAML:**
```powershell
kubectl edit deployment analytics-engine -n sentinel-analytics

# Change this line:
# image: aditisentinel/analytics-engine:2.0.0
# To:
# image: aditisentinel/analytics-engine:2.0.1-helmet-fix
```

---

### Step 7: Monitor Rollout

```powershell
kubectl rollout status deployment/analytics-engine -n sentinel-analytics
```

**Watch pods:**
```powershell
kubectl get pods -n sentinel-analytics -l app=analytics-engine -w
```

**Expected output:**
```
NAME                                READY   STATUS              RESTARTS   AGE
analytics-engine-5d8f9c7b6-abc12    1/1     Running             0          2m
analytics-engine-5d8f9c7b6-def34    0/1     ContainerCreating   0          10s
analytics-engine-old-hash-xyz89     1/1     Terminating         0          10m
```

---

### Step 8: Verify Deployment

```powershell
# Check pod logs
kubectl logs deployment/analytics-engine -n sentinel-analytics --tail=100

# Look for these messages:
# "Helmet detector loaded local ONNX helmet classifier with multi-model verification"
# "Pose estimation model loaded"
# "Face detection model loaded"
```

**Port forward for testing:**
```powershell
kubectl port-forward deployment/analytics-engine -n sentinel-analytics 8092:8092

# Test health
Invoke-RestMethod http://localhost:8092/health | ConvertTo-Json
```

---

## Verification Checklist

After deployment, verify:

- [ ] ConfigMap shows `HELMET_MULTI_MODEL=true`
- [ ] All pods are `Running` with `1/1` ready
- [ ] Logs show "multi-model verification"
- [ ] Health endpoint returns `AI_OPERATIONAL`
- [ ] False alarms on bare heads: STOPPED ✓
- [ ] False alarms on chairs: STOPPED ✓
- [ ] Moving helmet wearers: DETECTED ✓
- [ ] Stationary helmet wearers: DETECTED ✓

---

## Troubleshooting

### Build Fails

**Error:** `Cannot find module 'typescript'`

**Solution:**
```powershell
npm install
npm run build
```

### Docker Build Fails

**Error:** `models/... not found`

**Solution:**
Ensure models are present:
```powershell
dir models\safety\helmet-head-localizer.onnx
dir models\pose\yolov8n-pose.onnx
dir models\face\face-detector.onnx
```

### Push Fails - Authentication

**Error:** `denied: requested access to the resource is denied`

**Solution:**
```powershell
docker login
# Enter username and password
docker push aditisentinel/analytics-engine:2.0.1-helmet-fix
```

### Pods Not Starting

**Check pod status:**
```powershell
kubectl get pods -n sentinel-analytics -l app=analytics-engine
kubectl describe pod <pod-name> -n sentinel-analytics
kubectl logs <pod-name> -n sentinel-analytics
```

**Common issues:**
- Image pull error → Check image name and registry auth
- CrashLoopBackOff → Check logs for startup errors
- Models not found → Check PVC is mounted

### Still Seeing False Alarms

**Check evidence source:**
```powershell
kubectl logs deployment/analytics-engine -n sentinel-analytics | Select-String "helmet-worn"
```

If showing `confirmed-head-classification` instead of `localized-head-classification`:
- Verify models are loaded (check logs)
- Verify ConfigMap is applied
- Verify pod was restarted with new image

---

## Rollback

If issues occur:

```powershell
# Roll back to previous image
kubectl set image deployment/analytics-engine `
  analytics-engine=aditisentinel/analytics-engine:2.0.0 `
  -n sentinel-analytics

# Monitor rollback
kubectl rollout status deployment/analytics-engine -n sentinel-analytics
```

---

## Version History

| Version | Changes | Date |
|---------|---------|------|
| 2.0.0 | Initial production release | 2026-09-15 |
| 2.0.1-helmet-fix | Multi-model verification + moving person fix | 2026-10-07 |

---

## Quick Commands Reference

```powershell
# Full rebuild and deploy
npm run build && `
docker build -t aditisentinel/analytics-engine:2.0.1-helmet-fix . && `
docker push aditisentinel/analytics-engine:2.0.1-helmet-fix && `
kubectl set image deployment/analytics-engine analytics-engine=aditisentinel/analytics-engine:2.0.1-helmet-fix -n sentinel-analytics

# Check status
kubectl get pods -n sentinel-analytics -l app=analytics-engine

# View logs
kubectl logs -f deployment/analytics-engine -n sentinel-analytics

# Health check
kubectl port-forward deployment/analytics-engine -n sentinel-analytics 8092:8092
Invoke-RestMethod http://localhost:8092/health
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-10-07  
**Target Environment:** GCP Kubernetes (sentinel-analytics namespace)
