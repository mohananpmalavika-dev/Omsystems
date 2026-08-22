@echo off
echo ========================================
echo Sentinel Edge Agent with Cloudflare Tunnel
echo ========================================
echo.

cd /d %~dp0

REM Check if cloudflared exists
if not exist "cloudflared.exe" (
    echo ERROR: cloudflared.exe not found!
    echo.
    echo Please download from:
    echo https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
    echo.
    echo Rename to cloudflared.exe and place in this directory.
    echo.
    pause
    exit /b 1
)

echo Starting Edge Agent...
start "Sentinel Edge Agent" /MIN node start-with-env.mjs

echo Waiting for edge agent to start...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo Starting Cloudflare Tunnel...
echo ========================================
echo.
echo Your PUBLIC edge agent URL will appear below.
echo Copy this URL and use it in your dashboard configuration.
echo.

cloudflared.exe tunnel --url http://localhost:8090

pause
