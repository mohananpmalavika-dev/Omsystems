@echo off
setlocal EnableDelayedExpansion
echo ================================================================
echo    Sentinel Grid Edge Agent - 1-Click Project Recovery
echo ================================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
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

echo [Target Directory] %AGENT_DIR%
echo [Target Binary]    %AGENT_EXE%
echo [Target Config]    %CONFIG_PATH%
echo.

echo [1/5] Stopping any hung processes...
taskkill /F /IM edge-agent.exe /T >nul 2>&1
taskkill /F /IM mediamtx.exe /T >nul 2>&1
taskkill /F /IM ffmpeg.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1

echo [2/5] Cleaning stale locks inside project...
if exist "%AGENT_DIR%\data\edge-agent.lock" (
    del /F /Q "%AGENT_DIR%\data\edge-agent.lock" >nul 2>&1
    echo   - Cleared lock file
)

echo [3/5] Setting secure directory permissions inside project...
if not exist "%AGENT_DIR%\data" mkdir "%AGENT_DIR%\data"
if not exist "%AGENT_DIR%\logs" mkdir "%AGENT_DIR%\logs"
if not exist "%AGENT_DIR%\config" mkdir "%AGENT_DIR%\config"
icacls "%AGENT_DIR%\data" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "%AGENT_DIR%\logs" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "%AGENT_DIR%\config" /grant Users:(OI)(CI)R /T /Q >nul 2>&1

echo [4/5] Registering 24/7 Auto-Healing Watchdog (Scheduled Task)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$taskName = 'Sentinel Grid Edge Agent'; ^
   $exe = '%AGENT_EXE%'; ^
   $config = '%CONFIG_PATH%'; ^
   $workDir = '%AGENT_DIR%'; ^
   $action = New-ScheduledTaskAction -Execute $exe -Argument ('--run --config \"' + $config + '\"') -WorkingDirectory $workDir; ^
   $bootTrigger = New-ScheduledTaskTrigger -AtStartup; ^
   $watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration ([TimeSpan]::MaxValue); ^
   $principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; ^
   $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew; ^
   Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue; ^
   Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($bootTrigger, $watchdogTrigger) -Principal $principal -Settings $settings -Description 'Sentinel Grid Edge Agent (project workspace)' | Out-Null; ^
   Start-ScheduledTask -TaskName $taskName; ^
   Write-Host '  - Scheduled Task registered with 24/7 repeating 1-minute auto-heal watchdog pointing inside project.'"

echo [5/5] Verifying Edge Agent process startup...
timeout /t 5 /nobreak >nul
tasklist /FI "IMAGENAME eq edge-agent.exe" | find /i "edge-agent.exe" >nul
if %errorLevel% equ 0 (
    echo.
    echo ================================================================
    echo  SUCCESS: Edge Agent is now RUNNING and self-healing inside project!
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
