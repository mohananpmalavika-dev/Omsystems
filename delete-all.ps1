# PowerShell script to delete all cameras and gateways from production database
# Usage: .\delete-all.ps1 -DatabaseUrl "postgresql://user:pass@host:5432/dbname"

param(
    [Parameter(Mandatory=$true)]
    [string]$DatabaseUrl
)

Write-Host "⚠️  WARNING: This will delete ALL cameras and gateways from the database!" -ForegroundColor Red
Write-Host "Press Ctrl+C to cancel, or Enter to continue..."
Read-Host

Write-Host "`nChecking current counts..." -ForegroundColor Yellow
& psql $DatabaseUrl -c "SELECT COUNT(*) as camera_count FROM resource_nodes WHERE node_type = 'camera';"
& psql $DatabaseUrl -c "SELECT COUNT(*) as gateway_count FROM resource_nodes WHERE node_type = 'gateway';"

Write-Host "`nDeleting records..." -ForegroundColor Yellow
& psql $DatabaseUrl -f delete-cameras-gateways.sql

Write-Host "`nDone! Verifying deletion..." -ForegroundColor Green
& psql $DatabaseUrl -c "SELECT COUNT(*) as remaining_cameras FROM resource_nodes WHERE node_type = 'camera';"
& psql $DatabaseUrl -c "SELECT COUNT(*) as remaining_gateways FROM resource_nodes WHERE node_type = 'gateway';"
