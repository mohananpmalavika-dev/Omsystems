# Edge Agent - No Live Video After Installation

## Root Cause Analysis

Looking at your edge agent logs, I can see:

### ✅ What's Working:
- Edge agent installed successfully
- Service is running
- Agent registered with control plane
- **Cameras ARE being discovered** (log shows `"discovered":8` from DVR at 192.168.29.171)
- Agent heartbeats are working

### ❌ What's NOT Working:
- **"Synchronized 0 camera(s)"** - No cameras approved for monitoring
- **Control Plane 400 errors** - Discovery submissions failing
- **Live video not available** - Because no cameras are activated

## The Critical Issue

```
"Synchronized 0 camera(s) for heartbeat monitoring"
```

This means:
- **Cameras were discovered** (8 channels from your CP PLUS DVR)
- **But NOT approved in the dashboard yet**
- **Live video requires approved cameras** - cameras must be in 'active' status

## Why Discovery Failed Initially

Your logs show these errors:

```
RTSP scan host failed {"host":"192.168.29.171","error":"Control plane 400: {\"error\":\"invalid_request\",\"details\":{\"formErrors\":[],\"fieldErrors\":{\"profiles\":[\"Invalid enum value. Expected 'H264' | 'H265' | 'MJPEG' | 'unknown', received 'hevc'\"]}}}"}
```

**Problem**: 
- CP PLUS DVR returns codec as "hevc" (lowercase)
- Control plane expects "H265" 
- This was blocking camera discovery submissions

**Fix Applied**: Edge agent now normalizes HEVC/HEV1/HVC1 → H265

Later logs show:
```
[info] RTSP recorder discovery: found 8 channel(s) at 192.168.29.171:554
[info] Automatic ONVIF discovery completed {"discovered":8}
```

✅ This means the fix worked! Cameras are being discovered now.

---

## Solution: Approve Cameras in Dashboard

### Step 1: Check Edge Agent Status

```powershell
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 50
```

Look for:
```
✅ [info] Edge agent <id> registered; waiting for branch commands
✅ [info] RTSP recorder discovery: found X channel(s)  
✅ [info] Automatic ONVIF discovery completed {"discovered":X}
```

### Step 2: Open Dashboard

Navigate to: **https://sentinel-grid-monitoring-vhid.onrender.com**

### Step 3: Go to Camera Discovery Section

**Path**: Dashboard → Cameras → Discovered Cameras (or Camera Discovery)

### Step 4: You Should See 8 Cameras

The cameras discovered from your CP PLUS DVR should appear with:
- **Status**: "discovered" or "pending"
- **Device**: CP PLUS channels 1-8
- **IP Address**: 192.168.29.171

### Step 5: Approve Each Camera

For each camera:
1. **Click the camera** to view details
2. **Click "Approve"** or **Change status to "active"**
3. **Verify settings** (name, location, etc.)
4. **Save changes**

OR (if bulk action available):
1. **Select all 8 cameras**
2. **Bulk action**: "Approve Selected"
3. **Confirm**

### Step 6: Wait for Synchronization

After approving, the edge agent will:
- **Sync camera configs** (happens every 60 seconds)
- **Start monitoring** the approved cameras
- **Enable live video streams**

Check logs again:
```powershell
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20 -Wait
```

Look for:
```
✅ [info] Synchronized 8 camera(s) for heartbeat monitoring
```

### Step 7: Test Live Video

1. **Go to**: Dashboard → Cameras → Live View
2. **Select a camera**
3. **Click "View Live"** or similar button
4. **Live video should start playing!**

---

## If Cameras Still Not Showing in Dashboard

### Issue A: Discovery Not Submitted Due to 400 Errors

**Check logs for these errors:**
```
Control plane 400: {"error":"invalid_request"}
```

**Solutions:**

#### 1. Update Edge Agent Code (HEVC Fix)

The codec normalization fix needs to be in your running edge agent:

**File**: `edge-agent/src/index.ts` (lines 797-803)

```typescript
function discoveryCodec(value: string | null | undefined): DiscoveredCameraPayload["profiles"][number]["codec"] {
  const normalized = value?.trim().replace(/[.\s_-]/g, "").toUpperCase();
  if (normalized === "H264" || normalized === "AVC" || normalized === "AVC1") return "H264";
  if (normalized === "H265" || normalized === "HEVC" || normalized === "HEV1" || normalized === "HVC1") return "H265";
  if (normalized === "MJPEG" || normalized === "MJPG" || normalized === "JPEG") return "MJPEG";
  return "unknown";
}
```

**Rebuild edge agent:**
```powershell
cd C:\Omsystems\edge-agent
npm run build
```

**Reinstall:**
```powershell
# Uninstall current
C:\Omsystems\scripts\uninstall-edge-agent.ps1

# Rebuild installer
npm run package:windows

# Install with new build
.\installer\windows\install-edge-agent.ps1
```

#### 2. Trigger Manual Rediscovery

After fixing the code and reinstalling:

**Via Dashboard:**
- Navigate to: Edge Agents section
- Find your edge agent
- Click: "Trigger Discovery" or "Rescan Network"

**Via Edge Agent Command:**
```powershell
# This forces immediate rediscovery
Restart-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
```

#### 3. Check Control Plane Status

```powershell
cd C:\Omsystems
.\scripts\verify-render-urls.ps1
```

Ensure **Control Plane** shows: ✓ Healthy

If control plane is down:
```powershell
.\scripts\verify-render-urls.ps1 -WakeServices
```

### Issue B: Cameras Discovered But Not Visible in Dashboard UI

**Possible causes:**
- Dashboard not refreshing
- Filtering hiding discovered cameras
- Database query issue

**Solutions:**

1. **Hard refresh dashboard**: `Ctrl+F5` or `Cmd+Shift+R`

