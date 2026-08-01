# Edge Agent Troubleshooting Guide

## Current Status: ⚠️ Partially Working

The edge agent is running but encountering multiple issues that prevent full functionality.

---

## Issues Identified

### 🔴 Issue #1: Camera Authentication Failures (CRITICAL)

**Problem:**  
3 out of 4 cameras are rejecting ONVIF authentication with "Invalid username or password" errors.

**Affected Cameras:**
- `192.168.29.171` - Failing authentication (27 attempts remaining)
- `192.168.29.196` - ONVIF SOAP fault (authentication error)
- `192.168.29.46` - ONVIF SOAP fault (authentication error)

**Working Camera:**
- ✅ One camera (`IPC_NT98566_IPG-N4C-WQ2_S38`) is successfully discovered

**Current Config:**
```bash
CAMERA_USERNAME="admin"
CAMERA_PASSWORD="admin"
```

**Root Cause:**  
The cameras are not using the default `admin/admin` credentials. They may have:
- Custom passwords set during installation
- Manufacturer-specific defaults
- Empty passwords
- Different usernames

**Solution:**

1. **Find correct credentials:**
   ```powershell
   # Run the credential testing script
   .\test-camera-credentials.ps1 -CameraIP "192.168.29.171"
   ```

2. **Common defaults by manufacturer:**
   - **Hikvision**: `admin` / (empty) or `admin` / `12345`
   - **Dahua**: `admin` / `admin` or `admin` / `888888`
   - **CP Plus**: `admin` / `admin` or `admin` / `cp123`
   - **Provision ISR**: `admin` / `admin`

3. **Test credentials via browser:**
   - Navigate to `http://192.168.29.171`
   - Try logging in with different credentials
   - Note which one works

4. **Update config file:**
   ```powershell
   # Edit the config
   notepad "C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent-H1.env"
   
   # Update these lines:
   CAMERA_USERNAME="your_actual_username"
   CAMERA_PASSWORD="your_actual_password"
   ```

5. **Restart edge agent:**
   ```powershell
   Stop-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
   Start-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
   ```

---

### 🟡 Issue #2: Error Message Truncation (MEDIUM)

**Problem:**  
Edge agent sends error messages longer than 200 characters to the control plane API, which rejects them.

**Error Message:**
```json
{
  "error": "invalid_request",
  "details": {
    "fieldErrors": {
      "statusReason": ["String must contain at most 200 character(s)"]
    }
  }
}
```

**Root Cause:**  
In `edge-agent/src/index.ts` line 242, the code limits error messages to 500 characters:
```typescript
statusReason: message.slice(0, 500),  // ❌ TOO LONG!
```

But the API schema only allows 200 characters maximum.

**Solution:**  
✅ **FIXED** - Changed to:
```typescript
statusReason: message.slice(0, 200),  // ✓ Correct
```

**To Apply Fix:**
```powershell
# Rebuild the edge agent
cd C:\Omsystems\edge-agent
npm run build:exe

# The new executable will be in:
# C:\Omsystems\edge-agent\release\edge-agent.exe

# Replace the installed version:
# 1. Stop the scheduled task
Stop-ScheduledTask -TaskName "Sentinel Grid Edge Agent"

# 2. Copy new executable (requires admin)
Copy-Item "C:\Omsystems\edge-agent\release\edge-agent.exe" `
  -Destination "C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe" `
  -Force

# 3. Restart
Start-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
```

---

### 🟢 Issue #3: No Critical Errors Detected

**Status:**  
- ✅ Edge agent is registered: `e89264b4-9168-4b1b-8438-d61f7029668f`
- ✅ Branch ID configured: `00000000-0000-4000-8000-000000000104`
- ✅ Control plane connectivity: Working
- ✅ Bridge authentication: Successful
- ✅ Camera discovery: Running (finds 4 cameras)
- ✅ Heartbeat: Active (30-second intervals)

---

## Quick Diagnostic Commands

### Check Edge Agent Status
```powershell
# View scheduled task status
Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent"

# Check if process is running
Get-Process -Name "edge-agent" -ErrorAction SilentlyContinue

# View recent logs
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 50
```

### Run Comprehensive Diagnostics
```powershell
# Run the diagnostic script
.\diagnose-edge-agent.ps1
```

