@echo off
:: Check Edge Agent Status
:: Double-click this file to see if the edge agent is running

title Edge Agent Status Check

echo.
echo ========================================
echo  Edge Agent Status Check
echo ========================================
echo.

:: Check if scheduled task exists
schtasks /query /TN "Sentinel Grid Edge Agent" >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Scheduled Task: INSTALLED
    
    :: Get task status
    for /f "tokens=2 delims=:" %%a in ('schtasks /query /TN "Sentinel Grid Edge Agent" /fo list ^| findstr /C:"Status:"') do (
        set TASK_STATUS=%%a
    )
    
    echo [*] Task Status: %TASK_STATUS%
) else (
    echo [!] Scheduled Task: NOT INSTALLED
    echo.
    echo     To install, run: INSTALL_AS_SERVICE.bat (as Administrator)
)
echo.

:: Check if process is running
tasklist /FI "IMAGENAME eq edge-agent.exe" 2>NUL | find /I /N "edge-agent.exe">NUL
if %errorlevel% equ 0 (
    echo [*] Process: RUNNING
    
    :: Get process details
    for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq edge-agent.exe" /NH') do (
        echo [*] Process ID: %%a
        goto :found_process
    )
    :found_process
) else (
    echo [!] Process: NOT RUNNING
)
echo.

:: Check if installation directory exists
if exist "C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe" (
    echo [*] Installation: C:\Program Files\Sentinel Grid\Edge Agent
    
    :: Check log file
    if exist "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" (
        echo [*] Log file exists
        
        :: Get last few lines of log
        echo.
        echo [*] Recent log entries:
        echo ----------------------------------------
        powershell -Command "Get-Content 'C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log' -Tail 5 2>$null"
        echo ----------------------------------------
    )
) else (
    echo [!] Installation: NOT FOUND
    echo.
    echo     To install, run: INSTALL_AS_SERVICE.bat (as Administrator)
)

echo.
echo ========================================
echo  Quick Actions
echo ========================================
echo.
echo To start edge agent:
echo   - Run: START_EDGE_AGENT.bat
echo   OR
echo   - Open Task Scheduler, find "Sentinel Grid Edge Agent", click "Run"
echo.
echo To install as Windows service:
echo   - Right-click: INSTALL_AS_SERVICE.bat
echo   - Select: "Run as Administrator"
echo.
echo To view full logs:
echo   - Open: C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log
echo   OR
echo   - Open: C:\Omsystems\edge-agent\logs\edge-agent.log
echo.
pause
