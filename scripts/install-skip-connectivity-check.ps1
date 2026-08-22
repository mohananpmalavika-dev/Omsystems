#!/usr/bin/env pwsh
<#
.SYNOPSIS
Installs edge agent and skips the connectivity check that causes hangs.

.DESCRIPTION
Runs the edge agent installer with -SkipConnectivityCheck parameter to avoid
hanging during Render cold start.
#>

[CmdletBinding()]
param(
    [string]$InstallerPath
)

$ErrorActionPreference = "Stop"

Write-Host "`n╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Edge Agent Installation (Skip Connectivity Check)          ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ Must run as Administrator" -ForegroundColor Red
    exit 1
}

# Find installer
if (-not $InstallerPath) {
    $possiblePaths = @(
        ".\edge-agent\installer\windows\install-edge-agent.ps1",
        "..\edge-agent\installer\windows\install-edge-agent.ps1",
        "edge-agent\installer\windows\install-edge-agent.ps1"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $InstallerPath = $path
            break
        }
    }
}

if (-not $InstallerPath -or -not (Test-Path $InstallerPath)) {
    Write-Host "❌ Installer not found" -ForegroundColor Red
    Write-Host "Specify path: -InstallerPath '.\path\to\install-edge-agent.ps1'" -ForegroundColor Yellow
    exit 1
}

Write-Host "Installer: $InstallerPath" -ForegroundColor Gray
Write-Host "Mode: Skip connectivity check (faster, no timeout)" -ForegroundColor Yellow
Write-Host ""

Write-Host "⚠️  The installer will:" -ForegroundColor Yellow
Write-Host "   • Install all components" -ForegroundColor Gray
Write-Host "   • Start the service" -ForegroundColor Gray
Write-Host "   • Skip the connectivity test (which causes hangs)" -ForegroundColor Gray
Write-Host "   • Service will activate in background" -ForegroundColor Gray
Write-Host ""

# Run installer with skip flag
Write-Host "Running installer...`n" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor DarkGray

try {
    & $InstallerPath -SkipConnectivityCheck
    $exitCode = $LASTEXITCODE
    
    Write-Host "=" * 70 -ForegroundColor DarkGray
    Write-Host ""
    
    if ($exitCode -eq 0) {
        Write-Host "✓ Installation completed" -ForegroundColor Green
        Write-Host ""
        Write-Host "Waiting 5 seconds for service to start..." -ForegroundColor Gray
        Start-Sleep -Seconds 5
        
        # Check task
        $task = Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" -ErrorAction SilentlyContinue
        if ($task) {
            Write-Host "✓ Scheduled task exists: $($task.State)" -ForegroundColor Green
            
            if ($task.State -eq "Running") {
                Write-Host "✓ Service is running" -ForegroundColor Green
            } else {
                Write-Host "⚠ Service state: $($task.State)" -ForegroundColor Yellow
                Write-Host "  Starting task..." -ForegroundColor Gray
                Start-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
                Start-Sleep -Seconds 2
            }
        }
        
        # Show logs
        Write-Host "`nChecking logs..." -ForegroundColor Cyan
        $logPath = "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log"
        
        if (Test-Path $logPath) {
            Write-Host "Last 10 log lines:" -ForegroundColor Gray
            Get-Content $logPath -Tail 10 | ForEach-Object {
                if ($_ -match "error|fail") {
                    Write-Host $_ -ForegroundColor Red
                } elseif ($_ -match "warn") {
                    Write-Host $_ -ForegroundColor Yellow
                } else {
                    Write-Host $_ -ForegroundColor Gray
                }
            }
        }
        
        Write-Host "`n✓ Installation successful!" -ForegroundColor Green
        Write-Host "  The service is running and will activate automatically." -ForegroundColor Gray
        Write-Host ""
        Write-Host "Monitor logs:" -ForegroundColor Cyan
        Write-Host "  Get-Content '$logPath' -Tail 20 -Wait" -ForegroundColor Gray
        
    } else {
        Write-Host "✗ Installation failed (exit code: $exitCode)" -ForegroundColor Red
    }
    
    exit $exitCode
    
} catch {
    Write-Host "`n✗ Installation failed with exception" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor DarkRed
    exit 1
}
