# Edge Agent Live Video Issues and Fixes

## Issues Identified

After analyzing the edge agent installer and logs, I've identified the following issues preventing live video from working:

### 1. **Cameras Discovered But Not Monitored**
The logs show:
```
[info] Discovered 0 ONVIF endpoint(s)
[info] RTSP recorder discovery: found 8 channel(s)
[info] Synchronized 0 camera(s) for heartbeat monitoring
```

**Problem**: Cameras are being discovered and submitted to the control plane, but they're not being synchronized back for monitoring. This means the edge agent doesn't have any cameras configured to stream.

**Root Cause**: The cameras need to be:
1. Discovered (✓ Working)
2. Approved/registered in the control plane
3. Synced back to the edge agent with connection details
4. **This step is failing - cameras are not returning from `listMonitoringCameras()`**

### 2. **Live Media Configuration Issues**
The installer sets `LIVE_MEDIA_ENABLED="true"` but:
- MediaMTX may not be starting properly
- The public media gateway URL resolution might be failing
- Camera stream secrets are being stored but not accessible during monitoring

### 3. **Codec Validation Errors**
Several cameras are failing with:
```
"Invalid enum value. Expected 'H264' | 'H265' | 'MJPEG' | 'unknown', received 'hevc'"
```

**Problem**: The control plane doesn't accept "hevc" as a valid codec, but H.265 and HEVC are the same thing. The edge agent should normalize "hevc" to "H265".

## Fixes Required

### Fix 1: Add Codec Normalization
**File**: `edge-agent/src/discovery/rtsp-network-scan.ts` or `edge-agent/src/index.ts`

Add codec normalization before submitting discoveries:
```typescript
function normalizeCodec(codec: string | undefined): 'H264' | 'H265' | 'MJPEG' | 'unknown' {
  const normalized = codec?.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized === 'H264' || normalized === 'AVC') return 'H264';
  if (normalized === 'H265' || normalized === 'HEVC') return 'H265';
  if (normalized === 'MJPEG' || normalized === 'MJPG') return 'MJPEG';
  return 'unknown';
}
```

### Fix 2: Verify Control Plane Camera Registration
**Action**: Check the control plane dashboard/API to ensure:
1. Discovered cameras are visible
2. Cameras can be approved/enabled
3. The `listMonitoringCameras()` endpoint returns approved cameras
4. Connection secrets are properly associated with each camera

**Database Check**: Verify the cameras table has entries with:
- `branchId` matching the edge agent's branch
- `status` = 'active' or 'online'
- `connectionSecretRef` is populated
- Associated with the edge agent ID

### Fix 3: Enhance Live Media Startup Logging
**File**: `edge-agent/src/streaming/edge-live-gateway.ts`

Add more detailed logging:
```typescript
logger.info("Starting edge media runtime", {
  liveMediaEnabled: config.LIVE_MEDIA_ENABLED,
  mediaRuntimeManaged: config.MEDIA_RUNTIME_MANAGED,
  tunnelMode: tunnelMode,
  publicGatewayUrl: config.PUBLIC_MEDIA_GATEWAY_URL,
});
```

### Fix 4: Check Camera Monitoring Sync
**File**: `edge-agent/src/index.ts` (syncCameraHeartbeatConfig function)

Add logging:
```typescript
async function syncCameraHeartbeatConfig() {
  const cameras = await control.listMonitoringCameras(agentId, config.EDGE_AGENT_VERSION);
  logger.info(`Synchronized ${cameras.length} camera(s) for heartbeat monitoring`, {
    cameraIds: cameras.map(c => c.id),
    camerasWithSecrets: cameras.filter(c => secrets.get(c.connectionSecretRef)).length,
  });
  // ... rest of function
}
```

## Immediate Diagnostic Steps

### Step 1: Check Control Plane API
```bash
# Check if cameras were submitted
curl http://localhost:8080/api/v1/cameras?branchId=<your-branch-id>

# Check if edge agent is registered
curl http://localhost:8080/api/v1/edge-agents/<agent-id>
```

### Step 2: Check Stream Secrets
Look at the file: `C:\Program Files\Sentinel Grid\Edge Agent\data\stream-secrets.json`

It should contain entries like:
```json
{
  "edge://<agent-id>/<camera-id>": "rtsp://username:password@192.168.x.x/..."
}
```

### Step 3: Check MediaMTX is Running
After installation, check if MediaMTX started:
```powershell
# Check if port 8888 (HLS) and 9997 (API) are listening
netstat -ano | findstr "8888"
netstat -ano | findstr "9997"

# Check MediaMTX API
curl http://127.0.0.1:9997/v3/config/global/get
```

### Step 4: Manual Camera Approval Workflow
If cameras are discovered but not monitored:

