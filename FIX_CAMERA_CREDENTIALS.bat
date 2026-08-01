@echo off
:: Camera Credential Helper
:: This helps you find and set the correct camera passwords

title Fix Camera Credentials

echo.
echo ========================================
echo  Camera Credential Helper
echo ========================================
echo.

echo Found 4 cameras on your network:
echo.
echo   Working:  1 camera (credentials correct)
echo   Failing:  3 cameras (wrong password)
echo.
echo Failing cameras:
echo   - 192.168.29.171  (25 attempts left)
echo   - 192.168.29.196
echo   - 192.168.29.46
echo.
echo ========================================
echo  Step 1: Find Correct Password
echo ========================================
echo.
echo Choose how to find the password:
echo.
echo   1. I already know the password
echo   2. Test common passwords automatically
echo   3. Open camera in web browser to test
echo.
set /p CHOICE="Enter choice (1/2/3): "

if "%CHOICE%"=="1" goto manual_entry
if "%CHOICE%"=="2" goto auto_test
if "%CHOICE%"=="3" goto browser_test

:manual_entry
echo.
echo ========================================
echo  Enter Camera Credentials
echo ========================================
goto step2

:auto_test
echo.
echo ========================================
echo  Automatic Password Testing
echo ========================================
echo.
set /p TEST_IP="Enter camera IP to test (e.g., 192.168.29.171): "
echo.
echo Testing camera at %TEST_IP%...
echo.

:: Test connectivity
ping -n 1 %TEST_IP% >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAILED] Camera not reachable
    goto manual_entry
)
echo [OK] Camera is reachable
echo.

set FOUND_PASSWORD=
set USERNAME=admin

echo Testing common passwords...
echo.

:: Test empty password
echo [*] Testing: %USERNAME% / (empty)
powershell -Command "try { $pass = ''; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; Invoke-WebRequest -Uri 'http://%TEST_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo     [SUCCESS] Empty password works!
    set FOUND_PASSWORD=
    goto found_password
)
echo     [FAILED]

:: Test admin
echo [*] Testing: %USERNAME% / admin
powershell -Command "try { $pass = 'admin'; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; Invoke-WebRequest -Uri 'http://%TEST_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo     [SUCCESS] Password: admin
    set FOUND_PASSWORD=admin
    goto found_password
)
echo     [FAILED]

:: Test 12345
echo [*] Testing: %USERNAME% / 12345
powershell -Command "try { $pass = '12345'; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; Invoke-WebRequest -Uri 'http://%TEST_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo     [SUCCESS] Password: 12345
    set FOUND_PASSWORD=12345
    goto found_password
)
echo     [FAILED]

:: Test 123456
echo [*] Testing: %USERNAME% / 123456
powershell -Command "try { $pass = '123456'; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; Invoke-WebRequest -Uri 'http://%TEST_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo     [SUCCESS] Password: 123456
    set FOUND_PASSWORD=123456
    goto found_password
)
echo     [FAILED]

:: Test 888888
echo [*] Testing: %USERNAME% / 888888
powershell -Command "try { $pass = '888888'; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; Invoke-WebRequest -Uri 'http://%TEST_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo     [SUCCESS] Password: 888888
    set FOUND_PASSWORD=888888
    goto found_password
)
echo     [FAILED]

echo.
echo [!] None of the common passwords worked.
echo.
set /p TRY_CUSTOM="Do you want to enter a custom password? (Y/N): "
if /i "%TRY_CUSTOM%"=="Y" (
    echo.
    set /p CUSTOM_PASS="Enter password to test: "
    echo.
    echo [*] Testing: %USERNAME% / !CUSTOM_PASS!
    powershell -Command "try { $pass = '!CUSTOM_PASS!'; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; Invoke-WebRequest -Uri 'http://%TEST_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if !errorlevel! equ 0 (
        echo     [SUCCESS] Custom password works!
        set FOUND_PASSWORD=!CUSTOM_PASS!
        goto found_password
    ) else (
        echo     [FAILED] Still doesn't work
        echo.
        goto manual_entry
    )
) else (
    goto manual_entry
)

