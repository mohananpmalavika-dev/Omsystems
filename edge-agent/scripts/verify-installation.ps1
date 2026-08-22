#!/usr/bin/env pwsh
<#
.SYNOPSIS
Verifies Sentinel Grid Edge Agent installation and diagnoses live video issues.

.DESCRIPTION
Checks installation components, configuration, services, ports, and logs.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Edge Agent Installation Verification" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$installDir = "C:\Program Files\Sentinel Grid\Edge Agent"
$configPath = Join-Path $installDir "config\edge-agent.env"
$logPath = Join-Path $installDir "logs\edge-agent.log"
$dataDir = Join-Path $installDir "data"
$streamSecretsPath = Join-Path $dataDir "stream-secrets.json"
$identityPath = Join-Path $dataDir "device-identity.enc"

$issues = @()
$warnings = @()

# 1. Check if service is running
Write-Host "1. Checking Scheduled Task..." -ForegroundColor Yellow
$task = Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "   ✓ Scheduled task exists" -ForegroundColor Green
    Write-Host "     State: $($task.State)" -ForegroundColor Gray
    
    $taskInfo = Get-ScheduledTaskInfo -TaskName "Sentinel Grid Edge Agent" -ErrorAction SilentlyContinue
    if ($taskInfo) {
        Write-Host "     Last Run: $($taskInfo.LastRunTime)" -ForegroundColor Gray
        Write-Host "     Last Result: $($taskInfo.LastTaskResult)" -ForegroundColor Gray
    }
    
    if ($task.State -ne "Running") {
        $warnings += "Task state is $($task.State), not Running"
    }
} else {
    Write-Host "   ✗ Scheduled task not found" -ForegroundColor Red
    $issues += "Scheduled task 'Sentinel Grid Edge Agent' does not exist"
}

# 2. Check configuration
Write-Host "`n2. Checking Configuration..." -ForegroundColor Yellow
if (Test-Path $configPath) {
    Write-Host "   ✓ Configuration file exists" -ForegroundColor Green
    
    $configContent = Get-Content $configPath -Raw
    $config = @{}
    foreach ($line in ($configContent -split "`n")) {
        if ($line -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim().Trim('"')
            $config[$key] = $value
        }
    }
    
    Write-Host "`n   Configuration Values:" -ForegroundColor Cyan
    @(
        "CONTROL_PLANE_URL",
        "BRANCH_ID",
        "LIVE_MEDIA_ENABLED",
        "EDGE_MANAGED_MEDIA_BOOTSTRAP",
        "EDGE_LIVE_GATEWAY_PORT",
        "MEDIA_TUNNEL_MODE",
        "PUBLIC_MEDIA_GATEWAY_URL"
    ) | ForEach-Object {
        $value = $config[$_]
        if ($value) {
            Write-Host "     $_ = $value" -ForegroundColor Gray
        } else {
            Write-Host "     $_ = (not set)" -ForegroundColor DarkGray
        }
    }
    
    if ($config["LIVE_MEDIA_ENABLED"] -ne "true") {
        $issues += "LIVE_MEDIA_ENABLED is not 'true'"
    }
    
    if (-not $config["CONTROL_PLANE_URL"]) {
        $issues += "CONTROL_PLANE_URL is not configured"
    }
} else {
    Write-Host "   ✗ Configuration file not found at $configPath" -ForegroundColor Red
    $issues += "Configuration file missing"
}

# 3. Check runtime dependencies
Write-Host "`n3. Checking Runtime Dependencies..." -ForegroundColor Yellow

$runtimeChecks = @(
    @{ Name = "FFprobe"; Path = "runtime\ffmpeg\ffprobe.exe" },
    @{ Name = "FFmpeg"; Path = "runtime\ffmpeg\ffmpeg.exe" },
    @{ Name = "MediaMTX"; Path = "runtime\mediamtx\mediamtx.exe" },
    @{ Name = "Cloudflared"; Path = "runtime\cloudflared.exe" }
)

foreach ($check in $runtimeChecks) {
    $fullPath = Join-Path $installDir $check.Path
    if (Test-Path $fullPath) {
        Write-Host "   ✓ $($check.Name) found" -ForegroundColor Green
        Write-Host "     Path: $fullPath" -ForegroundColor Gray
    } else {
        Write-Host "   ✗ $($check.Name) not found" -ForegroundColor Red
        Write-Host "     Expected: $fullPath" -ForegroundColor Gray
        $issues += "$($check.Name) missing at $($check.Path)"
    }
}

# 4. Check data files
Write-Host "`n4. Checking Data Files..." -ForegroundColor Yellow

if (Test-Path $identityPath) {
    Write-Host "   ✓ Device identity exists" -ForegroundColor Green
} else {
    Write-Host "   ⚠ Device identity not found (may not be activated yet)" -ForegroundColor Yellow
    $warnings += "Device identity file not found - agent may need activation"
}

if (Test-Path $streamSecretsPath) {
    Write-Host "   ✓ Stream secrets file exists" -ForegroundColor Green
    try {
        $secrets = Get-Content $streamSecretsPath -Raw | ConvertFrom-Json
        $secretCount = ($secrets.PSObject.Properties | Measure-Object).Count
        Write-Host "     Stream secrets stored: $secretCount" -ForegroundColor Gray
        
        if ($secretCount -eq 0) {
            $warnings += "No stream secrets stored yet - cameras may not be discovered"
        }
    } catch {
        Write-Host "   ⚠ Could not parse stream secrets file" -ForegroundColor Yellow
        $warnings += "Stream secrets file exists but cannot be parsed"
    }
} else {
    Write-Host "   ⚠ Stream secrets file not found" -ForegroundColor Yellow
    $warnings += "No stream secrets file - cameras not yet discovered"
}

