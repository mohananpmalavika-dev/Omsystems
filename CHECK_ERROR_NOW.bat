@echo off
echo Running Edge Agent Installation Diagnostics...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\simple-error-check.ps1"
echo.
pause
