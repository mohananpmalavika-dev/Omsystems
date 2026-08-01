# Edge Agent Showing Offline - ROOT CAUSE FOUND

## 🔴 PROBLEM IDENTIFIED

**The edge agent is NOT RUNNING!**

### Evidence:

1. **Last heartbeat:** 13+ hours ago (802 minutes)
   ```
   Last Seen: Fri Jul 31 2026 23:42:55 GMT+0530
   Current:   Sat Aug 01 2026 13:05:00 GMT+0530
   Age:       48,167 seconds (13.4 hours)
   ```

2. **No scheduled task found:**
   ```powershell
   Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
   # ERROR: Task not found!
   ```

3. **No running process:**
   ```powershell
   Get-Process -Name "edge-agent"
   # No process found
   ```

4. **Dashboard shows offline because:**
   - Telemetry older than 300 seconds (5 minutes) = **OFFLINE**
   - Edge agent hasn't sent heartbeat in 13+ hours
   - Current age: 48,167 seconds > 300 seconds threshold

---

## 🎯 ROOT CAUSE

**The edge agent was never installed as a Windows Service or Scheduled Task!**

The edge agent needs to:
1. Be installed as a Windows Scheduled Task (or Service)
2. Run automatically on system startup
3. Send heartbeats every 30 seconds
4. Submit telemetry to the control plane

Currently: **NONE of these are happening!**

---

## ✅ SOLUTION

### Option 1: Run the Official Installer (RECOMMENDED)

The edge agent has a built-in Windows installer:

```powershell
# Run as Administrator
cd "C:\Omsystems\edge-agent"

# Build the installer package
npm run build:exe

# Run the installer
.\release\edge-agent.exe --install

# Follow the prompts:
# - It will request Admin privileges
# - Ask for camera password
# - Install to C:\Program Files\Sentinel Grid\Edge Agent\
# - Create a scheduled task
# - Start the agent
```

### Option 2: Manual Installation

If the installer doesn't work, manually set it up:

```powershell
# 1. Create the installation directory
New-Item -ItemType Directory -Force -Path "C:\Program Files\Sentinel Grid\Edge Agent"

# 2. Copy the executable
Copy-Item "C:\Omsystems\edge-agent\release\edge-agent.exe" `
  -Destination "C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe"

# 3. Copy the config
Copy-Item "C:\Omsystems\edge-agent\config\edge-agent-H1.env" `
  -Destination "C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent-H1.env"

# 4. Create scheduled task (run as Administrator)
$action = New-ScheduledTaskAction -Execute "C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe" `
  -Argument "--config `"C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent-H1.env`""

$trigger = New-ScheduledTaskTrigger -AtStartup

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3

Register-ScheduledTask -TaskName "Sentinel Grid Edge Agent" `
  -Action $action -Trigger $trigger -Principal $principal -Settings $settings

# 5. Start the task
Start-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
```

### Option 3: Quick Test Run (Development Mode)

Just test if it works before installing:

```powershell
# Run in current terminal (will block)
cd C:\Omsystems\edge-agent

# Set the config path
$env:EDGE_CONFIG_PATH="C:\Omsystems\edge-agent\config\edge-agent-H1.env"

# Run the agent
npm run dev

# OR use the built executable
.\release\edge-agent.exe --config ".\config\edge-agent-H1.env"
```

Watch for:
- "Edge agent registered; waiting for branch commands"
- "Discovered X ONVIF endpoint(s)"
- No authentication errors

Press Ctrl+C to stop.

---

## 📊 How to Verify It's Working

### 1. Check the Process is Running

```powershell
Get-Process -Name "edge-agent" -ErrorAction SilentlyContinue
```

Expected: Process with PID and memory usage shown

### 2. Check the Scheduled Task

```powershell
Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" | 
  Select-Object State, LastRunTime, LastTaskResult
```

Expected:
- State: **Running** or **Ready**
- LastTaskResult: **0** (success)

### 3. Check Recent Logs

```powershell
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20
```

Expected to see (within last minute):
```
[info] Edge agent <id> registered; waiting for branch commands
[info] Synchronized X camera(s) for heartbeat monitoring
```

### 4. Check Database (after 1 minute)

```powershell
node C:\Omsystems\check-edge-telemetry.mjs
```

Expected:
- Last Seen: Less than 90 seconds ago
- Status should show: "✅ FRESH (< 90s)"

### 5. Check Dashboard (after 2 minutes)

Open dashboard → Operations → Branches

Expected:
- Edge Agent status: **🟢 Online**
- Last heartbeat: Within last minute

---

## 📝 Configuration Checklist

Before starting, ensure config is correct:

```powershell
notepad "C:\Omsystems\edge-agent\config\edge-agent-H1.env"
```

Verify these settings:

```bash
# ✅ These are correct
CONTROL_PLANE_URL="https://sentinel-grid-control-plane1.onrender.com"
EDGE_BRIDGE_SHARED_KEY="WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa"
EDGE_AGENT_ID="e89264b4-9168-4b1b-8438-d61f7029668f"
EDGE_AGENT_NAME="H1"
BRANCH_ID="00000000-0000-4000-8000-000000000104"

