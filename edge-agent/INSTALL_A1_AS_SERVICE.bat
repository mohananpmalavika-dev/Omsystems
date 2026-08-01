@echo off
REM ========================================
REM   INSTALL EDGE AGENT A1 AS SERVICE
REM ========================================
echo.
echo ========================================
echo   Install Edge Agent A1 as Service
echo ========================================
echo.
echo This will install the A1 Edge Agent to run automatically
echo when Windows starts (as a scheduled task).
echo.
echo Gateway Name: A1
echo Config File: config\edge-agent-A1.env
echo.
pause

cd /d "%~dp0"

REM Get the current directory
set "AGENT_DIR=%~dp0"
set "AGENT_DIR=%AGENT_DIR:~0,-1%"

echo.
echo Installing scheduled task: SentinelEdgeAgent-A1
echo.

REM Delete existing task if it exists
schtasks /query /tn "SentinelEdgeAgent-A1" >nul 2>&1
if %errorlevel% equ 0 (
    echo Removing existing task...
    schtasks /delete /tn "SentinelEdgeAgent-A1" /f
)

REM Create new scheduled task
schtasks /create /tn "SentinelEdgeAgent-A1" /tr "\"%AGENT_DIR%\release\sentinel-edge-agent.exe\" --config \"%AGENT_DIR%\config\edge-agent-A1.env\"" /sc onstart /ru SYSTEM /rl HIGHEST /f

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   SUCCESS! A1 Service Installed
    echo ========================================
    echo.
    echo The Edge Agent A1 will now start automatically when Windows boots.
    echo.
    echo To start it NOW without rebooting:
    echo   1. Run CHECK_STATUS_A1.bat
    echo   2. Or run: schtasks /run /tn "SentinelEdgeAgent-A1"
    echo.
    echo To check if it's running:
    echo   Run CHECK_STATUS_A1.bat
    echo.
    echo To uninstall:
    echo   Run UNINSTALL_A1_SERVICE.bat
    echo.
) else (
    echo.
    echo ERROR: Failed to install service!
    echo.
)

pause
