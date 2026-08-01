@echo off
cd /d %~dp0
echo Starting Camera Scanner (H1)...
echo.
node dist\src\index.js
pause
