@echo off
REM Delete All Cameras and Branch Edges - Windows Batch Script
REM 
REM This is a convenience wrapper for Windows users
REM 

echo ======================================================================
echo   DELETE ALL CAMERAS AND BRANCH EDGES
echo ======================================================================
echo.
echo This script will run the deletion process using Node.js
echo.

REM Check if .env file exists and load it
if exist .env (
    echo Loading environment variables from .env file...
    for /f "usebackq tokens=*" %%a in (".env") do (
        set %%a
    )
)

REM Check if DATABASE_URL is set
if "%DATABASE_URL%"=="" (
    if "%DIRECT_URL%"=="" (
        echo ERROR: DATABASE_URL or DIRECT_URL environment variable is required
        echo.
        echo Please set it in your .env file or as an environment variable:
        echo   set DATABASE_URL=postgresql://user:pass@host:5432/database
        echo.
        pause
        exit /b 1
    )
)

REM Run the Node.js script
echo.
echo Running deletion script...
echo.
node scripts\delete-all-cameras-and-edges.mjs

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Script failed with error code %ERRORLEVEL%
    echo.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Script completed successfully!
echo.
pause
