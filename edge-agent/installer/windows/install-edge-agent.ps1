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
$SourceDashboardLauncher = Join-Path $SourceDirectory "open-dashboard-scan.ps1"
$SourceRuntimePackages = Join-Path $SourceDirectory "runtime-packages"
$RestoreExistingTaskOnFailure = $false

# The self-extracting EXE launches this script in a separate elevated PowerShell
# process. Preserve terminating errors there so an operator can read and act on
# them instead of seeing a red flash followed by a closed console.
trap {
  if ($RestoreExistingTaskOnFailure) {
    try {
      Enable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
      Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    } catch { }
  }
  $failureDetail = ([string]$_.Exception.Message) -replace '(?i)sgact_[A-Za-z0-9_-]+', 'sgact_[redacted]'
  $failureLogPath = Join-Path $InstallDirectory "logs\edge-agent.log"
  Write-Host ""
  Write-Host "Sentinel Grid Edge Agent installation did not complete." -ForegroundColor Red
  Write-Host $failureDetail -ForegroundColor Red
  Write-Host "Log: $failureLogPath" -ForegroundColor Yellow
  Write-Host "Download a fresh installer only when the message says the activation is invalid or expired." -ForegroundColor Yellow
  try { [void](Read-Host "Press Enter to close this installer") } catch { }
  exit 1
}

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
  # dotenv expands \r and \n inside double-quoted values. JSON-encoded native
  # Windows paths therefore corrupt segments such as "\runtime" at startup.
  # Node and Windows accept forward slashes, which remain literal in dotenv.
  if ($Value -match '^[A-Za-z]:\\') {
    $Value = $Value.Replace('\', '/')
  }
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

function Get-InstalledAgentProcesses([string]$Root) {
  $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  return @(
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
      try {
        $processPath = $_.Path
        -not [string]::IsNullOrWhiteSpace($processPath) -and
          [IO.Path]::GetFullPath($processPath).StartsWith($fullRoot, [StringComparison]::OrdinalIgnoreCase)
      } catch {
        $false
      }
    }
  )
}

function Stop-InstalledAgentProcesses([string]$Root) {
  Write-Host "Terminating any previous Sentinel Grid Edge Agent processes..." -ForegroundColor Yellow

  # Stop only processes launched from this installation. Name-based matching
  # can terminate unrelated ffmpeg or cloudflared workloads on the same host.
  foreach ($process in Get-InstalledAgentProcesses $Root) {
    if ($process.Id -ne $PID) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }

  # Clean the lock only after the installed process tree has been drained.
  $lockFile = Join-Path $Root "data\edge-agent.lock"
  if (Test-Path -LiteralPath $lockFile) {
    Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
  }
}

Assert-Administrator
if (-not (Test-Path -LiteralPath $SourceExecutable -PathType Leaf)) { throw "The all-in-one installer could not extract edge-agent.exe." }
if (-not (Test-Path -LiteralPath $SourceConfig -PathType Leaf)) { throw "The all-in-one installer could not extract its branch configuration." }

$Executable = Join-Path $InstallDirectory "edge-agent.exe"
$ConfigDirectory = Join-Path $InstallDirectory "config"
$ConfigPath = Join-Path $ConfigDirectory "edge-agent.env"
$LogDirectory = Join-Path $InstallDirectory "logs"
$DataDirectory = Join-Path $InstallDirectory "data"

New-Item -ItemType Directory -Path $InstallDirectory, $ConfigDirectory, $LogDirectory, $DataDirectory -Force | Out-Null
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
  $RestoreExistingTaskOnFailure = $true
  Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}
