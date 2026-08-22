@echo off
REM Batch script to apply database migrations
REM Run this from the project root directory

echo ==================================
echo Omsystems Database Migration Tool
echo ==================================
echo.

REM Check if psql is available
where psql >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] PostgreSQL client (psql) not found in PATH
    echo Please install PostgreSQL and ensure psql is in your PATH
    pause
    exit /b 1
)

echo [OK] PostgreSQL client found
echo.

REM Database connection parameters (modify as needed)
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=sentinel
set DB_USER=postgres

echo Database: %DB_NAME% on %DB_HOST%:%DB_PORT%
echo User: %DB_USER%
echo.
echo Press Ctrl+C to cancel or
pause

echo.
echo ==================================
echo Applying Migrations
echo ==================================
echo.

REM Apply Analytics Phase 2 migration
echo [1/2] Applying: 013_analytics_phase2.sql
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f "database\migrations\013_analytics_phase2.sql"
if %ERRORLEVEL% EQU 0 (
    echo [OK] Analytics Phase 2 migration applied
) else (
    echo [ERROR] Failed to apply Analytics Phase 2 migration
)
echo.

REM Apply Compliance Enhancements migration
echo [2/2] Applying: 022_compliance_enhancements.sql
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f "database\migrations\022_compliance_enhancements.sql"
if %ERRORLEVEL% EQU 0 (
    echo [OK] Compliance Enhancements migration applied
) else (
    echo [ERROR] Failed to apply Compliance Enhancements migration
)
echo.

echo ==================================
echo Migration Complete
echo ==================================
echo.

REM Verify tables
echo Verifying new tables...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('face_watchlists', 'anpr_watchlists', 'compliance_requirements', 'compliance_controls') ORDER BY table_name;"

echo.
echo Migration process complete!
pause
