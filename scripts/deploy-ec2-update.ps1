$ErrorActionPreference = "Stop"
$instanceId = "i-03fda9a80e75865fd"

Write-Host "Triggering deployment update on AWS EC2 ($instanceId)..." -ForegroundColor Cyan

$commands = @(
    "cd /opt/sentinel-grid",
    "git fetch origin main",
    "git reset --hard origin/main",
    "git log -1 --oneline",
    "docker system prune -af --volumes || true",
    "df -h",
    "docker compose -f deploy/aws/docker-compose.aws.yml down || true",
    "docker compose -f deploy/aws/docker-compose.aws.yml up -d --build",
    "docker ps"
)

$paramJson = @{
    commands = $commands
} | ConvertTo-Json -Compress

$cmd = aws ssm send-command `
    --instance-ids $instanceId `
    --document-name "AWS-RunShellScript" `
    --parameters "$paramJson" `
    --query "Command.CommandId" `
    --output text

Write-Host "SSM Command dispatched: $cmd" -ForegroundColor Green
Write-Host "Waiting for execution to complete..." -ForegroundColor Yellow

Start-Sleep -Seconds 10

for ($i = 0; $i -lt 60; $i++) {
    $status = aws ssm get-command-invocation `
        --command-id $cmd `
        --instance-id $instanceId `
        --query "Status" `
        --output text


    Write-Host "Current Status: $status" -ForegroundColor DarkGray
    if ($status -eq "Success" -or $status -eq "Failed" -or $status -eq "Cancelled") {
        break
    }
    Start-Sleep -Seconds 5
}

$output = aws ssm get-command-invocation `
    --command-id $cmd `
    --instance-id $instanceId `
    --query "StandardOutputContent" `
    --output text

$errorOutput = aws ssm get-command-invocation `
    --command-id $cmd `
    --instance-id $instanceId `
    --query "StandardErrorContent" `
    --output text

Write-Host "================ Deployment Output ================" -ForegroundColor Cyan
Write-Host $output
if ($errorOutput) {
    Write-Host "================ Warnings / Errors ================" -ForegroundColor Yellow
    Write-Host $errorOutput
}
