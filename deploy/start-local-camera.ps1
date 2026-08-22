[CmdletBinding()]
param(
  [string]$OnvifUrl = "http://192.168.29.58:8899/onvif/device_service",
  [string]$SecretReference = "local://pilot/camera-01",
  [string]$PublicHost = "192.168.29.100",
  [string]$ProfileName = "subStream",
  [string]$PublicHlsBaseUrl = "",
  [string]$PublicWebRtcBaseUrl = "",
  [string]$CameraUsername = "",
  [object]$CameraPassword
)

$ErrorActionPreference = "Stop"
$cameraUsername = if ($CameraUsername) {
  $CameraUsername
} else {
  Read-Host "Camera username"
}
$securePassword = if ($CameraPassword) {
  if ($CameraPassword -is [Security.SecureString]) {
    $CameraPassword
  } else {
    ConvertTo-SecureString ([string]$CameraPassword) -AsPlainText -Force
  }
} else {
  Read-Host "Camera password" -AsSecureString
}
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
  $securePassword
)

try {
  $plainCameraPassword =
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

  $env:CAMERA_ONVIF_URL = $OnvifUrl
  $env:CAMERA_USERNAME = $cameraUsername
  $env:CAMERA_PASSWORD = $plainCameraPassword
  $env:CAMERA_PROFILE_NAME = $ProfileName

  $sourceUri = & node .\edge-agent\scripts\resolve-camera-stream.mjs
  if ($LASTEXITCODE -ne 0 -or -not $sourceUri) {
    throw "Unable to resolve the camera RTSP stream"
  }

  $env:STREAM_SECRETS_JSON = @{
    $SecretReference = $sourceUri
  } | ConvertTo-Json -Compress
  $env:PUBLIC_HLS_BASE_URL = if ($PublicHlsBaseUrl) {
    $PublicHlsBaseUrl
  } else {
    "http://${PublicHost}:8888"
  }
  $env:PUBLIC_WEBRTC_BASE_URL = if ($PublicWebRtcBaseUrl) {
    $PublicWebRtcBaseUrl
  } else {
    "http://${PublicHost}:8889"
  }
  $env:DASHBOARD_DEV_USER_ID = "user-global-admin"

  & docker compose up -d --build --force-recreate `
    api media-gateway recording-engine dashboard
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose could not start the camera services"
  }

  Write-Host "Local camera services are running at http://${PublicHost}:3000"
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  Remove-Item Env:CAMERA_ONVIF_URL -ErrorAction SilentlyContinue
  Remove-Item Env:CAMERA_USERNAME -ErrorAction SilentlyContinue
  Remove-Item Env:CAMERA_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:CAMERA_PROFILE_NAME -ErrorAction SilentlyContinue
  Remove-Item Env:STREAM_SECRETS_JSON -ErrorAction SilentlyContinue
  Remove-Item Env:PUBLIC_HLS_BASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PUBLIC_WEBRTC_BASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:DASHBOARD_DEV_USER_ID -ErrorAction SilentlyContinue
}
