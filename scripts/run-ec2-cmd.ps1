param(
    [Parameter(Mandatory=$true)]
    [string[]]$Commands
)

$ErrorActionPreference = "Stop"
try { chcp 65001 > $null } catch {}
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
$instanceId = "i-03fda9a80e75865fd"

$paramFile = [System.IO.Path]::GetTempFileName()
$json = @{ commands = $Commands } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($paramFile, $json, [System.Text.Encoding]::ASCII)

$cmd = aws ssm send-command `
    --instance-ids $instanceId `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$paramFile" `
    --query "Command.CommandId" `
    --output text

Remove-Item -Path $paramFile -Force -ErrorAction SilentlyContinue

if ([string]::IsNullOrWhiteSpace($cmd)) {
    throw "Failed to dispatch SSM command to instance $instanceId."
}

Write-Host "Dispatched SSM Command $cmd..." -ForegroundColor Cyan

for ($i = 0; $i -lt 180; $i++) {
    Start-Sleep -Seconds 2
    $status = aws ssm get-command-invocation `
        --command-id $cmd `
        --instance-id $instanceId `
        --query "Status" `
        --output text

    if ($status -eq "Success" -or $status -eq "Failed" -or $status -eq "Cancelled" -or $status -eq "TimedOut") {
        break
    }
}

try {
    $inv = aws ssm get-command-invocation `
        --command-id $cmd `
        --instance-id $instanceId `
        --output json | ConvertFrom-Json
    if ($inv.StandardOutputContent) {
        Write-Host $inv.StandardOutputContent
    }
    if ($inv.StandardErrorContent) {
        Write-Host "STDERR:" -ForegroundColor Red
        Write-Host $inv.StandardErrorContent -ForegroundColor Red
    }
    if ($status -ne "Success") {
        Write-Host "SSM Command Status: $status" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Completed with status: $status"
}
