# Deploy Walking Person Detection Fix to GCP VM
# This script rebuilds and redeploys the analytics-engine with the new person detection thresholds

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  Deploying Walking Person Detection Fix to GCP" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# Step 1: Build TypeScript to JavaScript
Write-Host "`n[1/5] Building TypeScript to JavaScript..." -ForegroundColor Yellow
Set-Location C:\Omsystems\Omsystems\analytics-engine

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies first..." -ForegroundColor Yellow
    npm install
}

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build successful" -ForegroundColor Green

# Step 2: Verify the fix is in the compiled JavaScript
Write-Host "`n[2/5] Verifying fix in compiled code..." -ForegroundColor Yellow
$helmetDetectorJs = Get-Content "dist\detectors\helmet-detector.js" -Raw
if ($helmetDetectorJs -match "PERSON_CONFIDENCE\s*=\s*0\.35") {
    Write-Host "✅ Person detection threshold 0.35 confirmed in build" -ForegroundColor Green
} else {
    Write-Host "⚠️  Warning: Could not verify person threshold in build" -ForegroundColor Yellow
}

# Step 3: Commit changes (optional but recommended)
Write-Host "`n[3/5] Committing changes..." -ForegroundColor Yellow
Set-Location C:\Omsystems\Omsystems
git add analytics-engine/src/detectors/helmet-detector.ts
git commit -m "fix: lower person detection threshold to 0.35 for walking persons" -ErrorAction SilentlyContinue
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Changes committed" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Nothing to commit or already committed" -ForegroundColor Cyan
}

# Step 4: Connect to GCP and rebuild
Write-Host "`n[4/5] Connecting to GCP to rebuild analytics-engine..." -ForegroundColor Yellow
Write-Host "ℹ️  This will:" -ForegroundColor Cyan
Write-Host "   - Copy new code to GCP VM" -ForegroundColor Cyan
Write-Host "   - Rebuild analytics-engine Docker image" -ForegroundColor Cyan
Write-Host "   - Restart the container" -ForegroundColor Cyan
Write-Host ""

# Get GCP instance details
$GCP_INSTANCE = "sentinel-grid-vm"  # Adjust if your VM name is different
$GCP_ZONE = "asia-south1-a"  # Adjust if your zone is different
$GCP_PROJECT = "kryptovision"  # Adjust if your project is different

Write-Host "Checking GCP connection..." -ForegroundColor Yellow

# Test gcloud connectivity
$gcloudTest = gcloud compute instances list --project=$GCP_PROJECT --filter="name=$GCP_INSTANCE" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Cannot connect to GCP. Please ensure:" -ForegroundColor Red
    Write-Host "   1. gcloud CLI is installed: https://cloud.google.com/sdk/docs/install" -ForegroundColor Red
    Write-Host "   2. You are authenticated: gcloud auth login" -ForegroundColor Red
    Write-Host "   3. Project is set: gcloud config set project $GCP_PROJECT" -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternative: Manual Deployment Instructions" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "1. SSH into your GCP VM" -ForegroundColor White
    Write-Host "2. Run these commands:" -ForegroundColor White
    Write-Host "   cd /opt/sentinel-grid" -ForegroundColor Cyan
    Write-Host "   git pull origin main" -ForegroundColor Cyan
    Write-Host "   cd deploy/gcp" -ForegroundColor Cyan
    Write-Host "   docker compose -f docker-compose.gcp.yml build analytics-engine" -ForegroundColor Cyan
    Write-Host "   docker compose -f docker-compose.gcp.yml up -d analytics-engine" -ForegroundColor Cyan
    Write-Host "   docker logs -f sentinel-gcp-analytics-engine" -ForegroundColor Cyan
    exit 1
}

Write-Host "✅ GCP connection verified" -ForegroundColor Green

# Push changes to Git (so VM can pull them)
Write-Host "`nPushing changes to Git..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Git push failed or nothing to push" -ForegroundColor Yellow
}

# SSH into GCP and rebuild
Write-Host "`n[5/5] Rebuilding on GCP VM..." -ForegroundColor Yellow
Write-Host "This may take 2-3 minutes..." -ForegroundColor Cyan

$commands = @"
set -e
echo '🔄 Updating code from Git...'
cd /opt/sentinel-grid
git fetch origin main
git reset --hard origin/main

echo '🏗️  Rebuilding analytics-engine Docker image...'
cd deploy/gcp
docker compose -f docker-compose.gcp.yml build analytics-engine

echo '🚀 Restarting analytics-engine container...'
docker compose -f docker-compose.gcp.yml up -d analytics-engine

echo '⏳ Waiting for container to start...'
sleep 5

echo '📊 Checking container status...'
docker ps | grep analytics-engine

echo '✅ Deployment complete!'
echo ''
echo '📋 View logs with:'
echo '   docker logs -f sentinel-gcp-analytics-engine'
"@

gcloud compute ssh $GCP_INSTANCE `
    --project=$GCP_PROJECT `
    --zone=$GCP_ZONE `
    --command=$commands

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host "  ✅ Deployment Successful!" -ForegroundColor Green
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host "1. Test with someone wearing a helmet walking in front of camera" -ForegroundColor White
    Write-Host "2. Alert should appear within 10-20 seconds" -ForegroundColor White
    Write-Host "3. Check logs if no alert:" -ForegroundColor White
    Write-Host "   gcloud compute ssh $GCP_INSTANCE --project=$GCP_PROJECT --zone=$GCP_ZONE --command='docker logs -f sentinel-gcp-analytics-engine'" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    Write-Host "Please check the errors above and try manual deployment." -ForegroundColor Red
    Write-Host ""
    exit 1
}
