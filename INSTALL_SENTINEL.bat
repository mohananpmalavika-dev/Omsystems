@echo off
:: ===========================================
:: Sentinel Camera System - One-Click Installer
:: ===========================================
:: For common users - No technical knowledge required
:: Just run this file and everything will work automatically

title Sentinel Camera System - Installation

color 0A
echo.
echo  ================================================
echo    SENTINEL CAMERA SYSTEM
echo    Easy Installation for Everyone
echo  ================================================
echo.
echo  This will:
echo    1. Install camera detection service
echo    2. Start scanning for cameras automatically
echo    3. Open your camera dashboard
echo.
echo  Please wait...
echo.

:: Check if running as admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ================================================
    echo    IMPORTANT: Administrator Permission Needed
    echo  ================================================
    echo.
    echo  Right-click this file and select
    echo  "Run as Administrator"
    echo.
    echo  Then try again.
    echo.
    pause
    exit /b 1
)

:: Change to edge agent directory
cd /d "%~dp0\edge-agent"

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ================================================
    echo    Node.js Not Found
    echo  ================================================
    echo.
    echo  Please install Node.js first:
    echo  Download from: https://nodejs.org
    echo.
    echo  Then run this installer again.
    echo.
    pause
    exit /b 1
)

:: Install dependencies silently
echo  [Step 1/5] Installing required software...
call npm install --silent --loglevel error >nul 2>&1
echo  [OK] Software installed
echo.

:: Build executable
echo  [Step 2/5] Preparing camera detection service...
echo              (This may take 2-3 minutes)
call npm run build:exe >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [ERROR] Build failed. Please contact support.
    echo.
    pause
    exit /b 1
)
echo  [OK] Service ready
echo.

:: Create installation directory in user folder (no admin issues)
set INSTALL_DIR=%USERPROFILE%\Sentinel Camera System
echo  [Step 3/5] Setting up installation folder...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\config" mkdir "%INSTALL_DIR%\config"
if not exist "%INSTALL_DIR%\logs" mkdir "%INSTALL_DIR%\logs"
if not exist "%INSTALL_DIR%\data" mkdir "%INSTALL_DIR%\data"

:: Copy files
copy /Y "release\edge-agent.exe" "%INSTALL_DIR%\edge-agent.exe" >nul
copy /Y "config\edge-agent-H1.env" "%INSTALL_DIR%\config\edge-agent.env" >nul

:: Update paths in config to use user profile
powershell -Command "(Get-Content '%INSTALL_DIR%\config\edge-agent.env') -replace 'C:/Omsystems/edge-agent', '%INSTALL_DIR:\=/%' | Set-Content '%INSTALL_DIR%\config\edge-agent.env'" >nul

echo  [OK] Files copied
echo.

:: Create startup task
echo  [Step 4/5] Creating automatic startup...
schtasks /query /TN "Sentinel Camera System" >nul 2>&1
if %errorlevel% equ 0 (
    schtasks /delete /TN "Sentinel Camera System" /F >nul 2>&1
)

schtasks /create /TN "Sentinel Camera System" ^
    /TR "\"%INSTALL_DIR%\edge-agent.exe\" --config \"%INSTALL_DIR%\config\edge-agent.env\"" ^
    /SC ONSTART ^
    /RU "%USERNAME%" ^
    /RL HIGHEST ^
    /F >nul 2>&1

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [ERROR] Failed to create startup task!
    echo.
    pause
    exit /b 1
)

:: Start the service
echo  [Step 5/5] Starting camera detection...
schtasks /run /TN "Sentinel Camera System" >nul 2>&1
timeout /t 3 /nobreak >nul
echo  [OK] Camera detection started
echo.

:: Create desktop shortcut for dashboard
echo  [*] Creating desktop shortcut...
set SHORTCUT_PATH=%USERPROFILE%\Desktop\Sentinel Dashboard.url
echo [InternetShortcut] > "%SHORTCUT_PATH%"
echo URL=https://sentinel-grid-monitoring1.onrender.com >> "%SHORTCUT_PATH%"
echo IconIndex=0 >> "%SHORTCUT_PATH%"
echo.

:: Create uninstaller
echo @echo off > "%INSTALL_DIR%\Uninstall.bat"
echo title Uninstall Sentinel Camera System >> "%INSTALL_DIR%\Uninstall.bat"
echo echo Removing Sentinel Camera System... >> "%INSTALL_DIR%\Uninstall.bat"
echo schtasks /delete /TN "Sentinel Camera System" /F ^>nul 2^>^&1 >> "%INSTALL_DIR%\Uninstall.bat"
echo timeout /t 2 /nobreak ^>nul >> "%INSTALL_DIR%\Uninstall.bat"
echo rd /s /q "%INSTALL_DIR%" >> "%INSTALL_DIR%\Uninstall.bat"
echo del /f /q "%USERPROFILE%\Desktop\Sentinel Dashboard.url" ^>nul 2^>^&1 >> "%INSTALL_DIR%\Uninstall.bat"
echo echo Uninstalled successfully! >> "%INSTALL_DIR%\Uninstall.bat"
echo pause >> "%INSTALL_DIR%\Uninstall.bat"

color 0A
echo.
echo  ================================================
echo    INSTALLATION COMPLETE!
echo  ================================================
echo.
echo  What happens now:
echo.
echo  1. Camera detection is running in the background
echo  2. It will automatically find cameras on your network
echo  3. Your dashboard will open in your browser
echo.
echo  Dashboard link: 
echo  https://sentinel-grid-monitoring1.onrender.com
echo.
echo  To uninstall:
echo  Run: %INSTALL_DIR%\Uninstall.bat
echo.
echo  Opening dashboard in 5 seconds...
echo.

:: Open dashboard
timeout /t 5 /nobreak >nul
start https://sentinel-grid-monitoring1.onrender.com

echo.
echo  You can close this window now.
echo.
pause
