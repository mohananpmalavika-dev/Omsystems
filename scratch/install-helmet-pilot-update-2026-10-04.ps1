$ErrorActionPreference='Stop'
$workspace='C:\Omsystems\Omsystems'
$statusPath=Join-Path $workspace 'scratch\helmet-pilot-update-status.json'
function Write-Status($state,$detail) {
    @{state=$state; detail=$detail; at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding UTF8
}
try {
    Write-Status 'started' 'Checking the installed pilot and trusted update signature'
    $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Windows administrator approval is required'}
    $install='C:\Program Files\Sentinel Grid\Edge Agent'
    $exe=Join-Path $install 'edge-agent.exe'
    $task=Get-ScheduledTask -TaskName 'Sentinel Grid Edge Agent'
    if(-not (@($task.Actions | Where-Object {$_.Execute.Trim('"') -eq $exe}).Count)){throw 'Scheduled task executable does not match the installed pilot'}
    Set-Location -LiteralPath $workspace
    & 'C:\Program Files\nodejs\node.exe' 'node_modules\tsx\dist\cli.mjs' 'scratch\activate-helmet-pilot-update-2026-10-04.ts' *> 'scratch\helmet-pilot-update-activation.log'
    if($LASTEXITCODE -ne 0){throw 'Signed update activation failed; see the activation log'}
    $instances=@(Get-CimInstance Win32_Process -Filter "name='edge-agent.exe'" | Where-Object {$_.ExecutablePath -eq $exe})
    Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
    foreach($instance in $instances){Stop-Process -Id $instance.ProcessId -Force -ErrorAction SilentlyContinue}
    Start-ScheduledTask -TaskName $task.TaskName
    Write-Status 'restarted' 'Signed pilot update 0.1.48 activated; waiting for gateway health'
} catch {
    Write-Status 'failed' $_.Exception.Message
    exit 1
}
