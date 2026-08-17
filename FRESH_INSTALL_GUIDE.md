# Fresh Edge Agent Installation Guide

## Complete Reset and Reinstall Instructions

Follow these steps to completely remove the current installation and test from scratch.

---

## Step 1: Uninstall Current Edge Agent

**Run as Administrator:**

```powershell
cd C:\Omsystems
.\scripts\uninstall-edge-agent.ps1
```

This will:
- ✓ Stop the scheduled task
- ✓ Remove all files
- ✓ Delete configuration
- ✓ Remove firewall rules
- ✓ Clean up temporary files

**Expected Output:**
```
✓ Edge Agent has been completely removed
🎉 Clean uninstall verified - ready for fresh installation!
```

---

## Step 2: Wake Up Render Services

Before installing, make sure all services are awake:

```powershell
.\scripts\verify-render-urls.ps1 -WakeServices
```

**Expected Output:**
```
Services: 4/4 healthy (100%)
✓ All services are healthy!
```

⏰ **Important**: Services stay awake for ~15 minutes. If installation takes longer, you may need to wake them again.

---

## Step 3: Get Fresh Activation Code

Your old activation code may be expired or consumed.

1. **Open Dashboard**: https://sentinel-grid-monitoring-vhid.onrender.com/admin/branch-onboarding
2. **Click**: "Install Scanner" tab
3. **Generate**: New activation code
4. **Download**: Fresh installer package

OR manually note the activation code to use with existing installer.

---

## Step 4: Install Edge Agent

### Option A: Install with Full Logging (Recommended)

```powershell
# Make sure you're in Administrator PowerShell!
cd C:\Omsystems
.\scripts\install-with-logging.ps1 -InstallerPath ".\edge-agent\installer\windows\install-edge-agent.ps1"
```

This wrapper will:
- ✓ Check if running as admin
- ✓ Verify control plane is reachable
- ✓ Capture all output to log file
- ✓ Show clear success/failure messages

### Option B: Run Installer Directly

```powershell
cd C:\Omsystems\edge-agent\installer\windows
.\install-edge-agent.ps1
```

### Option C: Use Downloaded Installer

If you downloaded a fresh installer from the dashboard:
```powershell
# Navigate to Downloads folder
cd $env:USERPROFILE\Downloads

# Find the installer (might be .exe or .ps1)
.\Sentinel-Grid-Edge-Agent-Installer.exe
# OR
.\install-edge-agent.ps1
```

---

## Step 5: Verify Installation

After installation completes:

```powershell
.\scripts\simple-error-check.ps1
```

**Expected Results:**
```
[OK] Installation directory exists
[OK] edge-agent.exe found
[OK] Configuration file found
[OK] Scheduled task exists
State: Running
```

---

## Step 6: Check Edge Agent Logs

View real-time logs to see if it's working:

```powershell
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20 -Wait
```

**What to Look For:**

✅ **Success Indicators:**
```
[info] Edge agent <id> registered; waiting for branch commands
[info] Synchronized X camera(s) for heartbeat monitoring
[info] Discovered X ONVIF endpoint(s)
```

❌ **Error Indicators:**
```
[error] Cannot reach control plane
[error] Edge agent stopped after an unrecoverable startup error
```

If you see errors, press `Ctrl+C` to stop viewing logs and check troubleshooting below.

---

## Step 7: Verify in Dashboard

1. **Open Dashboard**: https://sentinel-grid-monitoring-vhid.onrender.com
2. **Navigate to**: Edge Agents section
3. **Check**: Your edge agent should appear as "Online"
4. **Navigate to**: Cameras section
5. **Check**: Discovered cameras should appear

---

## Troubleshooting

### Issue: "Run this installer from an Administrator PowerShell window"

**Fix:**
1. Right-click **PowerShell**
2. Select **"Run as Administrator"**
3. Run installer again

### Issue: "Cannot reach control plane"

**Fix:**
```powershell
# Wake services first
.\scripts\verify-render-urls.ps1 -WakeServices

# Wait for "All services healthy"
# Then retry installation within 15 minutes
```

### Issue: "The activation code must start with sgact_"

**Fix:**
- Generate new activation code from dashboard
- Old code expired or already used

### Issue: Installation completes but task exits immediately

**Check logs:**
```powershell
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 50
```

**Common causes:**
- Wrong control plane URL
- Invalid activation code
- Network/firewall blocking

### Issue: Analytics 429 Errors (like before)

**This is OK!** - Not a failure. See `FIX_ANALYTICS_429_ERROR.md`

The edge agent is working. Analytics engine just can't handle the load on free tier.

---

## Quick Command Reference

```powershell
# Uninstall
.\scripts\uninstall-edge-agent.ps1

# Wake services
.\scripts\verify-render-urls.ps1 -WakeServices

# Install with logging
.\scripts\install-with-logging.ps1 -InstallerPath ".\edge-agent\installer\windows\install-edge-agent.ps1"

# Check status
.\scripts\simple-error-check.ps1

# View logs (real-time)
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20 -Wait

# Check scheduled task
Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent"

# Restart edge agent
Restart-ScheduledTask -TaskName "Sentinel Grid Edge Agent"

# Stop edge agent
Stop-ScheduledTask -TaskName "Sentinel Grid Edge Agent"

# Start edge agent
Start-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
```

---

## Complete Fresh Install Sequence

**All commands in one place:**

```powershell
# 1. Open PowerShell as Administrator
# 2. Navigate to project
cd C:\Omsystems

# 3. Uninstall current installation
.\scripts\uninstall-edge-agent.ps1

# 4. Wake services
.\scripts\verify-render-urls.ps1 -WakeServices

# 5. Install (once services are awake)
.\scripts\install-with-logging.ps1 -InstallerPath ".\edge-agent\installer\windows\install-edge-agent.ps1"

# 6. Verify
.\scripts\simple-error-check.ps1

# 7. Watch logs
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20 -Wait
```

---

## Expected Timeline

- **Uninstall**: ~30 seconds
- **Wake services**: 30-90 seconds (first time), ~5 seconds (if already awake)
- **Installation**: 2-5 minutes
- **Verification**: ~30 seconds

**Total**: ~5-10 minutes for complete fresh install

---

## Success Criteria

Installation is successful when:

1. ✅ Scheduled task exists and is "Running"
2. ✅ Logs show "Edge agent registered"
3. ✅ No "Cannot reach control plane" errors
4. ✅ Edge agent appears "Online" in dashboard
5. ✅ Cameras are discovered (may take a few minutes)

Analytics 429 errors are **not failures** - just warnings that analytics engine is overloaded.

---

## After Successful Installation

1. **Approve cameras** in dashboard (change status to 'active')
2. **Test live video** for each camera
3. **Check analytics** are working (if engine upgraded)

---

## Need Help?

If installation fails:

1. **Run diagnostics**: `.\scripts\simple-error-check.ps1`
2. **Check logs**: View edge-agent.log
3. **Check services**: `.\scripts\verify-render-urls.ps1`
4. **Review documentation**:
   - `EDGE_ACTIVATION_BLOCKED_FIX.md` - Activation issues
   - `FIX_ANALYTICS_429_ERROR.md` - Analytics warnings
   - `EDGE_AGENT_TROUBLESHOOTING.md` - General troubleshooting

---

## Notes

- **Always run PowerShell as Administrator** for installation/uninstallation
- **Wake services before installing** to avoid timeout errors
- **Generate fresh activation code** if previous one was used
- **Analytics 429 errors are not fatal** - core functionality still works
- **Services on Render free tier** need to be kept awake or upgraded

---

Good luck with your fresh installation! 🚀
