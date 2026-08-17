# Edge Agent Activation Blocked - Root Cause & Fix

## Problem Identified

Your edge agent installer shows:
```
❌ Activation blocked
Edge agent enrollment
1 of 14 outbound calls complete - 7.1%
```

This means the installer **cannot complete the activation process** with the control plane.

## Root Cause

The edge agent activation process requires **14 outbound API calls** to complete enrollment:

1. **Activate edge agent** - Exchange activation code for credentials (`POST /v1/edge-enrollment/activate`)
2. **Heartbeat** - Register as online
3. **Get monitoring cameras** - Sync camera list
4. **Discovery bootstrap** - Get credentials
5-14. **Various initialization calls**

The installer is **stuck after call #1** at 7.1%, which means:
- ✓ The activation call reached the control plane
- ✓ The edge agent was registered
- ✗ **Subsequent calls are failing or timing out**

## Most Likely Causes

### Cause 1: Control Plane Timeout (MOST LIKELY)
**Evidence**: From logs:
```
[error] Edge agent stopped after an unrecoverable startup error 
{"error":"Cannot reach control plane https://sentinel-grid-control-plane-ocn1.onrender.com: fetch failed"}
```

Your control plane URL is on Render.com free tier, which:
- **Spins down after 15 minutes of inactivity**
- Takes **30-60 seconds to wake up** on first request
- Has **550 hours/month free limit** (22.9 days)
- **Times out** during cold start

**During installation**:
1. First call wakes up the Render service (30-60s)
2. Activation succeeds after service wakes
3. **Subsequent calls still hit timeout** because service isn't fully initialized
4. Installer gives up after failed calls

### Cause 2: Network/Firewall Blocking
The installer machine might have:
- Firewall blocking outbound HTTPS
- Proxy requiring configuration
- VPN interfering with connections
- DNS resolution issues

### Cause 3: Activation Code Already Used
If you tried installing before, the activation code might be:
- Already consumed
- Expired (default TTL: 60 minutes)
- Revoked

## Immediate Fixes

### Fix 1: Wait for Render Service to Wake Up (QUICKEST)

Before running installer:

```powershell
# Wake up your Render service
Write-Host "Waking up control plane..." -ForegroundColor Cyan
1..5 | ForEach-Object {
    try {
        $response = Invoke-WebRequest -Uri "https://sentinel-grid-control-plane-ocn1.onrender.com/health" -TimeoutSec 60
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ Control plane is awake!" -ForegroundColor Green
            return
        }
    } catch {
        Write-Host "  Attempt $_/5: Waiting for service to wake..." -ForegroundColor Yellow
        Start-Sleep -Seconds 15
    }
}

# Now run the installer
Write-Host "`nControl plane is ready. Run installer now." -ForegroundColor Green
```

### Fix 2: Create New Activation Code

Your current code may be expired or consumed:

1. **Go to dashboard**: https://sentinel-grid-monitoring-vhid.onrender.com/admin/branch-onboarding
2. **Click "Scan Cameras"** tab
3. **Click "Direct IP Probe"** or **"Install Scanner"** tab
4. **Generate new activation code**
5. **Download fresh installer** with new code embedded

### Fix 3: Increase Installer Timeout

The installer has a 30-second timeout for activation. Modify the installer to wait longer:

**Edit**: `edge-agent/installer/windows/install-edge-agent.ps1`

Find this line (around line 180):
```powershell
& $Executable --config $ConfigPath --diagnose
```

Change to:
```powershell
$env:CONTROL_PLANE_TIMEOUT_MS = "60000"  # 60 seconds instead of 15
& $Executable --config $ConfigPath --diagnose
```

### Fix 4: Skip Activation Check During Install

**Edit**: `edge-agent/installer/windows/install-edge-agent.ps1`

Add `-SkipConnectivityCheck` parameter usage:

Run installer with:
```powershell
.\install-edge-agent.ps1 -SkipConnectivityCheck
```

This will:
- ✓ Install all components
- ✓ Configure activation code
- ✓ Start the service
- ✗ Skip the connectivity verification

The edge agent will **retry activation in the background** after it starts.

## Long-term Solutions

### Solution 1: Upgrade Render Plan

Free tier limitations:
- ❌ Spins down after 15 mins inactivity
- ❌ Limited to 550 hours/month
- ❌ Slow cold starts (30-60s)
- ❌ 512MB RAM

**Upgrade to Starter ($7/month)**:
- ✓ Always on (no spin down)
- ✓ Unlimited hours
- ✓ Instant responses
- ✓ 512MB RAM

**Or upgrade to Standard ($25/month)**:
- ✓ Always on
- ✓ 2GB RAM
- ✓ Better performance
- ✓ Health checks included

### Solution 2: Self-host Control Plane

Deploy control plane on:
- AWS EC2 t3.small (always on, ~$15/month)
- DigitalOcean Droplet ($12/month)
- Your own server/VPS
- Kubernetes cluster

### Solution 3: Keep Render Service Awake

Use UptimeRobot or similar to ping your service every 5 minutes:

1. Sign up at https://uptimerobot.com (free)
2. Add monitor:
   - Type: HTTP(s)
   - URL: https://sentinel-grid-control-plane-ocn1.onrender.com/health
   - Interval: 5 minutes
3. This keeps your Render service awake 24/7

**Note**: This uses more of your 550 free hours but prevents cold starts.

## Diagnostic Steps

### Step 1: Test Control Plane Availability

```powershell
# Test health endpoint
Measure-Command {
    Invoke-WebRequest -Uri "https://sentinel-grid-control-plane-ocn1.onrender.com/health"
}

