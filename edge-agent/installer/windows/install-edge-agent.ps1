[CmdletBinding()]
param(
  [string]$InstallDirectory = (Join-Path $env:ProgramFiles "Sentinel Grid\Edge Agent"),
  [switch]$SkipConnectivityCheck
)

$ErrorActionPreference = "Stop"
$TaskName = "Sentinel Grid Edge Agent"
$SourceDirectory = $PSScriptRoot
$SourceExecutable = Join-Path $SourceDirectory "edge-agent.exe"
$SourceConfig = Join-Path $SourceDirectory "config\edge-agent.env"
$SourceUninstaller = Join-Path $SourceDirectory "uninstall-edge-agent.ps1"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this installer from an Administrator PowerShell window."
  }
}

function Get-ConfigValue([string]$Path, [string]$Name) {
  $prefix = "$Name="
  $line = Get-Content -LiteralPath $Path | Where-Object { $_.StartsWith($prefix) } | Select-Object -First 1
  if ($null -eq $line) { return "" }
  $raw = $line.Substring($prefix.Length)
  try { return ($raw | ConvertFrom-Json) } catch { return $raw.Trim('"') }
}

function Set-ConfigValue([string]$Path, [string]$Name, [string]$Value) {
  $lines = @(Get-Content -LiteralPath $Path)
  $encoded = $Value | ConvertTo-Json -Compress
  $replacement = "$Name=$encoded"
  $found = $false
  for ($index = 0; $index -lt $lines.Count; $index += 1) {
    if ($lines[$index].StartsWith("$Name=")) {
      $lines[$index] = $replacement
      $found = $true
      break
    }
  }
  if (-not $found) { $lines += $replacement }
  Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function Read-RequiredSecret([string]$Prompt, [int]$MinimumLength) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($plain.Length -lt $MinimumLength) { throw "The value must contain at least $MinimumLength characters." }
    return $plain
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

Assert-Administrator
if (-not (Test-Path -LiteralPath $SourceExecutable -PathType Leaf)) { throw "edge-agent.exe is missing. Extract the complete dashboard ZIP before installing." }
if (-not (Test-Path -LiteralPath $SourceConfig -PathType Leaf)) { throw "config\edge-agent.env is missing. Extract the complete dashboard ZIP before installing." }

$Executable = Join-Path $InstallDirectory "edge-agent.exe"
$ConfigDirectory = Join-Path $InstallDirectory "config"
$ConfigPath = Join-Path $ConfigDirectory "edge-agent.env"
$LogDirectory = Join-Path $InstallDirectory "logs"
$DataDirectory = Join-Path $InstallDirectory "data"

New-Item -ItemType Directory -Path $InstallDirectory, $ConfigDirectory, $LogDirectory, $DataDirectory -Force | Out-Null
Copy-Item -LiteralPath $SourceExecutable -Destination $Executable -Force
Copy-Item -LiteralPath $SourceConfig -Destination $ConfigPath -Force
if (Test-Path -LiteralPath $SourceUninstaller -PathType Leaf) {
  Copy-Item -LiteralPath $SourceUninstaller -Destination (Join-Path $InstallDirectory "uninstall-edge-agent.ps1") -Force
}
Unblock-File -LiteralPath $Executable

$controlPlaneUrl = Get-ConfigValue $ConfigPath "CONTROL_PLANE_URL"
if ($controlPlaneUrl.StartsWith("REPLACE_")) {
  $controlPlaneUrl = Read-Host "Public dashboard/control-plane URL (for example https://dashboard.example.com)"
  $parsedUri = $null
  if (-not [Uri]::TryCreate($controlPlaneUrl, [UriKind]::Absolute, [ref]$parsedUri) -or $parsedUri.Scheme -notin @("http", "https")) {
    throw "CONTROL_PLANE_URL must be an absolute HTTP or HTTPS URL."
  }
  Set-ConfigValue $ConfigPath "CONTROL_PLANE_URL" $controlPlaneUrl.TrimEnd('/')
}

$bridgeKey = Get-ConfigValue $ConfigPath "EDGE_BRIDGE_SHARED_KEY"
$developmentUserId = Get-ConfigValue $ConfigPath "DEV_USER_ID"
if ([string]::IsNullOrWhiteSpace($bridgeKey) -and [string]::IsNullOrWhiteSpace($developmentUserId)) {
  $bridgeKey = Read-RequiredSecret "Edge bridge shared key" 32
  Set-ConfigValue $ConfigPath "EDGE_BRIDGE_SHARED_KEY" $bridgeKey
}

$cameraPassword = Get-ConfigValue $ConfigPath "CAMERA_PASSWORD"
if ($cameraPassword.StartsWith("REPLACE_")) {
  $cameraPassword = Read-RequiredSecret "ONVIF camera password" 1
  Set-ConfigValue $ConfigPath "CAMERA_PASSWORD" $cameraPassword
}

# The config contains camera and bridge credentials. Only SYSTEM and local
# administrators should be able to read it after installation.
& icacls.exe $ConfigPath /inheritance:r /grant:r '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to protect the edge-agent configuration file." }

Write-Host "Validating edge-agent configuration..." -ForegroundColor Cyan
& $Executable --config $ConfigPath --check-config
if ($LASTEXITCODE -ne 0) { throw "Edge-agent configuration validation failed." }

if (-not $SkipConnectivityCheck) {
  Write-Host "Authenticating with the dashboard..." -ForegroundColor Cyan
  & $Executable --config $ConfigPath --diagnose
  if ($LASTEXITCODE -ne 0) { throw "Dashboard connectivity check failed. The startup task was not installed; correct the URL, firewall, or edge key and run this installer again." }
}

foreach ($dependency in @("ffprobe.exe", "ffmpeg.exe")) {
  if (-not (Get-Command $dependency -ErrorAction SilentlyContinue)) {
    Write-Warning "$dependency is not on PATH. The agent will connect, but RTSP probing/evidence features need an FFmpeg installation."
  }
}

$action = New-ScheduledTaskAction -Execute $Executable -Argument "--config `"$ConfigPath`"" -WorkingDirectory $InstallDirectory
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Sentinel Grid branch camera, recorder, storage and network monitoring agent" | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
$state = (Get-ScheduledTask -TaskName $TaskName).State

Write-Host "Sentinel Grid Edge Agent installed successfully." -ForegroundColor Green
Write-Host "Startup task: $TaskName ($state)"
Write-Host "Configuration: $ConfigPath"
Write-Host "Log: $LogDirectory\edge-agent.log"
