@echo off
setlocal EnableDelayedExpansion

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Administrator privileges required. Requesting elevation...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title Sentinel Grid Edge Agent - 1-Click Auto Setup
cls
echo ================================================================
echo          SENTINEL GRID CCTV SECURITY - 1-CLICK AUTO SETUP
echo ================================================================
echo Target Branch: Aditi Malavika (5f7cf420-7a56-4ef1-8a12-d45d8bbc5cd3)
echo.
echo [*] Connecting to Sentinel Grid Cloud Control Plane...
echo [*] Downloading and configuring Edge Agent background service...
echo [*] Probing local network for ONVIF IP cameras, RTSP streams, and DVRs...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr -useb 'https://sentinel-grid-monitoring-s38w.onrender.com/api/control/v1/branches/5f7cf420-7a56-4ef1-8a12-d45d8bbc5cd3/install.ps1' | iex"

echo.
echo ================================================================
echo   SUCCESS: Sentinel Grid Edge Agent is installed and running!
echo   It will continuously monitor this branch 24/7 in the background.
echo ================================================================
echo.
pause
