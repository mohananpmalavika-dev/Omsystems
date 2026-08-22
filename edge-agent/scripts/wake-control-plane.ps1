#!/usr/bin/env pwsh
<#
.SYNOPSIS
Wakes up the control plane (especially for Render free tier) before edge agent installation.

.DESCRIPTION
Render's free tier spins down after 15 minutes of inactivity. This script pings the
control plane repeatedly until it responds, ensuring the service is awake before
running the edge agent installer.

.PARAMETER ControlPlaneUrl
The control plane URL. Defaults to the configured URL or prompts if not set.

.PARAMETER MaxWaitSeconds
Maximum time to wait for the control plane to wake up. Default: 120 seconds.

.EXAMPLE
.\wake-control-plane.ps1
# Uses default URL from environment or prompts

.EXAMPLE
.\wake-control-plane.ps1 -ControlPlaneUrl "https://my-control-plane.onrender.com"

.EXAMPLE
.\wake-control-plane.ps1 -MaxWaitSeconds 180
# Wait up to 3 minutes
#>

[CmdletBinding()]
param(
    [string]$ControlPlaneUrl,
    [int]$MaxWaitSeconds = 120
)

$ErrorActionPreference = "Continue"

# Try to detect control plane URL
if (-not $ControlPlaneUrl) {
    # Check if we're in the edge-agent directory with config
    $configPaths = @(
        "config\edge-agent.env",
        "..\config\edge-agent.env",
        "$env:ProgramFiles\Sentinel Grid\Edge Agent\config\edge-agent.env",
        ".env"
    )
    
    foreach ($configPath in $configPaths) {
        if (Test-Path $configPath) {
            $configContent = Get-Content $configPath -Raw
            if ($configContent -match 'CONTROL_PLANE_URL\s*=\s*"?([^"\s]+)"?') {
                $ControlPlaneUrl = $matches[1]
                Write-Host "Detected control plane URL from config: $ControlPlaneUrl" -ForegroundColor Gray
                break
            }
        }
    }
}

# Still no URL? Prompt user
if (-not $ControlPlaneUrl) {
    $ControlPlaneUrl = Read-Host "Enter control plane URL (e.g., https://your-app.onrender.com)"
}

# Validate URL
try {
    $uri = [Uri]$ControlPlaneUrl
    if ($uri.Scheme -notin @("http", "https")) {
        throw "URL must use http or https protocol"
    }
} catch {
    Write-Error "Invalid control plane URL: $ControlPlaneUrl"
    Write-Error $_.Exception.Message
    exit 1
}

$healthUrl = "$($ControlPlaneUrl.TrimEnd('/'))/health"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Waking Up Control Plane" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Control Plane: $ControlPlaneUrl" -ForegroundColor White
Write-Host "Health Check:  $healthUrl" -ForegroundColor White
Write-Host "Max Wait:      $MaxWaitSeconds seconds" -ForegroundColor White
Write-Host ""

# Detect if it's Render
$isRender = $ControlPlaneUrl -match "\.onrender\.com"
if ($isRender) {
    Write-Host "ℹ️  Detected Render.com hosting" -ForegroundColor Yellow
    Write-Host "   Free tier services spin down after 15 mins of inactivity." -ForegroundColor Gray
    Write-Host "   First request may take 30-60 seconds to wake up." -ForegroundColor Gray
    Write-Host ""
}

$startTime = Get-Date
$attempt = 0
$totalWaitTime = 0
$success = $false

Write-Host "Sending wake-up requests..." -ForegroundColor Cyan

