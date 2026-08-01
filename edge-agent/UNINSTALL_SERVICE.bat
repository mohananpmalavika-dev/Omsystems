@echo off
:: Sentinel Grid Edge Agent - Service Uninstaller
:: Right-click this file and select "Run as Administrator"

title Sentinel Grid Edge Agent - Service Uninstaller

echo.
echo ========================================
echo  Sentinel Grid Edge Agent
echo  Service Uninstaller
echo ========================================
echo.

:: Check if running as admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: This script must be run as Administrator!
    echo.
    echo Right-click this file and select "Run as Administrator"
    echo.
    pause
    exit /b 1
)

echo [OK] Running as Administrator
echo.

:: Stop the scheduled task if running
echo [*] Stopping edge agent...
schtasks /end /TN "Sentinel Grid Edge Agent" >nul 2>&1
timeout /t 2 /nobreak >nul
echo [OK] Edge agent stopped
echo.

:: Delete the scheduled task
echo [*] Removing scheduled task...
schtasks /delete /TN "Sentinel Grid Edge Agent" /F >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Scheduled task removed
) else (
    echo [!] No scheduled task found (may not be installed)
)
echo.

:: Ask if user wants to delete installation files
echo.
echo Do you want to delete the installation files?
echo   - Location: C:\Program Files\Sentinel Grid\Edge Agent
echo   - This will remove logs and configuration
echo.
set /p DELETE_FILES="Delete files? (Y/N): "

if /i "%DELETE_FILES%"=="Y" (
    echo.
    echo [*] Deleting installation files...
    rmdir /s /q "C:\Program Files\Sentinel Grid\Edge Agent" 2>nul
    echo [OK] Files deleted
) else (
    echo.
    echo [!] Files kept in: C:\Program Files\Sentinel Grid\Edge Agent
)

echo.
echo ========================================
echo  Uninstallation Complete!
echo ========================================
echo.
echo The edge agent has been removed from Windows startup.
echo.
pause
