# Quick Start Script for Local Development
# This script starts all required services for local camera feed testing

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Sentinel Grid - Local Development Startup  " -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js detected: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Function to start a service in a new terminal
function Start-Service {
    param(
        [string]$ServiceName,
        [string]$WorkingDirectory,
        [string]$Command,
        [string]$Color = "Yellow"
    )
    
    Write-Host "Starting $ServiceName..." -ForegroundColor $Color
    $psCommand = "cd '$WorkingDirectory'; $Command"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $psCommand
    Start-Sleep -Seconds 2
}

# Check .env files exist
Write-Host ""
Write-Host "Checking configuration files..." -ForegroundColor Cyan

$rootEnv = Test-Path ".\.env"
$edgeEnv = Test-Path ".\edge-agent\.env"
$dashboardEnv = Test-Path ".\dashboard\.env.local"

if (-not $rootEnv) {
    Write-Host "⚠ Root .env file exists" -ForegroundColor Yellow
} else {
    Write-Host "✓ Root .env file exists" -ForegroundColor Green
}

if (-not $edgeEnv) {
    Write-Host "⚠ Edge agent .env not found. Copying from example..." -ForegroundColor Yellow
    Copy-Item ".\edge-agent\.env.example" ".\edge-agent\.env" -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Cyan
Write-Host ""

# Start Control Plane (Backend)
Start-Service -ServiceName "Control Plane (Backend)" -WorkingDirectory $PWD -Command "npm run dev" -Color "Blue"

# Wait for control plane to initialize
Write-Host "Waiting for control plane to initialize (10 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Start Edge Agent (Media Gateway)
Start-Service -ServiceName "Edge Agent (Media Gateway)" -WorkingDirectory "$PWD\edge-agent" -Command "npm run dev" -Color "Magenta"

# Wait for edge agent to initialize
Write-Host "Waiting for edge agent to initialize (5 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Start Dashboard (Frontend)
Start-Service -ServiceName "Dashboard (Frontend)" -WorkingDirectory "$PWD\dashboard" -Command "npm run dev" -Color "Green"

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  All Services Started Successfully!         " -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access Points:" -ForegroundColor Cyan
Write-Host "  • Dashboard:      http://localhost:3000" -ForegroundColor White
Write-Host "  • Control Plane:  http://localhost:8080" -ForegroundColor White
Write-Host "  • Media Gateway:  http://localhost:8090" -ForegroundColor White
Write-Host ""
Write-Host "Health Checks:" -ForegroundColor Cyan
Write-Host "  • Control Plane:  http://localhost:8080/health" -ForegroundColor White
Write-Host "  • Media Gateway:  http://localhost:8090/health" -ForegroundColor White
Write-Host ""
Write-Host "Note: Each service is running in a separate terminal window" -ForegroundColor Yellow
Write-Host "Close this window to keep services running" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
