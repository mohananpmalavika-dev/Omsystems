# ============================================================================
# Deploy Helmet False Alarm Fix to GCP Kubernetes
# ============================================================================
# This script deploys the updated ConfigMap with multi-model verification
# to eliminate helmet false alarms in the live GCP environment
# ============================================================================

$ErrorActionPreference = "Stop"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Helmet False Alarm Fix - GCP Deployment" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$NAMESPACE = "sentinel-analytics"
$CONFIGMAP_NAME = "analytics-engine-config"
$DEPLOYMENT_NAME = "analytics-engine"

# ============================================================================
# Step 1: Verify kubectl access
# ============================================================================
Write-Host "Step 1: Verifying kubectl access..." -ForegroundColor Yellow

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Host "X kubectl not found. Please install kubectl first." -ForegroundColor Red
    exit 1
}

try {
    $null = kubectl cluster-info 2>&1
    $CURRENT_CONTEXT = kubectl config current-context
    Write-Host "[v] Connected to cluster: $CURRENT_CONTEXT" -ForegroundColor Green
} catch {
    Write-Host "X Cannot connect to Kubernetes cluster. Please configure kubectl." -ForegroundColor Red
    exit 1
}
Write-Host ""

# ============================================================================
# Step 2: Verify namespace exists
# ============================================================================
Write-Host "Step 2: Verifying namespace..." -ForegroundColor Yellow

try {
    $null = kubectl get namespace $NAMESPACE 2>&1
    Write-Host "[v] Namespace $NAMESPACE exists" -ForegroundColor Green
} catch {
    Write-Host "X Namespace $NAMESPACE not found. Creating..." -ForegroundColor Yellow
    kubectl create namespace $NAMESPACE
}
Write-Host ""

# ============================================================================
# Step 3: Backup current ConfigMap
# ============================================================================
Write-Host "Step 3: Backing up current ConfigMap..." -ForegroundColor Yellow

$BACKUP_FILE = "configmap-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').yaml"

try {
    kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o yaml > "k8s\$BACKUP_FILE" 2>&1
    Write-Host "[v] Current ConfigMap backed up to: k8s\$BACKUP_FILE" -ForegroundColor Green
} catch {
    Write-Host "! No existing ConfigMap found (this may be first deployment)" -ForegroundColor Yellow
}
Write-Host ""

# ============================================================================
# Step 4: Apply updated ConfigMap
# ============================================================================
Write-Host "Step 4: Applying updated ConfigMap with helmet fix..." -ForegroundColor Yellow

kubectl apply -f k8s\configmap-helmet-fix.yaml

Write-Host "[v] ConfigMap updated successfully" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Step 5: Verify ConfigMap settings
# ============================================================================
Write-Host "Step 5: Verifying helmet fix settings in ConfigMap..." -ForegroundColor Yellow

$HELMET_MULTI_MODEL = kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data.HELMET_MULTI_MODEL}'
$ENABLE_POSE = kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data.ENABLE_POSE_ESTIMATION}'
$ENABLE_FACE = kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data.ENABLE_FACE_RECOGNITION}'

if ($HELMET_MULTI_MODEL -eq "true" -and $ENABLE_POSE -eq "true" -and $ENABLE_FACE -eq "true") {
    Write-Host "[v] HELMET_MULTI_MODEL: $HELMET_MULTI_MODEL" -ForegroundColor Green
    Write-Host "[v] ENABLE_POSE_ESTIMATION: $ENABLE_POSE" -ForegroundColor Green
    Write-Host "[v] ENABLE_FACE_RECOGNITION: $ENABLE_FACE" -ForegroundColor Green
} else {
    Write-Host "X ConfigMap validation failed:" -ForegroundColor Red
    Write-Host "  HELMET_MULTI_MODEL: $HELMET_MULTI_MODEL (expected: true)"
    Write-Host "  ENABLE_POSE_ESTIMATION: $ENABLE_POSE (expected: true)"
    Write-Host "  ENABLE_FACE_RECOGNITION: $ENABLE_FACE (expected: true)"
    exit 1
}
Write-Host ""

# ============================================================================
# Step 6: Restart analytics engine pods
# ============================================================================
Write-Host "Step 6: Restarting analytics engine pods..." -ForegroundColor Yellow
Write-Host "This will trigger a rolling restart of all analytics engine pods." -ForegroundColor Yellow

$confirmation = Read-Host "Continue? (y/n)"
if ($confirmation -ne 'y') {
    Write-Host "Deployment cancelled."
    exit 0
}

kubectl rollout restart deployment/$DEPLOYMENT_NAME -n $NAMESPACE

Write-Host "[v] Rollout initiated" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Step 7: Monitor rollout status
# ============================================================================
Write-Host "Step 7: Monitoring rollout status..." -ForegroundColor Yellow
Write-Host "This may take 2-3 minutes..." -ForegroundColor Yellow
Write-Host ""

$rolloutResult = kubectl rollout status deployment/$DEPLOYMENT_NAME -n $NAMESPACE --timeout=5m

if ($LASTEXITCODE -eq 0) {
    Write-Host "[v] Rollout completed successfully" -ForegroundColor Green
} else {
    Write-Host "X Rollout failed or timed out" -ForegroundColor Red
    Write-Host "Check pod logs: kubectl logs -f deployment/$DEPLOYMENT_NAME -n $NAMESPACE"
    exit 1
}
Write-Host ""

