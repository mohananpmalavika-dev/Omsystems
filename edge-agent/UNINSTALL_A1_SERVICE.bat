@echo off
REM ========================================
REM   UNINSTALL EDGE AGENT A1 SERVICE
REM ========================================
echo.
echo ========================================
echo   Uninstall Edge Agent A1 Service
echo ========================================
echo.
echo This will remove the A1 Edge Agent service (scheduled task).
echo The agent will no longer start automatically.
echo.
pause

echo.
echo Stopping any running A1 processes...
taskkill /f /im sentinel-edge-agent.exe 2>nul
timeout /t 2 /nobreak > nul

echo.
echo Removing scheduled task...
schtasks /delete /tn "SentinelEdgeAgent-A1" /f

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   SUCCESS! A1 Service Uninstalled
    echo ========================================
    echo.
) else (
    echo.
    echo Service was not installed or already removed.
    echo.
)

pause
