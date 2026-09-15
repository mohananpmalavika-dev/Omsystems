[CmdletBinding()]
param(
  [string]$SourceDirectory = 'C:\Users\Dhanya\Downloads\edge-agent-setup (3)',
  [string]$SourceExecutable = 'C:\Omsystems\edge-agent\release\edge-agent-0.1.19.exe',
  [Parameter(Mandatory)][string]$ExpectedSha256,
  [string]$StatusPath = 'C:\Omsystems\reports\edge-agent-0.1.19-install-status.json'
)

$ErrorActionPreference = 'Stop'
$install = [IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'Sentinel Grid\Edge Agent'))
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$stage = "$install.stage-$stamp"
$backup = "$install.backup-$stamp"
$failed = "$install.failed-$stamp"
$taskName = 'Sentinel Grid Edge Agent'
$status = [ordered]@{ success = $false; version = '0.1.19'; startedAt = [DateTime]::UtcNow.ToString('o'); backupPath = $backup }
$oldMoved = $false
$taskChanged = $false
$oldTaskXml = $null

function Set-Setting([string]$Path, [string]$Name, [string]$Value) {
  $lines = @(Get-Content -LiteralPath $Path | Where-Object { $_ -notmatch ('^' + [regex]::Escape($Name) + '=') })
  $lines += "$Name=" + (ConvertTo-Json -InputObject $Value -Compress)
  [IO.File]::WriteAllLines($Path, $lines, [Text.UTF8Encoding]::new($false))
}

function Stop-Installation([string]$Root) {
  $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $owned = @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath).StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
  })
  foreach ($item in $owned) { Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue }
  foreach ($item in $owned) {
    Wait-Process -Id $item.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
    if (Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue) { throw "Process $($item.ProcessId) did not stop." }
  }
}