Stop-InstalledAgentProcesses $InstallDirectory
Copy-Item -LiteralPath $SourceExecutable -Destination $Executable -Force
Copy-Item -LiteralPath $SourceConfig -Destination $ConfigPath -Force
if (Test-Path -LiteralPath $SourceUninstaller -PathType Leaf) {
  Copy-Item -LiteralPath $SourceUninstaller -Destination (Join-Path $InstallDirectory "uninstall-edge-agent.ps1") -Force
}
if (Test-Path -LiteralPath $SourceDashboardLauncher -PathType Leaf) {
  Copy-Item -LiteralPath $SourceDashboardLauncher -Destination (Join-Path $InstallDirectory "open-dashboard-scan.ps1") -Force
}
if (Test-Path -LiteralPath (Join-Path $SourceDirectory "THIRD_PARTY_NOTICES.txt") -PathType Leaf) {
  Copy-Item -LiteralPath (Join-Path $SourceDirectory "THIRD_PARTY_NOTICES.txt") -Destination (Join-Path $InstallDirectory "THIRD_PARTY_NOTICES.txt") -Force
}
Unblock-File -LiteralPath $Executable

$RuntimeDirectory = Join-Path $InstallDirectory "runtime"
$FfmpegArchive = Join-Path $SourceRuntimePackages "ffmpeg.zip"
$MediaMtxArchive = Join-Path $SourceRuntimePackages "mediamtx.zip"
$CloudflaredSource = Join-Path $SourceRuntimePackages "cloudflared.exe"
if ((Test-Path -LiteralPath $FfmpegArchive -PathType Leaf) -and
    (Test-Path -LiteralPath $MediaMtxArchive -PathType Leaf) -and
    (Test-Path -LiteralPath $CloudflaredSource -PathType Leaf)) {
  Write-Host "Installing the bundled camera media runtime..." -ForegroundColor Cyan
  $FfmpegDirectory = Join-Path $RuntimeDirectory "ffmpeg"
  $MediaMtxDirectory = Join-Path $RuntimeDirectory "mediamtx"
  New-Item -ItemType Directory -Path $RuntimeDirectory, $FfmpegDirectory, $MediaMtxDirectory -Force | Out-Null
  Expand-Archive -LiteralPath $FfmpegArchive -DestinationPath $FfmpegDirectory -Force
  Expand-Archive -LiteralPath $MediaMtxArchive -DestinationPath $MediaMtxDirectory -Force
  $FfmpegExecutable = Get-ChildItem -LiteralPath $FfmpegDirectory -Filter "ffmpeg.exe" -File -Recurse | Select-Object -First 1
  $FfprobeExecutable = Get-ChildItem -LiteralPath $FfmpegDirectory -Filter "ffprobe.exe" -File -Recurse | Select-Object -First 1
  $MediaMtxExecutable = Get-ChildItem -LiteralPath $MediaMtxDirectory -Filter "mediamtx.exe" -File -Recurse | Select-Object -First 1
  if (-not $FfmpegExecutable -or -not $FfprobeExecutable -or -not $MediaMtxExecutable) {
    throw "The bundled camera runtime archives are incomplete."
  }
  $CloudflaredExecutable = Join-Path $RuntimeDirectory "cloudflared.exe"
  Copy-Item -LiteralPath $CloudflaredSource -Destination $CloudflaredExecutable -Force
  Unblock-File -LiteralPath $FfmpegExecutable.FullName
  Unblock-File -LiteralPath $FfprobeExecutable.FullName
  Unblock-File -LiteralPath $MediaMtxExecutable.FullName
  Unblock-File -LiteralPath $CloudflaredExecutable
  Set-ConfigValue $ConfigPath "FFMPEG_PATH" $FfmpegExecutable.FullName
  Set-ConfigValue $ConfigPath "FFPROBE_PATH" $FfprobeExecutable.FullName
  Set-ConfigValue $ConfigPath "MEDIAMTX_PATH" $MediaMtxExecutable.FullName
  Set-ConfigValue $ConfigPath "CLOUDFLARED_PATH" $CloudflaredExecutable
  Set-ConfigValue $ConfigPath "LIVE_MEDIA_ENABLED" "true"
  Set-ConfigValue $ConfigPath "EDGE_MANAGED_MEDIA_BOOTSTRAP" "true"
  Set-ConfigValue $ConfigPath "EDGE_LIVE_GATEWAY_HOST" "0.0.0.0"
  Set-ConfigValue $ConfigPath "EDGE_LIVE_GATEWAY_PORT" "8090"
  Set-ConfigValue $ConfigPath "PUBLIC_MEDIA_GATEWAY_URL" "auto"
  Set-ConfigValue $ConfigPath "MEDIA_TUNNEL_MODE" "quick"
  Set-ConfigValue $ConfigPath "MEDIA_QUICK_TUNNEL_FALLBACK" "false"
}