2. **Check filters**:
   - Make sure "Show Discovered" filter is enabled
   - Clear any status filters

3. **Query database directly** (if you have access):
   ```sql
   SELECT id, name, status, ipAddress, manufacturer, model
   FROM cameras
   WHERE status = 'discovered'
   ORDER BY createdAt DESC;
   ```

4. **Check control plane logs** (on Render):
   - Look for discovery submission errors
   - Check validation errors

---

## Understanding Camera States

```
┌─────────────┐
│ Discovered  │  ← Edge agent finds camera
└──────┬──────┘
       │
       │ (Manual approval in dashboard)
       ↓
┌─────────────┐
│   Active    │  ← Camera approved, monitoring enabled
└──────┬──────┘
       │
       │ (Edge agent syncs config)
       ↓
┌─────────────┐
│ Monitoring  │  ← Heartbeats running, live video available
└─────────────┘
```

**Key Point**: Live video is **ONLY available** after:
1. ✅ Camera discovered (edge agent)
2. ✅ Camera approved (dashboard admin)
3. ✅ Config synced (edge agent heartbeat)

---

## Quick Diagnostic Commands

```powershell
# 1. Check if edge agent is running
Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" | Select-Object State

# 2. Check last 50 log entries
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 50

# 3. Check for discovery events
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" | Select-String "discovered"

# 4. Check for synchronization
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" | Select-String "Synchronized"

# 5. Check for errors
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" | Select-String "error"

# 6. Check control plane connectivity
.\scripts\verify-render-urls.ps1
```

---

## Expected Log Progression

### 1. After Installation:
```
[info] Edge agent <id> registered; waiting for branch commands
[info] Synchronized 0 camera(s) for heartbeat monitoring
```

### 2. During Discovery:
```
[info] Discovered X ONVIF endpoint(s)
[info] RTSP recorder discovery: found X channel(s) at <IP>
[info] Automatic ONVIF discovery completed {"discovered":X}
```

### 3. After Dashboard Approval:
```
[info] Synchronized X camera(s) for heartbeat monitoring  ← THIS IS KEY!
```

### 4. During Monitoring:
```
[debug] Camera <id> heartbeat: online
[info] Submitted telemetry for camera <id>
```

---

## Troubleshooting Checklist

- [ ] Edge agent installed and running
- [ ] Edge agent registered with control plane
- [ ] Cameras discovered (check logs for `"discovered":X`)
- [ ] No 400 errors in logs (HEVC codec issue fixed)
- [ ] Control plane is healthy and reachable
- [ ] Dashboard shows discovered cameras
- [ ] Cameras approved/activated in dashboard
- [ ] Edge agent synced approved cameras (`Synchronized X camera(s)`)
- [ ] Live video endpoint accessible
- [ ] No 429 errors from analytics engine (or ignored if present)

---

## Common Mistakes

### ❌ Waiting for cameras to "auto-activate"
**Cameras MUST be manually approved** in the dashboard. They don't automatically start monitoring.

### ❌ Assuming "discovered" means "live"
Discovered cameras are **pending approval**. Live video requires **active** status.

### ❌ Not checking dashboard for approvals
Installation only submits discoveries. You must **log in to dashboard** and approve them.

### ❌ Expecting immediate sync
After approval, edge agent syncs every 60 seconds. May take 1-2 minutes before `Synchronized X cameras` appears.

---

## If Everything Fails

### Nuclear Option: Full Reset

```powershell
# 1. Uninstall
C:\Omsystems\scripts\uninstall-edge-agent.ps1

# 2. Clear database (if you have access)
# Delete discovered cameras from database

# 3. Rebuild edge agent with fixes
cd C:\Omsystems\edge-agent
npm run build
npm run package:windows

# 4. Wake services
C:\Omsystems\scripts\verify-render-urls.ps1 -WakeServices

# 5. Fresh install
.\installer\windows\install-edge-agent.ps1

# 6. Wait for discovery (check logs)
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20 -Wait

# 7. Approve in dashboard

# 8. Wait for sync (60 seconds)

# 9. Test live video
```

---

## Success Indicators

You'll know it's working when you see:

### In Edge Agent Logs:
```
✅ [info] Edge agent <id> registered
✅ [info] RTSP recorder discovery: found 8 channel(s)
✅ [info] Automatic ONVIF discovery completed {"discovered":8}
✅ [info] Synchronized 8 camera(s) for heartbeat monitoring  ← THIS!
```

### In Dashboard:
```
✅ 8 discovered cameras shown
✅ Cameras in "active" status (after approval)
✅ Edge agent shows "Online"
✅ Live video button/link available
✅ Live video plays when clicked
```

---

## Summary

**Your current status (based on logs):**
- ✅ Edge agent installed
- ✅ Cameras discovered (8 channels)
- ❌ Cameras NOT approved yet
- ❌ No cameras synchronized for monitoring
- ❌ Live video unavailable

**Next steps:**
1. **Open dashboard**: https://sentinel-grid-monitoring-vhid.onrender.com
2. **Find "Discovered Cameras"** section
3. **Approve all 8 cameras**
4. **Wait 60 seconds** for sync
5. **Check logs** for "Synchronized 8 camera(s)"
6. **Test live video**

**The fix is simple**: Just approve the cameras in the dashboard!

---

## Additional Resources

- `FIX_ANALYTICS_429_ERROR.md` - Explains analytics warnings (not failures)
- `FRESH_INSTALL_GUIDE.md` - Complete reinstallation guide
- `INSTALLER_HUNG_FIX.md` - Installation timeout issues
- `EDGE_AGENT_TROUBLESHOOTING.md` - General troubleshooting

---

Need help with dashboard access or camera approval? Let me know! 🚀
