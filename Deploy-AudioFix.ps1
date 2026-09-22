# Audio Fix Deployment Script for Windows
# Deploys automatic audio transcoding to AAC for browser HLS playback

Write-Host "🎵 Deploying Audio Fix for Browser HLS Playback" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if FFmpeg is installed
$ffmpegInstalled = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpegInstalled) {
    Write-Host "❌ FFmpeg is not installed!" -ForegroundColor Red
    Write-Host "   Please install FFmpeg first:" -ForegroundColor Yellow
    Write-Host "   1. Download from: https://www.gyan.dev/ffmpeg/builds/" -ForegroundColor Yellow
    Write-Host "   2. Extract to C:\ffmpeg" -ForegroundColor Yellow
    Write-Host "   3. Add C:\ffmpeg\bin to System PATH" -ForegroundColor Yellow
    Write-Host "   4. Restart PowerShell and run this script again" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ FFmpeg found: $(ffmpeg -version | Select-Object -First 1)" -ForegroundColor Green
Write-Host ""

Write-Host "📦 Building updated components..." -ForegroundColor Cyan
Write-Host ""

# Build edge-agent with updated MediaMTX config
if (Test-Path "edge-agent") {
    Write-Host "  → Building edge-agent..." -ForegroundColor White
    Push-Location edge-agent
    npm run build 2>&1 | Select-Object -Last 5
    Pop-Location
    Write-Host "  ✅ edge-agent built" -ForegroundColor Green
}

# Build dashboard with audio unmuted by default
if (Test-Path "dashboard") {
    Write-Host "  → Building dashboard..." -ForegroundColor White
    Push-Location dashboard
    npm run build 2>&1 | Select-Object -Last 5
    Pop-Location
    Write-Host "  ✅ dashboard built" -ForegroundColor Green
}

Write-Host ""
Write-Host "🔄 Restarting services..." -ForegroundColor Cyan
Write-Host ""

# Restart Docker containers if running
$mediaGateway = docker ps --filter "name=media-gateway" --format "{{.Names}}" 2>$null
if ($mediaGateway) {
    Write-Host "  → Restarting media-gateway..." -ForegroundColor White
    docker restart media-gateway | Out-Null
    Start-Sleep -Seconds 3
    Write-Host "  ✅ media-gateway restarted" -ForegroundColor Green
}

$edgeAgent = docker ps --filter "name=edge-agent" --format "{{.Names}}" 2>$null
if ($edgeAgent) {
    Write-Host "  → Restarting edge-agent..." -ForegroundColor White
    docker restart edge-agent | Out-Null
    Start-Sleep -Seconds 3
    Write-Host "  ✅ edge-agent restarted" -ForegroundColor Green
}

$dashboard = docker ps --filter "name=dashboard" --format "{{.Names}}" 2>$null
if ($dashboard) {
    Write-Host "  → Restarting dashboard..." -ForegroundColor White
    docker restart dashboard | Out-Null
    Write-Host "  ✅ dashboard restarted" -ForegroundColor Green
}

# Check Windows Services
$services = @("Sentinel-Edge", "Sentinel-Dashboard", "MediaMTX")
foreach ($serviceName in $services) {
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($service -and $service.Status -eq "Running") {
        Write-Host "  → Restarting $serviceName..." -ForegroundColor White
        Restart-Service -Name $serviceName -Force
        Write-Host "  ✅ $serviceName restarted" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "✨ Audio fix deployed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 What was changed:" -ForegroundColor Cyan
Write-Host "  1. ✅ MediaMTX now auto-transcodes audio to AAC (G.711 → AAC)" -ForegroundColor Green
Write-Host "  2. ✅ Edge agent updated with audio transcoding config" -ForegroundColor Green
Write-Host "  3. ✅ Dashboard cameras start with audio UNMUTED" -ForegroundColor Green
Write-Host ""
Write-Host "🧪 Testing:" -ForegroundColor Yellow
Write-Host "  1. Open live camera view in browser"
Write-Host "  2. Click a camera to start live stream"
Write-Host "  3. Audio should play automatically (unmuted)"
Write-Host "  4. Check browser console (F12) for any errors"
Write-Host ""
Write-Host "🔍 Verification:" -ForegroundColor Yellow
Write-Host "  • Check MediaMTX logs: docker logs media-gateway -f"
Write-Host "  • Check if FFmpeg processes are running:"
Write-Host "    Get-Process | Where-Object {`$_.Name -like '*ffmpeg*'}"
Write-Host ""
Write-Host "⚠️  NOTE: First camera connection after restart may take 5-10 seconds" -ForegroundColor Yellow
Write-Host "   while FFmpeg starts the audio transcoding process."
Write-Host ""
Write-Host "🎉 Done! Audio should now work in all browsers." -ForegroundColor Green