$controlPlaneUrl = Get-ConfigValue $ConfigPath "CONTROL_PLANE_URL"
if ([string]::IsNullOrWhiteSpace($controlPlaneUrl) -or $controlPlaneUrl.StartsWith("REPLACE_")) {
  throw "This installer is missing its automatic Sentinel Grid server address. Return to Sentinel Grid and download a new scanner installer."
}
$parsedUri = $null
if (-not [Uri]::TryCreate($controlPlaneUrl, [UriKind]::Absolute, [ref]$parsedUri) -or $parsedUri.Scheme -notin @("http", "https")) {
  throw "The automatic Sentinel Grid server address in this installer is invalid. Download a new scanner installer."
}
Set-ConfigValue $ConfigPath "CONTROL_PLANE_URL" $controlPlaneUrl.TrimEnd('/')

$activationCode = Get-ConfigValue $ConfigPath "EDGE_ACTIVATION_CODE"
if ([string]::IsNullOrWhiteSpace($activationCode) -or $activationCode.StartsWith("REPLACE_")) {
  $activationCode = Read-RequiredSecret "One-time gateway activation code from Sentinel Grid" 40
  if (-not $activationCode.StartsWith("sgact_")) { throw "The activation code must start with sgact_." }
  Set-ConfigValue $ConfigPath "EDGE_ACTIVATION_CODE" $activationCode
}

# The one-time activation code is consumed on first boot. The resulting unique
# identity and all camera credentials live in separately encrypted local files.
& icacls.exe $ConfigPath /inheritance:r /grant:r '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' '*S-1-5-32-545:(R)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to protect the edge-agent configuration file." }

Write-Host "Validating edge-agent configuration..." -ForegroundColor Cyan
& $Executable --config $ConfigPath --check-config
if ($LASTEXITCODE -ne 0) { throw "Edge-agent configuration validation failed." }

foreach ($setting in @("FFPROBE_PATH", "FFMPEG_PATH", "MEDIAMTX_PATH", "CLOUDFLARED_PATH")) {
  $dependency = Get-ConfigValue $ConfigPath $setting
  if (-not (Test-Path -LiteralPath $dependency -PathType Leaf) -and -not (Get-Command $dependency -ErrorAction SilentlyContinue)) {
    Write-Warning "$setting is unavailable at '$dependency'. Related camera functions will be disabled."
  }
}

