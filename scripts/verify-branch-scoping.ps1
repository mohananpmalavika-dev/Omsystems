[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== 1. Logging in as Superadmin mgdhanyamohan ===" -ForegroundColor Cyan
$superBody = @{
    username = "mgdhanyamohan"
    password = "SentinelMasterAdmin2026!"
} | ConvertTo-Json

$superAuth = Invoke-RestMethod -Uri "http://3.7.216.169:8080/v1/auth/login" -Method Post -ContentType "application/json" -Body $superBody
$superToken = $superAuth.accessToken
Write-Host "Logged in as $($superAuth.user.username) (role: $($superAuth.user.role))" -ForegroundColor Green

Write-Host "`n=== 2. Superadmin views all branches ===" -ForegroundColor Cyan
$superBranches = Invoke-RestMethod -Uri "http://3.7.216.169:8080/v1/branches" -Method Get -Headers @{ Authorization = "Bearer $superToken" }
Write-Host "Total branches visible to superadmin: $($superBranches.Count)" -ForegroundColor Green
$superBranches | ForEach-Object { Write-Host " - Branch: $($_.name) (ID: $($_.id), Type: $($_.nodeType))" }

Write-Host "`n=== 3. Checking user BASANTH and resetting password to KnownPassword123! ===" -ForegroundColor Cyan
$users = Invoke-RestMethod -Uri "http://3.7.216.169:8080/v1/users" -Method Get -Headers @{ Authorization = "Bearer $superToken" }
$basanthUser = $users.users | Where-Object { $_.username -eq "BASANTH" }
if (-not $basanthUser) {
    Write-Host "User BASANTH not found in user list!" -ForegroundColor Red
} else {
    Write-Host "Found BASANTH: $($basanthUser.id) (role: $($basanthUser.role))"
    
    # Set known password for BASANTH to test login
    $pwBody = @{ password = "BasanthPassword2026!" } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://3.7.216.169:8080/v1/users/$($basanthUser.id)/password" -Method Put -ContentType "application/json" -Headers @{ Authorization = "Bearer $superToken" } -Body $pwBody
    Write-Host "Reset BASANTH password successfully." -ForegroundColor Green

    Write-Host "`n=== 4. Logging in as BASANTH (Operator assigned to south branch) ===" -ForegroundColor Cyan
    $basanthAuth = Invoke-RestMethod -Uri "http://3.7.216.169:8080/v1/auth/login" -Method Post -ContentType "application/json" -Body (@{ username = "BASANTH"; password = "BasanthPassword2026!" } | ConvertTo-Json)
    $basanthToken = $basanthAuth.accessToken
    Write-Host "Logged in as $($basanthAuth.user.username) (role: $($basanthAuth.user.role))" -ForegroundColor Green

    Write-Host "`n=== 5. Querying branches accessible to BASANTH ===" -ForegroundColor Cyan
    $basanthBranches = Invoke-RestMethod -Uri "http://3.7.216.169:8080/v1/branches" -Method Get -Headers @{ Authorization = "Bearer $basanthToken" }
    Write-Host "Total branches visible to BASANTH: $($basanthBranches.Count)" -ForegroundColor Yellow
    $basanthBranches | ForEach-Object { Write-Host " - Visible Branch: $($_.name) (ID: $($_.id))" }

    Write-Host "`n=== 6. Querying organization tree for BASANTH ===" -ForegroundColor Cyan
    $basanthTree = Invoke-RestMethod -Uri "http://3.7.216.169:8080/v1/organization/tree" -Method Get -Headers @{ Authorization = "Bearer $basanthToken" }
    Write-Host "Total nodes in org tree for BASANTH: $($basanthTree.Count)" -ForegroundColor Yellow
    $basanthTree | ForEach-Object { Write-Host " - Node: $($_.name) (Type: $($_.nodeType))" }

    Write-Host "`n=== 7. Querying accessible cameras for BASANTH ===" -ForegroundColor Cyan
    $basanthCameras = Invoke-RestMethod -Uri "http://3.7.216.169:8080/v1/cameras" -Method Get -Headers @{ Authorization = "Bearer $basanthToken" }
    Write-Host "Total cameras visible to BASANTH: $($basanthCameras.Count)" -ForegroundColor Yellow
    $basanthCameras | ForEach-Object { Write-Host " - Camera: $($_.name) (Branch ID: $($_.branchId))" }
}
