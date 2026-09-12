$ErrorActionPreference = "Stop"
$instanceId = "i-03fda9a80e75865fd"

Write-Host "Triggering dashboard rebuild and update on AWS EC2 ($instanceId)..." -ForegroundColor Cyan

$commands = @(
    "cd /opt/sentinel-grid",
    "git fetch origin main",
    "git reset --hard origin/main",
    "cd /opt/sentinel-grid/deploy/aws",
    "docker compose -f docker-compose.aws.yml build dashboard",
    "docker compose -f docker-compose.aws.yml up -d --force-recreate caddy dashboard",
    "sleep 5",
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
    "curl -sI http://localhost:10000 || true"
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

for ($i = 0; $i -lt 120; $i++) {
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

$stdout = aws ssm get-command-invocation --command-id $cmd --instance-id $instanceId --query "StandardOutputContent" --output text
$stderr = aws ssm get-command-invocation --command-id $cmd --instance-id $instanceId --query "StandardErrorContent" --output text

Write-Host "=== BUILD & DEPLOY OUTPUT ===" -ForegroundColor Green
Write-Host $stdout

if (-not [string]::IsNullOrWhiteSpace($stderr)) {
    Write-Host "=== ERRORS / WARNINGS ===" -ForegroundColor Yellow
    Write-Host $stderr
}
