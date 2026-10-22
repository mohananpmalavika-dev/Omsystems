@echo off
setlocal EnableDelayedExpansion
echo ================================================================
echo    Sentinel Grid Edge Agent - 1-Click Client Recovery
echo ================================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~dpnx0\"\"' -Verb RunAs"
    exit /b
)

:: 1. Detect Edge Agent installation directory (Client PC, Extracted Package, or Workspace)
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
        echo or in current folder.
        echo.
        pause
        exit /b 1
    )
)

echo [Agent Location] %AGENT_DIR%
echo [Executable]     %AGENT_EXE%
echo [Configuration]  %CONFIG_PATH%
echo.

echo [1/5] Stopping any hung processes...
taskkill /F /IM edge-agent.exe /T >nul 2>&1
taskkill /F /IM mediamtx.exe /T >nul 2>&1
taskkill /F /IM ffmpeg.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1

echo [2/5] Cleaning stale locks...
if exist "%AGENT_DIR%\data\edge-agent.lock" (
    del /F /Q "%AGENT_DIR%\data\edge-agent.lock" >nul 2>&1
    echo   - Cleared lock file
)

echo [3/5] Setting secure directory permissions...
if not exist "%AGENT_DIR%\data" mkdir "%AGENT_DIR%\data" >nul 2>&1
if not exist "%AGENT_DIR%\logs" mkdir "%AGENT_DIR%\logs" >nul 2>&1
if not exist "%AGENT_DIR%\config" mkdir "%AGENT_DIR%\config" >nul 2>&1
icacls "%AGENT_DIR%\data" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "%AGENT_DIR%\logs" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "%AGENT_DIR%\config" /grant Users:(OI)(CI)R /T /Q >nul 2>&1

echo [4/5] Registering 24/7 Auto-Healing Scheduled Task Watchdog...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$taskName = 'Sentinel Grid Edge Agent'; ^
   $exe = '%AGENT_EXE%'; ^
   $config = '%CONFIG_PATH%'; ^
   $workDir = '%AGENT_DIR%'; ^
   $arg = if (Test-Path $config) { '--run --config \"' + $config + '\"' } else { '--run' }; ^
   $action = New-ScheduledTaskAction -Execute $exe -Argument $arg -WorkingDirectory $workDir; ^
   $bootTrigger = New-ScheduledTaskTrigger -AtStartup; ^
   $watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration ([TimeSpan]::MaxValue); ^
   $principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; ^
   $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew; ^
   Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue; ^
   Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($bootTrigger, $watchdogTrigger) -Principal $principal -Settings $settings -Description 'Sentinel Grid Edge Agent 24/7 Auto-Heal' | Out-Null; ^
   Start-ScheduledTask -TaskName $taskName; ^
   Write-Host '  - Scheduled Task registered with 24/7 repeating 1-minute auto-heal watchdog.'"

echo [5/5] Verifying Edge Agent process startup...
timeout /t 5 /nobreak >nul
tasklist /FI "IMAGENAME eq edge-agent.exe" | find /i "edge-agent.exe" >nul
if %errorLevel% equ 0 (
    echo.
    echo ================================================================
    echo  SUCCESS: Edge Agent is now RUNNING and protected by watchdog!
    echo ================================================================
) else (
    echo.
    echo [Direct Start] Triggering direct process launch...
    start "" /D "%AGENT_DIR%" "%AGENT_EXE%" --run --config "%CONFIG_PATH%"
    timeout /t 4 /nobreak >nul
    tasklist /FI "IMAGENAME eq edge-agent.exe" | find /i "edge-agent.exe" >nul
    if %errorLevel% equ 0 (
        echo  SUCCESS: Edge Agent launched successfully!
    ) else (
        echo  [WARNING] Process did not stay alive. Check logs:
        echo  "%AGENT_DIR%\logs\edge-agent.log"
    )
)

echo.
pause
