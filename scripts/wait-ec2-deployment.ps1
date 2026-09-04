$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"

$cmd = if ($args.Count -gt 0) { $args[0] } else { "e99d5059-89dc-4880-84ed-a0ae55d7db10" }
$instanceId = "i-03fda9a80e75865fd"

Write-Host "Waiting for SSM command $cmd on instance $instanceId to complete..." -ForegroundColor Cyan

while ($true) {
    $status = aws ssm get-command-invocation `
        --command-id $cmd `
        --instance-id $instanceId `
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

if ($status -ne "Success") {
    throw "Deployment ended with status: $status"
}
