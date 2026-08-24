#!/usr/bin/env pwsh
# Simple Edge Agent Error Checker - No syntax errors!

Write-Host "`n==============================================================" -ForegroundColor Cyan
Write-Host " Edge Agent Installation Error Check" -ForegroundColor Cyan
Write-Host "==============================================================`n" -ForegroundColor Cyan

# 1. Check if installation directory exists
Write-Host "1. Checking Installation..." -ForegroundColor Yellow
$installDir = "C:\Program Files\Sentinel Grid\Edge Agent"

if (Test-Path $installDir) {
    Write-Host "   [OK] Installation directory exists" -ForegroundColor Green
    
    $exePath = Join-Path $installDir "edge-agent.exe"
    if (Test-Path $exePath) {
        Write-Host "   [OK] edge-agent.exe found" -ForegroundColor Green
    } else {
        Write-Host "   [ERROR] edge-agent.exe NOT found" -ForegroundColor Red
    }
    
    $configPath = Join-Path $installDir "config\edge-agent.env"
    if (Test-Path $configPath) {
        Write-Host "   [OK] Configuration file found" -ForegroundColor Green
    } else {
        Write-Host "   [ERROR] Configuration file NOT found" -ForegroundColor Red
    }
} else {
    Write-Host "   [ERROR] Installation directory does NOT exist" -ForegroundColor Red
    Write-Host "   Installation never started or failed immediately" -ForegroundColor Yellow
}

# 2. Check logs
Write-Host "`n2. Checking Logs..." -ForegroundColor Yellow

$logPaths = @(
    "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log",
    "$env:TEMP\edge-agent-install.log",
    "$env:TEMP\sentinel-grid-install.log"
)

$foundLog = $false
foreach ($logPath in $logPaths) {
    if (Test-Path $logPath) {
        $foundLog = $true
        Write-Host "   [OK] Found log: $logPath" -ForegroundColor Green
        Write-Host "`n   Last 20 lines:" -ForegroundColor Cyan
        Get-Content $logPath -Tail 20 | ForEach-Object {
            if ($_ -match "error|fail|exception") {
                Write-Host "   $_" -ForegroundColor Red
            } else {
                Write-Host "   $_" -ForegroundColor Gray
            }
        }
        Write-Host ""
    }
}

if (-not $foundLog) {
    Write-Host "   [WARN] No logs found" -ForegroundColor Yellow
}

# 3. Check scheduled task
Write-Host "`n3. Checking Scheduled Task..." -ForegroundColor Yellow
$task = Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" -ErrorAction SilentlyContinue

if ($task) {
    Write-Host "   [OK] Scheduled task exists" -ForegroundColor Green
    Write-Host "   State: $($task.State)" -ForegroundColor Gray
    
    $taskInfo = Get-ScheduledTaskInfo -TaskName "Sentinel Grid Edge Agent" -ErrorAction SilentlyContinue
    if ($taskInfo) {
        Write-Host "   Last Run: $($taskInfo.LastRunTime)" -ForegroundColor Gray
        Write-Host "   Exit Code: $($taskInfo.LastTaskResult)" -ForegroundColor Gray
    }
} else {
    Write-Host "   [ERROR] Scheduled task NOT found" -ForegroundColor Red
}

# 4. Check if running as admin
Write-Host "`n4. Checking Permissions..." -ForegroundColor Yellow
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isAdmin) {
    Write-Host "   [OK] Running as Administrator" -ForegroundColor Green
} else {
    Write-Host "   [ERROR] NOT running as Administrator" -ForegroundColor Red
    Write-Host "   Installer MUST be run as Administrator!" -ForegroundColor Yellow
}

# 5. Check disk space
Write-Host "`n5. Checking Disk Space..." -ForegroundColor Yellow
$drive = Get-PSDrive C
$freeGB = [Math]::Round($drive.Free / 1GB, 2)

Write-Host "   Free Space: $freeGB GB" -ForegroundColor Gray
if ($freeGB -lt 1) {
    Write-Host "   [ERROR] Less than 1GB free - need more space!" -ForegroundColor Red
} elseif ($freeGB -lt 5) {
    Write-Host "   [WARN] Less than 5GB free - may be tight" -ForegroundColor Yellow
} else {
    Write-Host "   [OK] Sufficient disk space" -ForegroundColor Green
}

# 6. Check control plane
Write-Host "`n6. Checking Control Plane Connection..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://sentinel-grid-control-plane-zcli.onrender.com/health" -TimeoutSec 10 -UseBasicParsing
    Write-Host "   [OK] Control plane is reachable" -ForegroundColor Green
} catch {
    Write-Host "   [ERROR] Cannot reach control plane" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor DarkRed
    Write-Host "`n   FIX: Wake services first:" -ForegroundColor Yellow
    Write-Host "   .\scripts\verify-render-urls.ps1 -WakeServices" -ForegroundColor Cyan
}

# Summary and recommendations
Write-Host "`n==============================================================" -ForegroundColor Cyan
Write-Host " RECOMMENDATIONS" -ForegroundColor Cyan
Write-Host "==============================================================`n" -ForegroundColor Cyan

if (-not $isAdmin) {
    Write-Host "[1] Run PowerShell as Administrator" -ForegroundColor Yellow
    Write-Host "    Right-click PowerShell > Run as Administrator`n" -ForegroundColor Gray
}

if (-not (Test-Path $installDir)) {
    Write-Host "[2] Installation never started" -ForegroundColor Yellow
    Write-Host "    - Check if you ran the installer" -ForegroundColor Gray
    Write-Host "    - Make sure you're running as Administrator" -ForegroundColor Gray
    Write-Host "    - Try running: .\scripts\install-with-logging.ps1`n" -ForegroundColor Cyan
}

Write-Host "[3] Wake control plane before installing" -ForegroundColor Yellow
Write-Host "    .\scripts\verify-render-urls.ps1 -WakeServices`n" -ForegroundColor Cyan

Write-Host "[4] Try installation with logging:" -ForegroundColor Yellow
Write-Host "    .\scripts\install-with-logging.ps1 -InstallerPath '.\edge-agent\installer\windows\install-edge-agent.ps1'`n" -ForegroundColor Cyan

Write-Host "==============================================================`n" -ForegroundColor Cyan
