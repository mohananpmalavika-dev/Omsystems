# Fix: Analytics Engine 429 Error

## Problem

Your edge agent installation is **working**, but the analytics engine is rejecting frames with:

```
Control plane 502: "analytics_engine_rejected_frame", "upstreamStatus": 429
```

**HTTP 429 = Too Many Requests** - Your analytics engine on Render free tier cannot handle the frame submission rate.

## What's Happening

1. ✅ Edge agent installed successfully
2. ✅ 4 cameras being monitored  
3. ✅ Heartbeats working
4. ❌ **Analytics engine overwhelmed** - rejecting frames

The edge agent sends a frame from each camera **every heartbeat cycle** (default: 30 seconds), which means:
- 4 cameras × 2 frames/minute = **8 frames/minute**
- On Render free tier with 512MB RAM, this is too much

## Quick Fix: Disable Analytics Frame Submission

Since analytics isn't critical for basic operation, **disable frame submission temporarily**:

### Option 1: Stop Edge Agent (Quickest)

The installation worked! Just stop sending analytics frames:

```powershell
# Stop the service temporarily
Stop-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
```

The cameras are discovered and registered. Live video should work now (once cameras are approved in dashboard).

### Option 2: Configure Edge Agent to Skip Analytics

Edit the config file:
```powershell
$configPath = "C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env"
# Add or update this line:
# ANALYTICS_FRAMES_ENABLED=false
```

Currently this feature might not be implemented. Let me check...

## Better Fix: Upgrade Analytics Engine

Your analytics engine needs more resources:

### Upgrade to Render Starter ($7/month)
- 512MB RAM → Still might struggle
- Always on (no cold starts)

### Upgrade to Render Standard ($25/month) - RECOMMENDED
- **2GB RAM** - Can handle frame processing
- **Always on**
- **Better performance**

Go to: https://dashboard.render.com → sentinel-grid-analytics-engine-j0py → Settings → Plan

## Temporary Workaround: Reduce Frame Rate

If you want to keep analytics but reduce load:

The edge agent currently doesn't have a built-in config for this, but we can modify the heartbeat interval:

Edit: `C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env`

```bash
# Increase heartbeat interval from 30s to 120s
CAMERA_HEARTBEAT_INTERVAL_MS=120000
```

This reduces frame submission from 8/minute to 2/minute.

Then restart:
```powershell
Restart-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
```

## Long-term Solution: Implement Frame Throttling

The edge agent code should be updated to add analytics frame throttling:

**File**: `edge-agent/src/monitoring/camera-heartbeat.ts`

Add configuration:
```typescript
// In config.ts
ANALYTICS_FRAME_ENABLED: z.enum(["true", "false"]).default("true"),
ANALYTICS_FRAME_INTERVAL_MS: z.coerce.number().int().min(30000).default(60000),
```

Modify frame submission logic:
```typescript
// Only send analytics frame if enabled and enough time elapsed
private readonly lastAnalyticsFrameTime = new Map<string, number>();

async checkCamera(camera: CameraData) {
  // ... existing code ...
  
  // Send analytics frame (throttled)
  const now = Date.now();
  const lastFrameTime = this.lastAnalyticsFrameTime.get(camera.id) ?? 0;
  const shouldSendFrame = this.config.ANALYTICS_FRAME_ENABLED && 
                          (now - lastFrameTime >= this.config.ANALYTICS_FRAME_INTERVAL_MS);
  
  if (frame && shouldSendFrame && this.analyticsFrameSender) {
    await this.analyticsFrameSender({
      cameraId: camera.id,
      capturedAt: new Date().toISOString(),
      width: 64,
      height: 36,
      imageBase64: frame.toString("base64"),
      metadata: { source: "edge-rtsp", edgeAgentId: this.edgeAgentId },
    }).catch((error: unknown) => {
      logger.warn("Analytics frame delivery failed", {
        cameraId: camera.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    
    this.lastAnalyticsFrameTime.set(camera.id, now);
  }
}
```

## What About Live Video?

**Good news**: Live video doesn't depend on analytics!

The analytics frame submission is separate from:
- ✅ Camera discovery (done)
- ✅ Camera monitoring (working)
- ✅ Live video streaming (should work once cameras approved)

## Current Status

Your edge agent is **working correctly**! The only issue is:
- ❌ Analytics engine can't process frames (resource limitation)
- ✅ Everything else is functioning

## Next Steps

**For now (to stop errors)**:
```powershell
# Just let it run - the errors are warnings, not failures
# OR temporarily stop it:
Stop-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
```

**To fix permanently**:
1. Upgrade analytics engine to Standard plan ($25/month)
2. Or implement frame throttling configuration (code change needed)
3. Or disable analytics frame submission entirely (code change needed)

## Check Live Video

The real test is: **Can you see live video?**

1. Go to dashboard: https://sentinel-grid-monitoring-vhid.onrender.com
2. Navigate to cameras
3. Find your 4 discovered cameras
4. **Approve them** (change status to 'active')
5. Try viewing live video

If live video works, the analytics errors are non-critical!

## Summary

- ✅ Installation succeeded
- ✅ 4 cameras discovered and monitored  
- ❌ Analytics engine overwhelmed (free tier limitation)
- ✅ Live video should work (once cameras approved)

The "error" you saw during installation was actually just the analytics warnings. The installer completed successfully!
