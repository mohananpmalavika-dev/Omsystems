[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$taskName = "Sentinel Grid Edge Agent"
$installDirectory = "C:\Program Files\Sentinel Grid\Edge Agent"
$scannerExecutable = Join-Path $installDirectory "edge-agent.exe"
$scannerConfig = Join-Path $installDirectory "config\edge-agent.env"

if (-not (Test-Path -LiteralPath $scannerExecutable -PathType Leaf)) {
  throw "Scanner executable missing: $scannerExecutable"
}
if (-not (Test-Path -LiteralPath $scannerConfig -PathType Leaf)) {
  throw "Scanner configuration missing: $scannerConfig"
}

$scannerVersion = (& $scannerExecutable --version 2>&1 | Out-String).Trim()
if ($scannerVersion -notmatch "0\.1\.3") {
  throw "Refusing to register unexpected scanner version: $scannerVersion"
}

$action = New-ScheduledTaskAction `
  -Execute $scannerExecutable `
  -Argument "--run --config `"$scannerConfig`"" `
  -WorkingDirectory $installDirectory
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 20 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Sentinel Grid branch camera, recorder, storage and network monitoring agent" `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 8

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
$taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
if ($task.State -ne "Running") {
  throw "Persistent scanner did not stay running. State=$($task.State), LastTaskResult=$($taskInfo.LastTaskResult)"
}

exit 0
