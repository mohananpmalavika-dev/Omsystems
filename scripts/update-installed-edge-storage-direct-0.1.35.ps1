[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$install = [IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'Sentinel Grid\Edge Agent'))
$exe = Join-Path $install 'edge-agent.exe'
$config = Join-Path $install 'config\edge-agent.env'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\edge-agent\release\edge-agent.exe'))
$resultPath = Join-Path $PSScriptRoot '..\edge-live-update-result-0.1.35.json'
$phasePath = Join-Path $PSScriptRoot '..\edge-live-update-phase-0.1.35.log'
$taskName = 'Sentinel Grid Edge Agent'
$expectedOldHash = '530E4D9E58CBD61E1143750B101E4792796A7B712F4C3450D9CF43CE99C36AB3'
$expectedNewHash = '903E529DE47092C02118183DD5A98220541ADA1E344034C60B52AA7E0A4400E3'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$backupExe = Join-Path $install "edge-agent.exe.before-0.1.35-direct.$stamp.bak"
$backupConfig = Join-Path $install "config\edge-agent.env.before-0.1.35-direct.$stamp.bak"

function Write-Phase([string]$phase) {
  Add-Content -LiteralPath $phasePath -Value "$([DateTime]::UtcNow.ToString('o')) $phase"
}

function Write-Result([bool]$updated, [bool]$healthy, [bool]$rolledBack, [string]$reason) {
  [pscustomobject]@{
    updated = $updated
    healthy = $healthy
    rolledBack = $rolledBack
    reason = $reason
    executableHash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
    startupTaskState = [string](Get-ScheduledTask -TaskName $taskName).State
    backupExe = $backupExe
  } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
}

function Stop-InstalledAgent {
  $instances = @(Get-Process -Name 'edge-agent' -ErrorAction SilentlyContinue)
  if ($instances.Count -gt 1) { throw 'Multiple Edge Agent processes found; refusing ambiguous update' }
  foreach ($instance in $instances) {
    Stop-Process -Id $instance.Id -Force -ErrorAction Stop
    try { Wait-Process -Id $instance.Id -Timeout 15 -ErrorAction Stop } catch {
      if (Get-Process -Id $instance.Id -ErrorAction SilentlyContinue) { throw }
    }
  }
}

function Start-InstalledAgent {
  Start-Process -FilePath $exe -ArgumentList @('--run', '--config', "`"$config`"") `
    -WorkingDirectory $install -WindowStyle Hidden | Out-Null
}

function Test-GatewayReady([int]$seconds) {
  $deadline = [DateTime]::UtcNow.AddSeconds($seconds)
  do {
    Start-Sleep -Seconds 3
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8090/health' -TimeoutSec 3
      if ($health.status -eq 'ok' -and $health.service -eq 'sentinel-edge-media-gateway') {
        return $true
      }
    } catch { }
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator required' }
Write-Phase 'administrator-verified'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf) -or
    -not (Test-Path -LiteralPath $config -PathType Leaf) -or
    -not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Expected files missing' }
if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ne $expectedOldHash -or
    (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $expectedNewHash) {
  throw 'Executable hash mismatch; no changes made'
}
Write-Phase 'hashes-verified'
$task = Get-ScheduledTask -TaskName $taskName
if (@($task.Actions | Where-Object {
  try { [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables([string]$_.Execute).Trim('"')) -eq $exe }
  catch { $false }
}).Count -ne 1) { throw 'Startup task points elsewhere; no changes made' }
& $source --config $config --check-config | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'New agent rejected installed configuration; no changes made' }
Write-Phase 'config-verified'
Copy-Item -LiteralPath $exe -Destination $backupExe
Copy-Item -LiteralPath $config -Destination $backupConfig
Write-Phase 'backups-created'

try {
  Disable-ScheduledTask -TaskName $taskName | Out-Null
  Write-Phase 'startup-task-disabled'
  Stop-InstalledAgent
  Write-Phase 'old-agent-stopped'
  Copy-Item -LiteralPath $source -Destination $exe -Force
  Write-Phase 'new-executable-copied'
  $content = [IO.File]::ReadAllText($config)
  if ($content -match '(?m)^EDGE_AGENT_VERSION=') {
    $content = [regex]::Replace($content, '(?m)^EDGE_AGENT_VERSION=.*$', 'EDGE_AGENT_VERSION="0.1.35"')
  } else { $content += "`r`nEDGE_AGENT_VERSION=`"0.1.35`"`r`n" }
  [IO.File]::WriteAllText($config, $content, [Text.UTF8Encoding]::new($false))
  Write-Phase 'config-updated'
  Start-InstalledAgent
  Write-Phase 'new-agent-started'
  if (-not (Test-GatewayReady 120)) { throw 'New agent gateway did not become healthy' }
  Write-Phase 'new-agent-healthy'
  Enable-ScheduledTask -TaskName $taskName | Out-Null
  Write-Result $true $true $false ''
} catch {
  $reason = $_.Exception.Message
  Write-Phase "rolling-back: $reason"
  Stop-InstalledAgent
  Copy-Item -LiteralPath $backupExe -Destination $exe -Force
  Copy-Item -LiteralPath $backupConfig -Destination $config -Force
  Start-InstalledAgent
  $healthy = Test-GatewayReady 120
  Enable-ScheduledTask -TaskName $taskName | Out-Null
  Write-Result $false $healthy $true $reason
  if (-not $healthy) { throw "Agent rollback did not restore gateway: $reason" }
}
