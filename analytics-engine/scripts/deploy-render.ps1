# Render Deployment Script for Sentinel Analytics Engine (PowerShell)
# Usage: .\scripts\deploy-render.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 Sentinel Grid Analytics Engine - Render Deployment" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the analytics-engine directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Please run this script from the analytics-engine directory" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Pre-deployment Checklist" -ForegroundColor Yellow
Write-Host "----------------------------"
Write-Host ""

# Check Node.js version
try {
    $nodeVersion = node -v
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed" -ForegroundColor Red
    exit 1
}

# Check npm
try {
    $npmVersion = npm -v
    Write-Host "✅ npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm is not installed" -ForegroundColor Red
    exit 1
}

# Check TypeScript compilation
Write-Host ""
Write-Host "🔨 Testing TypeScript compilation..." -ForegroundColor Yellow
try {
    npm run build *> $null
    Write-Host "✅ TypeScript compilation successful" -ForegroundColor Green
} catch {
    Write-Host "❌ TypeScript compilation failed" -ForegroundColor Red
    Write-Host "   Run 'npm run build' to see errors" -ForegroundColor Yellow
    exit 1
}

# Check for required files
Write-Host ""
Write-Host "📁 Checking required files..." -ForegroundColor Yellow
$requiredFiles = @(
    "render.yaml",
    "package.json",
    "tsconfig.json",
    "src/app.ts",
    "src/analytics-pipeline.ts"
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "✅ $file" -ForegroundColor Green
    } else {
        Write-Host "❌ Missing: $file" -ForegroundColor Red
        exit 1
    }
}

# Check for analog camera AI detectors
Write-Host ""
Write-Host "🤖 Checking Analog Camera AI modules..." -ForegroundColor Yellow
$analogAiFiles = @(
    "src/detectors/analog-video-quality-detector.ts",
    "src/detectors/camera-aging-detector.ts",
    "src/detectors/camera-type-classifier.ts",
    "src/detectors/dvr-channel-health-detector.ts",
    "src/routes/analog-camera-api.ts"
)

foreach ($file in $analogAiFiles) {
    if (Test-Path $file) {
        Write-Host "✅ $file" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Missing: $file (feature may not work)" -ForegroundColor Yellow
    }
}

# Check Git status
Write-Host ""
Write-Host "📦 Checking Git status..." -ForegroundColor Yellow
if (Test-Path ".git" -or Test-Path "../.git") {
    Write-Host "✅ Git repository detected" -ForegroundColor Green
    
    try {
        $gitStatus = git status --porcelain
        if ([string]::IsNullOrWhiteSpace($gitStatus)) {
            Write-Host "✅ No uncommitted changes" -ForegroundColor Green
        } else {
            Write-Host "⚠️  You have uncommitted changes" -ForegroundColor Yellow
            Write-Host "   Consider committing before deploying" -ForegroundColor Yellow
        }
        
        $currentBranch = git branch --show-current
        Write-Host "   Current branch: $currentBranch" -ForegroundColor Cyan
    } catch {
        Write-Host "   Could not check Git status" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Not a Git repository" -ForegroundColor Red
    Write-Host "   Initialize with: git init" -ForegroundColor Yellow
    exit 1
}

# Environment variables
Write-Host ""
Write-Host "🔐 Environment Variables (for Render Dashboard)" -ForegroundColor Yellow
Write-Host "------------------------------------------------"
Write-Host ""
Write-Host "Copy these to Render Dashboard → Environment Variables:" -ForegroundColor Cyan
Write-Host ""
Write-Host "# Required" -ForegroundColor Yellow
Write-Host "NODE_ENV=production"
Write-Host "PORT=3000"
Write-Host "ANALYTICS_SOURCE_SHARED_KEY=[generate-secure-key]"
Write-Host "CONTROL_PLANE_SHARED_KEY=[your-control-plane-key]"
Write-Host ""
Write-Host "# Analog Camera AI (Optional but Recommended)" -ForegroundColor Yellow
Write-Host "ENABLE_ANALOG_VIDEO_QUALITY=true"
Write-Host "ENABLE_CAMERA_AGING_PREDICTION=true"
Write-Host "ENABLE_CAMERA_TYPE_CLASSIFIER=true"
Write-Host "ENABLE_DVR_CHANNEL_HEALTH=true"
Write-Host ""
Write-Host "# Model Configuration" -ForegroundColor Yellow
Write-Host "ANALYTICS_REQUIRE_MODELS=false"
Write-Host "MODEL_CACHE_SIZE_MB=2048"
Write-Host ""

# Generate secure keys
Write-Host ""
Write-Host "🔑 Generated Secure Keys (copy for Render):" -ForegroundColor Yellow
Write-Host "-------------------------------------------"
$analyticsKey = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$controlPlaneKey = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
Write-Host ""
Write-Host "ANALYTICS_SOURCE_SHARED_KEY=$analyticsKey" -ForegroundColor Cyan
Write-Host "CONTROL_PLANE_SHARED_KEY=$controlPlaneKey" -ForegroundColor Cyan
Write-Host ""

# Summary
Write-Host ""
Write-Host "✨ Pre-deployment checks complete!" -ForegroundColor Green
Write-Host "=================================="
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Push code to GitHub:"
Write-Host "   git add ." -ForegroundColor Cyan
Write-Host "   git commit -m 'Add analog camera AI features'" -ForegroundColor Cyan
Write-Host "   git push origin main" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Deploy on Render:"
Write-Host "   a. Go to https://dashboard.render.com"
Write-Host "   b. Click 'New +' → 'Web Service'"
Write-Host "   c. Connect your GitHub repository"
Write-Host "   d. Select branch and configure:"
Write-Host "      - Root Directory: analytics-engine" -ForegroundColor Cyan
Write-Host "      - Build Command: npm install && npm run build" -ForegroundColor Cyan
Write-Host "      - Start Command: npm start" -ForegroundColor Cyan
Write-Host "   e. Add environment variables from above"
Write-Host "   f. Click 'Create Web Service'"
Write-Host ""
Write-Host "3. Monitor deployment:"
Write-Host "   - Watch logs in Render dashboard"
Write-Host "   - Test health endpoint after deployment"
Write-Host ""
Write-Host "4. Test deployment:"
Write-Host "   curl https://your-app.onrender.com/health" -ForegroundColor Cyan
Write-Host "   curl https://your-app.onrender.com/v1/analog/dashboard" -ForegroundColor Cyan
Write-Host ""
Write-Host "📖 Full guide: See RENDER_DEPLOYMENT_GUIDE.md"
Write-Host ""
Write-Host "Ready to deploy! 🎉" -ForegroundColor Green
