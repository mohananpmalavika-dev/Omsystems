param(
  [string]$RequestUri
)

$ErrorActionPreference = "Stop"
$taskName = "Sentinel Grid Edge Agent"
$serviceName = "SentinelGridEdgeAgent"

try {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) {
    if ($task.State -ne "Running") {
      Start-ScheduledTask -TaskName $taskName
    }
    exit 0
  }

  $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
  if ($service) {
    if ($service.Status -ne "Running") {
      Start-Service -Name $serviceName
    }
    exit 0
  }

  throw "Sentinel Grid Scanner is not installed on this computer."
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
