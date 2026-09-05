#!/usr/bin/env pwsh
<#
.SYNOPSIS
Checks for edge agent installer errors and recent logs.

.DESCRIPTION
Examines installation logs, edge agent logs, and Windows Event Log
to diagnose why the installer failed.
#>

[CmdletBinding()]
param(
    [string]$InstallLogPath,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"

Write-Host "`n╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Edge Agent Installer Error Diagnostics                   ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Possible log locations
$logLocations = @(
    "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log",
    "$env:TEMP\edge-agent-install.log",
    "$env:TEMP\sentinel-grid-install.log",
    "C:\Windows\Temp\edge-agent-install.log",
    "$env:USERPROFILE\AppData\Local\Temp\edge-agent-install.log"
)

if ($InstallLogPath) {
    $logLocations = @($InstallLogPath) + $logLocations
}

Write-Host "1. Checking Installation Logs..." -ForegroundColor Yellow

$foundLogs = @()
foreach ($logPath in $logLocations) {
    if (Test-Path $logPath) {
        $foundLogs += $logPath
        Write-Host "   ✓ Found: $logPath" -ForegroundColor Green
    }
}

if ($foundLogs.Count -eq 0) {
    Write-Host "   ⚠ No installation logs found" -ForegroundColor Yellow
    Write-Host "   Checked:" -ForegroundColor Gray
    $logLocations | ForEach-Object { Write-Host "     - $_" -ForegroundColor DarkGray }
} else {
    Write-Host "`n   Recent Log Content:" -ForegroundColor Cyan
    foreach ($logPath in $foundLogs) {
        Write-Host "`n   From: $logPath" -ForegroundColor Gray
        Write-Host "   " + ("=" * 60) -ForegroundColor DarkGray
        
        try {
            $logContent = Get-Content $logPath -Tail 50 -ErrorAction Stop
            
            # Look for errors
            $errors = $logContent | Select-String -Pattern "error|fail|exception|fatal" -Context 0,2
            
            if ($errors) {
                Write-Host "   Errors Found:" -ForegroundColor Red
                $errors | ForEach-Object {
                    Write-Host "   $_" -ForegroundColor DarkRed
                }
            } else {
                # Show last few lines
                Write-Host "   Last 10 lines:" -ForegroundColor Gray
                $logContent | Select-Object -Last 10 | ForEach-Object {
                    Write-Host "   $_" -ForegroundColor DarkGray
                }
            }
        } catch {
            Write-Host "   ✗ Could not read log: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host "`n2. Checking PowerShell Transcript..." -ForegroundColor Yellow

# Check for PowerShell transcripts
$transcriptLocations = @(
    "$env:TEMP\PowerShell_transcript*.txt",
    "$env:USERPROFILE\Documents\PowerShell_transcript*.txt"
)

$transcripts = @()
foreach ($pattern in $transcriptLocations) {
    $transcripts += Get-ChildItem -Path (Split-Path $pattern) -Filter (Split-Path $pattern -Leaf) -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-1) } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 3
}

if ($transcripts.Count -gt 0) {
    Write-Host "   ✓ Found recent PowerShell transcripts:" -ForegroundColor Green
    foreach ($transcript in $transcripts) {
        Write-Host "   - $($transcript.FullName)" -ForegroundColor Gray
        Write-Host "     Last modified: $($transcript.LastWriteTime)" -ForegroundColor DarkGray
    }
} else {
    Write-Host "   ⚠ No recent PowerShell transcripts found" -ForegroundColor Yellow
}

Write-Host "`n3. Checking Windows Event Log..." -ForegroundColor Yellow

try {
    $recentEvents = Get-WinEvent -FilterHashtable @{
        LogName = 'Application'
        ProviderName = 'PowerShell'
        Level = 2,3  # Error, Warning
        StartTime = (Get-Date).AddHours(-1)
    } -MaxEvents 10 -ErrorAction SilentlyContinue
    
    if ($recentEvents) {
        Write-Host "   ✓ Found recent PowerShell errors/warnings:" -ForegroundColor Yellow
        $recentEvents | ForEach-Object {
            Write-Host "`n   Time: $($_.TimeCreated)" -ForegroundColor Gray
            Write-Host "   Level: $($_.LevelDisplayName)" -ForegroundColor Yellow
            Write-Host "   Message: $($_.Message.Substring(0, [Math]::Min(200, $_.Message.Length)))" -ForegroundColor DarkYellow
        }
    } else {
        Write-Host "   ✓ No recent PowerShell errors in Event Log" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠ Could not access Windows Event Log" -ForegroundColor Yellow
}

Write-Host "`n4. Checking Installation State..." -ForegroundColor Yellow

# Check if installer files exist
$installerPath = "C:\Program Files\Sentinel Grid\Edge Agent"
$executablePath = Join-Path $installerPath "edge-agent.exe"
$configPath = Join-Path $installerPath "config\edge-agent.env"

if (Test-Path $installerPath) {
    Write-Host "   ✓ Installation directory exists: $installerPath" -ForegroundColor Green
    
    if (Test-Path $executablePath) {
        Write-Host "   ✓ Executable exists: $executablePath" -ForegroundColor Green
        
        $exeInfo = Get-Item $executablePath
        Write-Host "     Size: $([Math]::Round($exeInfo.Length / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host "     Created: $($exeInfo.CreationTime)" -ForegroundColor Gray
    } else {
        Write-Host "   ✗ Executable NOT found: $executablePath" -ForegroundColor Red
    }
    
    if (Test-Path $configPath) {
        Write-Host "   ✓ Configuration exists: $configPath" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Configuration NOT found: $configPath" -ForegroundColor Red
    }
} else {
    Write-Host "   ✗ Installation directory does NOT exist" -ForegroundColor Red
}

# Check scheduled task
$taskName = "Sentinel Grid Edge Agent"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($task) {
    Write-Host "`n   ✓ Scheduled task exists: $taskName" -ForegroundColor Green
    Write-Host "     State: $($task.State)" -ForegroundColor Gray
    
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
    if ($taskInfo) {
        Write-Host "     Last run: $($taskInfo.LastRunTime)" -ForegroundColor Gray
        $taskResultColor = if ($taskInfo.LastTaskResult -eq 0) { "Green" } else { "Red" }
        Write-Host "     Last result: $($taskInfo.LastTaskResult)" -ForegroundColor $taskResultColor
        
        if ($taskInfo.LastTaskResult -ne 0) {
            Write-Host "     ⚠ Task failed with exit code: $($taskInfo.LastTaskResult)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "`n   ✗ Scheduled task NOT found: $taskName" -ForegroundColor Red
}

Write-Host "`n5. Common Installation Errors..." -ForegroundColor Yellow

Write-Host "`n   Possible Causes:" -ForegroundColor Cyan
Write-Host "   • Installer not run as Administrator" -ForegroundColor Gray
Write-Host "   • Antivirus blocking installation" -ForegroundColor Gray
Write-Host "   • Insufficient disk space" -ForegroundColor Gray
Write-Host "   • Network timeout reaching control plane" -ForegroundColor Gray
Write-Host "   • Invalid activation code (expired/used)" -ForegroundColor Gray
Write-Host "   • Missing runtime dependencies (ffmpeg, mediamtx)" -ForegroundColor Gray
Write-Host "   • Port conflicts (8090, 8888, 9997)" -ForegroundColor Gray

Write-Host "`n6. Checking System Resources..." -ForegroundColor Yellow

# Check disk space
$systemDrive = $env:SystemDrive
$drive = Get-PSDrive $systemDrive.TrimEnd(':')
$freeSpaceGB = [Math]::Round($drive.Free / 1GB, 2)
$totalSpaceGB = [Math]::Round(($drive.Used + $drive.Free) / 1GB, 2)
$usedPercent = [Math]::Round(($drive.Used / ($drive.Used + $drive.Free)) * 100, 1)

Write-Host "   Disk Space ($systemDrive):" -ForegroundColor Gray
$diskColor = if ($freeSpaceGB -lt 1) { "Red" } elseif ($freeSpaceGB -lt 5) { "Yellow" } else { "Green" }
$diskMessage = "     Free: $freeSpaceGB GB / $totalSpaceGB GB ($usedPercent% used)"
Write-Host $diskMessage -ForegroundColor $diskColor

if ($freeSpaceGB -lt 1) {
    Write-Host "     WARNING: Less than 1GB free space" -ForegroundColor Red
}

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host "`n   Current Session:" -ForegroundColor Gray
$adminColor = if ($isAdmin) { "Green" } else { "Red" }
Write-Host "     Administrator: $isAdmin" -ForegroundColor $adminColor

if (-not $isAdmin) {
    Write-Host "     ⚠ Installer MUST be run as Administrator" -ForegroundColor Red
}

Write-Host "`n╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    Recommendations                            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "Based on the diagnostics above, try these solutions:" -ForegroundColor White
Write-Host ""

# Determine most likely issue
$recommendations = @()

if (-not $isAdmin) {
    $recommendations += @{
        Priority = 1
        Issue = "Not running as Administrator"
        Solution = "Right-click PowerShell and select 'Run as Administrator', then run installer again"
    }
}

if (Test-Path $installerPath) {
    if (-not (Test-Path $executablePath)) {
        $recommendations += @{
            Priority = 2
            Issue = "Installation directory exists but executable missing"
            Solution = "Partial installation detected. Delete $installerPath and reinstall"
        }
    }
}

if ($freeSpaceGB -lt 2) {
    $recommendations += @{
        Priority = 1
        Issue = "Low disk space"
        Solution = "Free up disk space (need at least 2GB) and try again"
    }
}

# Generic recommendations
$recommendations += @{
    Priority = 3
    Issue = "Network timeout or control plane unavailable"
    Solution = "Verify control plane is running on AWS / target host"
}

$recommendations += @{
    Priority = 4
    Issue = "Invalid or expired activation code"
    Solution = "Generate new activation code from the dashboard (/admin/branch-onboarding)"
}

$recommendations += @{
    Priority = 5
    Issue = "Antivirus blocking installation"
    Solution = "Temporarily disable antivirus, run installer, then re-enable"
}

$recommendations | Sort-Object Priority | ForEach-Object {
    Write-Host "  $($_.Priority). " -NoNewline -ForegroundColor Yellow
    Write-Host "$($_.Issue)" -ForegroundColor White
    Write-Host "     → $($_.Solution)" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "For detailed troubleshooting, see:" -ForegroundColor Cyan
Write-Host "  • QUICK_FIX_GUIDE.md" -ForegroundColor Gray
Write-Host "  • EDGE_ACTIVATION_BLOCKED_FIX.md" -ForegroundColor Gray
Write-Host ""

# Offer to view logs
if ($foundLogs.Count -gt 0) {
    Write-Host "View full logs? (y/n): " -NoNewline -ForegroundColor Yellow
    $response = Read-Host
    
    if ($response -eq 'y' -or $response -eq 'Y') {
        foreach ($logPath in $foundLogs) {
            Write-Host "`n$logPath" -ForegroundColor Cyan
            Write-Host ("=" * 80) -ForegroundColor DarkGray
            Get-Content $logPath -Tail 100
            Write-Host ""
        }
    }
}

Write-Host ""
