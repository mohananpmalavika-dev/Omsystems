[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ExpectedOldHash,
      [Parameter(Mandatory=$true)][string]$ExpectedNewHash)
$ErrorActionPreference = 'Stop'
$install = [IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'Sentinel Grid\Edge Agent'))
$exe = Join-Path $install 'edge-agent.exe'
$config = Join-Path $install 'config\edge-agent.env'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\edge-agent\release\edge-agent.exe'))
$resultPath = Join-Path $PSScriptRoot '..\tmp\storage-install-0.1.42.json'
trap {
  if (-not (Test-Path -LiteralPath $resultPath)) {
    @{updated=$false; error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $resultPath
  }
  exit 1
}
$taskName = 'Sentinel Grid Edge Agent'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$backupExe = Join-Path $install "edge-agent.exe.before-storage-0.1.42.$stamp.bak"
$backupConfig = Join-Path $install "config\edge-agent.env.before-storage-0.1.42.$stamp.bak"
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
function Test-GatewayReady {
  $deadline = [DateTime]::UtcNow.AddSeconds(90)
  do {
    Start-Sleep -Seconds 3
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8090/health' -TimeoutSec 3
      if ($health.status -eq 'ok' -and $health.service -eq 'sentinel-edge-media-gateway') { return $true }
    } catch { }
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}
try {
  Disable-ScheduledTask -TaskName $taskName | Out-Null
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
  Stop-InstalledAgent
  Copy-GatewayExecutable $source
  $content = [IO.File]::ReadAllText($config)
  if ($content -match '(?m)^EDGE_AGENT_VERSION=') {
    $content = [regex]::Replace($content, '(?m)^EDGE_AGENT_VERSION=.*$', 'EDGE_AGENT_VERSION="0.1.42"')
  } else { $content += "`r`nEDGE_AGENT_VERSION=`"0.1.42`"`r`n" }
  [IO.File]::WriteAllText($config, $content, [Text.UTF8Encoding]::new($false))
  Enable-ScheduledTask -TaskName $taskName | Out-Null
  Start-ScheduledTask -TaskName $taskName
  if (-not (Test-GatewayReady)) { throw 'Gateway health check failed after update' }
  @{updated=$true; version='0.1.42'; backupExe=$backupExe; backupConfig=$backupConfig} |
    ConvertTo-Json | Set-Content -LiteralPath $resultPath
} catch {
  $failure = $_.Exception.Message
  try {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Stop-InstalledAgent
    Copy-GatewayExecutable $backupExe
    Copy-Item -LiteralPath $backupConfig -Destination $config -Force
    Enable-ScheduledTask -TaskName $taskName | Out-Null
    Start-ScheduledTask -TaskName $taskName
    $healthy = Test-GatewayReady
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
