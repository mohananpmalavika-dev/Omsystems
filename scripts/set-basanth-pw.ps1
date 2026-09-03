$sql = "UPDATE users SET role = 'security_officer' WHERE username = 'admin'; UPDATE users SET password_hash = 'scrypt`$ogarQOZz7G2etrISbyS9OA`$22HuaNlki4QM5ro89oMT0XNWbsQld86AP23ew0HOftqG1LNG0HH_0ZRzvwprVpSeYa_ov90aDeitDsjg4ylNiw' WHERE username IN ('BASANTH', 'admin');"
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($sql))
$cmd = "echo $b64 | base64 -d | docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid"
& "$PSScriptRoot/run-ec2-cmd.ps1" $cmd