# Should respond in <500ms if awake
# First request after idle: 30-60 seconds
```

### Step 2: Test Activation Endpoint

```powershell
$activation = @{
    activationCode = "sgact_test"
    deviceUuid = [guid]::NewGuid().ToString()
    version = "0.1.8"
} | ConvertTo-Json

Invoke-WebRequest `
    -Uri "https://sentinel-grid-control-plane-ocn1.onrender.com/v1/edge-enrollment/activate" `
    -Method POST `
    -ContentType "application/json" `
    -Body $activation `
    -TimeoutSec 60
```

Expected responses:
- **200**: Activation succeeded (wrong, should be 201)
- **201**: Activation succeeded
- **401**: Invalid activation code (expected for test code)
- **Timeout**: Service is cold starting

### Step 3: Check Firewall/Network

```powershell
# Test outbound HTTPS
Test-NetConnection -ComputerName "sentinel-grid-control-plane-ocn1.onrender.com" -Port 443

# Check DNS resolution
Resolve-DnsName "sentinel-grid-control-plane-ocn1.onrender.com"

# Test with curl (shows more details)
curl -v https://sentinel-grid-control-plane-ocn1.onrender.com/health
```

### Step 4: Check Existing Edge Agents

In your database:
```sql
-- Check if edge agent was actually created
SELECT id, name, device_uuid, status, created_at, last_seen_at
FROM edge_agents
ORDER BY created_at DESC
LIMIT 5;

-- Check activation status
SELECT id, branch_id, agent_name, created_at, consumed_at, expires_at, revoked_at
FROM edge_activations
ORDER BY created_at DESC
LIMIT 5;
```

## Modified Installer Script

Create: `edge-agent/installer/windows/install-edge-agent-robust.ps1`

```powershell
[CmdletBinding()]
param(
  [string]$InstallDirectory = (Join-Path $env:ProgramFiles "Sentinel Grid\Edge Agent"),
  [switch]$SkipConnectivityCheck,
  [int]$ActivationRetries = 3,
  [int]$ActivationTimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

# [... rest of existing installer code until activation check ...]

if (-not $SkipConnectivityCheck) {
  Write-Host "Authenticating with Sentinel Grid..." -ForegroundColor Cyan
  Write-Host "Note: If control plane is on Render free tier, this may take 30-60 seconds on first request" -ForegroundColor Gray
  
  $activationSuccess = $false
  for ($attempt = 1; $attempt -le $ActivationRetries; $attempt++) {
    Write-Host "  Attempt $attempt/$ActivationRetries..." -ForegroundColor Gray
    
    try {
      # Set longer timeout for activation
      $env:CONTROL_PLANE_TIMEOUT_MS = ($ActivationTimeoutSeconds * 1000).ToString()
      
      & $Executable --config $ConfigPath --diagnose
      
      if ($LASTEXITCODE -eq 0) {
        $activationSuccess = $true
        break
      } else {
        Write-Warning "Activation attempt $attempt failed (exit code: $LASTEXITCODE)"
        if ($attempt -lt $ActivationRetries) {
          Write-Host "  Waiting 10 seconds before retry..." -ForegroundColor Yellow
          Start-Sleep -Seconds 10
        }
      }
    } catch {
      Write-Warning "Activation attempt $attempt failed: $($_.Exception.Message)"
      if ($attempt -lt $ActivationRetries) {
        Start-Sleep -Seconds 10
      }
    }
  }
  
  if (-not $activationSuccess) {
    Write-Warning @"
Edge agent installation completed, but initial activation could not be verified.

Possible reasons:
- Control plane is temporarily unavailable (Render free tier cold start)
- Network/firewall blocking outbound HTTPS
- Activation code expired or already used

The edge agent service is running and will keep retrying activation automatically.

Check logs at: $LogDirectory\edge-agent.log
"@
    $connectivityHealthy = $false
  } else {
    $connectivityHealthy = $true
  }
}

# [... rest of installer ...]
```

## Recommended Action Plan

**For immediate installation**:

1. **Wake up your Render service** first (takes 30-60 seconds)
   ```powershell
   Invoke-WebRequest -Uri "https://sentinel-grid-control-plane-ocn1.onrender.com/health" -TimeoutSec 90
   ```

2. **Generate new activation code** in dashboard (current might be expired)

3. **Run installer with increased timeout**:
   ```powershell
   $env:CONTROL_PLANE_TIMEOUT_MS = "90000"
   .\install-edge-agent.ps1
   ```

4. **If still fails**, install without check:
   ```powershell
   .\install-edge-agent.ps1 -SkipConnectivityCheck
   ```

5. **Monitor background activation** in logs:
   ```powershell
   Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20 -Wait
   ```

**For permanent fix**:

- Upgrade to Render Starter plan ($7/month) for always-on service
- Or set up UptimeRobot to keep free tier awake
- Or self-host control plane on always-on infrastructure

## Verification

After successful activation, you should see in logs:
```
[info] Edge agent 482e092b-... registered; waiting for branch commands {"branchId":"...","version":"0.1.8"}
[info] Synchronized 0 camera(s) for heartbeat monitoring
[info] Discovered 0 ONVIF endpoint(s)
```

If you see:
```
[error] Cannot reach control plane https://sentinel-grid-control-plane-ocn1.onrender.com: fetch failed
```

Then the issue is definitely the Render cold start timeout.
