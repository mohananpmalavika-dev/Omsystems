param(
    [Parameter(Mandatory=$true)]
    [string[]]$Commands
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
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

for ($i = 0; $i -lt 30; $i++) {
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

$output = aws ssm get-command-invocation `
    --command-id $cmd `
    --instance-id $instanceId `
    --query "StandardOutputContent" `
    --output text

Write-Host $output
