# Start Camera Scanner
# This PowerShell script loads .env file and starts the scanner

Write-Host "Starting Camera Scanner..." -ForegroundColor Green
Write-Host ""
Write-Host "Loading configuration from .env file..." -ForegroundColor Yellow

# Change to edge-agent directory
Set-Location $PSScriptRoot

# Load .env file into a hashtable
$envVars = @{}
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            $envVars[$key] = $value
            Write-Host "  Loaded: $key" -ForegroundColor Gray
        }
    }
    Write-Host ""
    Write-Host "Configuration loaded successfully!" -ForegroundColor Green
} else {
    Write-Host "ERROR: .env file not found!" -ForegroundColor Red
    Write-Host "Please run SETUP_AND_START_SCANNER.bat first" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Starting scanner..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start node with all environment variables
$env:CONTROL_PLANE_URL = $envVars['CONTROL_PLANE_URL']
$env:EDGE_BRIDGE_SHARED_KEY = $envVars['EDGE_BRIDGE_SHARED_KEY']
$env:EDGE_AGENT_ID = $envVars['EDGE_AGENT_ID']
$env:EDGE_AGENT_NAME = $envVars['EDGE_AGENT_NAME']
$env:EDGE_AGENT_VERSION = $envVars['EDGE_AGENT_VERSION']
$env:BRANCH_ID = $envVars['BRANCH_ID']
$env:LOG_LEVEL = $envVars['LOG_LEVEL']
$env:DATA_DIRECTORY = $envVars['DATA_DIRECTORY']
$env:LOG_DIRECTORY = $envVars['LOG_DIRECTORY']
$env:EDGE_LOG_PATH = $envVars['EDGE_LOG_PATH']
$env:CAMERA_DISCOVERY_ENABLED = $envVars['CAMERA_DISCOVERY_ENABLED']
$env:CAMERA_DISCOVERY_INTERVAL_SECONDS = $envVars['CAMERA_DISCOVERY_INTERVAL_SECONDS']
$env:LIVE_MEDIA_ENABLED = $envVars['LIVE_MEDIA_ENABLED']
$env:HEARTBEAT_INTERVAL_SECONDS = $envVars['HEARTBEAT_INTERVAL_SECONDS']
$env:EDGE_MEDIA_SHARED_KEY = $envVars['EDGE_MEDIA_SHARED_KEY']
$env:STREAM_SECRET_STORE_PATH = $envVars['STREAM_SECRET_STORE_PATH']
$env:STREAM_SECRET_PROVIDER_HOST = $envVars['STREAM_SECRET_PROVIDER_HOST']
$env:STREAM_SECRET_PROVIDER_PORT = $envVars['STREAM_SECRET_PROVIDER_PORT']
$env:EDGE_LIVE_GATEWAY_HOST = $envVars['EDGE_LIVE_GATEWAY_HOST']
$env:EDGE_LIVE_GATEWAY_PORT = $envVars['EDGE_LIVE_GATEWAY_PORT']
$env:PUBLIC_MEDIA_GATEWAY_URL = $envVars['PUBLIC_MEDIA_GATEWAY_URL']
$env:MEDIAMTX_PATH = $envVars['MEDIAMTX_PATH']
$env:MEDIAMTX_API_URL = $envVars['MEDIAMTX_API_URL']
$env:MEDIAMTX_HLS_URL = $envVars['MEDIAMTX_HLS_URL']
$env:MEDIA_TUNNEL_MODE = $envVars['MEDIA_TUNNEL_MODE']
$env:CLOUDFLARED_PATH = $envVars['CLOUDFLARED_PATH']
$env:MEDIA_ACCESS_TTL_SECONDS = $envVars['MEDIA_ACCESS_TTL_SECONDS']
$env:FFPROBE_PATH = $envVars['FFPROBE_PATH']
$env:FFMPEG_PATH = $envVars['FFMPEG_PATH']
$env:CAMERA_USERNAME = $envVars['CAMERA_USERNAME']
$env:CAMERA_PASSWORD = $envVars['CAMERA_PASSWORD']
$env:ONVIF_ENDPOINTS = $envVars['ONVIF_ENDPOINTS']
$env:RECORDER_DISCOVERY_MAX_CHANNELS = $envVars['RECORDER_DISCOVERY_MAX_CHANNELS']

Write-Host "EDGE_AGENT_ID set to: $env:EDGE_AGENT_ID" -ForegroundColor Cyan
Write-Host ""

# Start the scanner
node dist\src\index.js
