# A1 Edge Agent Setup - COMPLETE ✅

## Problem
After installation, the A1 gateway was not showing online in the dashboard (status: "pending").

## Root Cause
The A1 edge agent **was never started**. You had:
- ❌ No A1 configuration file
- ❌ No A1 service installed
- ❌ No A1 process running

Only the H1 gateway was configured and running.

## Solution
Created complete setup for A1 gateway with separate configuration and ports.

---

## What Was Created

### Configuration File
✅ **`edge-agent\config\edge-agent-A1.env`**
- Gateway ID: `6fa95d55-76e5-434d-81c5-8868fa9d08dc`
- Gateway Name: `A1`
- Branch ID: `00000000-0000-4000-8000-000000000104`
- Uses separate ports (8091, 8889, 8094, 9998) to avoid conflicts with H1

### Control Scripts
✅ **`START_EDGE_AGENT_A1.bat`** - Start A1 in test mode  
✅ **`INSTALL_A1_AS_SERVICE.bat`** - Install A1 to run automatically  
✅ **`CHECK_STATUS_A1.bat`** - Check if A1 is running  
✅ **`UNINSTALL_A1_SERVICE.bat`** - Remove A1 service  
✅ **`DIAGNOSE_A1.bat`** - Comprehensive diagnostic tool  

