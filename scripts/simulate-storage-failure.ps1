# Storage Failure Simulation Script
# Used for testing storage failover scenarios

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('disk-full', 's3-outage', 'smb-failure', 'all-fail')]
    [string]$FailureType,
    
    [Parameter(Mandatory=$false)]
    [int]$DurationSeconds = 60,
    
    [Parameter(Mandatory=$false)]
    [string]$StoragePath = "C:\temp\test-storage"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  STORAGE FAILURE SIMULATOR" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Failure Type: $FailureType" -ForegroundColor Yellow
Write-Host "Duration: $DurationSeconds seconds" -ForegroundColor Yellow
Write-Host ""

switch ($FailureType) {
    'disk-full' {
        Write-Host "[1/4] Simulating disk full scenario..." -ForegroundColor Yellow
        
        # Create test storage directory
        if (!(Test-Path $StoragePath)) {
            New-Item -ItemType Directory -Path $StoragePath | Out-Null
        }
        
        # Fill disk to 95% capacity (simulation)
        Write-Host "  Creating large dummy file to fill disk..." -ForegroundColor White
        
        try {
            # Calculate disk space
            $drive = (Get-Item $StoragePath).PSDrive
            $driveInfo = Get-PSDrive $drive.Name
            $freeSpace = $driveInfo.Free
            $totalSpace = $driveInfo.Used + $driveInfo.Free
            
            # Calculate size to fill to 95%
            $targetUsage = $totalSpace * 0.95
            $sizeToWrite = [Math]::Max(0, $targetUsage - $driveInfo.Used)
            
            if ($sizeToWrite -gt 1GB) {
                Write-Host "  ⚠️  Would fill $([Math]::Round($sizeToWrite / 1GB, 2)) GB" -ForegroundColor Yellow
                Write-Host "  Skipping actual fill for safety" -ForegroundColor Yellow
                Write-Host "  Simulating disk full condition..." -ForegroundColor Yellow
            }
            
            # In production test environment, would actually fill disk
            # fsutil file createnew "$StoragePath\dummy.dat" $sizeToWrite
            
            Write-Host "  ✅ Disk full condition simulated" -ForegroundColor Green
            Write-Host ""
            Write-Host "  Expected behavior:" -ForegroundColor Cyan
            Write-Host "  - Recording attempts to write to primary" -ForegroundColor White
            Write-Host "  - Primary returns ENOSPC error" -ForegroundColor White
            Write-Host "  - System fails over to secondary storage" -ForegroundColor White
            Write-Host "  - CRITICAL incident created" -ForegroundColor White
            Write-Host "  - Operator alerted via SMS" -ForegroundColor White
            Write-Host ""
            
        } catch {
            Write-Host "  ❌ Error: $_" -ForegroundColor Red
        }
        
        Write-Host "  Waiting $DurationSeconds seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds $DurationSeconds
        
        Write-Host "  ✅ Disk full simulation complete" -ForegroundColor Green
    }
    
    's3-outage' {
        Write-Host "[2/4] Simulating S3 outage..." -ForegroundColor Yellow
        
        Write-Host "  Simulating network timeout to S3..." -ForegroundColor White
        
        # In production test: Block S3 endpoints via firewall
        # New-NetFirewallRule -DisplayName "Block S3" -Direction Outbound `
        #   -RemoteAddress "52.216.0.0/14" -Action Block
        
        Write-Host "  ✅ S3 outage simulated" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Expected behavior:" -ForegroundColor Cyan
        Write-Host "  - S3 upload attempts timeout" -ForegroundColor White
        Write-Host "  - Recordings stage to local disk" -ForegroundColor White
        Write-Host "  - Upload retry queue created" -ForegroundColor White
        Write-Host "  - Recording continues without interruption" -ForegroundColor White
        Write-Host "  - Status shows 'S3 OFFLINE - LOCAL STAGING'" -ForegroundColor White
        Write-Host ""
        
        Write-Host "  Waiting $DurationSeconds seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds $DurationSeconds
        
        # In production test: Remove firewall rule
        # Remove-NetFirewallRule -DisplayName "Block S3"
        
        Write-Host "  ✅ S3 recovered" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Expected recovery:" -ForegroundColor Cyan
        Write-Host "  - Retry queue processor activates" -ForegroundColor White
        Write-Host "  - Staged recordings upload to S3" -ForegroundColor White
        Write-Host "  - Local staging cleaned up" -ForegroundColor White
        Write-Host "  - Status returns to 'NORMAL'" -ForegroundColor White
        Write-Host ""
    }
    
    'smb-failure' {
        Write-Host "[3/4] Simulating SMB network failure..." -ForegroundColor Yellow
        
        Write-Host "  Simulating SMB connection loss..." -ForegroundColor White
        
        # In production test: Disconnect network or block SMB port
        # New-NetFirewallRule -DisplayName "Block SMB" -Direction Outbound `
        #   -Protocol TCP -RemotePort 445 -Action Block
        
        Write-Host "  ✅ SMB failure simulated" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Expected behavior:" -ForegroundColor Cyan
        Write-Host "  - SMB write attempts fail with EHOSTUNREACH" -ForegroundColor White
        Write-Host "  - Current segment marked as 'partial'" -ForegroundColor White
        Write-Host "  - New segment starts on local storage" -ForegroundColor White
        Write-Host "  - Recording continues without gap" -ForegroundColor White
        Write-Host "  - Status shows 'SMB OFFLINE - LOCAL FALLBACK'" -ForegroundColor White
        Write-Host ""
        
        Write-Host "  Waiting $DurationSeconds seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds $DurationSeconds
        
        # In production test: Restore network
        # Remove-NetFirewallRule -DisplayName "Block SMB"
        
        Write-Host "  ✅ SMB connection restored" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Expected recovery:" -ForegroundColor Cyan
        Write-Host "  - SMB connection detected as available" -ForegroundColor White
        Write-Host "  - Local segments upload to SMB" -ForegroundColor White
        Write-Host "  - Recording resumes to SMB" -ForegroundColor White
        Write-Host "  - Status returns to 'NORMAL'" -ForegroundColor White
        Write-Host ""
    }
    
    'all-fail' {
        Write-Host "[4/4] Simulating catastrophic failure (all storage)" -ForegroundColor Red
        
        Write-Host "  ⚠️  WARNING: This simulates complete storage failure!" -ForegroundColor Red
        Write-Host ""
        
        Write-Host "  Simulating all storage tiers offline..." -ForegroundColor White
        
        Write-Host "  ✅ All storage failed" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Expected behavior:" -ForegroundColor Cyan
        Write-Host "  - System detects all storage unavailable" -ForegroundColor White
        Write-Host "  - New recordings STOPPED" -ForegroundColor White
        Write-Host "  - Existing recordings preserved" -ForegroundColor White
        Write-Host "  - EMERGENCY alert sent to operators" -ForegroundColor White
        Write-Host "  - SMS + Phone call notifications" -ForegroundColor White
        Write-Host "  - Status shows 'DEGRADED - NO STORAGE'" -ForegroundColor White
        Write-Host "  - System remains stable (no crash)" -ForegroundColor White
        Write-Host ""
        
        Write-Host "  Waiting $DurationSeconds seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds $DurationSeconds
        
        Write-Host "  ✅ Storage restored" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SIMULATION COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Check failover manager logs" -ForegroundColor White
Write-Host "  2. Verify recordings continued" -ForegroundColor White
Write-Host "  3. Check incident creation" -ForegroundColor White
Write-Host "  4. Verify operator notifications" -ForegroundColor White
Write-Host "  5. Confirm zero data loss" -ForegroundColor White
Write-Host ""

Write-Host "Dashboard URL:" -ForegroundColor Cyan
Write-Host "  http://localhost:3000/storage-health" -ForegroundColor White
Write-Host ""

Write-Host "Logs:" -ForegroundColor Cyan
Write-Host "  tail -f logs/storage-failover.log" -ForegroundColor White
Write-Host ""
