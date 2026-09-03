$cmd = 'docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT username, status, active, password_hash FROM users WHERE username=''BASANTH'';"'
& "$PSScriptRoot/run-ec2-cmd.ps1" $cmd
