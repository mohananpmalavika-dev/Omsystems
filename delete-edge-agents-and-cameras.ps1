# =====================================================
# DELETE ALL EDGE AGENTS AND CAMERAS
# =====================================================
# This script will execute the SQL deletion script
# =====================================================

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Red
Write-Host "  DESTRUCTIVE OPERATION WARNING" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""
Write-Host "This script will DELETE ALL:" -ForegroundColor Yellow
Write-Host "  - Edge Agents (Gateways)" -ForegroundColor Yellow
Write-Host "  - Cameras" -ForegroundColor Yellow
Write-Host "  - Related health data, commands, telemetry" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Red
Write-Host ""

# Get database URL from .env file
if (Test-Path ".env") {
    $envContent = Get-Content ".env"
    $dbUrl = ($envContent | Select-String "^DATABASE_URL=(.+)$").Matches.Groups[1].Value
    
    if ([string]::IsNullOrEmpty($dbUrl)) {
        Write-Host "ERROR: Could not find DATABASE_URL in .env file" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Database: $($dbUrl -replace 'postgresql://[^@]+@', 'postgresql://***:***@')" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "ERROR: .env file not found" -ForegroundColor Red
    exit 1
}

# Confirm with user
Write-Host "Do you want to proceed? Type 'DELETE ALL' to confirm:" -ForegroundColor Yellow -NoNewline
$confirmation = Read-Host " "

if ($confirmation -ne "DELETE ALL") {
    Write-Host "Operation cancelled." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "Executing deletion script..." -ForegroundColor Yellow

# Check if psql is available
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue

if ($null -eq $psqlPath) {
    Write-Host "ERROR: psql command not found. Please install PostgreSQL client tools." -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternative: Run the SQL script manually in your database client" -ForegroundColor Yellow
    Write-Host "SQL file location: .\delete-edge-agents-and-cameras.sql" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Remember to change 'ROLLBACK' to 'COMMIT' in the SQL file!" -ForegroundColor Red
    exit 1
}

# Execute the SQL script
try {
    Write-Host ""
    Write-Host "First running in PREVIEW mode (will ROLLBACK)..." -ForegroundColor Cyan
    Write-Host ""
    
    $env:PGPASSWORD = ""
    psql $dbUrl -f "delete-edge-agents-and-cameras.sql"
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "PREVIEW COMPLETE (changes were rolled back)" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Do you want to COMMIT the changes? Type 'YES' to confirm:" -ForegroundColor Yellow -NoNewline
    $finalConfirm = Read-Host " "
    
    if ($finalConfirm -eq "YES") {
        Write-Host ""
        Write-Host "Executing with COMMIT..." -ForegroundColor Red
        
        # Replace ROLLBACK with COMMIT in the SQL file temporarily
        $sqlContent = Get-Content "delete-edge-agents-and-cameras.sql" -Raw
        $sqlContentCommit = $sqlContent -replace "ROLLBACK;  -- Default is ROLLBACK for safety", "COMMIT;  -- COMMITTED"
        $tempSqlFile = "delete-edge-agents-and-cameras-COMMIT.sql"
        Set-Content -Path $tempSqlFile -Value $sqlContentCommit
        
        psql $dbUrl -f $tempSqlFile
        
        Remove-Item $tempSqlFile
        
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "DELETION COMPLETE" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
    } else {
        Write-Host "Final commit cancelled. No data was deleted." -ForegroundColor Green
    }
    
} catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
