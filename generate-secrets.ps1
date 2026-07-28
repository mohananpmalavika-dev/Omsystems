# Generate Secure Keys for Render Deployment
# Run this script to generate all required secure keys
# Copy the output and paste into Render Dashboard Environment Variables

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   Sentinel Grid - Secure Key Generator" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

function Generate-SecureKey {
    param([int]$length = 48)
    -join ((48..57) + (65..90) + (97..122) | Get-Random -Count $length | ForEach-Object {[char]$_})
}

Write-Host "Copy these values to Render Dashboard:" -ForegroundColor Yellow
Write-Host ""

$edgeBridgeKey = Generate-SecureKey
$mediaGatewayKey = Generate-SecureKey
$analyticsEngineKey = Generate-SecureKey
$analyticsSourceKey = Generate-SecureKey
$reportDownloadSecret = Generate-SecureKey

Write-Host "EDGE_BRIDGE_SHARED_KEY:" -ForegroundColor Green
Write-Host $edgeBridgeKey
Write-Host ""

Write-Host "MEDIA_GATEWAY_SHARED_KEY:" -ForegroundColor Green
Write-Host $mediaGatewayKey
Write-Host ""

Write-Host "ANALYTICS_ENGINE_SHARED_KEY:" -ForegroundColor Green
Write-Host $analyticsEngineKey
Write-Host ""

Write-Host "ANALYTICS_SOURCE_SHARED_KEY:" -ForegroundColor Green
Write-Host $analyticsSourceKey
Write-Host ""

Write-Host "REPORT_DOWNLOAD_SECRET:" -ForegroundColor Green
Write-Host $reportDownloadSecret
Write-Host ""

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   Apply these to Render services:" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "sentinel-grid-monitoring:" -ForegroundColor Magenta
Write-Host "  - EDGE_BRIDGE_SHARED_KEY: $edgeBridgeKey"
Write-Host ""

Write-Host "sentinel-grid-media-gateway:" -ForegroundColor Magenta
Write-Host "  - EDGE_BRIDGE_SHARED_KEY: $edgeBridgeKey"
Write-Host "  - MEDIA_GATEWAY_SHARED_KEY: $mediaGatewayKey"
Write-Host ""

Write-Host "sentinel-grid-analytics-engine:" -ForegroundColor Magenta
Write-Host "  - ANALYTICS_ENGINE_SHARED_KEY: $analyticsEngineKey"
Write-Host "  - ANALYTICS_SOURCE_SHARED_KEY: $analyticsSourceKey"
Write-Host ""

Write-Host "sentinel-grid-control-plane:" -ForegroundColor Magenta
Write-Host "  - EDGE_BRIDGE_SHARED_KEY: $edgeBridgeKey"
Write-Host "  - MEDIA_GATEWAY_SHARED_KEY: $mediaGatewayKey"
Write-Host "  - ANALYTICS_ENGINE_SHARED_KEY: $analyticsEngineKey"
Write-Host "  - REPORT_DOWNLOAD_SECRET: $reportDownloadSecret"
Write-Host ""

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   IMPORTANT: Keep these keys secure!" -ForegroundColor Red
Write-Host "   Do NOT commit them to Git" -ForegroundColor Red
Write-Host "==================================================" -ForegroundColor Cyan
