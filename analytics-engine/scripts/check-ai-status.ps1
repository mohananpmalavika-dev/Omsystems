# PowerShell script to check AI Engine status on Render
# Usage: .\check-ai-status.ps1

$HEALTH_URL = "https://kryptonvision-analytics-engine-u2sf.onrender.com/health"

Write-Host "=== KryptonVision Analytics Engine Health Check ===" -ForegroundColor Cyan
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $HEALTH_URL -Method Get -UseBasicParsing
    
    # Display main status
    Write-Host "Service Status: " -NoNewline
    switch ($response.aiState) {
        "AI_OPERATIONAL" { Write-Host $response.aiState -ForegroundColor Green }
        "AI_DEGRADED" { Write-Host $response.aiState -ForegroundColor Yellow }
        "AI_UNAVAILABLE" { Write-Host $response.aiState -ForegroundColor Red }
        default { Write-Host $response.aiState -ForegroundColor Gray }
    }
    
    Write-Host "Pipeline Initialized: " -NoNewline
    if ($response.pipeline.initialized) {
        Write-Host "Yes" -ForegroundColor Green
    } else {
        Write-Host "No" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "=== Model Status ===" -ForegroundColor Cyan
    Write-Host "Models Ready: $($response.pipeline.models.ready)"
    Write-Host "Models Loaded: $($response.pipeline.models.loaded) / $($response.pipeline.models.configured)"
    Write-Host "Required Models: $($response.pipeline.models.requiredReady) / $($response.pipeline.models.required)"
    
    if ($response.pipeline.models.missingRequired -and $response.pipeline.models.missingRequired.Count -gt 0) {
        Write-Host ""
        Write-Host "Missing Required Models:" -ForegroundColor Yellow
        foreach ($model in $response.pipeline.models.missingRequired) {
            Write-Host "  - $model" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "=== Detector Health ===" -ForegroundColor Cyan
    
    $healthy = @()
    $degraded = @()
    $unhealthy = @()
    
    $response.pipeline.detectors.PSObject.Properties | ForEach-Object {
        $name = $_.Name
        $detector = $_.Value
        switch ($detector.status) {
            "healthy" { $healthy += $name }
            "degraded" { $degraded += $name }
            "unhealthy" { $unhealthy += $name }
        }
    }
    
    Write-Host "Healthy ($($healthy.Count)): " -NoNewline -ForegroundColor Green
    Write-Host ($healthy -join ", ")
    
    Write-Host "Degraded ($($degraded.Count)): " -NoNewline -ForegroundColor Yellow
    Write-Host ($degraded -join ", ")
    
    Write-Host "Unhealthy ($($unhealthy.Count)): " -NoNewline -ForegroundColor Red
    Write-Host ($unhealthy -join ", ")
    
    Write-Host ""
    Write-Host "=== Active Streams ===" -ForegroundColor Cyan
    Write-Host "Active Streams: $($response.streams.active)"
    
    Write-Host ""
    Write-Host "=== Statistics ===" -ForegroundColor Cyan
    Write-Host "Events Received: $($response.received)"
    Write-Host "Events Accepted: $($response.accepted)"
    Write-Host "Events Failed: $($response.failed)"
    if ($response.lastAcceptedAt) {
        Write-Host "Last Event: $($response.lastAcceptedAt)"
    } else {
        Write-Host "Last Event: Never"
    }
    
    Write-Host ""
    Write-Host "=== Summary ===" -ForegroundColor Cyan
    if ($response.aiState -eq "AI_OPERATIONAL") {
        Write-Host "Service is fully operational with local AI inference" -ForegroundColor Green
    } elseif ($response.aiState -eq "AI_DEGRADED") {
        Write-Host "Service is operational but AI models are missing" -ForegroundColor Yellow
        Write-Host "Can accept external detections but cannot perform local inference" -ForegroundColor Gray
        Write-Host "See RENDER_DEPLOYMENT_GUIDE.md to deploy models" -ForegroundColor Gray
    } else {
        Write-Host "Service pipeline initialization failed" -ForegroundColor Red
        if ($response.initializationError) {
            Write-Host "Error: $($response.initializationError)" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "Error: Failed to connect to analytics engine" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
