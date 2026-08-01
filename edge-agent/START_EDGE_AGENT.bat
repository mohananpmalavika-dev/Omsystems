@echo off
:: Sentinel Grid Edge Agent - Simple Starter
:: Double-click this file to start the edge agent
:: Press Ctrl+C to stop it

title Sentinel Grid Edge Agent - H1

echo.
echo ========================================
echo  Sentinel Grid Edge Agent
echo  Gateway: H1
echo ========================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Change to edge agent directory
cd /d "%~dp0"

:: Check if config exists
if not exist "config\edge-agent-H1.env" (
    echo ERROR: Configuration file not found!
    echo.
    echo Looking for: config\edge-agent-H1.env
    echo.
    pause
    exit /b 1
)

echo [*] Configuration found: config\edge-agent-H1.env
echo.

:: Install dependencies if needed
if not exist "node_modules" (
    echo [*] Installing dependencies (first time only)...
    echo     This may take a few minutes...
    echo.
    call npm install --silent
    echo.
)

echo [*] Starting Edge Agent...
echo.
echo     - Gateway Name: H1
echo     - Control Plane: https://sentinel-grid-control-plane1.onrender.com
echo.
echo [!] Keep this window open. The agent is running.
echo [!] Press Ctrl+C to stop the agent.
echo.
echo ========================================
echo.

:: Run the edge agent
npm run dev

echo.
echo ========================================
echo  Edge Agent Stopped
echo ========================================
echo.
pause
