$ErrorActionPreference = "Stop"
$instanceId = "i-03fda9a80e75865fd"

$commands = @(
    "echo '=== DOCKER CONTAINERS ==='",
    "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
    "echo '=== DB TABLES ==='",
    "docker exec sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -c ""SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('ldap_sync_configurations', 'ldap_sync_credentials', 'ldap_sync_history', 'signed_config_bundles', 'abac_policies', 'oidc_providers');""",
    "echo '=== CONTROL PLANE LOGS ==='",
    "docker logs --tail 50 sentinel-aws-control-plane",
    "echo '=== LOCAL HTTP CHECKS ==='",
    "curl -sI http://localhost:8080/health || true",
    "curl -sI http://localhost:8080/ready || true",
    "curl -sI http://localhost:10000 || true",
    "curl -sI http://localhost:8090/v3/paths/list || true"
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

Start-Sleep -Seconds 3

for ($i = 0; $i -lt 30; $i++) {
    $status = aws ssm get-command-invocation --command-id $cmd --instance-id $instanceId --query "Status" --output text
    if ($status -eq "Success" -or $status -eq "Failed" -or $status -eq "Cancelled" -or $status -eq "TimedOut") {
        break
    }
    Start-Sleep -Seconds 2
}

$stdout = aws ssm get-command-invocation --command-id $cmd --instance-id $instanceId --query "StandardOutputContent" --output text
$stderr = aws ssm get-command-invocation --command-id $cmd --instance-id $instanceId --query "StandardErrorContent" --output text

Write-Host "STDOUT:"
Write-Host $stdout
if (-not [string]::IsNullOrWhiteSpace($stderr)) {
    Write-Host "STDERR:"
    Write-Host $stderr
}
