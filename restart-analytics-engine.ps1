#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Restart Analytics Engine to fix ONNX session disposal issue
    
.DESCRIPTION
    Restarts the analytics engine service to reload ONNX model sessions
    and fix the "Session already disposed" error affecting Local Pilot Channel 8
    
.EXAMPLE
    .\restart-analytics-engine.ps1
#>

Write-Host ""
Write-Host "🔄 Restarting Analytics Engine" -ForegroundColor Cyan
Write-Host "═" * 60
Write-Host ""

# Check if running in Docker
$dockerRunning = $false
try {
    $containers = docker ps --filter "name=analytics-engine" --format "{{.Names}}" 2>$null
    if ($containers) {
        $dockerRunning = $true
        Write-Host "✅ Found Docker container: $containers" -ForegroundColor Green
    }
} catch {
    # Docker not available or not running
}

if ($dockerRunning) {
    Write-Host ""
    Write-Host "🐳 Restarting Docker container..." -ForegroundColor Yellow
    docker restart analytics-engine
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Container restarted successfully" -ForegroundColor Green
        Write-Host ""
        Write-Host "⏳ Waiting 10 seconds for service to initialize..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
    } else {
        Write-Host "❌ Failed to restart container" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "📦 No Docker container found, restarting Node.js process..." -ForegroundColor Yellow
    Write-Host ""
    
    # Stop any running process
    Write-Host "🛑 Stopping analytics-engine..." -ForegroundColor Yellow
    Push-Location analytics-engine
    try {
        npm run stop 2>$null
    } catch {
        # Process might not be running
    }
    
    Write-Host "🏗️  Building..." -ForegroundColor Yellow
    npm run build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Write-Host "🚀 Starting analytics-engine..." -ForegroundColor Green
    Start-Process -FilePath "npm" -ArgumentList "start" -NoNewWindow -PassThru
    Pop-Location
    
    Write-Host ""
    Write-Host "⏳ Waiting 10 seconds for service to initialize..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

# Check health
Write-Host ""
Write-Host "🔍 Checking service health..." -ForegroundColor Cyan
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8092/health" -Method Get -TimeoutSec 10
    
    if ($response.aiState -eq "AI_OPERATIONAL") {
        Write-Host "✅ Analytics Engine is OPERATIONAL" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Status:" -ForegroundColor Cyan
        Write-Host "   AI State: $($response.aiState)" -ForegroundColor Green
        
        if ($response.pipeline.detectors.helmet) {
            Write-Host "   Helmet Detector: $($response.pipeline.detectors.helmet.status)" -ForegroundColor Green
            Write-Host "   Version: $($response.pipeline.detectors.helmet.version)" -ForegroundColor Green
        }
        
        Write-Host ""
        Write-Host "═" * 60
        Write-Host "✅ Restart completed successfully!" -ForegroundColor Green
        Write-Host "═" * 60
        Write-Host ""
        Write-Host "🎯 Next Steps:" -ForegroundColor Yellow
        Write-Host "   1. Test Local Pilot Channel 8 (should work now)"
        Write-Host "   2. For Channel 9, ensure person is 3-5m from camera"
        Write-Host "   3. Person should stay stationary for 45 seconds"
        Write-Host ""
        Write-Host "📖 Full guide: LOCAL_PILOT_FIX.md" -ForegroundColor Cyan
        Write-Host ""
        
        exit 0
    } else {
        Write-Host "⚠️  Service running but AI not operational" -ForegroundColor Yellow
        Write-Host "   AI State: $($response.aiState)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Check logs: analytics-engine/logs/analytics-engine.log" -ForegroundColor Cyan
        exit 1
    }
} catch {
    Write-Host "❌ Failed to connect to analytics engine" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔍 Troubleshooting:" -ForegroundColor Yellow
    Write-Host "   1. Check if service is running: docker ps" -ForegroundColor Cyan
    Write-Host "   2. Check logs: docker logs analytics-engine" -ForegroundColor Cyan
    Write-Host "   3. Verify port 8092 is not in use" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}
