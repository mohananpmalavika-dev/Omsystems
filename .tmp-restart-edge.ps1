$ErrorActionPreference = "Stop"
$taskName = "Sentinel Grid Edge Agent"
Start-ScheduledTask -TaskName $taskName
$deadline = (Get-Date).AddSeconds(60)
do {
  $task = Get-ScheduledTask -TaskName $taskName
  if ([string]$task.State -eq "Running") { exit 0 }
  Start-Sleep -Seconds 1
} while ((Get-Date) -lt $deadline)
throw "Sentinel Grid Edge Agent task did not enter Running state."
