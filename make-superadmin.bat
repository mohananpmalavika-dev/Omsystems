@echo off
echo ============================================
echo Making mgdhanyamohan a super admin
echo ============================================
echo.

node database\scripts\make-superadmin.js mgdhanyamohan

echo.
echo ============================================
echo Press any key to exit...
pause > nul
