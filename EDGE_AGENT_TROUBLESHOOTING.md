# Edge Agent Live Video Troubleshooting Guide

## Executive Summary

The edge agent installer is **partially working** but live video is not showing after installation due to a **camera registration workflow issue**. Cameras are being discovered successfully, but they are not being approved and synced back to the edge agent for monitoring.

## Root Cause Analysis

### Issue #1: Cameras Not Monitored (CRITICAL)
**Status**: ✗ **Blocking live video**

**Evidence from logs**:
```
[info] RTSP recorder discovery: found 8 channel(s) at 192.168.29.171:554
[info] Synchronized 0 camera(s) for heartbeat monitoring
```

**Root Cause**: 
- Cameras are successfully discovered by the edge agent
- Cameras are submitted to the control plane API
- **However**, cameras are not returning from `listMonitoringCameras()` 
- This means cameras are either:
  1. Not being approved/enabled in the control plane database
  2. Not associated with the correct edge agent/branch
  3. Missing required fields (connectionSecretRef)
  4. Stuck in "pending" or "discovered" status instead of "active"

**Impact**: Without cameras in the monitoring list, the edge agent has nothing to stream.

### Issue #2: HEVC Codec Not Recognized (FIXED)
**Status**: ✓ **Fixed in code**

**Evidence from logs**:
```
[debug] RTSP scan host failed {"host":"192.168.29.171","error":"Control plane 400: {\"error\":\"invalid_request\",\"details\":{\"formErrors\":[],\"fieldErrors\":{\"profiles\":[\"Invalid enum value. Expected 'H264' | 'H265' | 'MJPEG' | 'unknown', received 'hevc'\"]}}}"}
```

**Root Cause**: 
- CP PLUS DVR returns codec as "hevc" (lowercase)
- The `discoveryCodec()` function only checked for exact matches
- "HEVC" is H.265, but wasn't being normalized

**Fix Applied**: Updated `edge-agent/src/index.ts` to normalize HEVC → H265:
```typescript
function discoveryCodec(value: string | null | undefined): DiscoveredCameraPayload["profiles"][number]["codec"] {
  const normalized = value?.trim().replace(/[.\s_-]/g, "").toUpperCase();
  if (normalized === "H264" || normalized === "AVC" || normalized === "AVC1") return "H264";
  if (normalized === "H265" || normalized === "HEVC" || normalized === "HEV1" || normalized === "HVC1") return "H265";
  if (normalized === "MJPEG" || normalized === "MJPG" || normalized === "JPEG") return "MJPEG";
  return "unknown";
}
```

### Issue #3: Live Media Runtime Status Unknown
**Status**: ? **Cannot verify from logs**

The logs don't show:
- MediaMTX startup
- Live gateway listening confirmation  
- Tunnel establishment

This suggests either:
1. Live media is starting but not logging
2. Live media is failing silently
3. Logs are being written to a different location

## Required Actions

### Action 1: Fix Camera Registration Workflow (URGENT)

**Check control plane database**:
```sql
-- Check discovered cameras
SELECT id, name, branchId, status, sourceType, recorderId, recorderChannel, connectionSecretRef
FROM cameras 
WHERE branchId = '<your-branch-id>'
ORDER BY createdAt DESC;

-- Check if they're associated with the edge agent
SELECT * FROM edge_agents WHERE branchId = '<your-branch-id>';
```

**Expected state**:
- `status` should be `'active'` or `'online'` (not `'discovered'` or `'pending'`)
- `connectionSecretRef` must be populated (e.g., `edge://<agent-id>/<camera-id>`)
- `branchId` must match the edge agent's branch

**If cameras are in "discovered" status**, you need to:

**Option A: Add API endpoint for camera approval**
```typescript
// Add to cameras.routes.ts
router.patch('/cameras/:id/approve', async (request, reply) => {
  const camera = await getCameraById(request.params.id);
  if (!camera) return reply.notFound();
  
  await db.execute(
    sql`UPDATE cameras 
        SET status = 'active', 
            updatedAt = ${new Date().toISOString()}
        WHERE id = ${camera.id}`
  );
  
  return { success: true, camera };
});
```

