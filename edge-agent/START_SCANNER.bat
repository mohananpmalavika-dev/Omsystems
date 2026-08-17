@echo off
cd /d %~dp0
echo Starting Sentinel Grid Edge Agent / Camera Scanner...
echo.

if exist "start-with-env.mjs" (
    node start-with-env.mjs
) else (
    npx tsx src/index.ts
)

echo.
echo Scanner stopped.
pause
