@echo off
cd /d %~dp0
echo ================================================================
echo  Sentinel Grid Edge Agent - Auto Process Manager
echo ================================================================
echo Terminating any previous Edge Agent and camera runtime instances...
taskkill /F /IM edge-agent.exe /T >nul 2>&1
taskkill /F /IM mediamtx.exe /T >nul 2>&1
if exist "data\edge-agent.lock" del /F /Q "data\edge-agent.lock" >nul 2>&1
echo.
echo Starting Sentinel Grid Edge Agent / Camera Scanner...
echo.

if exist "start-with-env.mjs" (
    node start-with-env.mjs
) else (
    npx tsx src/index.ts
)

echo.
echo Scanner stopped.
pause
