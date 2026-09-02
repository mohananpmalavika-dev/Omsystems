param(
    [string]$CommandId = "dd49cecd-e37d-4875-b959-c02e965f8752",
    [string]$InstanceId = "i-03fda9a80e75865fd",
    [string]$Region = "ap-south-1"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONUTF8 = "1"

Write-Host "Waiting for SSM command $CommandId on instance $InstanceId..." -ForegroundColor Cyan

for ($i = 0; $i -lt 60; $i++) {
    $status = aws ssm get-command-invocation `
        --command-id $CommandId `
        --instance-id $InstanceId `
        --region $Region `
        --query "Status" `
        --output text

    Write-Host "Current Status: $status" -ForegroundColor DarkGray
    if ($status -eq "Success" -or $status -eq "Failed" -or $status -eq "Cancelled" -or $status -eq "TimedOut") {
        break
    }
    Start-Sleep -Seconds 10
}

$tempOut = [System.IO.Path]::GetTempFileName()
$tempErr = [System.IO.Path]::GetTempFileName()

try {
    aws ssm get-command-invocation `
        --command-id $CommandId `
        --instance-id $InstanceId `
        --region $Region `
        --query "StandardOutputContent" `
        --output text | Out-File -FilePath $tempOut -Encoding utf8
} catch {}

try {
    aws ssm get-command-invocation `
        --command-id $CommandId `
        --instance-id $InstanceId `
        --region $Region `
        --query "StandardErrorContent" `
        --output text | Out-File -FilePath $tempErr -Encoding utf8
} catch {}

$output = if (Test-Path $tempOut) { Get-Content -Path $tempOut -Raw -Encoding utf8 } else { "" }
$errorOutput = if (Test-Path $tempErr) { Get-Content -Path $tempErr -Raw -Encoding utf8 } else { "" }
Remove-Item $tempOut, $tempErr -Force -ErrorAction SilentlyContinue

Write-Host "Final Status: $status" -ForegroundColor Green
Write-Host "================ Output ================" -ForegroundColor Cyan
Write-Host $output
if ($errorOutput) {
    Write-Host "================ Errors ================" -ForegroundColor Yellow
    Write-Host $errorOutput
}
