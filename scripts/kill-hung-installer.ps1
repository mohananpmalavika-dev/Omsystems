#!/usr/bin/env pwsh
<#
.SYNOPSIS
Kills hung installer processes.

.DESCRIPTION
Stops any PowerShell processes that are running the installer and hung.
#>

Write-Host "`nKilling hung installer processes..." -ForegroundColor Yellow

# Kill edge-agent processes
$edgeProcesses = Get-Process -Name "edge-agent" -ErrorAction SilentlyContinue
if ($edgeProcesses) {
    Write-Host "Found $($edgeProcesses.Count) edge-agent process(es)" -ForegroundColor Gray
    $edgeProcesses | ForEach-Object {
        try {
            $_.Kill()
            Write-Host "✓ Killed PID: $($_.Id)" -ForegroundColor Green
        } catch {
            Write-Host "✗ Could not kill PID: $($_.Id)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "No edge-agent processes found" -ForegroundColor Gray
}

# Find installer PowerShell processes (be careful!)
Write-Host "`nLooking for hung PowerShell installer processes..." -ForegroundColor Yellow
Write-Host "Note: Will NOT kill your current PowerShell session!" -ForegroundColor Gray

$currentPID = $PID
$psProcesses = Get-Process -Name "powershell","pwsh" -ErrorAction SilentlyContinue | 
    Where-Object { $_.Id -ne $currentPID }

if ($psProcesses) {
    Write-Host "`nFound $($psProcesses.Count) other PowerShell process(es):" -ForegroundColor Yellow
    $psProcesses | ForEach-Object {
        Write-Host "  PID: $($_.Id) - Started: $($_.StartTime)" -ForegroundColor Gray
    }
    
    Write-Host "`nKill these processes? (y/n): " -NoNewline -ForegroundColor Yellow
    $response = Read-Host
    
    if ($response -eq 'y' -or $response -eq 'Y') {
        $psProcesses | ForEach-Object {
            try {
                $_.Kill()
                Write-Host "✓ Killed PID: $($_.Id)" -ForegroundColor Green
            } catch {
                Write-Host "✗ Could not kill PID: $($_.Id)" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "Skipped killing PowerShell processes" -ForegroundColor Gray
    }
} else {
    Write-Host "No other PowerShell processes found" -ForegroundColor Gray
}

Write-Host "`n✓ Done" -ForegroundColor Green
