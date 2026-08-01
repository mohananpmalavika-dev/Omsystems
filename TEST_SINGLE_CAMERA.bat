@echo off
:: Test Single Camera Credentials
:: This helps you test if a password works for one camera

title Test Camera Credentials

echo.
echo ========================================
echo  Test Single Camera
echo ========================================
echo.

echo This will test if you can connect to a camera
echo using different username/password combinations.
echo.

set /p CAMERA_IP="Enter camera IP (e.g., 192.168.29.171): "

if "%CAMERA_IP%"=="" (
    echo.
    echo Error: No IP address entered
    pause
    exit /b
)

echo.
echo Testing connectivity to %CAMERA_IP%...
ping -n 1 %CAMERA_IP% >nul 2>&1

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Camera %CAMERA_IP% is not reachable!
    echo.
    echo Check:
    echo   - Camera is powered on
    echo   - Camera is on the same network (192.168.29.x)
    echo   - IP address is correct
    echo.
    pause
    exit /b
)

echo [OK] Camera is reachable
echo.

echo.
echo ========================================
echo  Testing Common Passwords
echo ========================================
echo.
echo I will try to access the camera web interface
echo with common default passwords.
echo.

set USERNAME=admin

echo Testing: %USERNAME% / (empty password)...
powershell -Command "try { $pass = ''; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; $response = Invoke-WebRequest -Uri 'http://%CAMERA_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop; Write-Host '[SUCCESS] Empty password works!' -ForegroundColor Green; exit 0 } catch { if($_.Exception.Response.StatusCode -eq 401) { Write-Host '[FAILED] Wrong password' -ForegroundColor Red } else { Write-Host '[UNKNOWN] Could not test' -ForegroundColor Yellow } }"

echo.
echo Testing: %USERNAME% / admin...
powershell -Command "try { $pass = 'admin'; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; $response = Invoke-WebRequest -Uri 'http://%CAMERA_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop; Write-Host '[SUCCESS] Password: admin' -ForegroundColor Green; exit 0 } catch { if($_.Exception.Response.StatusCode -eq 401) { Write-Host '[FAILED] Wrong password' -ForegroundColor Red } else { Write-Host '[UNKNOWN] Could not test' -ForegroundColor Yellow } }"

echo.
echo Testing: %USERNAME% / 12345...
powershell -Command "try { $pass = '12345'; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; $response = Invoke-WebRequest -Uri 'http://%CAMERA_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop; Write-Host '[SUCCESS] Password: 12345' -ForegroundColor Green; exit 0 } catch { if($_.Exception.Response.StatusCode -eq 401) { Write-Host '[FAILED] Wrong password' -ForegroundColor Red } else { Write-Host '[UNKNOWN] Could not test' -ForegroundColor Yellow } }"

echo.
echo Testing: %USERNAME% / 123456...
powershell -Command "try { $pass = '123456'; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; $response = Invoke-WebRequest -Uri 'http://%CAMERA_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop; Write-Host '[SUCCESS] Password: 123456' -ForegroundColor Green; exit 0 } catch { if($_.Exception.Response.StatusCode -eq 401) { Write-Host '[FAILED] Wrong password' -ForegroundColor Red } else { Write-Host '[UNKNOWN] Could not test' -ForegroundColor Yellow } }"

echo.
echo Testing: %USERNAME% / 888888...
powershell -Command "try { $pass = '888888'; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; $response = Invoke-WebRequest -Uri 'http://%CAMERA_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop; Write-Host '[SUCCESS] Password: 888888' -ForegroundColor Green; exit 0 } catch { if($_.Exception.Response.StatusCode -eq 401) { Write-Host '[FAILED] Wrong password' -ForegroundColor Red } else { Write-Host '[UNKNOWN] Could not test' -ForegroundColor Yellow } }"

echo.
echo Testing: %USERNAME% / password...
powershell -Command "try { $pass = 'password'; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('%USERNAME%:' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; $response = Invoke-WebRequest -Uri 'http://%CAMERA_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop; Write-Host '[SUCCESS] Password: password' -ForegroundColor Green; exit 0 } catch { if($_.Exception.Response.StatusCode -eq 401) { Write-Host '[FAILED] Wrong password' -ForegroundColor Red } else { Write-Host '[UNKNOWN] Could not test' -ForegroundColor Yellow } }"

