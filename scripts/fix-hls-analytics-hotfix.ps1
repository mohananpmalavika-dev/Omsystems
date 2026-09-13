$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$instanceId = "i-03fda9a80e75865fd"

Write-Host "========================================================" -ForegroundColor Red
Write-Host " EMERGENCY HOTFIX: HLS 404/500 + Analytics Engine 503  " -ForegroundColor Red
Write-Host "========================================================" -ForegroundColor Red

$commands = @(
    'set -e',
    'cd /opt/sentinel-grid',
    'echo "=== [1/3] Restart analytics-engine if down (503 fix) ==="',
    'AE_STATUS=$(docker inspect --format="{{.State.Status}}" sentinel-aws-analytics-engine 2>/dev/null || echo "missing")',
    'echo "Analytics engine status: $AE_STATUS"',
    'if [ "$AE_STATUS" != "running" ]; then',
    '  cd /opt/sentinel-grid/deploy/aws',
    '  docker compose -f docker-compose.aws.yml up -d analytics-engine',
    '  sleep 12',
    'fi',
    'curl -sf http://localhost:8092/health | head -c 200 || echo "analytics-engine still unhealthy"',
    'echo "=== [2/3] Pull latest code (mediamtx.yml buffer fix + HLS retry) ==="',
    'cd /opt/sentinel-grid',
    'git fetch origin main',
    'git reset --hard origin/main',
    'git log -1 --oneline',
    'grep "hlsSegment" media-gateway/mediamtx.yml',
    'echo "=== [3/3] Rebuild + restart media-gateway ==="',
    'cd /opt/sentinel-grid/deploy/aws',
    'docker compose -f docker-compose.aws.yml build media-gateway',
    'docker compose -f docker-compose.aws.yml up -d --force-recreate media-gateway',
    'sleep 10',
    'echo "=== Verification ==="',
    'docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "sentinel|NAME"',
    'curl -sf http://localhost:8090/health | head -c 200 || echo "media-gateway health FAILED"',
    'echo ""',
    'curl -sf http://localhost:8092/health | head -c 200 || echo "analytics-engine health FAILED"',
    'echo ""',
    'echo "=== HOTFIX COMPLETE ==="'
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
Write-Host "Monitoring (this will take 3-5 minutes for rebuild)..." -ForegroundColor Yellow

Start-Sleep -Seconds 10

for ($i = 0; $i -lt 180; $i++) {
    $status = aws ssm get-command-invocation `
        --command-id $cmd `
        --instance-id $instanceId `
        --query "Status" --output text 2>$null

    if ($status -eq "Success" -or $status -eq "Failed" -or $status -eq "Cancelled" -or $status -eq "TimedOut") {
        Write-Host "FINAL STATUS: $status" -ForegroundColor $(if ($status -eq "Success") { "Green" } else { "Red" })
        break
    }
    Write-Host "[$($i * 5)s] $status" -ForegroundColor DarkGray
    Start-Sleep -Seconds 5
}

$out = aws ssm get-command-invocation --command-id $cmd --instance-id $instanceId --query "StandardOutputContent" --output text
Write-Host $out
