[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$taskName = "Sentinel Grid Edge Agent"
$installDirectory = "C:\Program Files\Sentinel Grid\Edge Agent"
$scannerExecutable = Join-Path $installDirectory "edge-agent.exe"
$scannerConfig = Join-Path $installDirectory "config\edge-agent.env"
$scannerData = Join-Path $installDirectory "data"
$expectedWorkspaceEntry = "C:\Omsystems\edge-agent\src\index.ts"
$mediaExecutable = Join-Path $installDirectory "runtime\mediamtx.exe"
$resultPath = "C:\Omsystems\.scanner-runtime\activation-result.log"

trap {
  $failure = "ACTIVATION_ERROR $($_.Exception.Message)"
  try { "[$(Get-Date -Format o)] $failure" | Add-Content -LiteralPath $resultPath } catch {}
  Write-Output $failure
  exit 1
}

$identityFile = Join-Path $scannerData "device-identity.enc"
$identityKey = Join-Path $scannerData "device-identity.key"

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this repair from an Administrator PowerShell window."
}

foreach ($requiredFile in @($scannerExecutable, $scannerConfig, $identityFile, $identityKey)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required scanner file is missing: $requiredFile"
  }
}

# Repair dependency paths written by older installers. dotenv interprets the
# "\r" in a JSON-quoted "\runtime" segment as a carriage return; forward
# slashes are native to Node on Windows and avoid that transformation.
$pathSettingNames = @("FFMPEG_PATH", "FFPROBE_PATH", "MEDIAMTX_PATH", "CLOUDFLARED_PATH")
$configLines = @(Get-Content -LiteralPath $scannerConfig)
foreach ($settingName in $pathSettingNames) {
  $prefix = "$settingName="
  for ($index = 0; $index -lt $configLines.Count; $index += 1) {
    if (-not $configLines[$index].StartsWith($prefix)) { continue }
    $rawValue = $configLines[$index].Substring($prefix.Length)
    try { $pathValue = $rawValue | ConvertFrom-Json } catch { $pathValue = $rawValue.Trim('"') }
    if ($pathValue -is [string] -and $pathValue -match '^[A-Za-z]:\\') {
      $normalizedPath = $pathValue.Replace('\', '/')
      $configLines[$index] = "$settingName=$($normalizedPath | ConvertTo-Json -Compress)"
    }
    break
  }
}
Set-Content -LiteralPath $scannerConfig -Value $configLines -Encoding UTF8

$scannerVersion = (& $scannerExecutable --version 2>&1 | Out-String).Trim()
if ($scannerVersion -notmatch "0\.1\.4") {
  throw "Refusing to start an unexpected scanner build: $scannerVersion"
}

"[$(Get-Date -Format o)] Activating installed scanner $scannerVersion" | Set-Content -LiteralPath $resultPath

# Stop only the obsolete workspace-launched scanner and its bundled media child.
$workspaceProcesses = @(Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and $_.CommandLine.IndexOf($expectedWorkspaceEntry, [StringComparison]::OrdinalIgnoreCase) -ge 0
})
$workspaceProcessIds = @($workspaceProcesses | ForEach-Object { [int]$_.ProcessId })
foreach ($processId in $workspaceProcessIds) {
  Stop-Process -Id $processId -Force -ErrorAction Stop
  "[$(Get-Date -Format o)] Stopped revoked workspace scanner PID $processId" | Add-Content -LiteralPath $resultPath
}

$mediaProcesses = @(Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath).Equals(
    [IO.Path]::GetFullPath($mediaExecutable),
    [StringComparison]::OrdinalIgnoreCase
  ) -and ($workspaceProcessIds -contains [int]$_.ParentProcessId)
})
foreach ($mediaProcess in $mediaProcesses) {
  Stop-Process -Id ([int]$mediaProcess.ProcessId) -Force -ErrorAction SilentlyContinue
  "[$(Get-Date -Format o)] Stopped workspace media child PID $($mediaProcess.ProcessId)" | Add-Content -LiteralPath $resultPath
}

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Start-Sleep -Seconds 1
}

$action = New-ScheduledTaskAction `
  -Execute $scannerExecutable `
  -Argument "--run --config `"$scannerConfig`"" `
  -WorkingDirectory $installDirectory
$trigger = New-ScheduledTaskTrigger -AtStartup
$taskPrincipal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 20 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $taskPrincipal `
  -Settings $settings `
  -Description "Sentinel Grid branch camera, recorder, storage and network monitoring agent" `
  -Force | Out-Null

$firewallName = "Sentinel Grid Private Media Gateway"
if (-not (Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule `
    -DisplayName $firewallName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 8090 `
    -RemoteAddress LocalSubnet `
    -Profile Any | Out-Null
}

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 12

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
$taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
$scannerProcess = Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath).Equals(
    [IO.Path]::GetFullPath($scannerExecutable),
    [StringComparison]::OrdinalIgnoreCase
  )
} | Select-Object -First 1
$mediaListener = Get-NetTCPConnection -State Listen -LocalPort 8090 -ErrorAction SilentlyContinue | Select-Object -First 1

if ($task.State -ne "Running" -or -not $scannerProcess) {
  throw "Installed scanner did not remain running. Task=$($task.State), LastResult=$($taskInfo.LastTaskResult)"
}

$status = "ACTIVATION_OK task=$($task.State) pid=$($scannerProcess.ProcessId) mediaPort8090=$([bool]$mediaListener) lastResult=$($taskInfo.LastTaskResult)"
"[$(Get-Date -Format o)] $status" | Add-Content -LiteralPath $resultPath
$status
