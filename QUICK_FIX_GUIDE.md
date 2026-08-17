# Quick Fix Guide - Edge Agent Installation

## Your Problem: "Activation blocked" at 7.1%

## Root Cause: Render Services Cold Starting

Your services are on Render free tier, which spin down after 15 minutes. The installer times out waiting for them to wake up.

## ⚡ Quick Fix (5 Minutes)

### Step 1: Wake Up Services
```powershell
cd C:\Omsystems
.\scripts\verify-render-urls.ps1 -WakeServices
```

Wait for: **"✓ All services are healthy!"**

### Step 2: Run Installer Immediately
While services are still warm (within 15 minutes), run your installer.

**That's it!** Installation should complete successfully now.

---

## Alternative: Skip Activation Check

If Step 1 doesn't work, install without connectivity check:

```powershell
.\install-edge-agent.ps1 -SkipConnectivityCheck
```

The service will activate automatically in the background.

---

## Still Not Working?

### Option A: Get Fresh Activation Code

Your activation code might be expired (60-minute TTL):

1. Open: https://sentinel-grid-monitoring-vhid.onrender.com/admin/branch-onboarding
2. Click **"Install Scanner"** tab  
3. Generate **new activation code**
4. Download **fresh installer**
5. Run it (make sure to wake services first!)

### Option B: Update Render Environment Variables

Your services might still have old URLs configured:

1. Go to: https://dashboard.render.com
2. For each service, update environment variables:

**Control Plane** (sentinel-grid-control-plane-ocn1):
```
CONTROL_PLANE_PUBLIC_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
```

**Dashboard** (sentinel-grid-monitoring-vhid):
```
CONTROL_PLANE_API_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
```

3. Click **"Save Changes"**
4. Wait for automatic redeploy
5. Try installation again

---

## Understanding the Issue

**What happens during installation:**

1. **Call 1/14**: Activate edge agent ✅ (7.1% - THIS WORKS)
2. **Call 2/14**: Heartbeat ❌ (TIMES OUT - service still cold)
3. Installer gives up

**Why it happens:**

- First call wakes Render service (takes 30-60 seconds)
- Service responds to call #1 as it's waking
- Call #2 happens while service is still initializing
- Installer timeout (15 seconds) < Service startup time (30-60 seconds)
- Result: "Activation blocked"

**The fix:**

Wake service BEFORE running installer, so all 14 calls succeed.

---

## Long-term Solution

**Problem**: Free tier spins down after 15 minutes of inactivity

**Solutions** (pick one):

### Solution 1: Upgrade Render Plan ($7/month)
- Services stay awake 24/7
- No cold starts
- Instant responses
- Go to: https://dashboard.render.com → Service → Settings → Plan

### Solution 2: Keep Free Tier Awake
Use UptimeRobot to ping every 5 minutes:

1. Sign up: https://uptimerobot.com (free)
2. Add monitors:
   - https://sentinel-grid-monitoring-vhid.onrender.com/health
   - https://sentinel-grid-control-plane-ocn1.onrender.com/health
   - https://sentinel-grid-analytics-engine-j0py.onrender.com/health
   - https://sentinel-grid-media-gateway-04ae.onrender.com/health
3. Set interval: 5 minutes
4. Services stay warm 24/7 (but uses your 550 free hours faster)

---

## Verification Commands

### Check if services are awake:
```powershell
# Quick test
Invoke-WebRequest -Uri "https://sentinel-grid-control-plane-ocn1.onrender.com/health"

# If timeout, run:
.\scripts\verify-render-urls.ps1 -WakeServices
```

### Check edge agent after installation:
```powershell
# View logs
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20

# Should see:
# [info] Edge agent <id> registered; waiting for branch commands
# [info] Synchronized 0 camera(s) for heartbeat monitoring

# NOT:
# [error] Cannot reach control plane
```

### Verify installation completed:
```powershell
Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
# Should show: State = Running
```

---

## Success Indicators

Installation **succeeded** when you see:

1. ✅ Scheduled task created and running
2. ✅ Logs show: "Edge agent registered"
3. ✅ No "Cannot reach control plane" errors
4. ✅ Camera discovery starts automatically

Installation **failed** if you see:

1. ❌ "Activation blocked" at 7.1%
2. ❌ Logs show: "Cannot reach control plane: fetch failed"
3. ❌ Task exists but immediately exits

---

## Summary

**Problem**: Render cold start timeout  
**Quick Fix**: Wake services before installing  
**Command**: `.\scripts\verify-render-urls.ps1 -WakeServices`  
**Then**: Run installer immediately (within 15 minutes)  
**Result**: Installation succeeds ✅

---

## Need Help?

Run diagnostics:
```powershell
# Check all services
.\scripts\verify-render-urls.ps1

# Check installation
.\edge-agent\scripts\verify-installation.ps1

# Check logs
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 50
```

All scripts are in: `C:\Omsystems\scripts\`
