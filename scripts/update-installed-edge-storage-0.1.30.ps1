[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$version = '0.1.30'
$expectedHash = '472A524430ACEDA7160B3046A73A3321ADE61CFE8E10B6A1FFF0986F480D1986'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\edge-agent\release\edge-agent.exe'))
$install = [IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'Sentinel Grid\Edge Agent')).TrimEnd('\')
$expectedInstall = [IO.Path]::GetFullPath("$env:ProgramFiles\Sentinel Grid\Edge Agent").TrimEnd('\')
$installedExe = Join-Path $install 'edge-agent.exe'
$config = Join-Path $install 'config\edge-agent.env'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this update from an Administrator PowerShell window.'
}
if ($install -ne $expectedInstall -or -not (Test-Path -LiteralPath $installedExe -PathType Leaf) -or
    -not (Test-Path -LiteralPath $config -PathType Leaf) -or -not (Test-Path -LiteralPath $source -PathType Leaf)) {
  throw 'The expected installed agent, configuration, or replacement executable is missing.'
}
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $expectedHash) {
  throw 'Replacement executable checksum mismatch. No changes were made.'
}
$reportedVersion = @(& $source --version 2>&1) -join ' '
if ($LASTEXITCODE -ne 0 -or $reportedVersion.Trim() -ne "Sentinel Grid Edge Agent $version") {
  throw 'Replacement executable version check failed. No changes were made.'
}
& $source --config $config --check-config | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Replacement executable rejected the installed configuration. No changes were made.' }

# Only a startup task pointing to this exact installed executable may be touched.
$task = @(Get-ScheduledTask | Where-Object {
  $candidate = $_
  @($candidate.Actions | Where-Object {
    $actionPath = [Environment]::ExpandEnvironmentVariables([string]$_.Execute).Trim('"')
    try { [IO.Path]::GetFullPath($actionPath) -eq $installedExe } catch { $false }
  }).Count -gt 0
})
if ($task.Count -ne 1 -or $task[0].State -eq 'Disabled') {
  throw 'Could not identify one enabled startup task for the installed agent. No changes were made.'
}
$startupTask = $task[0]
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$backupExe = Join-Path $install "edge-agent.exe.before-$version.$stamp.bak"
$backupConfig = Join-Path $install "config\edge-agent.env.before-$version.$stamp.bak"
foreach ($path in @($backupExe, $backupConfig)) {
  $parent = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($path))
  if ($parent -ne $install -and $parent -ne (Join-Path $install 'config')) {
    throw 'Backup path is outside the installed agent directory.'
  }
  if (Test-Path -LiteralPath $path) { throw "Backup already exists: $path" }
}

Copy-Item -LiteralPath $installedExe -Destination $backupExe
Copy-Item -LiteralPath $config -Destination $backupConfig
$replacementStarted = $false
try {
  Disable-ScheduledTask -TaskName $startupTask.TaskName -TaskPath $startupTask.TaskPath | Out-Null
  Stop-ScheduledTask -TaskName $startupTask.TaskName -TaskPath $startupTask.TaskPath -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath) -eq $installedExe
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Seconds 2
  if (Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath) -eq $installedExe
  }) { throw 'The old edge agent did not stop.' }

  Copy-Item -LiteralPath $source -Destination $installedExe -Force
  $content = [IO.File]::ReadAllText($config)
  if ($content -match '(?m)^EDGE_AGENT_VERSION=') {
    $content = [regex]::Replace($content, '(?m)^EDGE_AGENT_VERSION=.*$', "EDGE_AGENT_VERSION=`"$version`"")
  } else {
    $content += "`r`nEDGE_AGENT_VERSION=`"$version`"`r`n"
  }
  [IO.File]::WriteAllText($config, $content, [Text.UTF8Encoding]::new($false))
  Enable-ScheduledTask -TaskName $startupTask.TaskName -TaskPath $startupTask.TaskPath | Out-Null
  Start-ScheduledTask -TaskName $startupTask.TaskName -TaskPath $startupTask.TaskPath
  $replacementStarted = $true

  $deadline = [DateTime]::UtcNow.AddSeconds(90)
  do {
    Start-Sleep -Seconds 3
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8090/health' -TimeoutSec 3
      if ($health.status -ne 'ok' -or $health.service -ne 'sentinel-edge-media-gateway') { continue }
      try {
        Invoke-WebRequest -Uri 'http://127.0.0.1:8090/v1/storage/search' -Method POST `
          -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 3 | Out-Null
      } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 400) {
          Write-Host "Edge agent $version is running and the storage search route is available."
          Write-Host "Previous executable backup: $backupExe"
          return
        }
      }
    } catch { }
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'The replacement agent did not expose its storage search route within 90 seconds.'
} catch {
  $failure = $_.Exception.Message
  Stop-ScheduledTask -TaskName $startupTask.TaskName -TaskPath $startupTask.TaskPath -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath) -eq $installedExe
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Copy-Item -LiteralPath $backupExe -Destination $installedExe -Force
  Copy-Item -LiteralPath $backupConfig -Destination $config -Force
  Enable-ScheduledTask -TaskName $startupTask.TaskName -TaskPath $startupTask.TaskPath | Out-Null
  Start-ScheduledTask -TaskName $startupTask.TaskName -TaskPath $startupTask.TaskPath
  throw "Update failed; previous agent was restored. Cause: $failure"
}
