@echo off
REM ========================================
REM   CHECK EDGE AGENT A1 STATUS
REM ========================================
echo.
echo ========================================
echo   Edge Agent A1 Status Check
echo ========================================
echo.

echo Checking scheduled task...
schtasks /query /tn "SentinelEdgeAgent-A1" /fo LIST /v 2>nul | findstr /i "TaskName State Status"

if %errorlevel% neq 0 (
    echo.
    echo ❌ Service NOT installed!
    echo    Run INSTALL_A1_AS_SERVICE.bat to install it.
    echo.
) else (
    echo.
    echo Checking if process is running...
    tasklist /fi "imagename eq sentinel-edge-agent.exe" /fo table /nh | findstr /i "sentinel-edge-agent.exe" >nul
    if %errorlevel% equ 0 (
        echo ✅ Edge Agent A1 process is RUNNING
    ) else (
        echo ⚠️  Service installed but process NOT running
        echo    Try running: schtasks /run /tn "SentinelEdgeAgent-A1"
    )
    echo.
)

echo.
echo To start the service manually (if not running):
echo   schtasks /run /tn "SentinelEdgeAgent-A1"
echo.
echo To stop the service:
echo   taskkill /f /im sentinel-edge-agent.exe
echo.

pause
