# ============================================================================
# Helmet False Alarm Fix Verification Script
# ============================================================================
# Run this script to verify that multi-model verification is properly enabled
# ============================================================================

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Helmet False Alarm Fix - Verification" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

# Check .env configuration
Write-Host "1. Checking .env configuration..." -ForegroundColor Yellow
$envFile = ".\.env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    
    # Check critical settings
    $checks = @{
        "HELMET_MULTI_MODEL" = $envContent -match "HELMET_MULTI_MODEL\s*=\s*true"
        "ENABLE_POSE_ESTIMATION" = $envContent -match "ENABLE_POSE_ESTIMATION\s*=\s*true"
        "ENABLE_FACE_RECOGNITION" = $envContent -match "ENABLE_FACE_RECOGNITION\s*=\s*true"
        "POSE_MODEL_PATH" = $envContent -match "POSE_MODEL_PATH\s*=\s*\./models/pose"
        "FACE_DETECTION_MODEL_PATH" = $envContent -match "FACE_DETECTION_MODEL_PATH\s*=\s*\./models/face"
        "HELMET_FAST_ALERT NOT SET" = -not ($envContent -match "HELMET_FAST_ALERT\s*=\s*true")
    }
    
    foreach ($key in $checks.Keys) {
        if ($checks[$key]) {
            Write-Host "   [$([char]0x2713)] $key" -ForegroundColor Green
        } else {
            Write-Host "   [$([char]0x2717)] $key" -ForegroundColor Red
        }
    }
} else {
    Write-Host "   [$([char]0x2717)] .env file not found!" -ForegroundColor Red
}
Write-Host ""

# Check model files
Write-Host "2. Checking required model files..." -ForegroundColor Yellow
$models = @{
    "Helmet Classifier" = ".\models\safety\helmet.onnx"
    "Helmet/Head Localizer" = ".\models\safety\helmet-head-localizer.onnx"
    "Pose Estimator" = ".\models\pose\yolov8n-pose.onnx"
    "Face Detector" = ".\models\face\face-detector.onnx"
}

$allModelsPresent = $true
foreach ($name in $models.Keys) {
    $path = $models[$name]
    if (Test-Path $path) {
        $size = (Get-Item $path).Length / 1MB
        Write-Host "   [$([char]0x2713)] $name - $([math]::Round($size, 2)) MB" -ForegroundColor Green
    } else {
        Write-Host "   [$([char]0x2717)] $name - NOT FOUND at $path" -ForegroundColor Red
        $allModelsPresent = $false
    }
}
Write-Host ""

# Check model manifest
Write-Host "3. Checking model manifest..." -ForegroundColor Yellow
$manifestPath = ".\models\manifest.json"
if (Test-Path $manifestPath) {
    try {
        $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
        $requiredModels = @("helmet", "helmet-head-localizer", "pose-estimator", "face-detector")
        $foundModels = @()
        
        foreach ($model in $manifest.models) {
            if ($requiredModels -contains $model.id) {
                $foundModels += $model.id
            }
        }
        
        foreach ($modelId in $requiredModels) {
            if ($foundModels -contains $modelId) {
                Write-Host "   [$([char]0x2713)] $modelId entry found in manifest" -ForegroundColor Green
            } else {
                Write-Host "   [$([char]0x2717)] $modelId entry missing in manifest" -ForegroundColor Red
            }
        }
    } catch {
        Write-Host "   [$([char]0x2717)] Error reading manifest: $_" -ForegroundColor Red
    }
} else {
    Write-Host "   [$([char]0x2717)] manifest.json not found!" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Verification Summary" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

if ($allModelsPresent -and $checks["HELMET_MULTI_MODEL"] -and $checks["ENABLE_POSE_ESTIMATION"] -and $checks["ENABLE_FACE_RECOGNITION"]) {
    Write-Host ""
    Write-Host "$([char]0x2713) READY TO DEPLOY" -ForegroundColor Green
    Write-Host ""
    Write-Host "All required models and configuration are in place." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Restart the analytics engine:" -ForegroundColor White
    Write-Host "   pm2 restart analytics-engine" -ForegroundColor Cyan
    Write-Host "   OR" -ForegroundColor White
    Write-Host "   docker-compose restart analytics-engine" -ForegroundColor Cyan
    Write-Host "   OR" -ForegroundColor White
    Write-Host "   npm run dev" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "2. Monitor logs for successful model loading:" -ForegroundColor White
    Write-Host "   tail -f logs/analytics-engine.log | findstr /i helmet" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "3. Look for this message in logs:" -ForegroundColor White
    Write-Host '   "Helmet detector loaded local ONNX helmet classifier with multi-model verification"' -ForegroundColor Green
    Write-Host ""
    Write-Host "4. Monitor alerts for 24-48 hours" -ForegroundColor White
    Write-Host "   - False alarm rate should drop to <2%" -ForegroundColor Green
    Write-Host '   - Evidence source should be "localized-head-classification"' -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "$([char]0x2717) CONFIGURATION INCOMPLETE" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please fix the issues marked with [$([char]0x2717)] above." -ForegroundColor Red
    Write-Host ""
    if (-not $checks["HELMET_MULTI_MODEL"]) {
        Write-Host "Missing configuration: Add 'HELMET_MULTI_MODEL=true' to .env" -ForegroundColor Yellow
    }
    if (-not $checks["ENABLE_POSE_ESTIMATION"]) {
        Write-Host "Missing configuration: Add 'ENABLE_POSE_ESTIMATION=true' to .env" -ForegroundColor Yellow
    }
    if (-not $checks["ENABLE_FACE_RECOGNITION"]) {
        Write-Host "Missing configuration: Add 'ENABLE_FACE_RECOGNITION=true' to .env" -ForegroundColor Yellow
    }
    if (-not $allModelsPresent) {
        Write-Host "Missing models: Run 'npm run provision-models' to download" -ForegroundColor Yellow
    }
    Write-Host ""
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
