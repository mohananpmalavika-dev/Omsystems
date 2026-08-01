@echo off
REM ========================================
REM   DIAGNOSE EDGE AGENT A1 ISSUES
REM ========================================
echo.
echo ========================================
echo   Edge Agent A1 - DIAGNOSTIC TOOL
echo ========================================
echo.

cd /d "%~dp0"

echo [1/7] Checking if config file exists...
if exist "config\edge-agent-A1.env" (
    echo ✅ Config file found: config\edge-agent-A1.env
) else (
    echo ❌ Config file NOT found: config\edge-agent-A1.env
    echo    This is the problem! The config file is missing.
    goto :end
)

echo.
echo [2/7] Checking if executable exists...
if exist "release\sentinel-edge-agent.exe" (
    echo ✅ Executable found: release\sentinel-edge-agent.exe
) else (
    echo ❌ Executable NOT found: release\sentinel-edge-agent.exe
    echo    This is the problem! The edge agent program is missing.
    goto :end
)

echo.
echo [3/7] Checking if directories exist...
if exist "data-a1" (
    echo ✅ Data directory exists: data-a1\
) else (
    echo ⚠️  Data directory missing - creating it...
    mkdir "data-a1"
)

if exist "logs-a1" (
    echo ✅ Logs directory exists: logs-a1\
) else (
    echo ⚠️  Logs directory missing - creating it...
    mkdir "logs-a1"
)

echo.
echo [4/7] Checking if service is installed...
schtasks /query /tn "SentinelEdgeAgent-A1" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Service is installed: SentinelEdgeAgent-A1
) else (
    echo ⚠️  Service NOT installed
    echo    Run INSTALL_A1_AS_SERVICE.bat to install it
)

echo.
echo [5/7] Checking if process is running...
tasklist /fi "imagename eq sentinel-edge-agent.exe" /fo table /nh | findstr /i "sentinel-edge-agent.exe" >nul
if %errorlevel% equ 0 (
    echo ✅ Edge agent process IS running
    echo    Note: Both H1 and A1 use the same executable name
) else (
    echo ❌ Edge agent process is NOT running
    echo    This is why A1 is offline!
    echo.
    echo    To start it:
    echo      schtasks /run /tn "SentinelEdgeAgent-A1"
)

echo.
echo [6/7] Checking network ports...
netstat -an | findstr ":8091" >nul
if %errorlevel% equ 0 (
    echo ✅ Port 8091 is in use (A1 should be listening here)
) else (
    echo ⚠️  Port 8091 is NOT in use
    echo    A1's media gateway should be on port 8091
)

netstat -an | findstr ":8094" >nul
if %errorlevel% equ 0 (
    echo ✅ Port 8094 is in use (A1 secret provider)
) else (
    echo ⚠️  Port 8094 is NOT in use
    echo    A1's secret provider should be on port 8094
)

echo.
echo [7/7] Checking log file...
if exist "logs-a1\edge-agent.log" (
    echo ✅ Log file exists: logs-a1\edge-agent.log
    echo.
    echo    Last 10 lines of log:
    echo    ----------------------------------------
    powershell -command "Get-Content 'logs-a1\edge-agent.log' -Tail 10"
    echo    ----------------------------------------
) else (
    echo ⚠️  No log file found (agent may not have started yet)
)

:end
echo.
echo ========================================
echo   DIAGNOSIS COMPLETE
echo ========================================
echo.
echo If A1 is not running, try:
echo   1. Run INSTALL_A1_AS_SERVICE.bat (if not installed)
echo   2. Run: schtasks /run /tn "SentinelEdgeAgent-A1"
echo   3. Wait 30 seconds and check dashboard
echo.
pause
