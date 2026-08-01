# Sentinel Grid Service Uninstallation Script
# Stops and removes the Windows service

param(
    [string]$AppPath = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "======================================"
Write-Host "  Uninstalling Sentinel Grid Service"
Write-Host "======================================"
Write-Host ""

try {
    $serviceName = "SentinelGridEdgeAgent"
    
    # Check if service exists
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    
    if ($service) {
        Write-Host "Found service: $serviceName"
        
        # Stop the service if running
        if ($service.Status -eq 'Running') {
            Write-Host "Stopping service..."
            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
            Write-Host "✅ Service stopped"
        }
        
        # Delete the service
        Write-Host "Removing service..."
        sc.exe delete $serviceName | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Service removed successfully"
        } else {
            Write-Host "⚠️  Service removal returned code: $LASTEXITCODE"
        }
        
    } else {
        Write-Host "Service not found (may have been already removed)"
    }
    
    Write-Host ""
    Write-Host "======================================"
    Write-Host "  Uninstallation Complete"
    Write-Host "======================================"
    Write-Host ""
    Write-Host "Note: Configuration and log files have been"
    Write-Host "preserved in case you reinstall later."
    Write-Host ""
    Write-Host "Location: $AppPath"
    Write-Host ""
    
} catch {
    Write-Host "⚠️  Warning during uninstall: $($_.Exception.Message)"
    Write-Host ""
}
