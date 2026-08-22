# PowerShell script to apply database migrations
# Run this from the project root directory

param(
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432",
    [string]$DbName = "sentinel",
    [string]$DbUser = "postgres",
    [string]$DbPassword = ""
)

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Omsystems Database Migration Tool" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if psql is available
try {
    $psqlVersion = psql --version
    Write-Host "✓ PostgreSQL client found: $psqlVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ PostgreSQL client (psql) not found in PATH" -ForegroundColor Red
    Write-Host "Please install PostgreSQL and ensure psql is in your PATH" -ForegroundColor Yellow
    exit 1
}

# Set environment variable for password if provided
if ($DbPassword) {
    $env:PGPASSWORD = $DbPassword
}

# Connection string
$connString = "-h $DbHost -p $DbPort -U $DbUser -d $DbName"

Write-Host "Database: $DbName on $DbHost:$DbPort" -ForegroundColor Cyan
Write-Host ""

# Test connection
Write-Host "Testing database connection..." -ForegroundColor Yellow
$testQuery = "SELECT version();"
try {
    $result = psql $connString -c $testQuery 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Connection successful" -ForegroundColor Green
    } else {
        Write-Host "✗ Connection failed" -ForegroundColor Red
        Write-Host $result
        exit 1
    }
} catch {
    Write-Host "✗ Connection failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Applying Migrations" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Priority migrations to apply
$migrations = @(
    "013_analytics_phase2.sql",
    "022_compliance_enhancements.sql"
)

$successCount = 0
$failCount = 0
$skippedCount = 0

foreach ($migration in $migrations) {
    $migrationPath = "database\migrations\$migration"
    
    if (Test-Path $migrationPath) {
        Write-Host "Applying: $migration" -ForegroundColor Cyan
        
        try {
            $output = psql $connString -f $migrationPath 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ Success" -ForegroundColor Green
                $successCount++
            } else {
                Write-Host "  ✗ Failed" -ForegroundColor Red
                Write-Host "  Error: $output" -ForegroundColor Red
                $failCount++
            }
        } catch {
            Write-Host "  ✗ Error: $_" -ForegroundColor Red
            $failCount++
        }
    } else {
        Write-Host "Skipping: $migration (file not found)" -ForegroundColor Yellow
        $skippedCount++
    }
    
    Write-Host ""
}

# Summary
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Migration Summary" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Successful: $successCount" -ForegroundColor Green
Write-Host "Failed: $failCount" -ForegroundColor $(if ($failCount -gt 0) { "Red" } else { "Green" })
Write-Host "Skipped: $skippedCount" -ForegroundColor Yellow
Write-Host ""

# Verify tables created
Write-Host "Verifying new tables..." -ForegroundColor Cyan
$verifyQuery = @"
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'face_watchlists', 
    'anpr_watchlists', 
    'compliance_requirements', 
    'compliance_controls',
    'compliance_evidence',
    'compliance_risks'
)
ORDER BY table_name;
"@

try {
    $tables = psql $connString -t -c $verifyQuery
    if ($tables) {
        Write-Host "✓ New tables found:" -ForegroundColor Green
        $tables -split "`n" | Where-Object { $_.Trim() } | ForEach-Object {
            Write-Host "  - $($_.Trim())" -ForegroundColor Green
        }
    } else {
        Write-Host "⚠ No new tables found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠ Could not verify tables: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Migration process complete!" -ForegroundColor Cyan

# Clear password from environment
if ($DbPassword) {
    Remove-Item Env:\PGPASSWORD
}

if ($failCount -gt 0) {
    exit 1
}
