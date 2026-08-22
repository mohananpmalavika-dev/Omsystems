#!/usr/bin/env pwsh
<#
.SYNOPSIS
Complete reset and fresh installation of Sentinel Grid Edge Agent.

.DESCRIPTION
One command to:
1. Uninstall current edge agent
2. Wake up Render services
3. Install edge agent fresh
4. Verify installation

.PARAMETER SkipUninstall
Skip the uninstallation step (if no previous installation exists)

.PARAMETER InstallerPath
Path to the installer script (auto-detected if not provided)

.EXAMPLE
.\RESET_AND_INSTALL.ps1
# Complete fresh install

.EXAMPLE
.\RESET_AND_INSTALL.ps1 -SkipUninstall
# Install without uninstalling first
#>

[CmdletBinding()]
param(
    [switch]$SkipUninstall,
    [string]$InstallerPath
)

$ErrorActionPreference = "Continue"

Write-Host "`n╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Sentinel Grid Edge Agent - Complete Reset & Install        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ This script must be run as Administrator" -ForegroundColor Red
    Write-Host "`nPlease:" -ForegroundColor Yellow
    Write-Host "1. Right-click PowerShell" -ForegroundColor Gray
    Write-Host "2. Select 'Run as Administrator'" -ForegroundColor Gray
    Write-Host "3. Run this script again" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or use this command:" -ForegroundColor Cyan
    Write-Host "Start-Process powershell -Verb RunAs -ArgumentList `"-NoExit -ExecutionPolicy Bypass -File `\`"$PSCommandPath`\`"`"" -ForegroundColor Gray
    exit 1
}

$currentDir = $PSScriptRoot

# ============================================================================
# STEP 1: UNINSTALL
# ============================================================================

if (-not $SkipUninstall) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "STEP 1: Uninstalling Current Edge Agent" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
    
    $uninstallScript = Join-Path $currentDir "scripts\uninstall-edge-agent.ps1"
    if (Test-Path $uninstallScript) {
        & $uninstallScript -Force
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n❌ Uninstall failed. Check errors above." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "⚠️  Uninstall script not found at: $uninstallScript" -ForegroundColor Yellow
        Write-Host "Continuing anyway..." -ForegroundColor Gray
    }
    
    Write-Host "`n✓ Uninstall completed" -ForegroundColor Green
    Write-Host "Waiting 3 seconds..." -ForegroundColor Gray
    Start-Sleep -Seconds 3
} else {
    Write-Host "Skipping uninstall step...`n" -ForegroundColor Gray
}

# ============================================================================
# STEP 2: WAKE SERVICES
# ============================================================================

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "STEP 2: Waking Up Render Services" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

$wakeScript = Join-Path $currentDir "scripts\verify-render-urls.ps1"
if (Test-Path $wakeScript) {
    & $wakeScript -WakeServices
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n⚠️  Some services may not be reachable" -ForegroundColor Yellow
        Write-Host "Continue anyway? (y/n): " -NoNewline -ForegroundColor Yellow
        $continue = Read-Host
        if ($continue -ne 'y' -and $continue -ne 'Y') {
            Write-Host "Installation cancelled." -ForegroundColor Gray
            exit 0
        }
    } else {
        Write-Host "`n✓ All services are awake and ready" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  Service verification script not found" -ForegroundColor Yellow
    Write-Host "Continuing anyway..." -ForegroundColor Gray
}

Write-Host "`nWaiting 2 seconds before installation..." -ForegroundColor Gray
Start-Sleep -Seconds 2

# ============================================================================
# STEP 3: INSTALL
# ============================================================================

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "STEP 3: Installing Edge Agent" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

# Find installer if not specified
if (-not $InstallerPath) {
    $possiblePaths = @(
        Join-Path $currentDir "edge-agent\installer\windows\install-edge-agent.ps1",
        Join-Path $currentDir "installer\windows\install-edge-agent.ps1",
        Join-Path $currentDir "install-edge-agent.ps1"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $InstallerPath = $path
            Write-Host "Found installer at: $InstallerPath" -ForegroundColor Green
            break
        }
    }
}

