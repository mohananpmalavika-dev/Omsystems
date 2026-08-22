#!/usr/bin/env pwsh
<#
.SYNOPSIS
Completely uninstalls Sentinel Grid Edge Agent for clean reinstallation.

.DESCRIPTION
Removes all edge agent files, scheduled tasks, firewall rules, and configurations
to allow testing installation from scratch.
#>

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "`n╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    Sentinel Grid Edge Agent - Complete Uninstall             ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ This script must be run as Administrator" -ForegroundColor Red
    Write-Host "`nPlease:" -ForegroundColor Yellow
    Write-Host "1. Right-click PowerShell" -ForegroundColor Gray
    Write-Host "2. Select 'Run as Administrator'" -ForegroundColor Gray
    Write-Host "3. Run this script again" -ForegroundColor Gray
    exit 1
}

Write-Host "Running as Administrator: ✓" -ForegroundColor Green
Write-Host ""

if (-not $Force) {
    Write-Host "⚠️  This will COMPLETELY REMOVE the edge agent installation:" -ForegroundColor Yellow
    Write-Host "   • All files and executables" -ForegroundColor Gray
    Write-Host "   • Configuration and logs" -ForegroundColor Gray
    Write-Host "   • Scheduled tasks" -ForegroundColor Gray
    Write-Host "   • Firewall rules" -ForegroundColor Gray
    Write-Host "   • Device identity and credentials" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Continue? (y/n): " -NoNewline -ForegroundColor Yellow
    $response = Read-Host
    
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "Uninstall cancelled." -ForegroundColor Gray
        exit 0
    }
}

$installDir = "C:\Program Files\Sentinel Grid\Edge Agent"
$taskName = "Sentinel Grid Edge Agent"
$firewallRuleName = "Sentinel Grid Private Live Video"

Write-Host "`n1. Stopping Scheduled Task..." -ForegroundColor Yellow
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    try {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Write-Host "   ✓ Task stopped" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠ Could not stop task (may not be running)" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ℹ Task does not exist" -ForegroundColor Gray
}

Write-Host "`n2. Removing Scheduled Task..." -ForegroundColor Yellow
if ($task) {
    try {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "   ✓ Task removed" -ForegroundColor Green
    } catch {
        Write-Host "   ✗ Failed to remove task: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "   ℹ No task to remove" -ForegroundColor Gray
}

Write-Host "`n3. Removing Firewall Rule..." -ForegroundColor Yellow
$firewallRule = Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue
if ($firewallRule) {
    try {
        Remove-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction Stop
        Write-Host "   ✓ Firewall rule removed" -ForegroundColor Green
    } catch {
        Write-Host "   ✗ Failed to remove firewall rule: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "   ℹ No firewall rule to remove" -ForegroundColor Gray
}

Write-Host "`n4. Removing Installation Directory..." -ForegroundColor Yellow
if (Test-Path $installDir) {
    try {
        # Wait a moment for any processes to fully stop
        Start-Sleep -Seconds 2
        
        Remove-Item -Path $installDir -Recurse -Force -ErrorAction Stop
        Write-Host "   ✓ Installation directory removed" -ForegroundColor Green
        Write-Host "   Path: $installDir" -ForegroundColor Gray
    } catch {
        Write-Host "   ✗ Failed to remove directory: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   You may need to manually delete: $installDir" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ℹ Installation directory does not exist" -ForegroundColor Gray
}

Write-Host "`n5. Cleaning Up Temporary Files..." -ForegroundColor Yellow
$tempFiles = @(
    "$env:TEMP\edge-agent-*.log",
    "$env:TEMP\sentinel-grid-*.log",
    "$env:TEMP\PowerShell_transcript*.txt"
)

$cleanedCount = 0
foreach ($pattern in $tempFiles) {
    try {
        $files = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            Remove-Item $file.FullName -Force -ErrorAction SilentlyContinue
            $cleanedCount++
        }
    } catch {
        # Ignore errors for temp files
    }
}

if ($cleanedCount -gt 0) {
    Write-Host "   ✓ Removed $cleanedCount temporary file(s)" -ForegroundColor Green
} else {
    Write-Host "   ℹ No temporary files to clean" -ForegroundColor Gray
}

Write-Host "`n6. Checking for Remaining Processes..." -ForegroundColor Yellow
$processes = Get-Process -Name "edge-agent" -ErrorAction SilentlyContinue
if ($processes) {
    Write-Host "   ⚠ Found $($processes.Count) edge-agent process(es) still running" -ForegroundColor Yellow
    foreach ($process in $processes) {
        try {
            $process.Kill()
            Write-Host "   ✓ Stopped process PID: $($process.Id)" -ForegroundColor Green
        } catch {
            Write-Host "   ✗ Could not stop process PID: $($process.Id)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "   ✓ No edge-agent processes running" -ForegroundColor Green
}

Write-Host "`n╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    Uninstall Complete                         ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "✓ Edge Agent has been completely removed" -ForegroundColor Green
Write-Host ""
Write-Host "You can now test installation from scratch:" -ForegroundColor Cyan
Write-Host "1. Wake services: .\scripts\verify-render-urls.ps1 -WakeServices" -ForegroundColor Gray
Write-Host "2. Run installer: .\scripts\install-with-logging.ps1" -ForegroundColor Gray
Write-Host ""

# Verification
Write-Host "Verification:" -ForegroundColor Yellow
$verificationResults = @()

if (-not (Test-Path $installDir)) {
    Write-Host "  ✓ Installation directory removed" -ForegroundColor Green
    $verificationResults += $true
} else {
    Write-Host "  ✗ Installation directory still exists" -ForegroundColor Red
    $verificationResults += $false
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host "  ✓ Scheduled task removed" -ForegroundColor Green
    $verificationResults += $true
} else {
    Write-Host "  ✗ Scheduled task still exists" -ForegroundColor Red
    $verificationResults += $false
}

$processes = Get-Process -Name "edge-agent" -ErrorAction SilentlyContinue
if (-not $processes) {
    Write-Host "  ✓ No edge-agent processes running" -ForegroundColor Green
    $verificationResults += $true
} else {
    Write-Host "  ✗ Edge-agent processes still running" -ForegroundColor Red
    $verificationResults += $false
}

Write-Host ""

if ($verificationResults -notcontains $false) {
    Write-Host "🎉 Clean uninstall verified - ready for fresh installation!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  Some items could not be removed. Check errors above." -ForegroundColor Yellow
    Write-Host "   You may need to manually clean up before reinstalling." -ForegroundColor Gray
    exit 1
}