try {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator rights are required.' }
  # All recursive copies and moves stay within these explicitly checked roots.
  $parent = [IO.Path]::GetDirectoryName($install)
  foreach ($target in @($stage, $backup, $failed)) {
    if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($target)) -ne $parent) { throw 'Unexpected installation target.' }
    if (Test-Path -LiteralPath $target) { throw "Backup/staging path already exists: $target" }
  }
  $source = [IO.Path]::GetFullPath($SourceDirectory)
  $sourceConfig = Join-Path $source 'edge-agent.env'
  foreach ($required in @($SourceExecutable, $sourceConfig, (Join-Path $source 'data\device-identity.enc'), (Join-Path $source 'data\device-identity.key'))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required replacement file is missing: $required" }
  }
  $actualHash = (Get-FileHash -LiteralPath $SourceExecutable -Algorithm SHA256).Hash
  if ($actualHash -ne $ExpectedSha256) { throw 'Replacement executable checksum mismatch.' }
  $signature = Get-AuthenticodeSignature -LiteralPath $SourceExecutable
  # This local release is signed by the owner's existing self-signed certificate.
  # Pin both the build hash above and the signer; do not modify Windows root trust.
  $localSigner = $signature.SignerCertificate.Thumbprint -eq '492444B636DC7C2F1FC7FE6E30F80DE06EE6282F'
  $localUntrustedChain = $localSigner -and $signature.Status -eq 'UnknownError' -and $signature.StatusMessage -match 'not trusted'
  if ($signature.Status -ne 'Valid' -and -not $localUntrustedChain) { throw "Replacement signature is not valid: $($signature.Status)" }
  $status.signatureStatus = [string]$signature.Status
  $version = @(& $SourceExecutable --version 2>&1) -join ' '
  if ($LASTEXITCODE -ne 0 -or $version.Trim() -ne 'Sentinel Grid Edge Agent 0.1.19') { throw 'Replacement executable version check failed.' }

  New-Item -ItemType Directory -Path $stage, (Join-Path $stage 'config'), (Join-Path $stage 'data'), (Join-Path $stage 'logs') | Out-Null
  Copy-Item -LiteralPath $SourceExecutable -Destination (Join-Path $stage 'edge-agent.exe')
  Copy-Item -LiteralPath $sourceConfig -Destination (Join-Path $stage 'config\edge-agent.env')
  foreach ($identityFile in @('device-identity.enc', 'device-identity.key')) {
    Copy-Item -LiteralPath (Join-Path $source "data\$identityFile") -Destination (Join-Path $stage "data\$identityFile")
  }
  Copy-Item -LiteralPath (Join-Path $install 'runtime') -Destination (Join-Path $stage 'runtime') -Recurse
  foreach ($helper in @('uninstall-edge-agent.ps1', 'open-dashboard-scan.ps1')) {
    Copy-Item -LiteralPath (Join-Path 'C:\Omsystems\edge-agent\installer\windows' $helper) -Destination (Join-Path $stage $helper)
  }
  $config = Join-Path $stage 'config\edge-agent.env'
  Set-Setting $config 'EDGE_AGENT_VERSION' '0.1.19'
  Set-Setting $config 'LIVE_MEDIA_ENABLED' 'true'
  Set-Setting $config 'EDGE_LIVE_GATEWAY_HOST' '0.0.0.0'
  Set-Setting $config 'EDGE_LIVE_GATEWAY_PORT' '8090'
  foreach ($dependency in @(@('FFMPEG_PATH', 'ffmpeg.exe'), @('FFPROBE_PATH', 'ffprobe.exe'), @('MEDIAMTX_PATH', 'mediamtx.exe'), @('CLOUDFLARED_PATH', 'cloudflared.exe'))) {
    $file = Get-ChildItem -LiteralPath (Join-Path $stage 'runtime') -Filter $dependency[1] -File -Recurse | Select-Object -First 1
    if (-not $file) { throw "Missing runtime dependency: $($dependency[1])" }
    $relative = $file.FullName.Substring($stage.Length + 1).Replace('\', '/')
    Set-Setting $config $dependency[0] ((Join-Path $install $relative).Replace('\', '/'))
  }
  Push-Location $stage
  try {
    & (Join-Path $stage 'edge-agent.exe') --config $config --check-config | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Staged configuration validation failed.' }
    $diagnostic = @(& (Join-Path $stage 'edge-agent.exe') --config $config --diagnose 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'The new scanner identity could not connect; existing installation was retained.' }
  } finally { Pop-Location }

  $oldTaskXml = Export-ScheduledTask -TaskName $taskName
  $taskChanged = $true
  Disable-ScheduledTask -TaskName $taskName | Out-Null
  Stop-ScheduledTask -TaskName $taskName
  Stop-Installation $install
  Stop-Installation $source
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Move-Item -LiteralPath $install -Destination $backup
  $oldMoved = $true
  [IO.File]::WriteAllText((Join-Path $backup 'startup-task.xml'), $oldTaskXml)
  Move-Item -LiteralPath $stage -Destination $install
  $executable = Join-Path $install 'edge-agent.exe'
  $installedConfig = Join-Path $install 'config\edge-agent.env'
  $action = New-ScheduledTaskAction -Execute $executable -Argument "--run --config `"$installedConfig`"" -WorkingDirectory $install
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings | Out-Null
  Start-ScheduledTask -TaskName $taskName
  $deadline = [DateTime]::UtcNow.AddSeconds(150)
  do {
    Start-Sleep -Seconds 3
    $owner = Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $owner) { continue }
    $ownerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($owner.OwningProcess)"
    if ($ownerProcess.ExecutablePath -ne $executable) { continue }
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8090/health' -TimeoutSec 3
      $log = Join-Path $install 'logs\edge-agent.log'
      $registration = Select-String -LiteralPath $log -Pattern 'registered;.*"version":"0.1.19"' -ErrorAction SilentlyContinue | Select-Object -Last 1
      if ($health.service -eq 'sentinel-edge-media-gateway' -and $health.status -eq 'ok' -and $registration) {
        $status.pid = $owner.OwningProcess
        $status.registration = $registration.Line
        $status.gatewayHealthy = $true
        $status.success = $true
        break
      }
    } catch { }
  } while ([DateTime]::UtcNow -lt $deadline)
  if (-not $status.success) { throw 'New scanner did not pass registration and media health checks within 150 seconds.' }
  $status.sha256 = $actualHash.ToLowerInvariant()
} catch {
  $status.error = $_.Exception.Message
  if ($taskChanged) {
    try {
      Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      Stop-Installation $install
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
      if ($oldMoved) {
        if (Test-Path -LiteralPath $install) { Move-Item -LiteralPath $install -Destination $failed }
        Move-Item -LiteralPath $backup -Destination $install
      }
      Register-ScheduledTask -TaskName $taskName -Xml $oldTaskXml -Force | Out-Null
      Enable-ScheduledTask -TaskName $taskName | Out-Null
      Start-ScheduledTask -TaskName $taskName
      $status.rolledBack = $true
    } catch { $status.rollbackError = $_.Exception.Message }
  }
} finally {
  $status.completedAt = [DateTime]::UtcNow.ToString('o')
  $status | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $StatusPath -Encoding UTF8
}
if (-not $status.success) { exit 1 }
