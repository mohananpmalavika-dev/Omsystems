@echo off
echo ============================================
echo    Sentinel Camera Scanner - Auto Setup
echo ============================================
echo.
echo This will:
echo   1. Register a new camera scanner
echo   2. Configure the system
echo   3. Start the scanner automatically
echo.
pause

cd /d %~dp0

echo.
echo Step 1: Setting up scanner...
node auto-setup-scanner.mjs
if errorlevel 1 (
    echo.
    echo ERROR: Setup failed!
    pause
    exit /b 1
)

echo.
echo Step 2: Starting scanner...
echo.
cd edge-agent
start "Camera Scanner" powershell -NoExit -ExecutionPolicy Bypass -File "START_SCANNER.ps1"

echo.
echo ============================================
echo    Scanner is starting!
echo ============================================
echo.
echo A new window will open showing the scanner output.
echo.
echo To check status:
echo   1. Open your dashboard
echo   2. Go to Organization ^& devices
echo   3. Scanner should show "Running" within 30 seconds
echo.
echo To stop the scanner: Close the scanner window
echo.
pause
