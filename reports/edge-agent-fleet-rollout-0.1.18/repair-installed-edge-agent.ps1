param(
  [string]$SourceExecutable = "C:\Omsystems\edge-agent\release\edge-agent.exe",
  [string]$InstallDirectory = "$env:ProgramFiles\Sentinel Grid\Edge Agent",
  [string]$TaskName = "Sentinel Grid Edge Agent",
  [string]$StatusPath = "C:\Omsystems\reports\edge-agent-repair-status.json"
)

$ErrorActionPreference = "Stop"
$status = [ordered]@{
  startedAt = [DateTime]::UtcNow.ToString("o")
  success = $false
  taskName = $TaskName
  sourceVersion = $null
  gatewayHealthy = $false
  error = $null
}

try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Administrator approval is required to repair the installed edge agent."
  }

  $resolvedSource = [IO.Path]::GetFullPath($SourceExecutable)
  $resolvedInstall = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
  $expectedInstall = [IO.Path]::GetFullPath("$env:ProgramFiles\Sentinel Grid\Edge Agent").TrimEnd('\')
  if ($resolvedInstall -ne $expectedInstall) {
    throw "Refusing to modify an unexpected installation directory: $resolvedInstall"
  }
  if (-not (Test-Path -LiteralPath $resolvedSource -PathType Leaf)) {
    throw "Replacement edge agent not found: $resolvedSource"
  }

  $versionOutput = @(& $resolvedSource --version 2>&1)
  if ($LASTEXITCODE -ne 0 -or ($versionOutput -join " ") -notmatch "Edge Agent 0\.1\.18") {
    throw "The replacement executable did not pass its version check."
  }
  $status.sourceVersion = "0.1.18"

  $configPath = Join-Path $resolvedInstall "config\edge-agent.env"
  $installedExecutable = Join-Path $resolvedInstall "edge-agent.exe"
  $lockPath = Join-Path $resolvedInstall "data\edge-agent.lock"
  if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "Installed edge-agent configuration is missing: $configPath"
  }

  & $resolvedSource --config $configPath --check-config | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "The replacement executable rejected the installed configuration." }

  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  }

  $installPrefix = "$resolvedInstall\"
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ExecutablePath -and
      [IO.Path]::GetFullPath($_.ExecutablePath).StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase)
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2

  $backupPath = $null
  $configBackupPath = $null
  if (Test-Path -LiteralPath $installedExecutable -PathType Leaf) {
    $backupPath = "$installedExecutable.pre-live-recovery-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')).bak"
    Copy-Item -LiteralPath $installedExecutable -Destination $backupPath
  }
  $configBackupPath = "$configPath.pre-live-recovery-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')).bak"
  Copy-Item -LiteralPath $configPath -Destination $configBackupPath

  try {
    Copy-Item -LiteralPath $resolvedSource -Destination $installedExecutable -Force
    Unblock-File -LiteralPath $installedExecutable

    # Old installers wrote a static EDGE_AGENT_VERSION into the configuration.
    # Keep it in sync with the repaired executable so the control plane can
    # correctly target future signed, application-only updates.
    $configLines = @(Get-Content -LiteralPath $configPath)
    $versionSetting = 'EDGE_AGENT_VERSION="0.1.18"'
    $versionSettingFound = $false
    for ($index = 0; $index -lt $configLines.Count; $index += 1) {
      if ($configLines[$index] -match '^EDGE_AGENT_VERSION=') {
        $configLines[$index] = $versionSetting
        $versionSettingFound = $true
        break
      }
    }
    if (-not $versionSettingFound) { $configLines += $versionSetting }
    Set-Content -LiteralPath $configPath -Value $configLines -Encoding UTF8
    & $installedExecutable --config $configPath --check-config | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "The repaired configuration failed validation." }

    if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
      Remove-Item -LiteralPath $lockPath -Force
    }

    if (-not $task) {
      $action = New-ScheduledTaskAction `
        -Execute $installedExecutable `
        -Argument "--run --config `"$configPath`"" `
        -WorkingDirectory $resolvedInstall
      $trigger = New-ScheduledTaskTrigger -AtStartup
      $taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
      $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -MultipleInstances IgnoreNew
      Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $taskPrincipal `
        -Settings $settings `
        -Description "Sentinel Grid branch camera, recorder, storage and network monitoring agent" | Out-Null
    }

    Enable-ScheduledTask -TaskName $TaskName | Out-Null
    Start-ScheduledTask -TaskName $TaskName

    $deadline = [DateTime]::UtcNow.AddSeconds(150)
    do {
      Start-Sleep -Seconds 3
      try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8090/health" -TimeoutSec 3
        if ($health.status -eq "ok") {
          $status.gatewayHealthy = $true
          break
        }
      } catch { }
    } while ([DateTime]::UtcNow -lt $deadline)

    if (-not $status.gatewayHealthy) {
      throw "The repaired edge agent did not expose its local media health endpoint within 150 seconds."
    }
    $status.success = $true
  } catch {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($configBackupPath -and (Test-Path -LiteralPath $configBackupPath -PathType Leaf)) {
      Copy-Item -LiteralPath $configBackupPath -Destination $configPath -Force
    }
    if ($backupPath -and (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
      Copy-Item -LiteralPath $backupPath -Destination $installedExecutable -Force
      if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
        Remove-Item -LiteralPath $lockPath -Force
      }
      Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    }
    throw
  }
} catch {
  $status.error = $_.Exception.Message
} finally {
  $status.completedAt = [DateTime]::UtcNow.ToString("o")
  $statusDirectory = Split-Path -Parent $StatusPath
  if ($statusDirectory) { New-Item -ItemType Directory -Path $statusDirectory -Force | Out-Null }
  $status | ConvertTo-Json | Set-Content -LiteralPath $StatusPath -Encoding UTF8
}

if (-not $status.success) { exit 1 }
