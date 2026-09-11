@echo off
:: ================================================================
:: OmSystems / KryptonVision - Edge Agent Code Signing Script
:: Signs release\edge-agent.exe with Authenticode to pass Windows Defender
:: ================================================================

cd /d "%~dp0"
echo [*] Launching Authenticode Signing for Edge Agent...
powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0edge-agent\scripts\sign-and-package.ps1"
echo.
pause