if (-not $InstallerPath -or -not (Test-Path $InstallerPath)) {
    Write-Host "❌ Installer not found!" -ForegroundColor Red
    Write-Host "`nPlease specify installer path:" -ForegroundColor Yellow
    Write-Host ".\RESET_AND_INSTALL.ps1 -InstallerPath '.\path\to\install-edge-agent.ps1'" -ForegroundColor Cyan
    exit 1
}

$installLogWrapper = Join-Path $currentDir "scripts\install-with-logging.ps1"
if (Test-Path $installLogWrapper) {
    Write-Host "Using installation wrapper for detailed logging...`n" -ForegroundColor Gray
    & $installLogWrapper -InstallerPath $InstallerPath
    $installExitCode = $LASTEXITCODE
} else {
    Write-Host "Running installer directly...`n" -ForegroundColor Gray
    & $InstallerPath
    $installExitCode = $LASTEXITCODE
}

# ============================================================================
# STEP 4: VERIFY
# ============================================================================

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "STEP 4: Verifying Installation" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

Start-Sleep -Seconds 2

$verifyScript = Join-Path $currentDir "scripts\simple-error-check.ps1"
if (Test-Path $verifyScript) {
    & $verifyScript
} else {
    # Manual verification
    Write-Host "Running manual verification...`n" -ForegroundColor Gray
    
    $installDir = "C:\Program Files\Sentinel Grid\Edge Agent"
    $checks = @(
        @{ Name = "Installation Directory"; Test = { Test-Path $installDir } },
        @{ Name = "Executable"; Test = { Test-Path (Join-Path $installDir "edge-agent.exe") } },
        @{ Name = "Configuration"; Test = { Test-Path (Join-Path $installDir "config\edge-agent.env") } },
        @{ Name = "Scheduled Task"; Test = { $null -ne (Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" -ErrorAction SilentlyContinue) } }
    )
    
    $allPassed = $true
    foreach ($check in $checks) {
        $passed = & $check.Test
        $icon = if ($passed) { "✓" } else { "✗"; $allPassed = $false }
        $color = if ($passed) { "Green" } else { "Red" }
        Write-Host "  $icon $($check.Name)" -ForegroundColor $color
    }
    
    if ($allPassed) {
        Write-Host "`n✓ All verification checks passed" -ForegroundColor Green
    } else {
        Write-Host "`n✗ Some verification checks failed" -ForegroundColor Red
    }
}

# ============================================================================
# SUMMARY
# ============================================================================

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "INSTALLATION SUMMARY" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

if ($installExitCode -eq 0) {
    Write-Host "🎉 Edge Agent Installation Completed Successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host "1. Check logs: Get-Content 'C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log' -Tail 20" -ForegroundColor Gray
    Write-Host "2. Open dashboard: https://sentinel-grid-monitoring-vhid.onrender.com" -ForegroundColor Gray
    Write-Host "3. Check edge agents section - should show 'Online'" -ForegroundColor Gray
    Write-Host "4. Check cameras section - should show discovered cameras" -ForegroundColor Gray
    Write-Host "5. Approve cameras and test live video" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Note: Analytics 429 errors in logs are warnings, not failures." -ForegroundColor Yellow
    Write-Host "See FIX_ANALYTICS_429_ERROR.md for details." -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "❌ Edge Agent Installation Failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Check installation logs above for errors" -ForegroundColor Gray
    Write-Host "2. Run diagnostics: .\scripts\simple-error-check.ps1" -ForegroundColor Gray
    Write-Host "3. Check service status: .\scripts\verify-render-urls.ps1" -ForegroundColor Gray
    Write-Host "4. Review: EDGE_ACTIVATION_BLOCKED_FIX.md" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

exit $installExitCode
