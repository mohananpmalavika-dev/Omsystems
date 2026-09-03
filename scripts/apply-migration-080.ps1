$sql = Get-Content -Raw "database/migrations/080_fix_user_branch_scoping.sql"
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($sql))
$remoteCmd = "echo $b64 | base64 -d | docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid"
& "$PSScriptRoot/run-ec2-cmd.ps1" $remoteCmd
