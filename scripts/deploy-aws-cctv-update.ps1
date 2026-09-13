$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$instanceId = "i-03fda9a80e75865fd"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Deploying Sentinel Grid updates to AWS EC2 ($instanceId)..." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$commands = @(
    'set -e',
    'echo "=== 1. Pulling latest Git commit on EC2 ==="',
    'cd /opt/sentinel-grid',
    'git fetch origin main',
    'git reset --hard origin/main',
    'git log -1 --oneline',
    'echo "=== 2. Cleaning build cache to preserve disk space ==="',
    'docker builder prune -f || true',
    'docker image prune -f || true',
    'echo "=== 3. Applying Database Migrations (including Secure Area CCTV Face Recognition) ==="',
    'for migration in $(ls -1v /opt/sentinel-grid/database/migrations/*.sql 2>/dev/null); do docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid < "$migration" > /dev/null 2>&1 || true; done',
    'docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT table_name FROM information_schema.tables WHERE table_name IN (''secure_area_camera_mappings'', ''secure_area_cctv_events'', ''secure_area_authorized_persons'', ''secure_area_authorizations'');"',
    'echo "=== 4. Rebuilding & restarting Control Plane ==="',
    'cd /opt/sentinel-grid/deploy/aws',
    'docker compose -f docker-compose.aws.yml build control-plane',
    'docker compose -f docker-compose.aws.yml up -d --force-recreate control-plane',
    'echo "=== 5. Rebuilding & restarting Dashboard & Caddy ==="',
    'docker compose -f docker-compose.aws.yml build dashboard',
    'docker compose -f docker-compose.aws.yml up -d --force-recreate dashboard caddy',
    'echo "=== 6. Verifying Services Status ==="',
    'sleep 8',
    'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"',
    'echo "=== 7. Health Checks ==="',
    'curl -s http://localhost:8080/health || true',
    'echo ""',
    'curl -s http://localhost:8080/ready || true',
    'echo ""',
    'curl -sI http://localhost:10000 || true'
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

Write-Host "Dispatched AWS SSM Command: $cmd" -ForegroundColor Green
Write-Host "Monitoring execution progress..." -ForegroundColor Yellow

Start-Sleep -Seconds 5

for ($i = 0; $i -lt 180; $i++) {
    $status = aws ssm get-command-invocation `
        --command-id $cmd `
        --instance-id $instanceId `
        --query "Status" `
        --output text

    Write-Host "Current Status [$i]: $status" -ForegroundColor DarkGray
    if ($status -eq "Success" -or $status -eq "Failed" -or $status -eq "Cancelled" -or $status -eq "TimedOut") {
        break
    }
    Start-Sleep -Seconds 5
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

Write-Host "================ Deployment Output ================" -ForegroundColor Green
Write-Host $output

if ($errorOutput) {
    Write-Host "================ Warnings / Errors ================" -ForegroundColor Yellow
    Write-Host $errorOutput
}

if ($status -ne "Success") {
    throw "Deployment command failed with status: $status"
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "AWS EC2 Deployment Successfully Completed!" -ForegroundColor Green
Write-Host "Public Domain: https://3-7-216-169.sslip.io" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
