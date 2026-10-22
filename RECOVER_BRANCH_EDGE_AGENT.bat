@echo off
setlocal
echo ================================================================
echo    Sentinel Grid Edge Agent - 1-Click Branch Recovery
echo ================================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~dpnx0\"\"' -Verb RunAs"
    exit /b
)

set "AGENT_DIR=C:\Program Files\Sentinel Grid\Edge Agent"
if not exist "%AGENT_DIR%\edge-agent.exe" (
    echo [ERROR] Edge Agent installation not found at:
    echo "%AGENT_DIR%"
    echo.
    pause
    exit /b 1
)

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
icacls "%AGENT_DIR%\data" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "%AGENT_DIR%\logs" /grant Users:(OI)(CI)M /T /Q >nul 2>&1
icacls "%AGENT_DIR%\config" /grant Users:(OI)(CI)R /T /Q >nul 2>&1

echo [4/5] Registering robust auto-restarting Scheduled Task...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$taskName = 'Sentinel Grid Edge Agent'; ^
   $exe = '%AGENT_DIR%\edge-agent.exe'; ^
   $action = New-ScheduledTaskAction -Execute $exe -Argument '--run --config \"C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env\"' -WorkingDirectory '%AGENT_DIR%'; ^
   $bootTrigger = New-ScheduledTaskTrigger -AtStartup; ^
   $watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration ([TimeSpan]::MaxValue); ^
   $principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; ^
   $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew; ^
   Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue; ^
   Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($bootTrigger, $watchdogTrigger) -Principal $principal -Settings $settings | Out-Null; ^
   Start-ScheduledTask -TaskName $taskName; ^
   Write-Host '  - Scheduled Task registered with 24/7 repeating 1-minute auto-heal watchdog.'"

echo [5/5] Verifying Edge Agent process startup...
timeout /t 5 /nobreak >nul
tasklist /FI "IMAGENAME eq edge-agent.exe" | find /i "edge-agent.exe" >nul
if %errorLevel% equ 0 (
    echo.
    echo ================================================================
    echo  SUCCESS: Edge Agent is now RUNNING and connected!
    echo ================================================================
) else (
    echo.
    echo [Direct Start] Triggering direct process launch...
    start "" /D "%AGENT_DIR%" "%AGENT_DIR%\edge-agent.exe" --run --config "%AGENT_DIR%\config\edge-agent.env"
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
