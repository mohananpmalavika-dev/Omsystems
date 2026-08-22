@echo off
:: Sentinel Grid Edge Agent - 100% Automated Zero-Touch Installer
title Sentinel Grid Edge Agent Installer

echo ===================================================
echo   Sentinel Grid Edge Agent - Automated Installer
echo ===================================================
echo.
echo Installing Sentinel Grid 24/7 Background Service...
echo.

:: Automatically run elevated PowerShell script to install Windows Service
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process PowerShell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0scripts\install-service.ps1"" -AppPath ""%~dp0..""' -Wait"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================
    echo  [SUCCESS] Sentinel Grid Edge Agent is now ACTIVE!
    echo  - Runs 24/7 in background as a Windows Service
    echo  - Auto-discovers and provisions cameras directly
    echo ===================================================
) else (
    echo.
    echo [ERROR] Installation encountered an issue.
)

pause
exit
