@echo off
:: Sentinel Grid Edge Agent - Service Installer
:: Right-click this file and select "Run as Administrator"
:: This will install the edge agent to run automatically on startup

title Sentinel Grid Edge Agent - Service Installer

echo.
echo ========================================
echo  Sentinel Grid Edge Agent
echo  Service Installation
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

echo [OK] Configuration found
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org
    echo Then run this installer again.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js is installed
echo.

:: Install dependencies
echo [*] Installing dependencies...
call npm install --silent
echo.

:: Build the executable
echo [*] Building edge agent executable...
echo     This may take a few minutes...
echo.
call npm run build:exe
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Build failed!
    echo.
    pause
    exit /b 1
)
echo.
echo [OK] Build completed
echo.

:: Create installation directory
set INSTALL_DIR=C:\Program Files\Sentinel Grid\Edge Agent
echo [*] Creating installation directory...
if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    mkdir "%INSTALL_DIR%\config"
    mkdir "%INSTALL_DIR%\logs"
    mkdir "%INSTALL_DIR%\data"
)
echo [OK] Installation directory ready
echo.

:: Copy files
echo [*] Copying files...
copy /Y "release\edge-agent.exe" "%INSTALL_DIR%\edge-agent.exe" >nul
copy /Y "config\edge-agent-H1.env" "%INSTALL_DIR%\config\edge-agent-H1.env" >nul
echo [OK] Files copied
echo.

:: Create scheduled task
echo [*] Creating Windows scheduled task...
schtasks /query /TN "Sentinel Grid Edge Agent" >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Removing existing scheduled task...
    schtasks /delete /TN "Sentinel Grid Edge Agent" /F >nul
)

schtasks /create /TN "Sentinel Grid Edge Agent" ^
    /TR "\"%INSTALL_DIR%\edge-agent.exe\" --config \"%INSTALL_DIR%\config\edge-agent-H1.env\"" ^
    /SC ONSTART ^
    /RU SYSTEM ^
    /RL HIGHEST ^
    /F >nul

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to create scheduled task!
    echo.
    pause
    exit /b 1
)

echo [OK] Scheduled task created
echo.

:: Start the task
echo [*] Starting edge agent...
schtasks /run /TN "Sentinel Grid Edge Agent" >nul
echo [OK] Edge agent started
echo.

:: Wait a moment for the agent to initialize
timeout /t 5 /nobreak >nul

:: Show status
echo.
echo ========================================
echo  Installation Complete!
echo ========================================
echo.
echo The edge agent is now running and will start automatically on system boot.
echo.
echo Installation Details:
echo   - Location: %INSTALL_DIR%
echo   - Config:   %INSTALL_DIR%\config\edge-agent-H1.env
echo   - Logs:     %INSTALL_DIR%\logs\edge-agent.log
echo.
echo To check status:
echo   1. Open Task Scheduler
echo   2. Look for "Sentinel Grid Edge Agent"
echo.
echo To view logs:
echo   - Open: %INSTALL_DIR%\logs\edge-agent.log
echo.
echo.
pause