1. **Find discovered cameras** in the control plane UI
2. **Approve/Enable** each camera
3. **Verify** the camera appears in the monitoring configuration
4. **Wait** for next sync cycle (60 seconds) or restart edge agent

## Recommended Installation Verification Script

Create: `edge-agent/scripts/verify-installation.ps1`

```powershell
Write-Host "Verifying Edge Agent Installation..." -ForegroundColor Cyan

$installDir = "C:\Program Files\Sentinel Grid\Edge Agent"
$configPath = Join-Path $installDir "config\edge-agent.env"
$logPath = Join-Path $installDir "logs\edge-agent.log"

# 1. Check if service is running
$task = Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "✓ Scheduled task exists: $($task.State)" -ForegroundColor Green
} else {
    Write-Host "✗ Scheduled task not found" -ForegroundColor Red
}

# 2. Check configuration
if (Test-Path $configPath) {
    $config = Get-Content $configPath | ConvertFrom-StringData
    Write-Host "✓ Configuration file exists" -ForegroundColor Green
    Write-Host "  LIVE_MEDIA_ENABLED: $($config.LIVE_MEDIA_ENABLED)"
    Write-Host "  CONTROL_PLANE_URL: $($config.CONTROL_PLANE_URL)"
} else {
    Write-Host "✗ Configuration file not found" -ForegroundColor Red
}

# 3. Check runtime dependencies
$ffprobe = Get-Command "C:\Program Files\Sentinel Grid\Edge Agent\runtime\ffmpeg\ffprobe.exe" -ErrorAction SilentlyContinue
$mediamtx = Get-Command "C:\Program Files\Sentinel Grid\Edge Agent\runtime\mediamtx\mediamtx.exe" -ErrorAction SilentlyContinue

if ($ffprobe) { Write-Host "✓ FFprobe found" -ForegroundColor Green }
else { Write-Host "✗ FFprobe not found" -ForegroundColor Red }

if ($mediamtx) { Write-Host "✓ MediaMTX found" -ForegroundColor Green }
else { Write-Host "✗ MediaMTX not found" -ForegroundColor Red }

# 4. Check if ports are listening
$port8090 = Get-NetTCPConnection -LocalPort 8090 -ErrorAction SilentlyContinue
$port8888 = Get-NetTCPConnection -LocalPort 8888 -ErrorAction SilentlyContinue
$port9997 = Get-NetTCPConnection -LocalPort 9997 -ErrorAction SilentlyContinue

if ($port8090) { Write-Host "✓ Live gateway listening on port 8090" -ForegroundColor Green }
else { Write-Host "⚠ Live gateway not listening on port 8090" -ForegroundColor Yellow }

if ($port8888) { Write-Host "✓ MediaMTX HLS listening on port 8888" -ForegroundColor Green }
else { Write-Host "⚠ MediaMTX HLS not listening on port 8888" -ForegroundColor Yellow }

if ($port9997) { Write-Host "✓ MediaMTX API listening on port 9997" -ForegroundColor Green }
else { Write-Host "⚠ MediaMTX API not listening on port 9997" -ForegroundColor Yellow }

# 5. Check recent logs
if (Test-Path $logPath) {
    $recentLogs = Get-Content $logPath -Tail 20
    $errorCount = ($recentLogs | Select-String "error").Count
    $discoveryCount = ($recentLogs | Select-String "discovered").Count
    
    Write-Host "`nRecent Activity:" -ForegroundColor Cyan
    Write-Host "  Errors in last 20 lines: $errorCount"
    Write-Host "  Discovery events: $discoveryCount"
    
    if ($errorCount -gt 0) {
        Write-Host "`nRecent Errors:" -ForegroundColor Yellow
        $recentLogs | Select-String "error" | Select-Object -First 3
    }
}

Write-Host "`nFor detailed logs, check: $logPath" -ForegroundColor Cyan
```

## Expected Behavior After Fix

1. **Installation completes successfully**
2. **Edge agent starts and registers** with control plane
3. **Discovery runs** and finds cameras/recorders
4. **Cameras are submitted** to control plane
5. **Cameras are approved** (manual or auto)
6. **Cameras sync back** to edge agent
7. **Live media runtime starts**: MediaMTX + Live Gateway
8. **Cameras appear in monitoring** with stream access
9. **Dashboard shows live video** when accessing camera feeds

## Current Status Per Logs

✓ Edge agent installed and running
✓ Discovery finding cameras (8 channels discovered)
✓ Control plane connectivity working
✗ Cameras not syncing back for monitoring (0 cameras monitored)
✗ Live video not accessible
? MediaMTX status unknown (no logs showing startup)

The main issue is the **camera registration workflow** - cameras are discovered but not approved/synced back.
