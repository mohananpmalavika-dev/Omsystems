$ErrorActionPreference='Stop'
$workspace='C:\Omsystems\Omsystems'
$statusPath=Join-Path $workspace 'scratch\helmet-pilot-recovery-status.json'
try {
    $install='C:\Program Files\Sentinel Grid\Edge Agent'
    $settings=@{}
    foreach($line in [IO.File]::ReadAllLines((Join-Path $install 'config\edge-agent.env'))) {
        if($line -match '^(EDGE_LOG_PATH|EDGE_UPDATE_STAGING_PATH|EDGE_AGENT_VERSION)=(.*)$') {$settings[$matches[1]]=$matches[2].Trim('"')}
    }
    $logPath=if($settings.EDGE_LOG_PATH){$settings.EDGE_LOG_PATH}else{'logs\edge-agent.log'}
    if(-not [IO.Path]::IsPathRooted($logPath)){$logPath=Join-Path $install $logPath}
    if(Test-Path -LiteralPath $logPath) {
        $lines=Get-Content -LiteralPath $logPath -Tail 200
        $lines=$lines | ForEach-Object {$_ -replace '(rtsp|https?)://[^/@\s]+:[^/@\s]+@','$1://[redacted]@' -replace 'sggw_[A-Za-z0-9_-]+','[redacted-token]'}
        $lines | Set-Content -LiteralPath (Join-Path $workspace 'scratch\helmet-pilot-startup-diagnostics.log') -Encoding UTF8
    }
    Start-ScheduledTask -TaskName 'Sentinel Grid Edge Agent'
    @{state='original_agent_restarted'; settings=$settings; at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
} catch {
    @{state='failed'; error=$_.Exception.Message; at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
    exit 1
}
