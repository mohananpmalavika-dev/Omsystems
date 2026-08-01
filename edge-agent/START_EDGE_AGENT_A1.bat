@echo off
REM ========================================
REM   START EDGE AGENT A1 - TEST MODE
REM ========================================
echo.
echo ========================================
echo   Sentinel Edge Agent A1 - STARTING
echo ========================================
echo.
echo Gateway Name: A1
echo Config File: config\edge-agent-A1.env
echo.
echo This will start the edge agent in TEST MODE.
echo Press Ctrl+C to stop it.
echo.
echo Starting in 3 seconds...
timeout /t 3 /nobreak > nul

cd /d "%~dp0"

REM Check if the executable exists
if not exist "release\sentinel-edge-agent.exe" (
    echo ERROR: sentinel-edge-agent.exe not found!
    echo Expected location: release\sentinel-edge-agent.exe
    echo.
    pause
    exit /b 1
)

echo Starting Edge Agent A1...
echo.

release\sentinel-edge-agent.exe --config config\edge-agent-A1.env

echo.
echo Edge Agent A1 stopped.
pause
