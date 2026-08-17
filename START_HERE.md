# 🚀 START HERE - Fresh Edge Agent Installation

## One-Command Installation

**Right-click** `RESET_AND_INSTALL.bat` and select **"Run as Administrator"**

This will automatically:
1. ✅ Remove old installation
2. ✅ Wake up services
3. ✅ Install fresh
4. ✅ Verify everything works

---

## Manual Step-by-Step

If you prefer manual control:

### Step 1: Uninstall
```powershell
# Right-click PowerShell → Run as Administrator
cd C:\Omsystems
.\scripts\uninstall-edge-agent.ps1
```

### Step 2: Wake Services
```powershell
.\scripts\verify-render-urls.ps1 -WakeServices
```

### Step 3: Install
```powershell
.\scripts\install-with-logging.ps1 -InstallerPath ".\edge-agent\installer\windows\install-edge-agent.ps1"
```

### Step 4: Verify
```powershell
.\scripts\simple-error-check.ps1
```

---

## Quick Commands

```powershell
# One command - complete reset and install
.\RESET_AND_INSTALL.ps1

# Check if services are awake
.\scripts\verify-render-urls.ps1

# View logs in real-time
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20 -Wait

# Check installation status
.\scripts\simple-error-check.ps1

# Restart edge agent
Restart-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
```

---

## Your URLs

- **Dashboard**: https://sentinel-grid-monitoring-vhid.onrender.com
- **Control Plane**: https://sentinel-grid-control-plane-ocn1.onrender.com
- **Analytics Engine**: https://sentinel-grid-analytics-engine-j0py.onrender.com
- **Media Gateway**: https://sentinel-grid-media-gateway-04ae.onrender.com

---

## Documentation

- **`FRESH_INSTALL_GUIDE.md`** - Complete installation guide
- **`QUICK_FIX_GUIDE.md`** - Quick troubleshooting
- **`EDGE_ACTIVATION_BLOCKED_FIX.md`** - Activation issues
- **`FIX_ANALYTICS_429_ERROR.md`** - Analytics warnings
- **`RENDER_URLS_CONFIG.md`** - URL configuration

---

## Need Help?

**Installation fails?**
1. Check: `.\scripts\simple-error-check.ps1`
2. Read: `FRESH_INSTALL_GUIDE.md`
3. Review logs

**Analytics 429 errors?**
- This is OK! Not a failure.
- See: `FIX_ANALYTICS_429_ERROR.md`

**Services not responding?**
```powershell
.\scripts\verify-render-urls.ps1 -WakeServices
```

---

## Success Checklist

✅ Scheduled task "Sentinel Grid Edge Agent" is Running  
✅ Logs show "Edge agent registered"  
✅ No "Cannot reach control plane" errors  
✅ Edge agent shows "Online" in dashboard  
✅ Cameras are discovered  

---

Good luck! 🎉
