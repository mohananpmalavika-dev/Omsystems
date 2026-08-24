#!/usr/bin/env pwsh
<#
.SYNOPSIS
Wrapper script to run edge agent installer with full error logging.

.DESCRIPTION
Runs the edge agent installer and captures all output, errors, and exit codes
to help diagnose installation failures.
#>

[CmdletBinding()]
param(
    [string]$InstallerPath,
    [string]$ActivationCode
)

$ErrorActionPreference = "Continue"
$logFile = Join-Path $env:TEMP "edge-agent-install-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    Add-Content -Path $logFile -Value $logMessage
}

Write-Log "Starting Edge Agent Installation" "INFO"
Write-Log "Log file: $logFile" "INFO"

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Log "ERROR: This script must be run as Administrator" "ERROR"
    Write-Host "`nPlease run PowerShell as Administrator:" -ForegroundColor Red
    Write-Host "1. Right-click PowerShell" -ForegroundColor Yellow
    Write-Host "2. Select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host "3. Run this script again" -ForegroundColor Yellow
    exit 1
}

Write-Log "Running as Administrator: OK" "INFO"

# Find installer if not specified
if (-not $InstallerPath) {
    $possibleLocations = @(
        ".\edge-agent\installer\windows\install-edge-agent.ps1",
        ".\install-edge-agent.ps1",
        ".\edge-agent\install-edge-agent.ps1"
    )
    
    foreach ($location in $possibleLocations) {
        if (Test-Path $location) {
            $InstallerPath = $location
            Write-Log "Found installer at: $InstallerPath" "INFO"
            break
        }
    }
    
    if (-not $InstallerPath) {
        Write-Log "ERROR: Could not find installer script" "ERROR"
        Write-Host "`nPlease specify installer path:" -ForegroundColor Red
        Write-Host ".\install-with-logging.ps1 -InstallerPath '.\path\to\install-edge-agent.ps1'" -ForegroundColor Yellow
        exit 1
    }
}

if (-not (Test-Path $InstallerPath)) {
    Write-Log "ERROR: Installer not found at: $InstallerPath" "ERROR"
    exit 1
}

Write-Log "Installer path: $InstallerPath" "INFO"

# Check control plane availability
Write-Log "Checking control plane availability..." "INFO"
$controlPlaneUrl = "https://sentinel-grid-control-plane-zcli.onrender.com"

try {
    $response = Invoke-WebRequest -Uri "$controlPlaneUrl/health" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    Write-Log "Control plane is reachable (Status: $($response.StatusCode))" "INFO"
} catch {
    Write-Log "WARNING: Control plane may not be reachable: $($_.Exception.Message)" "WARN"
    Write-Host "`n⚠️  Control plane is not responding. This may cause installation to fail." -ForegroundColor Yellow
    Write-Host "   Recommendation: Wake services first with:" -ForegroundColor Gray
    Write-Host "   .\scripts\verify-render-urls.ps1 -WakeServices" -ForegroundColor Cyan
    Write-Host "`nContinue anyway? (y/n): " -NoNewline -ForegroundColor Yellow
    $continue = Read-Host
    if ($continue -ne 'y' -and $continue -ne 'Y') {
        Write-Log "Installation cancelled by user" "INFO"
        exit 0
    }
}

# Run installer
Write-Log "Running installer..." "INFO"
Write-Host "`n" + ("=" * 80) -ForegroundColor Cyan
Write-Host "INSTALLER OUTPUT" -ForegroundColor Cyan
Write-Host ("=" * 80) -ForegroundColor Cyan

try {
    $installerArgs = @()
    if ($ActivationCode) {
        # Note: This depends on installer supporting this parameter
        Write-Log "Using provided activation code" "INFO"
    }
    
    # Run installer and capture output
    $output = & $InstallerPath @installerArgs 2>&1
    
    # Log all output
    $output | ForEach-Object {
        $line = $_.ToString()
        Write-Host $line
        Add-Content -Path $logFile -Value $line
    }
    
    $exitCode = $LASTEXITCODE
    Write-Log "Installer exit code: $exitCode" "INFO"
    
    if ($exitCode -eq 0) {
        Write-Host "`n" + ("=" * 80) -ForegroundColor Green
        Write-Host "✓ INSTALLATION COMPLETED SUCCESSFULLY" -ForegroundColor Green
        Write-Host ("=" * 80) -ForegroundColor Green
        Write-Log "Installation completed successfully" "INFO"
        
        # Verify installation
        Write-Host "`nVerifying installation..." -ForegroundColor Cyan
        $installDir = "C:\Program Files\Sentinel Grid\Edge Agent"
        
        if (Test-Path "$installDir\edge-agent.exe") {
            Write-Host "✓ Executable installed" -ForegroundColor Green
        }
        
        if (Test-Path "$installDir\config\edge-agent.env") {
            Write-Host "✓ Configuration created" -ForegroundColor Green
        }
        
        $task = Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" -ErrorAction SilentlyContinue
        if ($task) {
            Write-Host "✓ Scheduled task created ($($task.State))" -ForegroundColor Green
        }
        
    } else {
        Write-Host "`n" + ("=" * 80) -ForegroundColor Red
        Write-Host "✗ INSTALLATION FAILED (Exit Code: $exitCode)" -ForegroundColor Red
        Write-Host ("=" * 80) -ForegroundColor Red
        Write-Log "Installation failed with exit code: $exitCode" "ERROR"
    }
    
} catch {
    Write-Log "EXCEPTION during installation: $($_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
    
    Write-Host "`n" + ("=" * 80) -ForegroundColor Red
    Write-Host "✗ INSTALLATION FAILED WITH EXCEPTION" -ForegroundColor Red
    Write-Host ("=" * 80) -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    $exitCode = 1
}

Write-Host "`n" + ("=" * 80) -ForegroundColor Cyan
Write-Host "Full log saved to:" -ForegroundColor Cyan
Write-Host $logFile -ForegroundColor White
Write-Host ("=" * 80) -ForegroundColor Cyan

exit $exitCode
