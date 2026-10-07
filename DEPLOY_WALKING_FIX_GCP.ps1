# Deploy Walking Person & Helmet Detection Fix to GCP VM
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  Deploying Walking Person & Helmet Detection Fix to GCP" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# Step 1: Build TypeScript to JavaScript
Write-Host "`n[1/4] Building TypeScript to JavaScript..." -ForegroundColor Yellow
Set-Location C:\Omsystems\Omsystems\analytics-engine

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build successful" -ForegroundColor Green

Set-Location C:\Omsystems\Omsystems

# Step 2: Run automated deployment script to GCP VM
Write-Host "`n[2/4] Uploading and deploying to GCP VM (kryptovision-server)..." -ForegroundColor Yellow
node scratch/deploy-analytics-fix.mjs

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host "  ✅ Deployment Successful on GCP VM (kryptovision-server)!" -ForegroundColor Green
    Write-Host "==================================================================" -ForegroundColor Green
} else {
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}
