$ErrorActionPreference = 'Stop'
$resultPath = Join-Path $PSScriptRoot '..\tmp\storage-restart-verification.json'
$exe = Join-Path $env:ProgramFiles 'Sentinel Grid\Edge Agent\edge-agent.exe'
$taskName = 'Sentinel Grid Edge Agent'
$restartAt = [DateTime]::UtcNow.ToString('o')
try {
  Disable-ScheduledTask -TaskName $taskName | Out-Null
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
  foreach ($instance in @(Get-CimInstance Win32_Process -Filter "Name='edge-agent.exe'")) {
    if ([IO.Path]::GetFullPath($instance.ExecutablePath) -ne [IO.Path]::GetFullPath($exe)) { throw 'Unexpected gateway installation' }
    Stop-Process -Id $instance.ProcessId -Force
    try { Wait-Process -Id $instance.ProcessId -Timeout 20 -ErrorAction Stop } catch {
      if (Get-Process -Id $instance.ProcessId -ErrorAction SilentlyContinue) { throw }
    }
  }
  Enable-ScheduledTask -TaskName $taskName | Out-Null
  Start-ScheduledTask -TaskName $taskName
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  do {
    Start-Sleep -Seconds 3
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8090/health' -TimeoutSec 3
      if ($health.status -eq 'ok' -and $health.service -eq 'sentinel-edge-media-gateway') {
        @{restarted=$true; restartAt=$restartAt; readyAt=[DateTime]::UtcNow.ToString('o')} |
          ConvertTo-Json | Set-Content -LiteralPath $resultPath
        exit 0
      }
    } catch { }
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'Restart health check timed out'
} catch {
  @{restarted=$false; restartAt=$restartAt; error=$_.Exception.Message} |
    ConvertTo-Json | Set-Content -LiteralPath $resultPath
  throw
} finally {
  Enable-ScheduledTask -TaskName $taskName | Out-Null
}