**Option B: Auto-approve discovered cameras**
```typescript
// Modify camera discovery submission in control plane
// When edge agent submits discovery, automatically set status='active' if streamVerified=true

if (discovery.streamVerified && discovery.rtspValidated) {
  camera.status = 'active'; // Auto-approve working cameras
} else {
  camera.status = 'discovered'; // Require manual review
}
```

**Option C: Manual database update** (temporary fix):
```sql
UPDATE cameras 
SET status = 'active'
WHERE branchId = '<your-branch-id>' 
  AND status = 'discovered'
  AND connectionSecretRef IS NOT NULL;
```

### Action 2: Rebuild and Deploy Edge Agent

After applying the codec fix:

```powershell
# Navigate to edge agent directory
cd C:\Omsystems\edge-agent

# Clean and rebuild
Remove-Item -Recurse -Force dist, node_modules
npm install
npm run build

# Create new installer package
npm run package:windows
```

### Action 3: Verify Installation

Run the verification script:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Omsystems\edge-agent\scripts\verify-installation.ps1"
```

Expected output:
```
✓ Scheduled task exists: Running
✓ Configuration file exists
✓ FFprobe found
✓ MediaMTX found
✓ Port 8090 listening (Live Gateway)
✓ Port 8888 listening (MediaMTX HLS)
✓ Port 9997 listening (MediaMTX API)
✓ Cameras being monitored: 8
```

### Action 4: Check Stream Secrets

Verify stream secrets are stored correctly:
```powershell
$installDir = "C:\Program Files\Sentinel Grid\Edge Agent"
$secretsPath = Join-Path $installDir "data\stream-secrets.json"
$secrets = Get-Content $secretsPath | ConvertFrom-Json
$secrets | ConvertTo-Json -Depth 10
```

Expected format:
```json
{
  "edge://<agent-id>/<camera-id-1>": "rtsp://user:pass@192.168.29.171:554/Streaming/Channels/101",
  "edge://<agent-id>/<camera-id-2>": "rtsp://user:pass@192.168.29.171:554/Streaming/Channels/201",
  ...
}
```

## Testing Live Video

Once cameras are syncing (monitor count > 0):

### Test 1: Check MediaMTX API
```powershell
# Should return MediaMTX configuration
Invoke-RestMethod -Uri "http://127.0.0.1:9997/v3/config/global/get"

# Should show configured camera paths
Invoke-RestMethod -Uri "http://127.0.0.1:9997/v3/config/paths/list"
```

### Test 2: Get Live Session from Dashboard
```typescript
// In dashboard, when opening live video:
const response = await fetch('/api/v1/live/sessions', {
  method: 'POST',
  body: JSON.stringify({ cameraId: '<camera-id>' })
});

const session = await response.json();
// session.token is passed to edge agent
```

### Test 3: Start Live Stream
```typescript
// Dashboard calls edge agent directly:
const response = await fetch('http://<edge-agent-ip>:8090/v1/live/start', {
  method: 'POST',
  body: JSON.stringify({ controlPlaneToken: session.token })
});

const stream = await response.json();
// stream.hls.url = http://<edge-agent-ip>:8090/hls/camera-<id>/index.m3u8
// Use this URL in video player with bearer token
```

### Test 4: Play HLS Stream
```html
<!-- Use hls.js or native HLS player -->
<video id="player" controls></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
  const video = document.getElementById('player');
  const hls = new Hls({
    xhrSetup: (xhr) => {
      xhr.setRequestHeader('Authorization', `Bearer ${bearerToken}`);
    }
  });
  hls.loadSource(streamUrl);
  hls.attachMedia(video);
</script>
```

## Monitoring and Logs

### Check Edge Agent Logs
```powershell
# Real-time tail
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 50 -Wait

# Search for errors
Select-String "error" "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" | Select-Object -Last 10

