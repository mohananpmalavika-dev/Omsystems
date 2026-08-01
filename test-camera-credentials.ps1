# Camera Credential Testing Script
# This script helps you find the correct camera credentials

param(
    [string]$CameraIP = "192.168.29.171",
    [string]$Username = "admin"
)

Write-Host "`n=== Camera Credential Tester ===" -ForegroundColor Cyan
Write-Host "Testing camera at: $CameraIP" -ForegroundColor Yellow
Write-Host ""

# Common default passwords for IP cameras
$commonPasswords = @(
    "admin",
    "12345",
    "123456",
    "password",
    "",  # Empty password
    "Admin123",
    "admin123",
    "pass",
    "1234",
    "root",
    "camera",
    "default",
    "888888",
    "54321"
)

Write-Host "Common camera default passwords to try:" -ForegroundColor Yellow
Write-Host ""

# Test basic connectivity first
Write-Host "1. Testing network connectivity..." -ForegroundColor Cyan
$ping = Test-Connection -ComputerName $CameraIP -Count 2 -Quiet -ErrorAction SilentlyContinue

if ($ping) {
    Write-Host "   ✓ Camera is reachable on network" -ForegroundColor Green
} else {
    Write-Host "   ✗ Camera is NOT reachable on network" -ForegroundColor Red
    Write-Host "   Check IP address and network connection" -ForegroundColor Yellow
    exit 1
}

# Test ONVIF port (80)
Write-Host "`n2. Testing ONVIF service ports..." -ForegroundColor Cyan
$port80 = Test-NetConnection -ComputerName $CameraIP -Port 80 -InformationLevel Quiet -WarningAction SilentlyContinue
$port8080 = Test-NetConnection -ComputerName $CameraIP -Port 8080 -InformationLevel Quiet -WarningAction SilentlyContinue

if ($port80) {
    Write-Host "   ✓ Port 80 is open (HTTP/ONVIF)" -ForegroundColor Green
}
if ($port8080) {
    Write-Host "   ✓ Port 8080 is open (Alt HTTP)" -ForegroundColor Green
}

if (-not $port80 -and -not $port8080) {
    Write-Host "   ✗ No HTTP ports responding" -ForegroundColor Red
}

# Test RTSP port
$port554 = Test-NetConnection -ComputerName $CameraIP -Port 554 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($port554) {
    Write-Host "   ✓ Port 554 is open (RTSP)" -ForegroundColor Green
}

Write-Host "`n3. Password suggestions based on camera model..." -ForegroundColor Cyan
Write-Host ""
Write-Host "   Common defaults by manufacturer:" -ForegroundColor Yellow
Write-Host "   - Hikvision: admin / (empty) or admin / 12345"
Write-Host "   - Dahua: admin / admin or admin / 888888"
Write-Host "   - CP Plus: admin / admin or admin / cp123"
Write-Host "   - Provision ISR: admin / admin"
Write-Host "   - Generic ONVIF: admin / (empty) or admin / admin"
Write-Host ""

Write-Host "4. Manual credential testing instructions:" -ForegroundColor Cyan
Write-Host ""
Write-Host "   To test credentials manually:" -ForegroundColor White
Write-Host "   1. Open web browser" 
Write-Host "   2. Navigate to: http://$CameraIP"
Write-Host "   3. Try these common credentials:"
Write-Host ""

$i = 1
foreach ($pwd in $commonPasswords) {
    $displayPwd = if ($pwd -eq "") { "(empty/blank)" } else { $pwd }
    Write-Host "      $i. Username: $Username  Password: $displayPwd"
    $i++
}

Write-Host "`n5. How to update edge agent config:" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Once you find the correct credentials:" -ForegroundColor Yellow
Write-Host "   1. Edit: C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent-H1.env"
Write-Host "   2. Update these lines:"
Write-Host '      CAMERA_USERNAME="your_username"'
Write-Host '      CAMERA_PASSWORD="your_password"'
Write-Host "   3. Restart the edge agent:"
Write-Host "      Restart-Computer"
Write-Host "      OR"
Write-Host '      Stop-ScheduledTask -TaskName "Sentinel Grid Edge Agent"'
Write-Host '      Start-ScheduledTask -TaskName "Sentinel Grid Edge Agent"'
Write-Host ""

Write-Host "6. Security recommendations:" -ForegroundColor Cyan
Write-Host ""
Write-Host "   ⚠ IMPORTANT: Default passwords are a security risk!" -ForegroundColor Red
Write-Host "   - Change all camera passwords from defaults"
Write-Host "   - Use strong passwords (12+ characters)"
Write-Host "   - Keep cameras on a separate VLAN"
Write-Host "   - Disable unnecessary network services"
Write-Host ""

# Try to get camera info via HTTP (if credentials were default admin/admin)
Write-Host "7. Attempting to fetch camera info (using admin/admin)..." -ForegroundColor Cyan
try {
    $basicAuth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:admin"))
    $headers = @{
        "Authorization" = "Basic $basicAuth"
    }
    
    $response = Invoke-WebRequest -Uri "http://$CameraIP/onvif/device_service" -Headers $headers -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✓ Got response with admin/admin!" -ForegroundColor Green
    Write-Host "   Credentials: admin / admin appear to work" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "   ✗ Authentication failed with admin/admin" -ForegroundColor Yellow
        Write-Host "   Try other credentials from the list above" -ForegroundColor Yellow
    } else {
        Write-Host "   - Could not auto-test (this is normal for some cameras)" -ForegroundColor Gray
    }
}

Write-Host "`n=== Testing Complete ===" -ForegroundColor Cyan
Write-Host ""
