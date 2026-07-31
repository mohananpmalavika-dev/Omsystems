# Start Edge Agent for Gateway H1
# This script will configure and start the edge agent for testing

$ErrorActionPreference = "Stop"

# Configuration
$CONTROL_PLANE_URL = "https://sentinel-grid-monitoring1.onrender.com"
$GATEWAY_NAME = "H1"
$EDGE_AGENT_DIR = "C:\Omsystems\edge-agent"
$EDGE_AGENT_EXE = "$EDGE_AGENT_DIR\release\edge-agent.exe"
$CONFIG_DIR = "$EDGE_AGENT_DIR\config"
$CONFIG_FILE = "$CONFIG_DIR\edge-agent.env"
$LOG_DIR = "$EDGE_AGENT_DIR\logs"
$DATA_DIR = "$EDGE_AGENT_DIR\data"

# Check if running as Administrator
function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Write-Host "This script requires administrator privileges. Restarting as administrator..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Starting Edge Agent for H1" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if edge-agent.exe exists
if (-not (Test-Path $EDGE_AGENT_EXE)) {
    Write-Host "ERROR: edge-agent.exe not found at $EDGE_AGENT_EXE" -ForegroundColor Red
    Write-Host "Please ensure the edge agent is built first." -ForegroundColor Red
    pause
    exit 1
}

# Create directories
Write-Host "Creating directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $CONFIG_DIR, $LOG_DIR, $DATA_DIR -Force | Out-Null

# Get bridge key from user
Write-Host ""
Write-Host "You need a bridge key to authenticate with the control plane." -ForegroundColor Yellow
Write-Host "This is a secure key that connects your gateway to the dashboard." -ForegroundColor Yellow
Write-Host ""
$bridgeKey = Read-Host "Enter bridge key (or press Enter to generate a test key)"

if ([string]::IsNullOrWhiteSpace($bridgeKey)) {
    # Generate a test key
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $bridgeKey = [System.BitConverter]::ToString($bytes).Replace('-', '').ToLower()
    Write-Host ""
    Write-Host "Generated test bridge key:" -ForegroundColor Green
    Write-Host $bridgeKey -ForegroundColor Yellow
    Write-Host ""
    Write-Host "NOTE: You need to register this key in your database for H1!" -ForegroundColor Red
    Write-Host ""
}

# Create configuration
Write-Host "Creating configuration file..." -ForegroundColor Yellow
$configContent = @"
CONTROL_PLANE_URL="$CONTROL_PLANE_URL"
EDGE_BRIDGE_SHARED_KEY="$bridgeKey"
GATEWAY_NAME="$GATEWAY_NAME"
LOG_LEVEL="info"
DATA_DIRECTORY="$DATA_DIR"
LOG_DIRECTORY="$LOG_DIR"
CAMERA_DISCOVERY_ENABLED="true"
CAMERA_DISCOVERY_INTERVAL_SECONDS="300"
LIVE_MEDIA_ENABLED="false"
HEARTBEAT_INTERVAL_SECONDS="30"
"@

Set-Content -Path $CONFIG_FILE -Value $configContent -Encoding UTF8
Write-Host "Configuration created at: $CONFIG_FILE" -ForegroundColor Green

# Test configuration
Write-Host ""
Write-Host "Testing configuration..." -ForegroundColor Yellow
try {
    $testResult = & $EDGE_AGENT_EXE --config $CONFIG_FILE --check-config 2>&1
    Write-Host "Configuration is valid!" -ForegroundColor Green
} catch {
    Write-Host "Configuration test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Ask if user wants to start now
Write-Host ""
Write-Host "Ready to start the edge agent for H1!" -ForegroundColor Green
Write-Host ""
$response = Read-Host "Start now? (Y/N)"

if ($response -eq 'Y' -or $response -eq 'y') {
    Write-Host ""
    Write-Host "Starting edge agent..." -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Start the edge agent
    & $EDGE_AGENT_EXE --run --config $CONFIG_FILE
} else {
    Write-Host ""
    Write-Host "Edge agent NOT started." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To start manually, run:" -ForegroundColor Cyan
    Write-Host "  $EDGE_AGENT_EXE --run --config $CONFIG_FILE" -ForegroundColor White
    Write-Host ""
    pause
}
