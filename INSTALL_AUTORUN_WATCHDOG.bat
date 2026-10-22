@echo off
setlocal EnableDelayedExpansion
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

echo [1/3] Clearing any stale instance locks inside project...
if exist "%AGENT_DIR%\data\edge-agent.lock" (
    del /F /Q "%AGENT_DIR%\data\edge-agent.lock" >nul 2>&1
)

echo [2/3] Registering 24/7 Auto-Healing Scheduled Task Watchdog...
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
   Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($bootTrigger, $watchdogTrigger) -Principal $principal -Settings $settings -Description 'Sentinel Grid 24/7 auto-healing monitoring agent (project workspace)' | Out-Null; ^
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
    echo  automatically within 60 seconds directly inside the project!
    echo ================================================================
) else (
    echo.
    echo Watchdog registered. Starting agent directly...
    start "" /D "%AGENT_DIR%" "%AGENT_EXE%" --run --config "%CONFIG_PATH%"
)

echo.
pause