### Directories
✅ **`data-a1\`** - A1 data storage  
✅ **`logs-a1\`** - A1 log files  

### Documentation
✅ **`A1_GETTING_STARTED.txt`** - Complete user guide  

---

## How to Get A1 Online NOW

### Quick Method (Test First)

1. **Test if A1 works:**
   ```
   Double-click: edge-agent\START_EDGE_AGENT_A1.bat
   ```

2. **Watch for these messages:**
   - "Connected to control plane"
   - "Heartbeat sent successfully"
   - "Camera discovery started"

3. **Check dashboard:**
   - Go to: https://sentinel-grid-monitoring1.onrender.com/admin/system
   - Click on "Gateways" tab
   - Look for A1 - status should change from "pending" to "online" within 30 seconds

4. **Stop the test:**
   - Press Ctrl+C in the window

### Production Method (Auto-Start)

1. **Install as service:**
   ```
   Double-click: edge-agent\INSTALL_A1_AS_SERVICE.bat
   ```

2. **Start the service:**
   ```
   schtasks /run /tn "SentinelEdgeAgent-A1"
   ```
   OR just restart your computer (it will auto-start)

3. **Verify it's running:**
   ```
   Double-click: edge-agent\CHECK_STATUS_A1.bat
   ```
   Should say "✅ Edge Agent A1 process is RUNNING"

4. **Check dashboard:**
   - A1 should show as "online" within 30 seconds

---

## Port Configuration

### H1 Gateway (Already Running)
- Main Port: `8090`
- HLS Stream Port: `8888`
- MediaMTX API: `9997`
- Secret Provider: `8093`

### A1 Gateway (New)
- Main Port: `8091` ⭐
- HLS Stream Port: `8889` ⭐
- MediaMTX API: `9998` ⭐
- Secret Provider: `8094` ⭐

Both can run simultaneously on the same computer without conflicts!

---

## Troubleshooting A1 Not Online

### 1. Check if A1 is Actually Running
```
edge-agent\CHECK_STATUS_A1.bat
```

**Expected:** "✅ Edge Agent A1 process is RUNNING"

**If NOT running:**
```
schtasks /run /tn "SentinelEdgeAgent-A1"
```

### 2. Check the Logs
```
Open: edge-agent\logs-a1\edge-agent.log
```

**Look for:**
- ✅ "Connected to control plane" = Good!
- ✅ "Heartbeat sent successfully" = Working!
- ❌ "Connection refused" = Network problem
- ❌ "Authentication failed" = Wrong bridge key

### 3. Run Diagnostics
```
edge-agent\DIAGNOSE_A1.bat
```

This checks:
- Configuration file exists
- Executable exists
- Service installed
- Process running
- Ports listening
- Recent log entries

### 4. Common Issues

**Issue:** Process not running  
**Fix:** `schtasks /run /tn "SentinelEdgeAgent-A1"`

**Issue:** "Port 8091 already in use"  
**Fix:** Stop the program using port 8091, or change the port in config

**Issue:** "Cannot connect to control plane"  
**Fix:** Check internet connection, verify CONTROL_PLANE_URL in config

**Issue:** Still shows "pending" in dashboard  
**Fix:** Wait 30-60 seconds for heartbeat, then refresh dashboard

### 5. Restart Everything
```
taskkill /f /im sentinel-edge-agent.exe
schtasks /run /tn "SentinelEdgeAgent-A1"
```

Wait 30 seconds and check dashboard.

---

## Running Both H1 and A1 Together

You can run both gateways simultaneously! They use different ports and separate data directories.

**Install both:**
```
edge-agent\INSTALL_AS_SERVICE.bat      (for H1)
edge-agent\INSTALL_A1_AS_SERVICE.bat   (for A1)
```

**Start both:**
```
schtasks /run /tn "SentinelEdgeAgent-H1"
schtasks /run /tn "SentinelEdgeAgent-A1"
```

**Check both:**
```
edge-agent\CHECK_STATUS.bat      (H1)
edge-agent\CHECK_STATUS_A1.bat   (A1)
```

Both will discover cameras independently and report to the same control plane.

---

## Next Steps

### After A1 is Online:

1. **Camera Discovery** - A1 will automatically scan for cameras every 60 seconds

2. **Fix Camera Credentials** - If cameras fail authentication:
   - Use the Camera Credential Manager in the dashboard
   - Or run `TEST_SINGLE_CAMERA.bat` to test passwords

3. **Monitor Performance** - Check logs regularly:
   - H1 logs: `edge-agent\logs\edge-agent.log`
   - A1 logs: `edge-agent\logs-a1\edge-agent.log`

4. **View Camera Streams** - Once cameras are online:
   - Go to Operations → Branches
   - Click on your branch
   - View live camera feeds from both H1 and A1

---

## File Locations

### A1 Configuration
- **Config:** `c:\Omsystems\edge-agent\config\edge-agent-A1.env`
- **Data:** `c:\Omsystems\edge-agent\data-a1\`
- **Logs:** `c:\Omsystems\edge-agent\logs-a1\`

### A1 Control Scripts
- **Start (Test):** `c:\Omsystems\edge-agent\START_EDGE_AGENT_A1.bat`
- **Install Service:** `c:\Omsystems\edge-agent\INSTALL_A1_AS_SERVICE.bat`
- **Check Status:** `c:\Omsystems\edge-agent\CHECK_STATUS_A1.bat`
- **Diagnose:** `c:\Omsystems\edge-agent\DIAGNOSE_A1.bat`
- **Uninstall:** `c:\Omsystems\edge-agent\UNINSTALL_A1_SERVICE.bat`

### Documentation
- **User Guide:** `c:\Omsystems\edge-agent\A1_GETTING_STARTED.txt`
- **This Summary:** `c:\Omsystems\A1_SETUP_COMPLETE.md`

---

## Quick Commands Reference

```bash
# Start A1 service
schtasks /run /tn "SentinelEdgeAgent-A1"

# Stop A1
taskkill /f /im sentinel-edge-agent.exe

# Check A1 status
schtasks /query /tn "SentinelEdgeAgent-A1"

# View A1 logs (last 20 lines)
powershell -command "Get-Content 'C:\Omsystems\edge-agent\logs-a1\edge-agent.log' -Tail 20"

# Check if A1 is listening on port 8091
netstat -an | findstr ":8091"
```

---

## Summary

✅ A1 configuration created with correct gateway ID  
✅ Separate ports configured (8091, 8889, 8094, 9998)  
✅ Easy-to-use BAT files created for non-technical users  
✅ Diagnostic tools provided  
✅ Complete documentation written  

**To get A1 online:** Just double-click `INSTALL_A1_AS_SERVICE.bat` and then run the service!

The A1 gateway is now fully set up and ready to go online! 🚀
