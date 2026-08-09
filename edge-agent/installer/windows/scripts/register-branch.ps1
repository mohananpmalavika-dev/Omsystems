# Sentinel Grid zero-touch branch bootstrap.
param(
    [string]$AppPath = (Split-Path -Parent $PSScriptRoot),
    [string]$ControlPlaneUrl = "https://sentinel-grid-control-plane1.onrender.com"
)

$ErrorActionPreference = "Stop"
$BranchNameFile = Join-Path $AppPath "branch-name.txt"
$ActivationCodeFile = Join-Path $AppPath "activation-code.txt"
if (-not (Test-Path -LiteralPath $BranchNameFile -PathType Leaf)) { throw "Branch name is missing." }
if (-not (Test-Path -LiteralPath $ActivationCodeFile -PathType Leaf)) { throw "A one-time activation code is required." }

$BranchName = (Get-Content -LiteralPath $BranchNameFile -Raw).Trim()
$ActivationCode = (Get-Content -LiteralPath $ActivationCodeFile -Raw).Trim()
if (-not $ActivationCode.StartsWith("sgact_") -or $ActivationCode.Length -lt 40) {
    throw "The activation code is invalid. Create a fresh code in Sentinel Grid."
}

$RuntimeDirectory = Join-Path $AppPath "runtime"
$Ffprobe = Get-ChildItem -LiteralPath $RuntimeDirectory -Filter "ffprobe.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$Ffmpeg = Get-ChildItem -LiteralPath $RuntimeDirectory -Filter "ffmpeg.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$MediaMtx = Get-ChildItem -LiteralPath $RuntimeDirectory -Filter "mediamtx.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$Cloudflared = Get-ChildItem -LiteralPath $RuntimeDirectory -Filter "cloudflared.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Ffprobe -or -not $Ffmpeg -or -not $MediaMtx -or -not $Cloudflared) {
    throw "The gateway runtime package is incomplete. ffmpeg, ffprobe, MediaMTX, and cloudflared are required."
}
$ConfigPath = Join-Path $AppPath "config\edge-agent.env"
$DataPath = Join-Path $AppPath "data"
$LogPath = Join-Path $AppPath "logs\edge-agent.log"

$ConfigContent = @"
CONTROL_PLANE_URL="$ControlPlaneUrl"
BRANCH_ID=""
EDGE_AGENT_ID=""
EDGE_BRIDGE_SHARED_KEY=""
DEV_USER_ID=""
EDGE_ACTIVATION_CODE="$ActivationCode"
EDGE_AGENT_NAME="$BranchName"
EDGE_AGENT_VERSION="0.1.6"
EDGE_IDENTITY_PATH="$DataPath\device-identity.enc"
EDGE_IDENTITY_KEY_PATH="$DataPath\device-identity.key"
EDGE_OFFLINE_OUTBOX_PATH="$DataPath\offline-outbox.enc"
EDGE_OFFLINE_OUTBOX_KEY_PATH="$DataPath\offline-outbox.key"
EDGE_OFFLINE_OUTBOX_MAX_ITEMS="10000"
EDGE_CAMERA_CREDENTIAL_VAULT_PATH="$DataPath\camera-credentials.enc"
EDGE_CAMERA_CREDENTIAL_VAULT_KEY_PATH="$DataPath\camera-credentials.key"
EDGE_UPDATE_STAGING_PATH="$DataPath\updates"
EDGE_LOG_PATH="$LogPath"
CAMERA_USERNAME=""
CAMERA_PASSWORD=""
ONVIF_ENDPOINTS=""
AUTO_DISCOVERY_ENABLED="true"
AUTO_DISCOVERY_INTERVAL_MS="900000"
DISCOVERY_TIMEOUT_MS="8000"
ONVIF_TIMEOUT_MS="10000"
FFPROBE_PATH="$($Ffprobe.FullName)"
FFMPEG_PATH="$($Ffmpeg.FullName)"
LIVE_MEDIA_ENABLED="true"
EDGE_MANAGED_MEDIA_BOOTSTRAP="true"
EDGE_LIVE_GATEWAY_HOST="0.0.0.0"
EDGE_LIVE_GATEWAY_PORT="8090"
PUBLIC_MEDIA_GATEWAY_URL="auto"
MEDIA_RUNTIME_MANAGED="true"
MEDIAMTX_PATH="$($MediaMtx.FullName)"
MEDIA_TUNNEL_MODE="quick"
MEDIA_QUICK_TUNNEL_FALLBACK="false"
CLOUDFLARED_PATH="$($Cloudflared.FullName)"
STREAM_SECRET_STORE_PATH="$DataPath\stream-secrets.json"
CAMERA_HEARTBEAT_INTERVAL_MS="30000"
CAMERA_CONFIG_REFRESH_MS="60000"
CONTROL_PLANE_TIMEOUT_MS="30000"
INTERNET_LINKS_JSON="[]"
RECORDERS_JSON="[]"
RECORDER_POLL_INTERVAL_MS="30000"
RECORDER_ARCHIVE_SCAN_INTERVAL_MS="21600000"
EDGE_HEALTH_DISK_PATH="$AppPath"
"@

New-Item -ItemType Directory -Path (Split-Path $ConfigPath), $DataPath, (Split-Path $LogPath) -Force | Out-Null
Set-Content -LiteralPath $ConfigPath -Value $ConfigContent -Encoding UTF8
& icacls.exe $ConfigPath /inheritance:r /grant:r '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to protect gateway configuration." }

Remove-Item -LiteralPath $BranchNameFile, $ActivationCodeFile -Force -ErrorAction SilentlyContinue
Write-Host "Gateway bootstrap saved. The Windows service will consume the one-time code on first start."