### Test Camera Connectivity
```powershell
# Test each camera
Test-Connection -ComputerName 192.168.29.171 -Count 2
Test-Connection -ComputerName 192.168.29.196 -Count 2
Test-Connection -ComputerName 192.168.29.46 -Count 2

# Test ONVIF port (80)
Test-NetConnection -ComputerName 192.168.29.171 -Port 80
```

---

## Configuration Files

### Main Config Location
```
C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent-H1.env
```

### Current Configuration
```bash
CONTROL_PLANE_URL="https://sentinel-grid-control-plane1.onrender.com"
EDGE_BRIDGE_SHARED_KEY="WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa"
EDGE_AGENT_ID="e89264b4-9168-4b1b-8438-d61f7029668f"
EDGE_AGENT_NAME="H1"
BRANCH_ID="00000000-0000-4000-8000-000000000104"
CAMERA_USERNAME="admin"        # ⚠️ NEEDS CORRECTION
CAMERA_PASSWORD="admin"        # ⚠️ NEEDS CORRECTION
```

### Log File Location
```
C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log
```

---

## Next Steps (Priority Order)

### 1. **Fix Camera Credentials** (CRITICAL)
- [ ] Test camera access via web browser for each IP
- [ ] Find correct username/password combinations
- [ ] Update edge-agent-H1.env config file
- [ ] Restart edge agent
- [ ] Verify all 4 cameras are discovered successfully

### 2. **Apply Error Truncation Fix** (RECOMMENDED)
- [ ] Rebuild edge agent with the fix
- [ ] Deploy updated executable
- [ ] Monitor logs to confirm error reporting works

### 3. **Monitor and Verify** (ONGOING)
- [ ] Check logs daily for authentication errors
- [ ] Verify heartbeat continues every 30 seconds
- [ ] Confirm all cameras are discovered
- [ ] Check dashboard shows camera status

---

## Common Camera Access Issues

### Camera Web Interface Not Accessible
**Problem:** Cannot access camera at `http://192.168.29.171`

**Possible Causes:**
1. IP address changed (DHCP lease expired)
2. Camera on different VLAN/network segment
3. Camera HTTP service disabled
4. Firewall blocking access

**Solutions:**
```powershell
# Use ONVIF discovery to find cameras
# (This is what the edge agent does automatically)

# Check your network configuration
ipconfig /all

# Ensure you're on the same subnet as cameras
# Cameras: 192.168.29.x
# Your PC should be: 192.168.29.y
```

### Too Many Failed Login Attempts
**Problem:** "You still have X attempts" message

**Solution:**
- Wait 30 minutes for lockout to reset
- OR reset camera to factory defaults (last resort)
- Cameras may permanently lock after attempts exhausted

---

## Security Best Practices

### After Fixing Credentials

1. **Change all default passwords:**
   - Each camera should have unique strong password
   - Use 12+ character passwords
   - Mix letters, numbers, symbols

2. **Network segmentation:**
   - Put cameras on separate VLAN
   - Restrict camera access to edge agent only
   - Block internet access from cameras

3. **Update camera firmware:**
   - Check manufacturer website for updates
   - Apply security patches regularly

4. **Monitor access logs:**
   - Review edge agent logs weekly
   - Look for unauthorized access attempts
   - Alert on repeated failures

---

## Contact & Support

### Log Files to Check
- Edge Agent: `C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log`
- Windows Event Log: Event Viewer → Application

### Useful Information for Support
```powershell
# Gather system info
Get-ComputerInfo | Select-Object OsName, OsVersion, OsArchitecture

# Network configuration
ipconfig /all

# Edge agent version
& "C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe" --version
```

---

## Summary

**Current Status:**
- ✅ Edge agent running and connected
- ✅ 1 camera successfully discovered
- ❌ 3 cameras failing authentication
- ⚠️ Error reporting issues (fixed, needs deployment)

**Main Action Required:**
**Find and configure correct camera credentials** - this will immediately fix 3 of 4 cameras.

**Estimated Time to Fix:**
- 15 minutes to test credentials
- 5 minutes to update config
- 2 minutes to restart agent
- **Total: ~22 minutes**

---

*Last Updated: 2026-07-31*
