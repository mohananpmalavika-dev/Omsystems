$sql = "UPDATE edge_agents SET public_media_url = NULL WHERE public_media_url LIKE '%trycloudflare.com%';"
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($sql))
$cmd = "echo $b64 | base64 -d | docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid"
& "$PSScriptRoot/run-ec2-cmd.ps1" $cmd
