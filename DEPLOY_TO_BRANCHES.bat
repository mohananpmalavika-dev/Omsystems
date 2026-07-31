@echo off
cls
echo ========================================
echo  Sentinel Grid - Branch Deployment
echo ========================================
echo.
echo This will help you prepare the installer
echo for distribution to branch offices.
echo.
pause

:MENU
cls
echo ========================================
echo  Sentinel Grid - Branch Deployment
echo ========================================
echo.
echo 1. Build Installer Package
echo 2. Generate Installation Key
echo 3. Generate 10 Installation Keys
echo 4. Open Installer Folder
echo 5. Open Deployment Guide
echo 6. Exit
echo.
set /p choice="Enter your choice (1-6): "

if "%choice%"=="1" goto BUILD
if "%choice%"=="2" goto GENERATE_ONE
if "%choice%"=="3" goto GENERATE_TEN
if "%choice%"=="4" goto OPEN_FOLDER
if "%choice%"=="5" goto OPEN_GUIDE
if "%choice%"=="6" goto EXIT
goto MENU

:BUILD
cls
echo Building installer package...
echo.
PowerShell -NoProfile -ExecutionPolicy Bypass -File "edge-agent\scripts\build-installer.ps1"
echo.
pause
goto MENU

:GENERATE_ONE
cls
set /p branchname="Enter branch name: "
echo.
echo Generating installation key for: %branchname%
echo.
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "cd edge-agent\scripts; .\generate-installation-key.ps1 -BranchName '%branchname%'"
echo.
pause
goto MENU

:GENERATE_TEN
cls
echo Generating 10 installation keys...
echo.
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "cd edge-agent\scripts; .\generate-installation-key.ps1 -Count 10"
echo.
pause
goto MENU

:OPEN_FOLDER
start "" "edge-agent\dist"
goto MENU

:OPEN_GUIDE
start "" "BRANCH_DEPLOYMENT_SUMMARY.md"
goto MENU

:EXIT
exit
