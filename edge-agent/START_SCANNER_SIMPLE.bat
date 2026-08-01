@echo off
echo Starting Camera Scanner...
echo.

cd /d %~dp0

REM Set environment variables from .env file
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    set "%%a=%%b"
)

echo Configuration loaded.
echo EDGE_AGENT_ID: %EDGE_AGENT_ID%
echo.
echo Starting Node...
echo.

node dist\src\index.js
pause