# 5. Check if ports are listening
Write-Host "`n5. Checking Network Ports..." -ForegroundColor Yellow

$portChecks = @(
    @{ Port = 8090; Name = "Live Gateway (edge agent HTTP API)" },
    @{ Port = 8888; Name = "MediaMTX HLS" },
    @{ Port = 9997; Name = "MediaMTX API" }
)

foreach ($check in $portChecks) {
    $connection = Get-NetTCPConnection -LocalPort $check.Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection) {
        Write-Host "   ✓ Port $($check.Port) listening ($($check.Name))" -ForegroundColor Green
        Write-Host "     State: $($connection.State)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠ Port $($check.Port) not listening ($($check.Name))" -ForegroundColor Yellow
        $warnings += "Port $($check.Port) ($($check.Name)) not listening"
    }
}

# 6. Check firewall rules
Write-Host "`n6. Checking Firewall Rules..." -ForegroundColor Yellow
$firewallRule = Get-NetFirewallRule -DisplayName "Sentinel Grid Private Live Video" -ErrorAction SilentlyContinue
if ($firewallRule) {
    Write-Host "   ✓ Firewall rule exists" -ForegroundColor Green
    Write-Host "     Enabled: $($firewallRule.Enabled)" -ForegroundColor Gray
} else {
    Write-Host "   ⚠ Firewall rule not found" -ForegroundColor Yellow
    $warnings += "Firewall rule for live video not configured"
}

# 7. Check recent logs
Write-Host "`n7. Analyzing Recent Logs..." -ForegroundColor Yellow
if (Test-Path $logPath) {
    $recentLogs = Get-Content $logPath -Tail 50 -ErrorAction SilentlyContinue
    
    $errorCount = ($recentLogs | Select-String "\[error\]" -AllMatches).Count
    $discoveryCount = ($recentLogs | Select-String "discovered" -AllMatches).Count
    $monitoringLine = $recentLogs | Select-String "Synchronized .* camera" | Select-Object -Last 1
    $cameraCount = if ($monitoringLine) {
        if ($monitoringLine -match "Synchronized (\d+) camera") { [int]$matches[1] } else { 0 }
    } else { 0 }
    
    Write-Host "   Log Statistics (last 50 lines):" -ForegroundColor Cyan
    Write-Host "     Errors: $errorCount" -ForegroundColor $(if ($errorCount -gt 0) { "Yellow" } else { "Gray" })
    Write-Host "     Discovery events: $discoveryCount" -ForegroundColor Gray
    Write-Host "     Cameras being monitored: $cameraCount" -ForegroundColor $(if ($cameraCount -eq 0) { "Yellow" } else { "Green" })
    
    if ($cameraCount -eq 0) {
        $warnings += "No cameras are being monitored - live video will not work"
    }
    
    if ($errorCount -gt 0) {
        Write-Host "`n   Recent Errors:" -ForegroundColor Red
        $recentLogs | Select-String "\[error\]" | Select-Object -First 5 | ForEach-Object {
            Write-Host "     $($_.Line.Substring(0, [Math]::Min(120, $_.Line.Length)))" -ForegroundColor DarkRed
        }
    }
    
    # Check for specific issues
    $controlPlaneErrors = $recentLogs | Select-String "Cannot reach control plane" | Select-Object -First 1
    if ($controlPlaneErrors) {
        $issues += "Cannot reach control plane - check CONTROL_PLANE_URL and network connectivity"
    }
    
    $codecErrors = $recentLogs | Select-String "Invalid enum value.*hevc" | Select-Object -First 1
    if ($codecErrors) {
        $warnings += "HEVC codec not recognized - codec normalization fix needed"
    }
    
} else {
    Write-Host "   ✗ Log file not found at $logPath" -ForegroundColor Red
    $issues += "Log file missing - edge agent may not have started"
}

# 8. Check control plane connectivity
if ($config -and $config["CONTROL_PLANE_URL"]) {
    Write-Host "`n8. Testing Control Plane Connectivity..." -ForegroundColor Yellow
    try {
        $healthUrl = "$($config['CONTROL_PLANE_URL'])/health"
        Write-Host "   Testing: $healthUrl" -ForegroundColor Gray
        
        $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "   ✓ Control plane reachable" -ForegroundColor Green
        } else {
            Write-Host "   ⚠ Control plane returned status $($response.StatusCode)" -ForegroundColor Yellow
            $warnings += "Control plane health check returned unexpected status"
        }
    } catch {
        Write-Host "   ✗ Cannot reach control plane" -ForegroundColor Red
        Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor DarkRed
        $issues += "Control plane not reachable at $($config['CONTROL_PLANE_URL'])"
    }
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ($issues.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "✓ All checks passed!" -ForegroundColor Green
    Write-Host "  Edge agent appears to be installed and running correctly.`n" -ForegroundColor Green
} else {
    if ($issues.Count -gt 0) {
        Write-Host "Critical Issues ($($issues.Count)):" -ForegroundColor Red
        $issues | ForEach-Object { Write-Host "  • $_" -ForegroundColor Red }
        Write-Host ""
    }
    
    if ($warnings.Count -gt 0) {
        Write-Host "Warnings ($($warnings.Count)):" -ForegroundColor Yellow
        $warnings | ForEach-Object { Write-Host "  • $_" -ForegroundColor Yellow }
        Write-Host ""
    }
}

Write-Host "Detailed logs: $logPath" -ForegroundColor Cyan
Write-Host "Configuration: $configPath" -ForegroundColor Cyan
Write-Host "`nRun with -Verbose for more details.`n" -ForegroundColor Gray

# Exit code
if ($issues.Count -gt 0) {
    exit 1
} else {
    exit 0
}
