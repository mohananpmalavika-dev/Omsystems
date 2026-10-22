@echo off
setlocal EnableDelayedExpansion
echo ================================================================
echo   Sentinel Grid Edge Agent - Start / Restart (Project Workspace)
echo ================================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to start Edge Agent...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~dpnx0\"\"' -Verb RunAs"
    exit /b
)

set "PROJECT_ROOT=%~dp0"
set "AGENT_DIR=%PROJECT_ROOT%edge-agent"

:: Locate Edge Agent executable inside the project
if exist "%AGENT_DIR%\release\edge-agent.exe" (
    set "AGENT_EXE=%AGENT_DIR%\release\edge-agent.exe"
) else if exist "%AGENT_DIR%\edge-agent.exe" (
    set "AGENT_EXE=%AGENT_DIR%\edge-agent.exe"
) else if exist "%PROJECT_ROOT%edge-agent.exe" (
    set "AGENT_EXE=%PROJECT_ROOT%edge-agent.exe"
) else (
    echo [ERROR] Edge Agent executable not found inside project:
    echo "%AGENT_DIR%\release\edge-agent.exe"
    echo.
    pause
    exit /b 1
)

:: Locate configuration file inside the project
if exist "%AGENT_DIR%\run-edge-agent.env" (
    set "CONFIG_PATH=%AGENT_DIR%\run-edge-agent.env"
) else if exist "%AGENT_DIR%\.env" (
    set "CONFIG_PATH=%AGENT_DIR%\.env"
) else if exist "%PROJECT_ROOT%local-edge-agent.env" (
    set "CONFIG_PATH=%PROJECT_ROOT%local-edge-agent.env"
) else if exist "%AGENT_DIR%\config\edge-agent.env" (
    set "CONFIG_PATH=%AGENT_DIR%\config\edge-agent.env"
) else (
    echo [ERROR] No configuration (.env) file found inside %AGENT_DIR%
    pause
    exit /b 1
)

echo [1/3] Terminating any stale agent processes...
taskkill /F /IM edge-agent.exe /T >nul 2>&1
taskkill /F /IM mediamtx.exe /T >nul 2>&1
if exist "%AGENT_DIR%\data\edge-agent.lock" (
    del /F /Q "%AGENT_DIR%\data\edge-agent.lock" >nul 2>&1
)

echo [2/3] Configuring directory permissions inside project...
if not exist "%AGENT_DIR%\data" mkdir "%AGENT_DIR%\data"
if not exist "%AGENT_DIR%\logs" mkdir "%AGENT_DIR%\logs"
if not exist "%AGENT_DIR%\config" mkdir "%AGENT_DIR%\config"
icacls "%AGENT_DIR%\data" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "%AGENT_DIR%\logs" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "%AGENT_DIR%\config" /grant Users:(OI)(CI)R /T /Q >nul 2>&1

echo [3/3] Launching Sentinel Grid Edge Agent...
schtasks /Run /TN "Sentinel Grid Edge Agent" >nul 2>&1
if %errorLevel% equ 0 (
    echo Successfully triggered Scheduled Task: Sentinel Grid Edge Agent
) else (
    echo Starting edge-agent process directly from project...
    start "" /D "%AGENT_DIR%" "%AGENT_EXE%" --run --config "%CONFIG_PATH%"
)

echo.
echo Waiting 5 seconds for agent initialization...
timeout /t 5 /nobreak >nul

tasklist /FI "IMAGENAME eq edge-agent.exe" | find /i "edge-agent.exe" >nul
if %errorLevel% equ 0 (
    echo.
    echo ================================================================
    echo  SUCCESS: Sentinel Grid Edge Agent is now RUNNING!
    echo ================================================================
) else (
    echo.
    echo WARNING: Agent process not detected in process table. Check logs:
    echo "%AGENT_DIR%\logs\edge-agent.log"
)

echo.
pause
