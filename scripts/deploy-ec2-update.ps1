$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
$instanceId = "i-03fda9a80e75865fd"

Write-Host "Triggering deployment update on AWS EC2 ($instanceId)..." -ForegroundColor Cyan

$commands = @(
    "cd /opt/sentinel-grid",
    "git fetch origin main",
    "git reset --hard origin/main",
    "bash /opt/sentinel-grid/scripts/deploy-aws-ec2.sh"
)


$paramFile = [System.IO.Path]::GetTempFileName()
$json = @{ commands = $commands } | ConvertTo-Json -Compress
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

Write-Host "SSM Command dispatched: $cmd" -ForegroundColor Green
Write-Host "Waiting for execution to complete..." -ForegroundColor Yellow

Start-Sleep -Seconds 5

for ($i = 0; $i -lt 180; $i++) {
    $status = aws ssm get-command-invocation `
        --command-id $cmd `
        --instance-id $instanceId `
        --query "Status" `
        --output text

    Write-Host "Current Status: $status" -ForegroundColor DarkGray
    if ($status -eq "Success" -or $status -eq "Failed" -or $status -eq "Cancelled" -or $status -eq "TimedOut") {
        break
    }
    Start-Sleep -Seconds 5
}

$tempOut = [System.IO.Path]::GetTempFileName()
$tempErr = [System.IO.Path]::GetTempFileName()
$env:PYTHONUTF8 = "1"

try {
    aws ssm get-command-invocation `
        --command-id $cmd `
        --instance-id $instanceId `
        --query "StandardOutputContent" `
        --output text | Out-File -FilePath $tempOut -Encoding utf8
} catch {}

try {
    aws ssm get-command-invocation `
        --command-id $cmd `
        --instance-id $instanceId `
        --query "StandardErrorContent" `
        --output text | Out-File -FilePath $tempErr -Encoding utf8
} catch {}

$output = if (Test-Path $tempOut) { Get-Content -Path $tempOut -Raw -Encoding utf8 } else { "" }
$errorOutput = if (Test-Path $tempErr) { Get-Content -Path $tempErr -Raw -Encoding utf8 } else { "" }
Remove-Item $tempOut, $tempErr -Force -ErrorAction SilentlyContinue

Write-Host "================ Deployment Output ================" -ForegroundColor Cyan
Write-Host $output
if ($errorOutput) {
    Write-Host "================ Warnings / Errors ================" -ForegroundColor Yellow
    Write-Host $errorOutput
}