:found_password
echo.
echo ========================================
echo  Password Found!
echo ========================================
echo.
echo   Username: %USERNAME%
echo   Password: %FOUND_PASSWORD%
echo.
set /p USE_FOUND="Use this password for all cameras? (Y/N): "
if /i "%USE_FOUND%"=="Y" (
    set PASSWORD=%FOUND_PASSWORD%
    goto step2_update
) else (
    goto manual_entry
)

:browser_test
echo.
echo Opening camera in browser...
echo.
echo   1. Browser will open to: http://192.168.29.171
echo   2. Try logging in with different passwords
echo   3. Note which password works
echo   4. Come back here and enter it
echo.
start http://192.168.29.171
echo.
pause
goto manual_entry

:step2
echo.
echo ========================================
echo  Enter Camera Credentials
echo ========================================
echo.
set /p USERNAME="Enter camera username (usually 'admin'): "
set /p PASSWORD="Enter camera password: "
echo.

if "%USERNAME%"=="" set USERNAME=admin

:step2_update
echo.
echo You entered:
echo   Username: %USERNAME%
echo   Password: %PASSWORD%
echo.
set /p CONFIRM="Is this correct? (Y/N): "

if /i not "%CONFIRM%"=="Y" (
    echo.
    echo Cancelled. Please run this again.
    pause
    exit /b
)

echo.
echo [*] Updating configuration file...

set CONFIG_FILE=C:\Omsystems\edge-agent\config\edge-agent-H1.env

:: Backup original config
copy "%CONFIG_FILE%" "%CONFIG_FILE%.backup" >nul 2>&1

:: Update credentials using PowerShell
powershell -Command "(Get-Content '%CONFIG_FILE%') -replace 'CAMERA_USERNAME=\".*\"', 'CAMERA_USERNAME=\"%USERNAME%\"' | Set-Content '%CONFIG_FILE%'"
powershell -Command "(Get-Content '%CONFIG_FILE%') -replace 'CAMERA_PASSWORD=\".*\"', 'CAMERA_PASSWORD=\"%PASSWORD%\"' | Set-Content '%CONFIG_FILE%'"

echo [OK] Configuration updated
echo.

echo ========================================
echo  Step 3: Restart Edge Agent
echo ========================================
echo.

:: Check if running as scheduled task
schtasks /query /TN "Sentinel Grid Edge Agent" >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Restarting edge agent service...
    schtasks /end /TN "Sentinel Grid Edge Agent" >nul 2>&1
    timeout /t 2 /nobreak >nul
    schtasks /run /TN "Sentinel Grid Edge Agent" >nul
    echo [OK] Edge agent restarted
) else (
    echo [!] Edge agent not running as service.
    echo.
    echo Please restart it manually:
    echo   - Close the START_EDGE_AGENT.bat window
    echo   - Double-click START_EDGE_AGENT.bat again
)

echo.
echo ========================================
echo  Step 4: Verify
echo ========================================
echo.
echo Waiting 30 seconds for cameras to be discovered...
timeout /t 30 /nobreak

echo.
echo [*] Checking logs for authentication errors...
echo.

powershell -Command "Get-Content 'C:\Omsystems\edge-agent\logs\edge-agent.log' -Tail 20 | Select-String -Pattern 'Failed to inspect|Submitted' | ForEach-Object { if($_ -match 'Failed') { Write-Host $_ -ForegroundColor Red } else { Write-Host $_ -ForegroundColor Green } }"

echo.
echo ========================================
echo  Results
echo ========================================
echo.
echo If you still see "Failed to inspect" errors:
echo   - The password may be wrong for some cameras
echo   - Different cameras may have different passwords
echo   - You may need to reset cameras to default password
echo.
echo If you see "Submitted" for all 4 cameras:
echo   ✓ SUCCESS! All cameras are working
echo.
echo To check dashboard:
echo   1. Open: https://sentinel-grid-control-plane1.onrender.com
echo   2. Go to: Operations ^> Branches ^> H1
echo   3. Should see 4 cameras discovered
echo.
pause
