@echo off
setlocal
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

echo [1/3] Terminating any stale agent processes...
taskkill /F /IM edge-agent.exe /T >nul 2>&1
taskkill /F /IM mediamtx.exe /T >nul 2>&1
if exist "C:\Program Files\Sentinel Grid\Edge Agent\data\edge-agent.lock" (
    del /F /Q "C:\Program Files\Sentinel Grid\Edge Agent\data\edge-agent.lock" >nul 2>&1
)

echo [2/3] Configuring directory permissions...
icacls "C:\Program Files\Sentinel Grid\Edge Agent\data" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "C:\Program Files\Sentinel Grid\Edge Agent\logs" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "C:\Program Files\Sentinel Grid\Edge Agent\config" /grant Users:(OI)(CI)R /T /Q >nul 2>&1

echo [3/3] Launching Sentinel Grid Edge Agent...
schtasks /Run /TN "Sentinel Grid Edge Agent" >nul 2>&1
if %errorLevel% equ 0 (
    echo Successfully triggered Scheduled Task: Sentinel Grid Edge Agent
) else (
    echo Starting edge-agent process directly...
    start "" /D "C:\Program Files\Sentinel Grid\Edge Agent" "C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe" --run --config "C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env"
)

echo.
echo Waiting 5 seconds for agent initialization...
timeout /t 5 /nobreak >nul

tasklist /FI "IMAGENAME eq edge-agent.exe" | find /i "edge-agent.exe" >nul
if %errorLevel% equ 0 (
    echo.
    echo ================================================================
    echo  SUCCESS: Sentinel Grid Edge Agent v0.1.38 is now RUNNING!
    echo ================================================================
) else (
    echo.
    echo WARNING: Agent process not detected in process table. Check logs:
    echo "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log"
)

echo.
pause
