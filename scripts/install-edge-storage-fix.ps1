[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ExpectedOldHash,
      [Parameter(Mandatory=$true)][string]$ExpectedNewHash,
      [Parameter(Mandatory=$true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$TargetVersion)
$ErrorActionPreference = 'Stop'
$install = [IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'Sentinel Grid\Edge Agent'))
$exe = Join-Path $install 'edge-agent.exe'
$config = Join-Path $install 'config\edge-agent.env'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\edge-agent\release\edge-agent.exe'))
$resultPath = Join-Path $PSScriptRoot "..\tmp\storage-install-$TargetVersion.json"
trap {
  if (-not (Test-Path -LiteralPath $resultPath)) {
    @{updated=$false; error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $resultPath
  }
  exit 1
}
$taskName = 'Sentinel Grid Edge Agent'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$backupExe = Join-Path $install "edge-agent.exe.before-storage-$TargetVersion.$stamp.bak"
$backupConfig = Join-Path $install "config\edge-agent.env.before-storage-$TargetVersion.$stamp.bak"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator required' }
if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ne $ExpectedOldHash -or
    (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $ExpectedNewHash) { throw 'Executable changed; no update performed' }
$task = Get-ScheduledTask -TaskName $taskName
if (@($task.Actions | Where-Object {
  [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables([string]$_.Execute).Trim('"')) -eq $exe
}).Count -ne 1) { throw 'Startup task does not reference this installation' }
& $source --config $config --check-config | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'New agent rejected installed configuration' }
Copy-Item -LiteralPath $exe -Destination $backupExe
Copy-Item -LiteralPath $config -Destination $backupConfig

function Stop-InstalledAgent {
  $instances = @(Get-CimInstance Win32_Process -Filter "Name='edge-agent.exe'")
  if ($instances.Count -gt 1) { throw 'Multiple gateway processes; update stopped' }
  foreach ($instance in $instances) {
    if ([IO.Path]::GetFullPath($instance.ExecutablePath) -ne $exe) { throw 'Gateway process belongs to another installation' }
    Stop-Process -Id $instance.ProcessId -Force
    try { Wait-Process -Id $instance.ProcessId -Timeout 20 -ErrorAction Stop } catch {
      if (Get-Process -Id $instance.ProcessId -ErrorAction SilentlyContinue) { throw }
    }
  }
}
function Copy-GatewayExecutable([string]$from) {
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    try { Copy-Item -LiteralPath $from -Destination $exe -Force; return } catch {
      if ($attempt -eq 9) { throw }
      Start-Sleep -Seconds 2
    }
  }
}
function Test-GatewayReady([int]$timeoutSeconds = 90) {
  $deadline = [DateTime]::UtcNow.AddSeconds($timeoutSeconds)
  do {
    Start-Sleep -Seconds 3
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8090/health' -TimeoutSec 3
      if ($health.status -eq 'ok' -and $health.service -eq 'sentinel-edge-media-gateway') { return $true }
    } catch { }
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}
function Start-InstalledAgent {
  Enable-ScheduledTask -TaskName $taskName | Out-Null
  Start-ScheduledTask -TaskName $taskName
  if (Test-GatewayReady 15) { return 'scheduled-task' }
  # Task Scheduler can queue a manual start while its launch conditions block
  # execution. Start the same installation directly only if no agent exists.
  $instances = @(Get-CimInstance Win32_Process -Filter "Name='edge-agent.exe'")
  if ($instances.Count -eq 0) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Process -FilePath $exe -ArgumentList @('--run', '--config', "`"$config`"") -WorkingDirectory $install -WindowStyle Hidden | Out-Null
    if (Test-GatewayReady) { return 'direct-start' }
  }
  throw 'Gateway health check failed after restart'
}
try {
  Disable-ScheduledTask -TaskName $taskName | Out-Null
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
  Stop-InstalledAgent
  Copy-GatewayExecutable $source
  $content = [IO.File]::ReadAllText($config)
  if ($content -match '(?m)^EDGE_AGENT_VERSION=') {
    $content = [regex]::Replace($content, '(?m)^EDGE_AGENT_VERSION=.*$', "EDGE_AGENT_VERSION=`"$TargetVersion`"")
  } else { $content += "`r`nEDGE_AGENT_VERSION=`"$TargetVersion`"`r`n" }
  [IO.File]::WriteAllText($config, $content, [Text.UTF8Encoding]::new($false))
  $startMethod = Start-InstalledAgent
  @{updated=$true; version=$TargetVersion; startMethod=$startMethod; backupExe=$backupExe; backupConfig=$backupConfig} |
    ConvertTo-Json | Set-Content -LiteralPath $resultPath
} catch {
  $failure = $_.Exception.Message
  try {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Stop-InstalledAgent
    Copy-GatewayExecutable $backupExe
    Copy-Item -LiteralPath $backupConfig -Destination $config -Force
    $startMethod = Start-InstalledAgent
    $healthy = $true
    @{updated=$false; rolledBack=$true; healthy=$healthy; error=$failure; backupExe=$backupExe} |
      ConvertTo-Json | Set-Content -LiteralPath $resultPath
  } catch {
    @{updated=$false; rolledBack=$false; error=$failure; rollbackError=$_.Exception.Message; backupExe=$backupExe} |
      ConvertTo-Json | Set-Content -LiteralPath $resultPath
  }
  throw $failure
} finally {
  Enable-ScheduledTask -TaskName $taskName | Out-Null
}