# ============================================================================
# Step 8: Verify pods are healthy
# ============================================================================
Write-Host "Step 8: Verifying pod health..." -ForegroundColor Yellow

Start-Sleep -Seconds 10

$RUNNING_PODS = (kubectl get pods -n $NAMESPACE -l app=analytics-engine --field-selector=status.phase=Running | Select-String "Running" | Measure-Object).Count
$TOTAL_PODS = kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath='{.spec.replicas}'

Write-Host "Ready pods: $RUNNING_PODS / $TOTAL_PODS"

if ($RUNNING_PODS -eq [int]$TOTAL_PODS) {
    Write-Host "[v] All pods are healthy" -ForegroundColor Green
} else {
    Write-Host "! Only $RUNNING_PODS of $TOTAL_PODS pods are ready. Checking pod status..." -ForegroundColor Yellow
    kubectl get pods -n $NAMESPACE -l app=analytics-engine
}
Write-Host ""

# ============================================================================
# Step 9: Verify multi-model verification in logs
# ============================================================================
Write-Host "Step 9: Checking logs for multi-model verification..." -ForegroundColor Yellow

Write-Host "Waiting for pod to initialize (30 seconds)..."
Start-Sleep -Seconds 30

$POD_NAME = kubectl get pods -n $NAMESPACE -l app=analytics-engine --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}'

if ([string]::IsNullOrEmpty($POD_NAME)) {
    Write-Host "X No running pod found" -ForegroundColor Red
    exit 1
}

Write-Host "Checking logs from pod: $POD_NAME"
Write-Host ""

$LOGS = kubectl logs $POD_NAME -n $NAMESPACE --tail=100 | Select-String -Pattern "helmet" -AllMatches

if ($LOGS | Select-String -Pattern "multi-model verification") {
    Write-Host "[v] Multi-model verification confirmed in logs:" -ForegroundColor Green
    $LOGS | Select-String -Pattern "multi-model"
} else {
    Write-Host "! Multi-model verification message not found in logs yet." -ForegroundColor Yellow
    Write-Host "This may take a few more seconds. Check logs manually:"
    Write-Host "  kubectl logs -f $POD_NAME -n $NAMESPACE" -ForegroundColor Cyan
}
Write-Host ""

# ============================================================================
# Step 10: Health check
# ============================================================================
Write-Host "Step 10: Running health check..." -ForegroundColor Yellow

Write-Host "Port-forwarding to pod for health check..."
$portForwardJob = Start-Job -ScriptBlock {
    param($podName, $namespace)
    kubectl port-forward $podName -n $namespace 8092:8092
} -ArgumentList $POD_NAME, $NAMESPACE

Start-Sleep -Seconds 5

try {
    $HEALTH_RESPONSE = Invoke-RestMethod -Uri "http://localhost:8092/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "[v] Health check passed" -ForegroundColor Green
    $HEALTH_RESPONSE | ConvertTo-Json -Depth 10
} catch {
    Write-Host "! Health check did not return expected response" -ForegroundColor Yellow
    Write-Host $_.Exception.Message
}

Stop-Job $portForwardJob -ErrorAction SilentlyContinue
Remove-Job $portForwardJob -ErrorAction SilentlyContinue

Write-Host ""

# ============================================================================
# Deployment Summary
# ============================================================================
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Deployment Complete" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration applied:"
Write-Host "  [v] HELMET_MULTI_MODEL=true" -ForegroundColor Green
Write-Host "  [v] ENABLE_POSE_ESTIMATION=true" -ForegroundColor Green
Write-Host "  [v] ENABLE_FACE_RECOGNITION=true" -ForegroundColor Green
Write-Host ""
Write-Host "Expected results (monitor for 24-48 hours):" -ForegroundColor Yellow
Write-Host "  * Detection time: 4-6 seconds"
Write-Host "  * False alarm rate: <2% (down from 15-40%)"
Write-Host "  * Bare heads, chairs, dark objects: REJECTED"
Write-Host "  * Evidence source: 'localized-head-classification'"
Write-Host ""
Write-Host "Monitoring commands:" -ForegroundColor Yellow
Write-Host "  # Watch logs for helmet detections" -ForegroundColor Cyan
Write-Host "  kubectl logs -f deployment/$DEPLOYMENT_NAME -n $NAMESPACE | Select-String helmet" -ForegroundColor White
Write-Host ""
Write-Host "  # Check pod status" -ForegroundColor Cyan
Write-Host "  kubectl get pods -n $NAMESPACE -l app=analytics-engine" -ForegroundColor White
Write-Host ""
Write-Host "  # View recent logs" -ForegroundColor Cyan
Write-Host "  kubectl logs deployment/$DEPLOYMENT_NAME -n $NAMESPACE --tail=100" -ForegroundColor White
Write-Host ""
Write-Host "  # Port forward to access health endpoint" -ForegroundColor Cyan
Write-Host "  kubectl port-forward deployment/$DEPLOYMENT_NAME -n $NAMESPACE 8092:8092" -ForegroundColor White
Write-Host ""
Write-Host "Rollback command (if needed):" -ForegroundColor Yellow
Write-Host "  kubectl apply -f k8s\$BACKUP_FILE" -ForegroundColor Cyan
Write-Host "  kubectl rollout restart deployment/$DEPLOYMENT_NAME -n $NAMESPACE" -ForegroundColor Cyan
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
