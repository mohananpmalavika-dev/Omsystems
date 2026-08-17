# Installer Hung - Quick Fix

## What Happened

Your installer is **stuck/hung** after validating the configuration. It's waiting for the control plane to respond but timing out (Render cold start issue).

## Immediate Actions

### Step 1: Close the Hung PowerShell Window

Just **close the PowerShell window** or press `Ctrl+C` multiple times.

If it won't close:
```powershell
# Open a NEW PowerShell as Administrator
# Run:
.\scripts\kill-hung-installer.ps1
```

### Step 2: Check What Was Installed

The installer may have installed files before hanging. Check:

```powershell
.\scripts\simple-error-check.ps1
```

### Step 3: Install with Connectivity Check Skipped

This avoids the hang:

```powershell
# In NEW PowerShell as Administrator
cd C:\Omsystems
.\scripts\install-skip-connectivity-check.ps1
```

This will:
- ✅ Install all components
- ✅ Start the service
- ✅ **Skip the connectivity test that causes hangs**
- ✅ Service activates in background automatically

## Why It Hangs

The installer runs this command:
```powershell
edge-agent.exe --config <path> --diagnose
```

This tries to contact the control plane to verify connectivity. But:
- Control plane is on Render free tier
- It's cold (spun down after 15 mins idle)
- Takes 30-60 seconds to wake
- Installer timeout is 30 seconds
- **Result**: Hangs waiting for response

## The Solution

Use `-SkipConnectivityCheck` parameter which:
- Skips the `--diagnose` step
- Installs everything
- Starts the service
- **Service handles activation in background** (it has longer timeouts)

## Quick Commands

```powershell
# If installer is hung right now:
# 1. Close PowerShell window (or Ctrl+C)

# 2. Open new PowerShell as Admin
cd C:\Omsystems

# 3. Check what's installed
.\scripts\simple-error-check.ps1

# 4. If partially installed, uninstall first
.\scripts\uninstall-edge-agent.ps1

# 5. Wake services
.\scripts\verify-render-urls.ps1 -WakeServices

# 6. Install WITHOUT connectivity check
.\scripts\install-skip-connectivity-check.ps1
```

## Alternative: Just Let It Time Out

Sometimes the installer WILL eventually time out (after ~2 minutes) and:
- Either succeed (if control plane woke up)
- Or show error message

You can wait it out if you prefer.

## After Installation (Without Connectivity Check)

The service runs and activates in background. Check logs:

```powershell
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20 -Wait
```

Look for:
```
[info] Edge agent <id> registered; waiting for branch commands
```

This means activation succeeded in the background!

## Preventing This Issue

### Option 1: Always Skip Connectivity Check
```powershell
.\scripts\install-skip-connectivity-check.ps1
```

### Option 2: Wake Services First (Then Install Normally)
```powershell
# Wake services and wait for "all healthy"
.\scripts\verify-render-urls.ps1 -WakeServices

# Then immediately install (while services still warm)
.\edge-agent\installer\windows\install-edge-agent.ps1
```

### Option 3: Modify Installer Timeout

Edit: `edge-agent/installer/windows/install-edge-agent.ps1`

Find this section (around line 180):
```powershell
Write-Host "Authenticating with Sentinel Grid..." -ForegroundColor Cyan
& $Executable --config $ConfigPath --diagnose
```

Change to:
```powershell
Write-Host "Authenticating with Sentinel Grid..." -ForegroundColor Cyan
# Set longer timeout for Render cold start
$env:CONTROL_PLANE_TIMEOUT_MS = "90000"  # 90 seconds instead of default 15
& $Executable --config $ConfigPath --diagnose
```

## Recommended Approach

**For testing now**:
```powershell
# 1. Close hung installer
# 2. Uninstall any partial installation
.\scripts\uninstall-edge-agent.ps1

# 3. Wake services
.\scripts\verify-render-urls.ps1 -WakeServices

# 4. Install WITHOUT connectivity check (fastest, no hang)
.\scripts\install-skip-connectivity-check.ps1

# 5. Watch logs to see it activate
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20 -Wait
```

## Summary

- ❌ Normal installer hangs on connectivity check (Render cold start)
- ✅ Use `-SkipConnectivityCheck` to avoid hang
- ✅ Service activates successfully in background
- ✅ Result is identical - working edge agent!

The `-SkipConnectivityCheck` flag is **the best solution** for Render free tier deployments!
