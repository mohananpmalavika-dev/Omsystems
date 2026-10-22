@echo off
setlocal EnableDelayedExpansion
echo ================================================================
echo   Sentinel Grid Edge Agent - Start / Restart Service
echo ================================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to start Edge Agent...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~dpnx0\"\"' -Verb RunAs"
    exit /b
)

:: Detect Edge Agent installation directory (Client PC, Extracted Package, or Workspace)
set "AGENT_DIR=C:\Program Files\Sentinel Grid\Edge Agent"
set "AGENT_EXE=%AGENT_DIR%\edge-agent.exe"
set "CONFIG_PATH=%AGENT_DIR%\config\edge-agent.env"

if not exist "%AGENT_EXE%" (
    if exist "%~dp0edge-agent.exe" (
        set "AGENT_DIR=%~dp0"
        set "AGENT_EXE=%~dp0edge-agent.exe"
        if exist "%~dp0edge-agent.env" set "CONFIG_PATH=%~dp0edge-agent.env"
        if exist "%~dp0config\edge-agent.env" set "CONFIG_PATH=%~dp0config\edge-agent.env"
    ) else if exist "%~dp0edge-agent\release\edge-agent.exe" (
        set "AGENT_DIR=%~dp0edge-agent"
        set "AGENT_EXE=%~dp0edge-agent\release\edge-agent.exe"
        if exist "%AGENT_DIR%\run-edge-agent.env" set "CONFIG_PATH=%AGENT_DIR%\run-edge-agent.env"
        if exist "%AGENT_DIR%\config\edge-agent.env" set "CONFIG_PATH=%AGENT_DIR%\config\edge-agent.env"
        if exist "%AGENT_DIR%\.env" set "CONFIG_PATH=%AGENT_DIR%\.env"
    ) else (
        echo [ERROR] Edge Agent executable not found at:
        echo "C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe"
        echo.
        pause
        exit /b 1
    )
)

echo [1/3] Terminating any stale agent processes...
taskkill /F /IM edge-agent.exe /T >nul 2>&1
taskkill /F /IM mediamtx.exe /T >nul 2>&1
if exist "%AGENT_DIR%\data\edge-agent.lock" (
    del /F /Q "%AGENT_DIR%\data\edge-agent.lock" >nul 2>&1
)

echo [2/3] Configuring directory permissions...
if not exist "%AGENT_DIR%\data" mkdir "%AGENT_DIR%\data" >nul 2>&1
if not exist "%AGENT_DIR%\logs" mkdir "%AGENT_DIR%\logs" >nul 2>&1
if not exist "%AGENT_DIR%\config" mkdir "%AGENT_DIR%\config" >nul 2>&1
icacls "%AGENT_DIR%\data" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "%AGENT_DIR%\logs" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "%AGENT_DIR%\config" /grant Users:(OI)(CI)R /T /Q >nul 2>&1

echo [3/3] Launching Sentinel Grid Edge Agent...
schtasks /Run /TN "Sentinel Grid Edge Agent" >nul 2>&1
if %errorLevel% equ 0 (
    echo Successfully triggered Scheduled Task: Sentinel Grid Edge Agent
) else (
    echo Starting edge-agent process directly...
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
