#!/usr/bin/env pwsh
<#
.SYNOPSIS
Verifies all Sentinel Grid Render services are reachable and responding.

.DESCRIPTION
Tests connectivity to all 4 Render services and reports their health status.
Useful after URL updates or when diagnosing connectivity issues.
#>

[CmdletBinding()]
param(
    [switch]$WakeServices,
    [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = "Continue"

# Define your official Render URLs
$services = @(
    @{
        Name = "Dashboard"
        Url = "https://sentinel-grid-monitoring-s38w.onrender.com"
        HealthPath = "/health"
        Priority = 1
        Description = "Main web dashboard and API proxy"
    },
    @{
        Name = "Control Plane"
        Url = "https://sentinel-grid-control-plane-zcli.onrender.com"
        HealthPath = "/health"
        Priority = 2
        Description = "Core backend API and database"
    },
    @{
        Name = "Analytics Engine"
        Url = "https://sentinel-grid-analytics-engine-682g.onrender.com"
        HealthPath = "/health"
        Priority = 3
        Description = "AI/ML analytics and video processing"
    },
    @{
        Name = "Media Gateway"
        Url = "https://sentinel-grid-media-gateway-ogqi.onrender.com"
        HealthPath = "/health"
        Priority = 4
        Description = "Live video streaming and HLS"
    }
)

Write-Host "`n╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Sentinel Grid - Render Service Health Check              ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$results = @()

foreach ($service in $services | Sort-Object Priority) {
    Write-Host "Testing: $($service.Name)" -ForegroundColor Yellow
    Write-Host "  URL: $($service.Url)" -ForegroundColor Gray
    Write-Host "  Purpose: $($service.Description)" -ForegroundColor Gray
    
    $healthUrl = "$($service.Url)$($service.HealthPath)"
    $startTime = Get-Date
    
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -Method GET -TimeoutSec $TimeoutSeconds -UseBasicParsing -ErrorAction Stop
        $elapsed = ((Get-Date) - $startTime).TotalMilliseconds
        
        $status = if ($response.StatusCode -eq 200) { "✓ HEALTHY" } else { "⚠ DEGRADED" }
        $color = if ($response.StatusCode -eq 200) { "Green" } else { "Yellow" }
        
        Write-Host "  Status: $status" -ForegroundColor $color
        Write-Host "  Response Time: $([Math]::Round($elapsed, 0))ms" -ForegroundColor $color
        Write-Host "  Status Code: $($response.StatusCode)" -ForegroundColor $color
        
        # Try to parse health response
        try {
            $healthBody = $response.Content | ConvertFrom-Json
            if ($healthBody.status) {
                Write-Host "  Service Status: $($healthBody.status)" -ForegroundColor $color
            }
            if ($healthBody.aiState) {
                Write-Host "  AI State: $($healthBody.aiState)" -ForegroundColor $color
            }
            if ($healthBody.version) {
                Write-Host "  Version: $($healthBody.version)" -ForegroundColor Gray
            }
        } catch {
            # Health response might not be JSON or might not have expected fields
        }
        
        $results += @{
            Service = $service.Name
            Status = "Healthy"
            StatusCode = $response.StatusCode
            ResponseTime = $elapsed
            Url = $service.Url
        }
        
    } catch {
        $elapsed = ((Get-Date) - $startTime).TotalMilliseconds
        $error = $_.Exception.Message
        
        if ($error -match "timed out" -or $error -match "timeout") {
            Write-Host "  Status: ⏱ TIMEOUT ($TimeoutSeconds s)" -ForegroundColor Red
            $status = "Timeout"
        } elseif ($error -match "Unable to connect" -or $error -match "No connection") {
            Write-Host "  Status: ✗ UNREACHABLE" -ForegroundColor Red
            $status = "Unreachable"
        } elseif ($error -match "503" -or $error -match "Service Unavailable") {
            Write-Host "  Status: ⚠ STARTING (Render cold start)" -ForegroundColor Yellow
            $status = "Starting"
        } else {
            Write-Host "  Status: ✗ ERROR" -ForegroundColor Red
            $status = "Error"
        }
        
        Write-Host "  Error: $($error.Substring(0, [Math]::Min(100, $error.Length)))" -ForegroundColor DarkRed
        
        $results += @{
            Service = $service.Name
            Status = $status
            StatusCode = $null
            ResponseTime = $elapsed
            Url = $service.Url
            Error = $error
        }
    }
    
    Write-Host ""
}

# Summary
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                          Summary                              ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$healthy = ($results | Where-Object { $_.Status -eq "Healthy" }).Count
$total = $results.Count
$healthPercentage = [Math]::Round(($healthy / $total) * 100, 0)

Write-Host "Services: $healthy/$total healthy ($healthPercentage%)" -ForegroundColor $(if ($healthy -eq $total) { "Green" } else { "Yellow" })
Write-Host ""

# Service status table
$results | ForEach-Object {
    $statusIcon = switch ($_.Status) {
        "Healthy" { "✓" }
        "Timeout" { "⏱" }
        "Starting" { "⚠" }
        "Unreachable" { "✗" }
        "Error" { "✗" }
        default { "?" }
    }
    
    $statusColor = switch ($_.Status) {
        "Healthy" { "Green" }
        "Timeout" { "Red" }
        "Starting" { "Yellow" }
        "Unreachable" { "Red" }
        "Error" { "Red" }
        default { "Gray" }
    }
    
    $responseTime = if ($_.ResponseTime) { "$([Math]::Round($_.ResponseTime, 0))ms" } else { "N/A" }
    
    Write-Host "  $statusIcon $($_.Service.PadRight(20))" -NoNewline -ForegroundColor $statusColor
    Write-Host " $($responseTime.PadRight(10))" -NoNewline -ForegroundColor Gray
    Write-Host " $($_.Status)" -ForegroundColor $statusColor
}

Write-Host ""

# Issues and recommendations
$issues = $results | Where-Object { $_.Status -ne "Healthy" }

if ($issues.Count -gt 0) {
    Write-Host "⚠ Issues Detected:" -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($issue in $issues) {
        Write-Host "  • $($issue.Service): $($issue.Status)" -ForegroundColor Yellow
        
        if ($issue.Status -eq "Timeout" -or $issue.Status -eq "Starting") {
            Write-Host "    Recommendation: This is likely a Render cold start." -ForegroundColor Gray
            Write-Host "    Action: Wait 30-60 seconds and try again." -ForegroundColor Gray
        } elseif ($issue.Status -eq "Unreachable") {
            Write-Host "    Recommendation: Check if service is deployed on Render." -ForegroundColor Gray
            Write-Host "    Action: Visit https://dashboard.render.com and check service status." -ForegroundColor Gray
        } elseif ($issue.Status -eq "Error") {
            Write-Host "    Recommendation: Check service logs on Render dashboard." -ForegroundColor Gray
            Write-Host "    Action: Visit service page and check recent logs/events." -ForegroundColor Gray
        }
        Write-Host ""
    }
    
    if ($WakeServices) {
        Write-Host "Attempting to wake services..." -ForegroundColor Cyan
        Write-Host "This will send multiple requests to ensure services are awake." -ForegroundColor Gray
        Write-Host ""
        
        # Re-test failed services
        foreach ($issue in $issues) {
            Write-Host "  Waking: $($issue.Service)..." -ForegroundColor Yellow
            $service = $services | Where-Object { $_.Name -eq $issue.Service }
            $healthUrl = "$($service.Url)$($service.HealthPath)"
            
            for ($i = 1; $i -le 3; $i++) {
                try {
                    $response = Invoke-WebRequest -Uri $healthUrl -Method GET -TimeoutSec 90 -UseBasicParsing -ErrorAction Stop
                    if ($response.StatusCode -eq 200) {
                        Write-Host "    ✓ Service is now awake!" -ForegroundColor Green
                        break
                    }
                } catch {
                    if ($i -lt 3) {
                        Write-Host "    Attempt $i/3: Still waking..." -ForegroundColor Gray
                        Start-Sleep -Seconds 15
                    } else {
                        Write-Host "    ✗ Service did not wake after 3 attempts" -ForegroundColor Red
                    }
                }
            }
        }
    } else {
        Write-Host "💡 Tip: Run with -WakeServices flag to automatically wake sleeping services:" -ForegroundColor Cyan
        Write-Host "   .\verify-render-urls.ps1 -WakeServices" -ForegroundColor Gray
    }
} else {
    Write-Host "✓ All services are healthy!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your Sentinel Grid platform is fully operational." -ForegroundColor Green
}

Write-Host ""
Write-Host "For detailed service status, visit: https://dashboard.render.com" -ForegroundColor Gray
Write-Host ""

# Exit code based on health
if ($healthy -eq $total) {
    exit 0
} else {
    exit 1
}