# Check camera sync
Select-String "Synchronized.*camera" "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" | Select-Object -Last 5
```

### Check MediaMTX Logs
MediaMTX logs are piped through the edge agent and appear as:
```
[info] MediaMTX: <log message>
[warn] MediaMTX: <warning message>
```

### Check Tunnel Logs (if using tunnels)
```
[info] Cloudflare Tunnel: <tunnel message>
```

## Common Issues and Solutions

### Issue: "Synchronized 0 camera(s)"
**Solution**: Check camera status in database. Cameras must be 'active', not 'discovered'.

### Issue: Port 8090 not listening
**Solution**: 
1. Check if edge agent is running: `Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent"`
2. Check for port conflicts: `Get-NetTCPConnection -LocalPort 8090`
3. Check firewall: `Get-NetFirewallRule -DisplayName "Sentinel Grid Private Live Video"`

### Issue: MediaMTX not starting
**Solution**:
1. Check if executable exists: `Test-Path "C:\Program Files\Sentinel Grid\Edge Agent\runtime\mediamtx\mediamtx.exe"`
2. Check if port 9997 is available: `Get-NetTCPConnection -LocalPort 9997`
3. Manually start MediaMTX for testing:
   ```powershell
   cd "C:\Program Files\Sentinel Grid\Edge Agent\runtime"
   .\mediamtx\mediamtx.exe mediamtx.yml
   ```

### Issue: HLS stream not playing
**Checklist**:
1. ✓ Camera is in monitoring list (check logs)
2. ✓ Stream secret exists for camera
3. ✓ MediaMTX is running (port 9997 listening)
4. ✓ Live gateway is running (port 8090 listening)
5. ✓ Bearer token is valid (not expired)
6. ✓ Camera stream is reachable from edge agent
7. ✓ Browser can reach edge agent IP:8090

### Issue: CORS errors in browser
**Solution**: Edge gateway already sets CORS headers. Ensure:
- Request includes `Authorization: Bearer <token>` header
- Origin header is present
- Browser allows credentials with CORS

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Control Plane                          │
│  - Camera database (status, connectionSecretRef)            │
│  - Live session management                                  │
│  - Edge agent registration                                  │
└────────────┬────────────────────────────────────────────────┘
             │ HTTPS
             │ - Camera sync (listMonitoringCameras)
             │ - Live session tokens (consumeLiveSession)
             │
┌────────────▼────────────────────────────────────────────────┐
│                     Edge Agent                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Live Gateway (port 8090)                             │  │
│  │  - /v1/live/start (consume token, get HLS URL)       │  │
│  │  - /hls/* (proxy to MediaMTX)                        │  │
│  │  - Bearer token auth                                 │  │
│  └────────┬─────────────────────────────────────────────┘  │
│           │                                                 │
│  ┌────────▼─────────────────────────────────────────────┐  │
│  │ MediaMTX (ports 8888 HLS, 9997 API)                  │  │
│  │  - RTSP → HLS transcoding                            │  │
│  │  - On-demand stream activation                       │  │
│  │  - Path authentication via edge gateway              │  │
│  └────────┬─────────────────────────────────────────────┘  │
│           │ RTSP (TCP)                                      │
└───────────┼─────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────┐
│                    IP Cameras / DVRs                        │
│  - RTSP streams                                             │
│  - Credentials in stream secrets                            │
└─────────────────────────────────────────────────────────────┘
```

## Next Steps

1. **Immediate**: Check camera status in database and approve/activate discovered cameras
2. **Short-term**: Rebuild edge agent with codec fix and redeploy
3. **Medium-term**: Implement auto-approval for verified cameras or add approval UI
4. **Long-term**: Add better logging for media runtime startup and health checks

## Support Information

**Logs Location**: `C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log`
**Config Location**: `C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env`
**Data Location**: `C:\Program Files\Sentinel Grid\Edge Agent\data\`

**Key Files**:
- `device-identity.enc` - Edge agent credentials
- `stream-secrets.json` - Camera RTSP URLs (encrypted)
- `camera-credential-vault.enc` - Discovery credentials

**Verification Script**: `C:\Omsystems\edge-agent\scripts\verify-installation.ps1`
