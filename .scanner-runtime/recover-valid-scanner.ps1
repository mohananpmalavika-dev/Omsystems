$ErrorActionPreference = "Stop"

$installDirectory = "C:\Program Files\KryptonVision\Edge Agent"
$archiveRoot = Join-Path $installDirectory "data\identity-archive"
$sourceDirectory = Join-Path $archiveRoot "20260809T101537Z-4de517f5"
$dataDirectory = Join-Path $installDirectory "data"
$executable = Join-Path $installDirectory "edge-agent.exe"
$configPath = Join-Path $installDirectory "config\edge-agent.env"
$taskName = "KryptonVision Edge Agent"
$resultPath = "C:\Omsystems\.scanner-runtime\recovery-result.log"

$resolvedArchiveRoot = [IO.Path]::GetFullPath($archiveRoot).TrimEnd('\') + '\'
$resolvedSource = [IO.Path]::GetFullPath($sourceDirectory).TrimEnd('\') + '\'
if (-not $resolvedSource.StartsWith($resolvedArchiveRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "The recovery identity is outside the KryptonVision archive."
}

foreach ($name in @("device-identity.enc", "device-identity.key")) {
  $source = Join-Path $sourceDirectory $name
  $destination = Join-Path $dataDirectory $name
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "The archived identity is incomplete: $name"
  }
  Copy-Item -LiteralPath $source -Destination $destination -Force
}

& icacls.exe (Join-Path $dataDirectory "device-identity.enc") /inheritance:r /grant:r '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null
& icacls.exe (Join-Path $dataDirectory "device-identity.key") /inheritance:r /grant:r '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null

& $executable --config $configPath --diagnose *>> $resultPath
if ($LASTEXITCODE -ne 0) { throw "The recovered scanner identity did not authenticate." }

$action = New-ScheduledTaskAction -Execute $executable -Argument "--run --config `"$configPath`"" -WorkingDirectory $installDirectory
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "KryptonVision branch camera, recorder, storage and network monitoring agent" | Out-Null
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3
$task = Get-ScheduledTask -TaskName $taskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
"RECOVERY_OK task=$($task.State) lastResult=$($taskInfo.LastTaskResult)" | Add-Content -LiteralPath $resultPath
