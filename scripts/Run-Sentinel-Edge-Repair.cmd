@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-edge-agent-repair.ps1"
exit /b %ERRORLEVEL%