# A downloaded Repair package contains a fresh one-time activation code. Move a
# previous gateway identity out of the active paths so the agent uses that code
# instead of retrying a credential that the control plane has revoked. Camera
# credentials, stream secrets, discovery state and the offline outbox remain in
# place. The identity files are archived so the repair is recoverable.
$identityFiles = @(
  (Join-Path $DataDirectory "device-identity.enc"),
  (Join-Path $DataDirectory "device-identity.key")
)
$identityArchiveDirectory = $null
$existingIdentityFiles = @($identityFiles | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
if (-not [string]::IsNullOrWhiteSpace($activationCode) -and $existingIdentityFiles.Count -gt 0) {
  $archiveName = "{0}-{1}" -f ([DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
  $identityArchiveDirectory = Join-Path (Join-Path $DataDirectory "identity-archive") $archiveName
  New-Item -ItemType Directory -Path $identityArchiveDirectory -Force | Out-Null
  foreach ($identityFile in $existingIdentityFiles) {
    Move-Item -LiteralPath $identityFile -Destination (Join-Path $identityArchiveDirectory (Split-Path $identityFile -Leaf)) -Force
  }
  Write-Host "Archived the previous gateway identity for automatic reactivation." -ForegroundColor Cyan
}

$action = New-ScheduledTaskAction -Execute $Executable -Argument "--run --config `"$ConfigPath`"" -WorkingDirectory $InstallDirectory
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
# Task Scheduler rejects sub-minute ISO-8601 repetition intervals (for example
# PT10S). One minute is the platform minimum and still gives the gateway a
# quick recovery path after a process crash or a short control-plane outage.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Sentinel Grid branch camera, recorder, storage and network monitoring agent" | Out-Null

# Local-subnet only: this permits authenticated live-video handoff from branch
# LAN and directly attached VPN clients without exposing a public media tunnel.
$firewallRuleName = "Sentinel Grid Private Live Video"
Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue |
  Remove-NetFirewallRule -ErrorAction SilentlyContinue
New-NetFirewallRule `
  -DisplayName $firewallRuleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 8090 `
  -Program $Executable `
  -RemoteAddress LocalSubnet `
  -Profile Any | Out-Null

$dashboardLauncher = Join-Path $InstallDirectory "open-dashboard-scan.ps1"
if (Test-Path -LiteralPath $dashboardLauncher -PathType Leaf) {
  $protocolKey = "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\sentinel-grid-scanner"
  $commandKey = Join-Path $protocolKey "shell\open\command"
  New-Item -Path $commandKey -Force | Out-Null
  Set-Item -Path $protocolKey -Value "URL:Sentinel Grid Scanner Protocol"
  New-ItemProperty -Path $protocolKey -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
  $powerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $protocolCommand = "`"$powerShell`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dashboardLauncher`" `"%1`""
  Set-Item -Path $commandKey -Value $protocolCommand
}

$connectivityHealthy = $true
if (-not $SkipConnectivityCheck) {
  Write-Host "Authenticating with Sentinel Grid..." -ForegroundColor Cyan
  # Windows PowerShell 5.1 turns a native process's stderr (including Node
  # 18's harmless ExperimentalWarning) into a terminating NativeCommandError
  # when ErrorActionPreference is Stop. Capture that stream for this command
  # only; the native exit code remains the authoritative health result.
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $diagnosticOutput = @(& $Executable --config $ConfigPath --diagnose 2>&1)
    $diagnosticExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($diagnosticExitCode -ne 0) {
    $connectivityHealthy = $false
    $diagnosticDetail = ($diagnosticOutput | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
    $terminalDiagnosticFailure = $null
    $activationWasInvalid = $diagnosticDetail -match "activation_invalid_or_expired"
    if ($activationWasInvalid) {
      $terminalDiagnosticFailure = "The one-time gateway activation is invalid, expired, or has already been used. Return to Sentinel Grid, create a new activation, and download a fresh installer."
    } elseif ($diagnosticDetail -match "device_already_enrolled") {
      $terminalDiagnosticFailure = "This computer is already enrolled with a different gateway identity. Use the Repair installer for that scanner, or remove its existing Sentinel Grid Edge Agent installation before enrolling it again."
    }
    if (-not [string]::IsNullOrWhiteSpace($diagnosticDetail)) {
      $safeDiagnosticDetail = $diagnosticDetail -replace '(?i)sgact_[A-Za-z0-9_-]+', 'sgact_[redacted]'
      Write-Warning "Initial Sentinel Grid authentication was not completed:`n$safeDiagnosticDetail"
    }
    # Activation is transactional. A reused or expired Repair package must not
    # strand a previously working scanner without an identity. A successful
    # activation always writes both new files before --diagnose returns.
    $newIdentityFiles = @($identityFiles | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
    $restoredPreviousIdentity = $false
    if ($identityArchiveDirectory -and $newIdentityFiles.Count -lt $identityFiles.Count) {
      $failedIdentityDirectory = Join-Path $identityArchiveDirectory "failed-reactivation"
      New-Item -ItemType Directory -Path $failedIdentityDirectory -Force | Out-Null
      foreach ($identityFile in $newIdentityFiles) {
        Move-Item -LiteralPath $identityFile -Destination (Join-Path $failedIdentityDirectory (Split-Path $identityFile -Leaf)) -Force
      }
      foreach ($identityFile in $identityFiles) {
        $archivedIdentityFile = Join-Path $identityArchiveDirectory (Split-Path $identityFile -Leaf)
        if (Test-Path -LiteralPath $archivedIdentityFile -PathType Leaf) {
          Move-Item -LiteralPath $archivedIdentityFile -Destination $identityFile -Force
        }
      }
      $restoredPreviousIdentity = $true
      Write-Warning "The new activation was not accepted. The previous encrypted scanner identity was restored. Download a fresh Repair package if the scanner remains offline."
    }
    # Re-running the exact same self-installing package is safe and should be
    # idempotent. Its one-time activation has already been consumed, but the
    # identity created by the first run can still be valid. Verify the restored
    # credential once before deciding that installation failed; this also makes
    # sure a revoked identity never masks a genuinely invalid activation.
    if ($activationWasInvalid -and $restoredPreviousIdentity) {
      Write-Host "Checking the restored scanner identity..." -ForegroundColor Cyan
      $previousErrorActionPreference = $ErrorActionPreference
      try {
        $ErrorActionPreference = "Continue"
        $restoredDiagnosticOutput = @(& $Executable --config $ConfigPath --diagnose 2>&1)
        $restoredDiagnosticExitCode = $LASTEXITCODE
      } finally {
        $ErrorActionPreference = $previousErrorActionPreference
      }
      if ($restoredDiagnosticExitCode -eq 0) {
        $connectivityHealthy = $true
        $terminalDiagnosticFailure = $null
        Write-Host "The installer was already activated on this computer. The existing scanner identity is valid; continuing the repair without re-enrollment." -ForegroundColor Green
      }
    }
    if ($terminalDiagnosticFailure) { throw $terminalDiagnosticFailure }
    if (-not $connectivityHealthy) {
      Write-Warning "Sentinel Grid is temporarily unreachable. The scanner is installed and its background task will keep retrying automatically. Review $LogDirectory\edge-agent.log if it does not appear online after connectivity returns."
    }
  }
}

Start-ScheduledTask -TaskName $TaskName
$startupTimeoutSeconds = 60
$startupDeadline = (Get-Date).AddSeconds($startupTimeoutSeconds)
$installedTask = $null
do {
  $installedTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  # Start-ScheduledTask is asynchronous. A task can legitimately remain in
  # Queued/Ready while Windows starts the packaged executable (especially
  # while a previous repair instance is shutting down). Do not report a
  # failure until the task has had enough time to enter Running.
  if ($installedTask -and [string]$installedTask.State -eq "Running") { break }
  Start-Sleep -Seconds 1
} while ((Get-Date) -lt $startupDeadline)

if (-not $installedTask) {
  throw "The Sentinel Grid startup task was not created. Run this Repair package again from an Administrator PowerShell window."
}
$state = $installedTask.State
if ($connectivityHealthy -and $state -ne "Running") {
  $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
  $lastResult = if ($taskInfo) { $taskInfo.LastTaskResult } else { "unknown" }
  throw "The Sentinel Grid startup task did not enter Running within $startupTimeoutSeconds seconds (state: $state, result: $lastResult). Check $LogDirectory\edge-agent.log and run Repair scanner again."
}
$RestoreExistingTaskOnFailure = $false

if ($connectivityHealthy) {
  Write-Host "Sentinel Grid Edge Agent installed and connected successfully." -ForegroundColor Green
} else {
  Write-Host "Sentinel Grid Edge Agent installed and waiting to connect." -ForegroundColor Yellow
}
Write-Host "Startup task: $TaskName ($state)"
Write-Host "Configuration: $ConfigPath"
Write-Host "Log: $LogDirectory\edge-agent.log"
Write-Host "Live video: private LAN/VPN local subnets only (TCP 8090)"
