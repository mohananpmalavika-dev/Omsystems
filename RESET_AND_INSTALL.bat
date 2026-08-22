@echo off
echo ============================================================
echo  Sentinel Grid Edge Agent - Complete Reset and Install
echo ============================================================
echo.
echo This will:
echo  1. Uninstall current edge agent
echo  2. Wake up Render services
echo  3. Install edge agent fresh
echo  4. Verify installation
echo.
echo NOTE: This must run as Administrator!
echo.
pause

powershell -ExecutionPolicy Bypass -File "%~dp0RESET_AND_INSTALL.ps1"

pause
