@echo off
setlocal
echo ================================================================
echo  Updating Installed Sentinel Grid Edge Agent to Version 0.1.35
echo ================================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~dpnx0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-installed-edge-storage-direct-0.1.35.ps1"

if %errorLevel% equ 0 (
    echo.
    echo ================================================================
    echo  SUCCESS: Edge Agent installed has been updated to Version 0.1.35!
    echo ================================================================
) else (
    echo.
    echo ================================================================
    echo  FAILED: Update failed with error code %errorLevel%.
    echo ================================================================
)
echo.
pause
