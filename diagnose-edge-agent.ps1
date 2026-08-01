# Sentinel Grid Edge Agent Diagnostics
# Run this script to diagnose edge agent issues

Write-Host "`n=== Edge Agent Diagnostics ===" -ForegroundColor Cyan
Write-Host ""

# Check if edge agent is running
Write-Host "1. Checking Edge Agent Status..." -ForegroundColor Yellow
$task = Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" -ErrorAction SilentlyContinue

if ($task) {
    Write-Host "   Status: $($task.State)" -ForegroundColor $(if($task.State -eq "Running") {"Green"} else {"Red"})
    Write-Host "   Last Run: $($task.LastRunTime)"
    Write-Host "   Last Result: $($task.LastTaskResult)"
} else {
    Write-Host "   Edge agent task not found!" -ForegroundColor Red
}

# Check if process is running
$process = Get-Process -Name "edge-agent" -ErrorAction SilentlyContinue
if ($process) {
    Write-Host "`n2. Process Status: Running (PID: $($process.Id))" -ForegroundColor Green
    Write-Host "   CPU Time: $($process.CPU)s"
    Write-Host "   Memory: $([math]::Round($process.WorkingSet64/1MB, 2)) MB"
} else {
    Write-Host "`n2. Process Status: Not Running" -ForegroundColor Red
}

# Check configuration
Write-Host "`n3. Configuration Check..." -ForegroundColor Yellow
$configPath = "C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent-H1.env"
if (Test-Path $configPath) {
    Write-Host "   Config found: $configPath" -ForegroundColor Green
    $config = Get-Content $configPath
    
    # Extract key settings
    $controlPlane = ($config | Select-String "CONTROL_PLANE_URL=").ToString().Split("=")[1].Trim('"')
    $agentId = ($config | Select-String "EDGE_AGENT_ID=").ToString().Split("=")[1].Trim('"')
    $branchId = ($config | Select-String "BRANCH_ID=").ToString().Split("=")[1].Trim('"')
    $cameraUser = ($config | Select-String "CAMERA_USERNAME=").ToString().Split("=")[1].Trim('"')
    
    Write-Host "   Control Plane: $controlPlane"
    Write-Host "   Agent ID: $agentId"
    Write-Host "   Branch ID: $branchId"
    Write-Host "   Camera Username: $cameraUser"
} else {
    Write-Host "   Config not found at: $configPath" -ForegroundColor Red
}

# Check recent logs
Write-Host "`n4. Recent Log Entries (Last 20 lines)..." -ForegroundColor Yellow
$logPath = "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log"
if (Test-Path $logPath) {
    Write-Host "   Log file: $logPath" -ForegroundColor Green
    Write-Host ""
    Get-Content $logPath -Tail 20 | ForEach-Object {
        if ($_ -like "*error*") {
            Write-Host "   $_" -ForegroundColor Red
        } elseif ($_ -like "*info*") {
            Write-Host "   $_" -ForegroundColor White
        } else {
            Write-Host "   $_"
        }
    }
} else {
    Write-Host "   Log not found at: $logPath" -ForegroundColor Red
}

# Network connectivity check
Write-Host "`n5. Network Connectivity..." -ForegroundColor Yellow
try {
    $result = Test-NetConnection -ComputerName "sentinel-grid-control-plane1.onrender.com" -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($result) {
        Write-Host "   Control Plane: Reachable" -ForegroundColor Green
    } else {
        Write-Host "   Control Plane: Not Reachable" -ForegroundColor Red
    }
} catch {
    Write-Host "   Control Plane: Connection test failed" -ForegroundColor Red
}

# Camera connectivity check
Write-Host "`n6. Camera Network Scan..." -ForegroundColor Yellow
$cameras = @("192.168.29.171", "192.168.29.196", "192.168.29.46")
foreach ($camera in $cameras) {
    $ping = Test-Connection -ComputerName $camera -Count 1 -Quiet -ErrorAction SilentlyContinue
    if ($ping) {
        Write-Host "   $camera : Reachable" -ForegroundColor Green
    } else {
        Write-Host "   $camera : Not Reachable" -ForegroundColor Red
    }
}

Write-Host "`n=== Diagnostic Summary ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Common Issues Found in Logs:" -ForegroundColor Yellow
Write-Host "  - Camera authentication failures (wrong username/password)"
Write-Host "  - Error messages too long (statusReason > 200 chars)"
Write-Host "  - Only 1 of 4 cameras successfully discovered"
Write-Host ""
Write-Host "Recommended Actions:" -ForegroundColor Green
Write-Host "  1. Update camera credentials in config file"
Write-Host "  2. Restart edge agent after config changes"
Write-Host "  3. Check camera manufacturer default credentials"
Write-Host ""
