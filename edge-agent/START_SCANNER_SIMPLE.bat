@echo off
echo Starting Camera Scanner...
echo.

cd /d %~dp0

node start-with-env.mjs

echo.
echo Scanner stopped.
pause
