# Face Recognition Dependency Installation Script
# Run this script to install all required dependencies

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Face Recognition Dependency Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if npm is available
if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

Write-Host "Node.js version:" -ForegroundColor Yellow
node --version
Write-Host ""

# Install analytics-engine dependencies
Write-Host "[1/2] Installing analytics-engine dependencies..." -ForegroundColor Green
Write-Host "This may take 5-10 minutes (downloading ~200MB)" -ForegroundColor Yellow
Write-Host ""

Set-Location -Path "$PSScriptRoot\analytics-engine"

Write-Host "Installing onnxruntime-node..." -ForegroundColor Cyan
npm install onnxruntime-node --save

Write-Host ""
Write-Host "Installing sharp..." -ForegroundColor Cyan
npm install sharp --save

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Analytics-engine dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to install analytics-engine dependencies" -ForegroundColor Red
    Write-Host "Try running manually: cd analytics-engine && npm install onnxruntime-node sharp" -ForegroundColor Yellow
}

Write-Host ""

# Install frontend dependencies
Write-Host "[2/2] Installing frontend dependencies..." -ForegroundColor Green
Write-Host ""

Set-Location -Path "$PSScriptRoot\frontend"

Write-Host "Installing react-dropzone..." -ForegroundColor Cyan
npm install react-dropzone --save

Write-Host ""
Write-Host "Installing date-fns..." -ForegroundColor Cyan
npm install date-fns --save

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Frontend dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to install frontend dependencies" -ForegroundColor Red
    Write-Host "Try running manually: cd frontend && npm install react-dropzone date-fns" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -Path $PSScriptRoot

# Check if packages were installed
$analyticsPackageJson = Get-Content "analytics-engine\package.json" -Raw | ConvertFrom-Json
$frontendPackageJson = Get-Content "frontend\package.json" -Raw | ConvertFrom-Json

$hasOnnx = $analyticsPackageJson.dependencies.PSObject.Properties.Name -contains "onnxruntime-node"
$hasSharp = $analyticsPackageJson.dependencies.PSObject.Properties.Name -contains "sharp"
$hasDropzone = $frontendPackageJson.dependencies.PSObject.Properties.Name -contains "react-dropzone"
$hasDateFns = $frontendPackageJson.dependencies.PSObject.Properties.Name -contains "date-fns"

Write-Host "Analytics Engine:" -ForegroundColor Yellow
Write-Host "  onnxruntime-node: $(if($hasOnnx){'✓ Installed'}else{'✗ Not found'})" -ForegroundColor $(if($hasOnnx){'Green'}else{'Red'})
Write-Host "  sharp: $(if($hasSharp){'✓ Installed'}else{'✗ Not found'})" -ForegroundColor $(if($hasSharp){'Green'}else{'Red'})
Write-Host ""

Write-Host "Frontend:" -ForegroundColor Yellow
Write-Host "  react-dropzone: $(if($hasDropzone){'✓ Installed'}else{'✗ Not found'})" -ForegroundColor $(if($hasDropzone){'Green'}else{'Red'})
Write-Host "  date-fns: $(if($hasDateFns){'✓ Installed'}else{'✗ Not found'})" -ForegroundColor $(if($hasDateFns){'Green'}else{'Red'})
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Next Steps" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Enable pgvector extension:" -ForegroundColor White
Write-Host "   psql -d your_database -c 'CREATE EXTENSION IF NOT EXISTS vector;'" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Run database migration:" -ForegroundColor White
Write-Host "   psql -d your_database -f database/migrations/014_enable_pgvector_faces.sql" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Obtain ArcFace model (see QUICK_START.md)" -ForegroundColor White
Write-Host ""
Write-Host "4. Configure environment:" -ForegroundColor White
Write-Host "   Set ARCFACE_MODEL_PATH in .env file" -ForegroundColor Gray
Write-Host ""
Write-Host "For detailed instructions, see: QUICK_START.md" -ForegroundColor Cyan
Write-Host ""
