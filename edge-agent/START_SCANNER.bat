@echo off
cd /d %~dp0
echo Starting Camera Scanner...
echo.
echo Loading configuration from .env file...

REM Load environment variables from .env file
for /f "usebackq tokens=* delims=" %%a in (".env") do (
    set "%%a"
)

echo.
echo Starting scanner...
node dist\src\index.js
pause
