@echo off
setlocal
echo ================================================================
echo    Sentinel Grid Edge Agent - 24/7 Auto-Heal Watchdog Setup
echo ================================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to register watchdog...
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

echo [1/3] Clearing any stale instance locks...
if exist "%AGENT_DIR%\data\edge-agent.lock" (
    del /F /Q "%AGENT_DIR%\data\edge-agent.lock" >nul 2>&1
)

echo [2/3] Registering 24/7 Auto-Healing Scheduled Task Watchdog...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$taskName = 'Sentinel Grid Edge Agent'; ^
   $exe = '%AGENT_DIR%\edge-agent.exe'; ^
   $action = New-ScheduledTaskAction -Execute $exe -Argument '--run --config \"C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env\"' -WorkingDirectory '%AGENT_DIR%'; ^
   $bootTrigger = New-ScheduledTaskTrigger -AtStartup; ^
   $watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration ([TimeSpan]::MaxValue); ^
   $principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; ^
   $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew; ^
   Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue; ^
   Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($bootTrigger, $watchdogTrigger) -Principal $principal -Settings $settings -Description 'Sentinel Grid 24/7 auto-healing monitoring agent' | Out-Null; ^
   Start-ScheduledTask -TaskName $taskName; ^
   Write-Host '  - Successfully registered Sentinel Grid Edge Agent watchdog task!'"

echo [3/3] Checking process health...
timeout /t 4 /nobreak >nul
tasklist /FI "IMAGENAME eq edge-agent.exe" | find /i "edge-agent.exe" >nul
if %errorLevel% equ 0 (
    echo.
    echo ================================================================
    echo  SUCCESS: Edge Agent is running and protected by 24/7 watchdog!
    echo  If the process is ever terminated, Windows will revive it
    echo  automatically within 60 seconds. No AnyDesk or TeamViewer needed!
    echo ================================================================
) else (
    echo.
    echo Watchdog registered. Starting agent directly...
    start "" /D "%AGENT_DIR%" "%AGENT_DIR%\edge-agent.exe" --run --config "%AGENT_DIR%\config\edge-agent.env"
)

echo.
pause
