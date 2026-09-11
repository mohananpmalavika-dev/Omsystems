@echo off
:: ================================================================
:: OmSystems / KryptonVision Edge Agent - Certificate Installer
:: Adds the Code Signing Certificate to Trusted Root & Trusted Publishers
:: ================================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Administrator privileges required. Requesting elevation...
    powershell -NoProfile -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
set CERT_FILE=omsystems-edge-agent.cer

if not exist "%CERT_FILE%" (
    echo [ERROR] Certificate file '%CERT_FILE%' not found in %~dp0
    pause
    exit /b 1
)

echo [*] Installing OmSystems Edge Agent Code Signing Certificate...
certutil -addstore -f "TrustedPublisher" "%CERT_FILE%" >nul
if %errorLevel% equ 0 (
    echo [OK] Added to Trusted Publishers store.
) else (
    echo [!] Warning: Failed to add to Trusted Publishers.
)

certutil -addstore -f "ROOT" "%CERT_FILE%" >nul
if %errorLevel% equ 0 (
    echo [OK] Added to Trusted Root Certification Authorities store.
    echo.
    echo ============================================================
    echo SUCCESS: OmSystems Edge Agent is now trusted by Windows Defender
    echo and Windows SmartScreen on this machine!
    echo ============================================================
) else (
    echo [ERROR] Failed to add certificate to Trusted Root store.
)

echo.
pause