# ⚠️ FIX THESE (use correct camera credentials)
CAMERA_USERNAME="admin"        # UPDATE THIS
CAMERA_PASSWORD="admin"        # UPDATE THIS
```

---

## 🐛 Common Issues

### Issue: "Configuration is invalid"

**Cause:** Missing or incorrect config file

**Fix:**
```powershell
# Check config exists
Test-Path "C:\Omsystems\edge-agent\config\edge-agent-H1.env"

# Validate config
.\edge-agent.exe --config ".\config\edge-agent-H1.env" --check-config
```

### Issue: "Control plane 401: invalid_bridge_identity"

**Cause:** Wrong EDGE_BRIDGE_SHARED_KEY

**Fix:** Copy the correct key from your edge agent setup

### Issue: "Control plane 404"

**Cause:** Wrong CONTROL_PLANE_URL or agent not registered

**Fix:** Verify URL is reachable:
```powershell
Invoke-WebRequest -Uri "https://sentinel-grid-control-plane1.onrender.com/health" -UseBasicParsing
```

### Issue: "Access Denied" when creating scheduled task

**Cause:** Not running as Administrator

**Fix:** Right-click PowerShell → "Run as Administrator"

---

## 🔄 Expected Behavior After Fix

### Within 30 seconds:
- ✅ Edge agent process running
- ✅ First heartbeat sent to control plane
- ✅ Database `last_seen_at` updated

### Within 90 seconds:
- ✅ Telemetry records in database
- ✅ Dashboard refreshes
- ✅ **Edge agent shows 🟢 ONLINE**

### Ongoing (every 30 seconds):
- ✅ Heartbeat updates
- ✅ Camera discovery scans
- ✅ Telemetry submission
- ✅ Health monitoring

---

## 📈 Monitoring Commands

### Real-time log monitoring:
```powershell
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Wait -Tail 10
```

### Check last heartbeat age:
```powershell
node C:\Omsystems\get-gateway-info.mjs
```

### Check task status:
```powershell
Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" | 
  Format-List TaskName, State, LastRunTime, NextRunTime, LastTaskResult
```

### Quick health check:
```powershell
node C:\Omsystems\check-edge-telemetry.mjs
```

---

## 🎯 SUCCESS CRITERIA

Edge agent is working correctly when ALL of these are true:

- [ ] Process `edge-agent.exe` is running
- [ ] Scheduled task "Sentinel Grid Edge Agent" exists and is Running
- [ ] Logs show heartbeat every 30 seconds
- [ ] Database `last_seen_at` is less than 90 seconds old
- [ ] Dashboard shows edge agent as 🟢 **ONLINE**
- [ ] Camera discovery is working (see discovered cameras in logs)
- [ ] No authentication errors in logs

---

## 📞 Next Steps

1. **Install the edge agent** (Option 1 recommended)
2. **Wait 2 minutes** for telemetry to flow
3. **Check dashboard** - should show online
4. **Fix camera credentials** (see EDGE_AGENT_TROUBLESHOOTING.md)
5. **Verify all cameras discovered**

---

## 🔍 Why Dashboard Uses Telemetry, Not last_seen_at

The dashboard determines online/offline status from the `operational_health_telemetry` table, NOT from `edge_agents.last_seen_at`.

**The logic:**
```typescript
// From: src/operational-health/service.ts
function telemetryStatus(envelope, policy, now) {
  if (!envelope) return "unknown";
  
  const ageSeconds = (now - Date.parse(envelope.observedAt)) / 1000;
  
  // If telemetry > 300 seconds old = OFFLINE
  if (ageSeconds > policy.offlineAfterSeconds) return "critical"; // offline
  
  // If telemetry > 90 seconds old = UNKNOWN
  if (ageSeconds > policy.staleAfterSeconds) return "unknown";
  
  // If metrics.status = "online" = ONLINE
  if (envelope.metrics.status === "online") return "healthy"; // online
}
```

**Policy thresholds:**
- `staleAfterSeconds`: 90 seconds
- `offlineAfterSeconds`: 300 seconds (5 minutes)

**Current situation:**
- Telemetry age: **48,167 seconds** (13.4 hours)
- Threshold: 300 seconds
- Result: **48,167 > 300 = OFFLINE** ❌

**After fix:**
- Telemetry age: **< 30 seconds**
- Threshold: 90 seconds
- Result: **30 < 90 = ONLINE** ✅

---

*Last Updated: 2026-08-01 13:10*
*Problem: Edge agent not running*
*Solution: Install and start the edge agent service*
