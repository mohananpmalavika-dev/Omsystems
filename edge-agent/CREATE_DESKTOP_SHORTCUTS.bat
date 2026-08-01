@echo off
:: Create Desktop Shortcuts for Edge Agent
:: Double-click this to create easy-access shortcuts on your desktop

title Create Desktop Shortcuts

echo.
echo ========================================
echo  Creating Desktop Shortcuts
echo ========================================
echo.

set DESKTOP=%USERPROFILE%\Desktop
set SCRIPT_DIR=%~dp0

:: Create shortcut for START_EDGE_AGENT.bat
echo [*] Creating "Start Edge Agent" shortcut...
powershell -Command "$WS = New-Object -ComObject WScript.Shell; $SC = $WS.CreateShortcut('%DESKTOP%\Start Edge Agent.lnk'); $SC.TargetPath = '%SCRIPT_DIR%START_EDGE_AGENT.bat'; $SC.WorkingDirectory = '%SCRIPT_DIR%'; $SC.Description = 'Start Sentinel Grid Edge Agent - H1'; $SC.Save()"
echo [OK] Created: Start Edge Agent.lnk
echo.

:: Create shortcut for CHECK_STATUS.bat
echo [*] Creating "Check Agent Status" shortcut...
powershell -Command "$WS = New-Object -ComObject WScript.Shell; $SC = $WS.CreateShortcut('%DESKTOP%\Check Agent Status.lnk'); $SC.TargetPath = '%SCRIPT_DIR%CHECK_STATUS.bat'; $SC.WorkingDirectory = '%SCRIPT_DIR%'; $SC.Description = 'Check Edge Agent Status'; $SC.Save()"
echo [OK] Created: Check Agent Status.lnk
echo.

:: Create shortcut for logs folder
echo [*] Creating "View Agent Logs" shortcut...
powershell -Command "$WS = New-Object -ComObject WScript.Shell; $SC = $WS.CreateShortcut('%DESKTOP%\View Agent Logs.lnk'); $SC.TargetPath = '%SCRIPT_DIR%logs'; $SC.WorkingDirectory = '%SCRIPT_DIR%logs'; $SC.Description = 'Open Edge Agent Logs Folder'; $SC.Save()"
echo [OK] Created: View Agent Logs.lnk
echo.

:: Create shortcut for HOW_TO_USE.txt
echo [*] Creating "Edge Agent Guide" shortcut...
powershell -Command "$WS = New-Object -ComObject WScript.Shell; $SC = $WS.CreateShortcut('%DESKTOP%\Edge Agent Guide.lnk'); $SC.TargetPath = '%SCRIPT_DIR%HOW_TO_USE.txt'; $SC.WorkingDirectory = '%SCRIPT_DIR%'; $SC.Description = 'How to Use Edge Agent'; $SC.Save()"
echo [OK] Created: Edge Agent Guide.lnk
echo.

echo.
echo ========================================
echo  Shortcuts Created!
echo ========================================
echo.
echo Check your desktop for these shortcuts:
echo.
echo   Start Edge Agent
echo   Check Agent Status
echo   View Agent Logs
echo   Edge Agent Guide
echo.
echo You can now use these shortcuts to manage the edge agent.
echo.
pause