echo.
echo ========================================
echo  Manual Password Entry
echo ========================================
echo.
echo If none of the above worked, you can:
echo   A) Try entering a custom password
echo   B) Test via web browser
echo.
set /p MANUAL_TEST="Do you want to try a custom password? (Y/N): "

if /i "%MANUAL_TEST%"=="Y" (
    echo.
    echo Enter custom credentials to test:
    set /p CUSTOM_USER="Username (default: admin): "
    set /p CUSTOM_PASS="Password: "
    
    if "%CUSTOM_USER%"=="" set CUSTOM_USER=admin
    
    echo.
    echo Testing: %CUSTOM_USER% / %CUSTOM_PASS%...
    powershell -Command "try { $user = '%CUSTOM_USER%'; $pass = '%CUSTOM_PASS%'; $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($user + ':' + $pass)); $headers = @{'Authorization' = 'Basic ' + $base64}; $response = Invoke-WebRequest -Uri 'http://%CAMERA_IP%/onvif/device_service' -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop; Write-Host ''; Write-Host '[SUCCESS] This password works!' -ForegroundColor Green; Write-Host ''; Write-Host 'Username: %CUSTOM_USER%' -ForegroundColor Cyan; Write-Host 'Password: %CUSTOM_PASS%' -ForegroundColor Cyan; Write-Host ''; exit 0 } catch { if($_.Exception.Response.StatusCode -eq 401) { Write-Host '[FAILED] Wrong password' -ForegroundColor Red } else { Write-Host '[UNKNOWN] Could not test - camera may not support this method' -ForegroundColor Yellow } }"
    
    if %errorlevel% equ 0 (
        echo.
        echo ========================================
        echo  SUCCESS! Password Found
        echo ========================================
        echo.
        set /p UPDATE_NOW="Do you want to update the edge agent config now? (Y/N): "
        
        if /i "!UPDATE_NOW!"=="Y" (
            echo.
            echo [*] Updating configuration...
            
            set CONFIG_FILE=C:\Omsystems\edge-agent\config\edge-agent-H1.env
            
            :: Backup
            copy "!CONFIG_FILE!" "!CONFIG_FILE!.backup" >nul 2>&1
            
            :: Update
            powershell -Command "(Get-Content '!CONFIG_FILE!') -replace 'CAMERA_USERNAME=\".*\"', 'CAMERA_USERNAME=\"%CUSTOM_USER%\"' | Set-Content '!CONFIG_FILE!'"
            powershell -Command "(Get-Content '!CONFIG_FILE!') -replace 'CAMERA_PASSWORD=\".*\"', 'CAMERA_PASSWORD=\"%CUSTOM_PASS%\"' | Set-Content '!CONFIG_FILE!'"
            
            echo [OK] Configuration updated!
            echo.
            echo Please restart the edge agent:
            echo   - If running as service: Restart the scheduled task
            echo   - If running from window: Close and restart START_EDGE_AGENT.bat
            echo.
        ) else (
            echo.
            echo Remember these credentials:
            echo   Username: %CUSTOM_USER%
            echo   Password: %CUSTOM_PASS%
            echo.
            echo To update config later, run: FIX_CAMERA_CREDENTIALS.bat
            echo.
        )
    ) else (
        echo.
        echo Still didn't work? Try:
        echo   1. Different username (try: root, user)
        echo   2. Check camera manual for default password
        echo   3. Reset camera to factory defaults
        echo.
    )
)

echo.
echo ========================================
echo  Browser Testing (Alternative)
echo ========================================
echo.
echo You can also test via web browser:
echo.
echo   1. Open Chrome/Edge
echo   2. Go to: http://%CAMERA_IP%
echo   3. Try logging in with different passwords
echo.
echo Common defaults by brand:
echo   Hikvision:  admin / (empty) or admin / 12345
echo   Dahua:      admin / admin or 888888
echo   CP Plus:    admin / admin or cp123
echo   Provision:  admin / admin
echo.
echo Once you find the working password:
echo   Run: FIX_CAMERA_CREDENTIALS.bat
echo.
pause