while ($totalWaitTime -lt $MaxWaitSeconds) {
    $attempt++
    $attemptStart = Get-Date
    
    try {
        Write-Host "  Attempt $attempt " -NoNewline -ForegroundColor Gray
        
        # Use Invoke-WebRequest with longer timeout for first few attempts
        $timeout = if ($attempt -le 3) { 90 } else { 30 }
        
        $response = Invoke-WebRequest -Uri $healthUrl -Method GET -TimeoutSec $timeout -UseBasicParsing -ErrorAction Stop
        
        $elapsed = ((Get-Date) - $attemptStart).TotalSeconds
        
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ SUCCESS" -ForegroundColor Green
            Write-Host "     Response time: $([Math]::Round($elapsed, 2))s" -ForegroundColor Green
            Write-Host "     Status code: $($response.StatusCode)" -ForegroundColor Green
            
            try {
                $healthBody = $response.Content | ConvertFrom-Json
                if ($healthBody.status) {
                    Write-Host "     Service status: $($healthBody.status)" -ForegroundColor Green
                }
            } catch {
                # Health response might not be JSON
            }
            
            $success = $true
            break
        } else {
            Write-Host "⚠ Unexpected status: $($response.StatusCode)" -ForegroundColor Yellow
            Write-Host "     Response time: $([Math]::Round($elapsed, 2))s" -ForegroundColor Yellow
        }
        
    } catch {
        $elapsed = ((Get-Date) - $attemptStart).TotalSeconds
        $error = $_.Exception.Message
        
        if ($error -match "timed out" -or $error -match "timeout") {
            Write-Host "⏱ TIMEOUT ($([Math]::Round($elapsed, 0))s)" -ForegroundColor Yellow
            if ($attempt -le 2 -and $isRender) {
                Write-Host "     (Normal for Render cold start - waiting for service to wake)" -ForegroundColor Gray
            }
        } elseif ($error -match "Unable to connect" -or $error -match "No connection") {
            Write-Host "✗ CONNECTION FAILED" -ForegroundColor Red
            Write-Host "     Error: $($error.Substring(0, [Math]::Min(80, $error.Length)))" -ForegroundColor DarkRed
        } else {
            Write-Host "✗ ERROR" -ForegroundColor Red
            Write-Host "     $($error.Substring(0, [Math]::Min(80, $error.Length)))" -ForegroundColor DarkRed
        }
    }
    
    $totalWaitTime = ((Get-Date) - $startTime).TotalSeconds
    
    if ($totalWaitTime -lt $MaxWaitSeconds) {
        $waitInterval = if ($attempt -le 2) { 10 } else { 5 }
        Write-Host "     Waiting $waitInterval seconds before retry..." -ForegroundColor Gray
        Start-Sleep -Seconds $waitInterval
        $totalWaitTime += $waitInterval
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($success) {
    $totalTime = ((Get-Date) - $startTime).TotalSeconds
    Write-Host "✓ Control Plane is Ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Total time: $([Math]::Round($totalTime, 1)) seconds" -ForegroundColor Gray
    Write-Host "  Attempts: $attempt" -ForegroundColor Gray
    Write-Host ""
    Write-Host "You can now run the edge agent installer." -ForegroundColor Green
    Write-Host ""
    
    if ($isRender) {
        Write-Host "💡 Tip: The service will stay awake for ~15 minutes." -ForegroundColor Cyan
        Write-Host "   If installation takes longer, you may need to wake it again." -ForegroundColor Gray
    }
    
    exit 0
    
} else {
    Write-Host "✗ Failed to Wake Control Plane" -ForegroundColor Red
    Write-Host ""
    Write-Host "After $attempt attempts over $([Math]::Round($totalWaitTime, 0)) seconds," -ForegroundColor Red
    Write-Host "the control plane did not respond successfully." -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible issues:" -ForegroundColor Yellow
    Write-Host "  • Control plane service is down" -ForegroundColor Yellow
    Write-Host "  • Network/firewall blocking outbound HTTPS" -ForegroundColor Yellow
    Write-Host "  • DNS resolution failure" -ForegroundColor Yellow
    Write-Host "  • Invalid control plane URL" -ForegroundColor Yellow
    
    if ($isRender) {
        Write-Host ""
        Write-Host "Render-specific troubleshooting:" -ForegroundColor Cyan
        Write-Host "  1. Check your Render dashboard: https://dashboard.render.com" -ForegroundColor Gray
        Write-Host "  2. Verify the service is deployed and not suspended" -ForegroundColor Gray
        Write-Host "  3. Check service logs for startup errors" -ForegroundColor Gray
        Write-Host "  4. Ensure you haven't exceeded 550 free hours/month" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Diagnostic commands:" -ForegroundColor Cyan
    Write-Host "  Test-NetConnection -ComputerName $($uri.Host) -Port $($uri.Port)" -ForegroundColor Gray
    Write-Host "  Resolve-DnsName $($uri.Host)" -ForegroundColor Gray
    Write-Host "  curl -v $healthUrl" -ForegroundColor Gray
    
    exit 1
}
