@echo off
:: Sentinel Grid Edge Agent Installer
:: Double-click this file to install

echo ========================================
echo   Sentinel Grid Edge Agent Installer
echo ========================================
echo.
echo Starting installation...
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0install-gui.ps1'"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Installation failed! Please contact IT support.
    pause
)

exit
