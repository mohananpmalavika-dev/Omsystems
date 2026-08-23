# Sentinel Grid Edge Agent Bootstrap Installer
# This lightweight installer downloads the edge agent bundle and runtime components on first use.

param(
    [Parameter(Mandatory=$true)]
    [string]$ActivationCode,
    
    [Parameter(Mandatory=$true)]
    [string]$ControlPlaneUrl,
    
    [Parameter(Mandatory=$true)]
    [string]$AgentName,
    
    [Parameter(Mandatory=$true)]
    [string]$BranchId,
    
    [Parameter(Mandatory=$true)]
    [string]$ActivationId
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   SENTINEL GRID EDGE AGENT - BOOTSTRAP INSTALLER" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# Installation directory
$InstallDir = "$env:ProgramData\SentinelGrid\EdgeAgent"
$DataDir = "$InstallDir\data"
$LogsDir = "$InstallDir\logs"
$VendorDir = "$InstallDir\vendor\windows"

# Create directories
Write-Host "[1/5] Creating installation directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
New-Item -ItemType Directory -Path $VendorDir -Force | Out-Null
Write-Host "  ✓ Directories created" -ForegroundColor Green

# Download edge agent bundle
Write-Host "[2/5] Downloading edge agent bundle..." -ForegroundColor Yellow
$BundleUrl = "$ControlPlaneUrl/api/control/v1/edge-agent/bundle/edge-agent.cjs"
$BundlePath = "$InstallDir\edge-agent.cjs"
try {
    Invoke-WebRequest -Uri $BundleUrl -OutFile $BundlePath -UseBasicParsing
    Write-Host "  ✓ Bundle downloaded ($(([math]::Round((Get-Item $BundlePath).Length / 1KB, 2))) KB)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Failed to download bundle: $_" -ForegroundColor Red
    exit 1
}

# Download runtime components
Write-Host "[3/5] Downloading runtime components..." -ForegroundColor Yellow

$Components = @(
    @{
        Name = "FFmpeg"
        Url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-07-31-14-10/ffmpeg-n8.1.2-34-g9b6c8969e0-win64-lgpl-shared-8.1.zip"
        Dest = "$VendorDir\ffmpeg.zip"
    },
    @{
        Name = "MediaMTX"
        Url = "https://github.com/bluenviron/mediamtx/releases/download/v1.17.1/mediamtx_v1.17.1_windows_amd64.zip"
        Dest = "$VendorDir\mediamtx.zip"
    },
    @{
        Name = "Cloudflared"
        Url = "https://github.com/cloudflare/cloudflared/releases/download/2026.5.2/cloudflared-windows-amd64.exe"
        Dest = "$VendorDir\cloudflared.exe"
    }
)

foreach ($Component in $Components) {
    Write-Host "  Downloading $($Component.Name)..." -ForegroundColor Gray
    try {
        Invoke-WebRequest -Uri $Component.Url -OutFile $Component.Dest -UseBasicParsing
        Write-Host "    ✓ $($Component.Name) downloaded" -ForegroundColor Green
    } catch {
        Write-Host "    ⚠ $($Component.Name) download failed (will retry on agent start)" -ForegroundColor Yellow
    }
}

# Create configuration
Write-Host "[4/5] Creating configuration..." -ForegroundColor Yellow
$Config = @"
CONTROL_PLANE_URL=$ControlPlaneUrl
BRANCH_ID=$BranchId
EDGE_AGENT_ID=$ActivationId
EDGE_AGENT_NAME=$AgentName
EDGE_ACTIVATION_CODE=$ActivationCode
EDGE_AGENT_VERSION=0.1.10
LIVE_MEDIA_ENABLED=true
EDGE_MANAGED_MEDIA_BOOTSTRAP=true
MEDIA_RUNTIME_MANAGED=true
EDGE_LOG_PATH=./logs/edge-agent.log
STREAM_SECRET_STORE_PATH=./data/stream-secrets.json
"@

$Config | Out-File -FilePath "$InstallDir\config.env" -Encoding UTF8
Write-Host "  ✓ Configuration saved" -ForegroundColor Green

# Create startup script
Write-Host "[5/5] Creating startup script..." -ForegroundColor Yellow
$StartupScript = @"
@echo off
cd /d "$InstallDir"
node edge-agent.cjs --config config.env
"@

$StartupScript | Out-File -FilePath "$InstallDir\start.bat" -Encoding ASCII
Write-Host "  ✓ Startup script created" -ForegroundColor Green

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "   INSTALLATION COMPLETE!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Installation location: $InstallDir" -ForegroundColor White
Write-Host ""
Write-Host "To start the agent, run:" -ForegroundColor White
Write-Host "  $InstallDir\start.bat" -ForegroundColor Cyan
Write-Host ""
Write-Host "Or install as a Windows service for automatic startup." -ForegroundColor White
Write-Host ""
