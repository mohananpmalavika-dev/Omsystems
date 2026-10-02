$ErrorActionPreference = 'Stop'
$output = 'C:/Omsystems/Omsystems/tmp/archive-install-diagnostic.json'
$result = @{}
try {
  $result.identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $task = Get-ScheduledTask -TaskName 'Sentinel Grid Edge Agent'
  $info = $task | Get-ScheduledTaskInfo
  $result.task = @{ state=[string]$task.State; lastResult=$info.LastTaskResult; lastRun=$info.LastRunTime.ToString('o'); actions=@($task.Actions | Select-Object Execute,Arguments,WorkingDirectory) }
  $result.processes = @(Get-CimInstance Win32_Process -Filter "Name='edge-agent.exe'" | Select-Object ProcessId,ExecutablePath)
  $result.configVersion = (Select-String -LiteralPath 'C:/Program Files/Sentinel Grid/Edge Agent/config/edge-agent.env' -Pattern '^EDGE_AGENT_VERSION=').Line
  $result.configCheck = (& 'C:/Program Files/Sentinel Grid/Edge Agent/edge-agent.exe' --config 'C:/Program Files/Sentinel Grid/Edge Agent/config/edge-agent.env' --check-config 2>&1 | Out-String)
  $result.configExit = $LASTEXITCODE
} catch { $result.error = $_.Exception.Message }
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $output
