$ErrorActionPreference = 'Stop'
$result = [ordered]@{}
try {
  $result.processes = @(Get-CimInstance Win32_Process -Filter "Name = 'edge-agent.exe'" | ForEach-Object {
    $config = $null
    if ($_.CommandLine -match '--config\s+"([^"]+)"') { $config = $Matches[1] }
    [ordered]@{ pid = $_.ProcessId; path = $_.ExecutablePath; configPath = $config }
  })
  $result.tasks = @(Get-ScheduledTask | Where-Object {
    ($_.Actions.Execute -join ' ') -match 'edge-agent|sentinel' -or $_.TaskName -match 'Sentinel'
  } | ForEach-Object {
    [ordered]@{ name = $_.TaskName; path = $_.TaskPath; state = [string]$_.State; actions = $_.Actions }
  })
  $result.success = $true
} catch { $result.error = $_.Exception.Message }
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'C:\Omsystems\reports\installed-edge-inspection.json' -Encoding UTF8
