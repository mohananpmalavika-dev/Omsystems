[CmdletBinding()]
param(
  [string]$RenderServiceId = "srv-d9f5bq37uimc73an5dj0",
  [string]$RenderUrl = "https://sentinel-grid-monitoring.onrender.com",
  [string]$DashboardUsername = "sentinel-admin"
)

$ErrorActionPreference = "Stop"

function New-RandomSecret([int]$byteCount) {
  $bytes = New-Object byte[] $byteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Start-Tunnel([string]$name, [string]$origin) {
  & docker run `
    -d `
    --name $name `
    --network omsystems_default `
    --restart unless-stopped `
    cloudflare/cloudflared:latest `
    tunnel --no-autoupdate --url $origin | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not start ${name}"
  }
}

function Wait-TunnelUrl([string]$name) {
  for ($attempt = 0; $attempt -lt 45; $attempt += 1) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $logs = & docker logs $name 2>&1 | Out-String
    }
    finally {
      $ErrorActionPreference = $previousPreference
    }
    $match = [regex]::Match(
      $logs,
      "https://[a-z0-9-]+\.trycloudflare\.com"
    )
    if ($match.Success) {
      return $match.Value
    }
    Start-Sleep -Seconds 1
  }
  throw "Timed out waiting for ${name}"
}

function Assert-ProtectedControlPlane([string]$BridgeKey) {
  try {
    Invoke-WebRequest `
      -Uri "http://localhost:8080/v1/branches" `
      -Headers @{ "x-user-id" = "user-global-admin" } `
      -UseBasicParsing | Out-Null
    throw "Control plane accepted a request without the bridge key"
  }
  catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 401) {
      throw
    }
  }

  Invoke-WebRequest `
    -Uri "http://localhost:8080/v1/branches" `
    -Headers @{
      "x-user-id" = "user-global-admin"
      "x-edge-bridge-key" = $BridgeKey
    } `
    -UseBasicParsing | Out-Null
}

function Assert-PublicBridge(
  [string]$ControlUrl,
  [string]$MediaUrl,
  [string]$BridgeKey
) {
  Invoke-WebRequest `
    -Uri "${ControlUrl}/health" `
    -UseBasicParsing | Out-Null
  Invoke-WebRequest `
    -Uri "${MediaUrl}/health" `
    -UseBasicParsing | Out-Null
  Invoke-WebRequest `
    -Uri "${ControlUrl}/v1/branches" `
    -Headers @{
      "x-user-id" = "user-global-admin"
      "x-edge-bridge-key" = $BridgeKey
    } `
    -UseBasicParsing | Out-Null
}

function Get-RenderHeaders {
  $configPath = "$env:USERPROFILE\.render\cli.yaml"
  $apiKeyLine = Get-Content $configPath |
    Where-Object { $_ -match "^\s{4}key:" } |
    Select-Object -First 1
  if (-not $apiKeyLine) {
    throw "Render CLI API credential was not found"
  }
  $apiKey = ($apiKeyLine -replace "^\s{4}key:\s*", "").Trim('"', "'")
  return @{
    Authorization = "Bearer $apiKey"
    Accept = "application/json"
  }
}

$tunnelNames = @(
  "sentinel-tunnel-control",
  "sentinel-tunnel-media",
  "sentinel-tunnel-hls"
)
$cameraUsername = Read-Host "Camera username"
$cameraPassword = Read-Host "Camera password" -AsSecureString
$bridgeKey = New-RandomSecret 48
$dashboardPassword = "SG-" + (New-RandomSecret 18)

try {
  $env:EDGE_BRIDGE_SHARED_KEY = $bridgeKey
  $env:DASHBOARD_ACCESS_USERNAME = $DashboardUsername
  $env:DASHBOARD_ACCESS_PASSWORD = $dashboardPassword

  & .\deploy\start-local-camera.ps1 `
    -CameraUsername $cameraUsername `
    -CameraPassword $cameraPassword

  Assert-ProtectedControlPlane -BridgeKey $bridgeKey

  foreach ($name in $tunnelNames) {
    $existing = & docker ps -a --filter "name=^/${name}$" --format "{{.Names}}"
    if ($existing -eq $name) {
      & docker rm -f $name | Out-Null
    }
  }

  Start-Tunnel "sentinel-tunnel-control" "http://api:8080"
  Start-Tunnel "sentinel-tunnel-media" "http://media-gateway:8090"
  Start-Tunnel "sentinel-tunnel-hls" "http://mediamtx:8888"

  $controlUrl = Wait-TunnelUrl "sentinel-tunnel-control"
  $mediaUrl = Wait-TunnelUrl "sentinel-tunnel-media"
  $hlsUrl = Wait-TunnelUrl "sentinel-tunnel-hls"

  & .\deploy\start-local-camera.ps1 `
    -CameraUsername $cameraUsername `
    -CameraPassword $cameraPassword `
    -PublicHlsBaseUrl $hlsUrl

  Assert-PublicBridge `
    -ControlUrl $controlUrl `
    -MediaUrl $mediaUrl `
    -BridgeKey $bridgeKey

  $renderHeaders = Get-RenderHeaders
  $renderVariables = [ordered]@{
    DASHBOARD_DEMO_MODE = "false"
    CONTROL_PLANE_INTERNAL_URL = $controlUrl
    MEDIA_GATEWAY_INTERNAL_URL = $mediaUrl
    DASHBOARD_DEV_USER_ID = "user-global-admin"
    EDGE_BRIDGE_SHARED_KEY = $bridgeKey
    DASHBOARD_ACCESS_USERNAME = $DashboardUsername
    DASHBOARD_ACCESS_PASSWORD = $dashboardPassword
  }

  foreach ($entry in $renderVariables.GetEnumerator()) {
    $key = [Uri]::EscapeDataString($entry.Key)
    $body = @{ value = $entry.Value } | ConvertTo-Json -Compress
    Invoke-RestMethod `
      -Method Put `
      -Uri "https://api.render.com/v1/services/${RenderServiceId}/env-vars/${key}" `
      -Headers $renderHeaders `
      -ContentType "application/json" `
      -Body $body | Out-Null
  }

  [pscustomobject]@{
    renderUrl = $RenderUrl
    controlTunnel = $controlUrl
    mediaTunnel = $mediaUrl
    hlsTunnel = $hlsUrl
    dashboardUsername = $DashboardUsername
    dashboardPassword = $dashboardPassword
  } | ConvertTo-Json
}
finally {
  Remove-Item Env:EDGE_BRIDGE_SHARED_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:DASHBOARD_ACCESS_USERNAME -ErrorAction SilentlyContinue
  Remove-Item Env:DASHBOARD_ACCESS_PASSWORD -ErrorAction SilentlyContinue
}
