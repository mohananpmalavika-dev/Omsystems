# Quick Start Edge Agent (Development Mode)
# This runs the edge agent in your current terminal for testing
# Press Ctrl+C to stop

param(
    [switch]$Build = $false
)

Write-Host "`n=== Edge Agent Quick Start (Dev Mode) ===" -ForegroundColor Cyan
Write-Host ""

$edgeAgentDir = "C:\Omsystems\edge-agent"
$configPath = "$edgeAgentDir\config\edge-agent-H1.env"

# Check if config exists
if (-not (Test-Path $configPath)) {
    Write-Host "❌ Config file not found: $configPath" -ForegroundColor Red
    Write-Host "   Please create the config file first." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Config found: $configPath" -ForegroundColor Green

# Display config summary
Write-Host "`n📋 Configuration Summary:" -ForegroundColor Yellow
$config = Get-Content $configPath
$controlPlane = ($config | Select-String "CONTROL_PLANE_URL=").ToString().Split("=")[1].Trim('"')
$agentId = ($config | Select-String "EDGE_AGENT_ID=").ToString().Split("=")[1].Trim('"')
$agentName = ($config | Select-String "EDGE_AGENT_NAME=").ToString().Split("=")[1].Trim('"')

Write-Host "   Control Plane: $controlPlane"
Write-Host "   Agent ID:      $agentId"
Write-Host "   Agent Name:    $agentName"

# Check if we should build first
if ($Build) {
    Write-Host "`n🔨 Building edge agent executable..." -ForegroundColor Yellow
    Set-Location $edgeAgentDir
    & npm run build:exe
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Build completed" -ForegroundColor Green
}

# Check connectivity
Write-Host "`n🌐 Testing connectivity to control plane..." -ForegroundColor Yellow
try {
    $testUrl = "$controlPlane/health"
    $response = Invoke-WebRequest -Uri $testUrl -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "✅ Control plane is reachable" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Could not reach control plane: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "   The agent may fail to connect. Press Ctrl+C to abort or Enter to continue..." -ForegroundColor Yellow
    Read-Host
}

# Test camera connectivity
Write-Host "`n📷 Testing camera connectivity..." -ForegroundColor Yellow
$cameras = @("192.168.29.171", "192.168.29.196", "192.168.29.46")
$reachable = 0
foreach ($camera in $cameras) {
    $ping = Test-Connection -ComputerName $camera -Count 1 -Quiet -ErrorAction SilentlyContinue
    if ($ping) {
        Write-Host "   ✅ $camera is reachable" -ForegroundColor Green
        $reachable++
    } else {
        Write-Host "   ❌ $camera is NOT reachable" -ForegroundColor Red
    }
}

if ($reachable -eq 0) {
    Write-Host "`n⚠️  No cameras are reachable!" -ForegroundColor Yellow
    Write-Host "   The agent will start but won't discover any cameras." -ForegroundColor Yellow
    Write-Host "   Press Ctrl+C to abort or Enter to continue..." -ForegroundColor Yellow
    Read-Host
}

# Start the agent
Write-Host "`n🚀 Starting Edge Agent..." -ForegroundColor Green
Write-Host "   Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""
Write-Host "=".PadRight(80, "=") -ForegroundColor Gray
Write-Host ""

Set-Location $edgeAgentDir

# Check if node_modules exists
if (-not (Test-Path "$edgeAgentDir\node_modules")) {
    Write-Host "📦 Installing dependencies first..." -ForegroundColor Yellow
    & npm install
}

# Run the agent
try {
    & npm run dev
} catch {
    Write-Host "`n❌ Edge agent stopped with error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=".PadRight(80, "=") -ForegroundColor Gray
Write-Host "`n👋 Edge agent stopped." -ForegroundColor Yellow
Write-Host ""
