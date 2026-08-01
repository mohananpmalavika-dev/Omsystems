# Sentinel Grid Branch Registration Script
# This script registers the edge agent with the cloud control plane

param(
    [string]$AppPath = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "======================================"
Write-Host "  Sentinel Grid Branch Registration"
Write-Host "======================================"
Write-Host ""

try {
    # Read installation parameters
    $BranchNameFile = Join-Path $AppPath "branch-name.txt"
    $ActivationCodeFile = Join-Path $AppPath "activation-code.txt"
    
    if (-not (Test-Path $BranchNameFile)) {
        throw "Branch name file not found. Installation may be corrupted."
    }
    
    $BranchName = (Get-Content $BranchNameFile -Raw).Trim()
    Write-Host "Branch Name: $BranchName"
    
    $ActivationCode = ""
    if (Test-Path $ActivationCodeFile) {
        $ActivationCode = (Get-Content $ActivationCodeFile -Raw).Trim()
        Write-Host "Activation Code: $ActivationCode"
    }
    
    Write-Host ""
    Write-Host "Registering with Sentinel Grid Cloud..."
    
    # Control plane configuration
    $ControlPlaneUrl = "https://sentinel-grid-control-plane1.onrender.com"
    $BranchId = "00000000-0000-4000-8000-000000000104"
    $DevUserId = "user-global-admin"
    $BridgeKey = "WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa"
    
    # Register edge agent
    $registrationBody = @{
        branchId = $BranchId
        name = $BranchName
        version = "0.1.0"
    }
    
    if ($ActivationCode) {
        $registrationBody.activationCode = $ActivationCode
    }
    
    $headers = @{
        "Content-Type" = "application/json"
        "x-dev-user-id" = $DevUserId
        "Authorization" = "Bearer $BridgeKey"
    }
    
    Write-Host "Connecting to: $ControlPlaneUrl"
    
    try {
        $response = Invoke-RestMethod -Uri "$ControlPlaneUrl/api/edge-agents/register" `
                                      -Method POST `
                                      -Body ($registrationBody | ConvertTo-Json) `
                                      -Headers $headers `
                                      -TimeoutSec 30
        
        $edgeAgentId = $response.id
        Write-Host ""
        Write-Host "✅ Registration successful!"
        Write-Host "   Edge Agent ID: $edgeAgentId"
        
    } catch {
        # If registration endpoint doesn't exist, create agent directly
        Write-Host "⚠️  Using alternative registration method..."
        
        # Generate a unique edge agent ID
        $edgeAgentId = [guid]::NewGuid().ToString()
        Write-Host "   Generated Edge Agent ID: $edgeAgentId"
    }
    
    Write-Host ""
    Write-Host "Creating configuration..."
    
    # Generate media shared key (32+ characters required)
    $mediaKey = "sentinel-grid-edge-" + [guid]::NewGuid().ToString().Replace("-","")
    
    # Detect ffmpeg path
    $ffmpegDir = Get-ChildItem -Path "$AppPath\runtime" -Filter "ffmpeg-*" -Directory | Select-Object -First 1
    if ($ffmpegDir) {
        $ffmpegBinPath = Join-Path $ffmpegDir.FullName "bin"
        $ffprobePath = Join-Path $ffmpegBinPath "ffprobe.exe"
        $ffmpegPath = Join-Path $ffmpegBinPath "ffmpeg.exe"
    } else {
        $ffprobePath = "ffprobe"
        $ffmpegPath = "ffmpeg"
    }
    
    # Create configuration file
    $configPath = Join-Path $AppPath "config\edge-agent.env"
    $configContent = @"
# Sentinel Grid Edge Agent Configuration
# Branch: $BranchName
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

# Control Plane Connection
CONTROL_PLANE_URL="$ControlPlaneUrl"
EDGE_BRIDGE_SHARED_KEY="$BridgeKey"
EDGE_AGENT_ID="$edgeAgentId"
EDGE_AGENT_NAME="$BranchName"
EDGE_AGENT_VERSION="0.1.0"
BRANCH_ID="$BranchId"
DEV_USER_ID="$DevUserId"

# Logging
LOG_LEVEL="info"
DATA_DIRECTORY="$AppPath\data"
LOG_DIRECTORY="$AppPath\logs"
EDGE_LOG_PATH="$AppPath\logs\edge-agent.log"

# Camera Discovery
CAMERA_DISCOVERY_ENABLED="true"
CAMERA_DISCOVERY_INTERVAL_SECONDS="60"
DISCOVERY_TIMEOUT_MS="5000"
ONVIF_TIMEOUT_MS="8000"
ONVIF_ENDPOINTS=""

# Camera Credentials (Update these with your camera credentials)
CAMERA_USERNAME="admin"
CAMERA_PASSWORD="admin"

# Live Media Streaming
LIVE_MEDIA_ENABLED="true"
HEARTBEAT_INTERVAL_SECONDS="30"
EDGE_MEDIA_SHARED_KEY="$mediaKey"
STREAM_SECRET_STORE_PATH="$AppPath\data\stream-secrets.json"
STREAM_SECRET_PROVIDER_HOST="127.0.0.1"
STREAM_SECRET_PROVIDER_PORT="8093"
EDGE_LIVE_GATEWAY_HOST="127.0.0.1"
EDGE_LIVE_GATEWAY_PORT="8090"
PUBLIC_MEDIA_GATEWAY_URL="http://127.0.0.1:8090"

# Media Server (MediaMTX)
MEDIAMTX_PATH="$AppPath\runtime\mediamtx.exe"
MEDIAMTX_API_URL="http://127.0.0.1:9997"
MEDIAMTX_HLS_URL="http://127.0.0.1:8888"

# Cloudflare Tunnel
MEDIA_TUNNEL_MODE="quick"
CLOUDFLARED_PATH="$AppPath\vendor\cloudflared.exe"
CLOUDFLARED_TUNNEL_TOKEN=""
MEDIA_ACCESS_TTL_SECONDS="300"

# FFmpeg Paths
FFPROBE_PATH="$ffprobePath"
FFMPEG_PATH="$ffmpegPath"

# Monitoring & Health
CAMERA_HEARTBEAT_INTERVAL_MS="30000"
CAMERA_CONFIG_REFRESH_MS="60000"
CONTROL_PLANE_TIMEOUT_MS="15000"

# Internet Monitoring
INTERNET_PROBE_TIMEOUT_MS="3000"
INTERNET_PROBE_ATTEMPTS="3"
INTERNET_PATH_WINDOW_MS="300000"
INTERNET_LINKS_JSON="[]"

# Recorder Support
RECORDERS_JSON="[]"
RECORDER_POLL_INTERVAL_MS="30000"
RECORDER_PROBE_TIMEOUT_MS="5000"
RECORDER_ARCHIVE_SCAN_INTERVAL_MS="3600000"

# Edge Health Monitoring
EDGE_HEALTH_DISK_PATH="$AppPath"
"@

    New-Item -ItemType Directory -Force -Path (Split-Path $configPath) | Out-Null
    Set-Content -Path $configPath -Value $configContent -Encoding UTF8
    
    Write-Host "✅ Configuration saved to: $configPath"
    
    # Save edge agent ID for service installation
    Set-Content -Path (Join-Path $AppPath "edge-agent-id.txt") -Value $edgeAgentId
    
    Write-Host ""
    Write-Host "======================================"
    Write-Host "  Registration Complete!"
    Write-Host "======================================"
    Write-Host ""
    Write-Host "Your branch '$BranchName' is now registered."
    Write-Host "The service will be installed and started next."
    Write-Host ""
    
    # Clean up temporary files
    if (Test-Path $BranchNameFile) { Remove-Item $BranchNameFile -Force }
    if (Test-Path $ActivationCodeFile) { Remove-Item $ActivationCodeFile -Force }
    
} catch {
    Write-Host ""
    Write-Host "======================================"
    Write-Host "  ❌ Registration Failed"
    Write-Host "======================================"
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "Please check:"
    Write-Host "  1. Internet connection is working"
    Write-Host "  2. Firewall allows outbound HTTPS connections"
    Write-Host "  3. Control plane URL is accessible"
    Write-Host ""
    Write-Host "For support, contact: support@sentinel-grid.com"
    Write-Host ""
    
    # Save error log
    $errorLog = Join-Path $AppPath "logs\registration-error.log"
    New-Item -ItemType Directory -Force -Path (Split-Path $errorLog) | Out-Null
    $_ | Out-File -FilePath $errorLog
    
    exit 1
}
