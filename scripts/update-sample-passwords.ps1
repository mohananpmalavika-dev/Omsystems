$ErrorActionPreference = "Stop"
$instanceId = "i-03fda9a80e75865fd"

# mgdhanyamohan: Thathu@110
# BASANTH & admin: 4344@RAM
# Krypton: 4344@RAM (already set)
# test: test@123 (already set)

$sql = @"
UPDATE users SET password_hash = 'scrypt`$ARrxo02jwt7jo6XFNttO7A`$9afGMFkRFIjV4gp8HFhvlAV-7UMLz7Mfnzfj5D2IIRJwtKyvEcrCzpfikeUBw9EXER9vrTS0u3Rwy0qyBi-AUQ', must_change_password = false WHERE lower(username) = 'mgdhanyamohan';
UPDATE users SET password_hash = 'scrypt`$ynebwQs6K58fQfkWIZXRNA`$xKN35LIv5eMYRyXiWlencHSVRVtEHtk2e-VO0FNnEzXVdVF4KCZtpP2ZxGNhiIMh5DSclooPRLvyyf86wLYLGg', must_change_password = false WHERE lower(username) IN ('basanth', 'admin', 'krypton');
UPDATE users SET password_hash = 'scrypt`$EFqOh9Knu1-KIAzLbHR6NA`$xhb7y4QDcBoS4pUR9hM0lT4ayXVwZWv379dcDIG52C7bxGnfTZ-AkGims5wASD9RPvXCp7x2VjfX_fLhP-9xVw', must_change_password = false WHERE lower(username) = 'test';
"@

$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($sql))

$paramFile = [System.IO.Path]::GetTempFileName()
$json = @{
    commands = @(
        "echo $b64 | base64 -d | docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid"
    )
} | ConvertTo-Json -Compress

[System.IO.File]::WriteAllText($paramFile, $json, [System.Text.Encoding]::ASCII)

$cmd = aws ssm send-command `
    --instance-ids $instanceId `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$paramFile" `
    --query "Command.CommandId" `
    --output text

Remove-Item -Path $paramFile -Force -ErrorAction SilentlyContinue

Write-Host "Dispatched password update SSM command: $cmd"

Start-Sleep -Seconds 3

for ($i = 0; $i -lt 15; $i++) {
    $status = aws ssm get-command-invocation --command-id $cmd --instance-id $instanceId --query "Status" --output text
    if ($status -eq "Success" -or $status -eq "Failed" -or $status -eq "Cancelled" -or $status -eq "TimedOut") {
        break
    }
    Start-Sleep -Seconds 2
}

$output = aws ssm get-command-invocation --command-id $cmd --instance-id $instanceId --query "StandardOutputContent" --output text
Write-Host "Output: $output"
