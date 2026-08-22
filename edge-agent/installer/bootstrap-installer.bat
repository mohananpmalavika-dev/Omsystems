@echo off
REM Sentinel Grid Edge Agent Bootstrap Installer
REM This batch file wrapper allows installation without changing PowerShell execution policy

setlocal EnableDelayedExpansion

echo ================================================================
echo    SENTINEL GRID EDGE AGENT - BOOTSTRAP INSTALLER
echo ================================================================
echo.

REM Check for parameters passed from the download
set "ActivationCode=%~1"
set "ControlPlaneUrl=%~2"
set "AgentName=%~3"
set "BranchId=%~4"
set "ActivationId=%~5"

if "%ActivationCode%"=="" (
    echo ERROR: This installer must be downloaded from Sentinel Grid dashboard.
    echo Please use the "Download Package" button in the branch onboarding wizard.
    echo.
    pause
    exit /b 1
)

echo [1/5] Creating installation directories...
set "InstallDir=%ProgramData%\SentinelGrid\EdgeAgent"
set "DataDir=%InstallDir%\data"
set "LogsDir=%InstallDir%\logs"
set "VendorDir=%InstallDir%\vendor\windows"

if not exist "%InstallDir%" mkdir "%InstallDir%"
if not exist "%DataDir%" mkdir "%DataDir%"
if not exist "%LogsDir%" mkdir "%LogsDir%"
if not exist "%VendorDir%" mkdir "%VendorDir%"
echo   [OK] Directories created
echo.

echo [2/5] Downloading edge agent bundle...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {Invoke-WebRequest -Uri '%ControlPlaneUrl%/api/control/v1/edge-agent/bundle/edge-agent.cjs' -OutFile '%InstallDir%\edge-agent.cjs' -UseBasicParsing}"
if errorlevel 1 (
    echo   [ERROR] Failed to download bundle
    pause
    exit /b 1
)
echo   [OK] Bundle downloaded
echo.

echo [3/5] Downloading runtime components...
echo   Downloading FFmpeg...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-07-31-14-10/ffmpeg-n8.1.2-34-g9b6c8969e0-win64-lgpl-shared-8.1.zip' -OutFile '%VendorDir%\ffmpeg.zip' -UseBasicParsing}" 2>nul
if errorlevel 1 echo   [WARN] FFmpeg download failed (will retry on agent start)
echo   Downloading MediaMTX...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {Invoke-WebRequest -Uri 'https://github.com/bluenviron/mediamtx/releases/download/v1.17.1/mediamtx_v1.17.1_windows_amd64.zip' -OutFile '%VendorDir%\mediamtx.zip' -UseBasicParsing}" 2>nul
if errorlevel 1 echo   [WARN] MediaMTX download failed (will retry on agent start)
echo   Downloading Cloudflared...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/download/2026.5.2/cloudflared-windows-amd64.exe' -OutFile '%VendorDir%\cloudflared.exe' -UseBasicParsing}" 2>nul
if errorlevel 1 echo   [WARN] Cloudflared download failed (will retry on agent start)
echo   [OK] Runtime components download completed
echo.

echo [4/5] Creating configuration...
(
echo CONTROL_PLANE_URL=%ControlPlaneUrl%
echo BRANCH_ID=%BranchId%
echo EDGE_AGENT_ID=%ActivationId%
echo EDGE_AGENT_NAME=%AgentName%
echo EDGE_ACTIVATION_CODE=%ActivationCode%
echo EDGE_AGENT_VERSION=0.1.8
echo LIVE_MEDIA_ENABLED=true
echo EDGE_MANAGED_MEDIA_BOOTSTRAP=true
echo MEDIA_RUNTIME_MANAGED=true
echo EDGE_LOG_PATH=./logs/edge-agent.log
echo STREAM_SECRET_STORE_PATH=./data/stream-secrets.json
) > "%InstallDir%\config.env"
echo   [OK] Configuration saved
echo.

echo [5/5] Creating startup script...
(
echo @echo off
echo cd /d "%InstallDir%"
echo node edge-agent.cjs --config config.env
) > "%InstallDir%\start.bat"
echo   [OK] Startup script created
echo.

echo ================================================================
echo    INSTALLATION COMPLETE!
echo ================================================================
echo.
echo Installation location: %InstallDir%
echo.
echo To start the agent, run:
echo   %InstallDir%\start.bat
echo.
echo Or install as a Windows service for automatic startup.
echo.
pause
