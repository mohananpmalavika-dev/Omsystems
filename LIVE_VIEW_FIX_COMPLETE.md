# Live View 502 Error - Complete Fix Guide

## Problem
Live view is failing with 502 errors. The error occurs at `/api/live` in the dashboard.

## Root Cause Analysis

The 502 error from `/api/live` means the dashboard's backend (Next.js API route) is failing when trying to:
1. Create a live session from the control plane, OR
2. Start the stream on the media gateway

## Architecture Overview

```
Browser → Dashboard (/api/live) → Control Plane (create session) → Media Gateway (start stream) → MediaMTX → Camera
```

## Checklist - What's Needed for Live View

### ✅ Infrastructure (Already Set Up)
- ✅ Control Plane: `https://sentinel-grid-control-plane1.onrender.com`
- ✅ Media Gateway: `https://sentinel-grid-media-gateway1.onrender.com`
- ✅ Dashboard: Running locally with correct environment

### ⚠️ Missing Requirements

#### 1. Camera Must Be Discovered and Approved
**Status: LIKELY MISSING**

The camera you're trying to view (`IPC-NT8856G_JPG-N4C-W02-S38`) must:
- Be discovered by the edge agent scanner
- Be approved through the dashboard
- Have a valid database record with:
  - Camera ID (UUID)
  - Connection secret reference
  - RTSP stream URL

**How to check:**
```sql
-- In your production database
SELECT id, name, status, connection_secret_ref 
FROM cameras 
WHERE name LIKE '%IPC-NT8856G%';
```

**How to fix:**
1. Run edge agent scanner: `c:\Omsystems\edge-agent\START_SCANNER_SIMPLE.bat`
2. Wait for cameras to be discovered (check dashboard → discovered cameras)
3. Click "Approve all & start" to add cameras to monitoring

#### 2. Media Gateway Must Be Able to Reach Cameras
**Status: UNCERTAIN**

The media gateway on Render needs to be able to:
- Reach the control plane (✅ can do this)
- Get camera RTSP URLs from the control plane (✅ can do this)
- **Actually connect to the camera's RTSP stream** (❌ PROBLEM!)

**The Issue:** Cameras are on your local network (192.168.x.x), but the media gateway is on Render's cloud. The media gateway **cannot** reach your local cameras!

## Solution Options

### Option 1: Use Edge Agent Media Gateway (RECOMMENDED)

Instead of using the Render-hosted media gateway, use the edge agent's built-in media gateway which **can** reach your local cameras.

**Steps:**

1. **Update Dashboard Environment** - Point to local edge agent:
   ```env
   # dashboard/.env.local
   MEDIA_GATEWAY_INTERNAL_URL=http://127.0.0.1:8090
   ```

2. **Ensure Edge Agent is Running:**
   ```bash
   cd c:\Omsystems\edge-agent
   START_SCANNER_SIMPLE.bat
   ```
   
   Verify it shows:
   ```
   Local stream-secret provider listening on 127.0.0.1:8093
   Edge agent {id} registered; waiting for branch commands
   ```

3. **Configure Control Plane to Return Edge Agent URL:**
   
   When creating live sessions, the control plane should return the edge agent's `publicMediaUrl`. This is already implemented - it comes from the `edge_agents.public_media_url` column.
   
   Check if your edge agent has a public media URL set:
   ```sql
   SELECT id, name, public_media_url, status 
   FROM edge_agents 
   WHERE id = '6a570d4a-2c71-415f-b59a-643cf50d55c5';
   ```
   
   If `public_media_url` is NULL or wrong, update it:
   ```sql
   UPDATE edge_agents 
   SET public_media_url = 'http://127.0.0.1:8090'
   WHERE id = '6a570d4a-2c71-415f-b59a-643cf50d55c5';
   ```

4. **Restart Dashboard:**
   ```bash
   # Stop dashboard (Ctrl+C)
   cd c:\Omsystems\dashboard
   npm run dev
   ```

### Option 2: Tunnel Edge Agent Through Cloudflare (ADVANCED)

Make your local edge agent accessible from the internet so the Render media gateway can reach it.

**Steps:**

1. Install Cloudflare Tunnel (cloudflared)
2. Create a tunnel pointing to `localhost:8090`
3. Update edge agent's `publicMediaUrl` to the Cloudflare tunnel URL
4. Update camera RTSP URLs to be reachable (may need VPN or public IPs)

**This is complex and not recommended for development.**

### Option 3: Deploy Everything Locally (SIMPLEST FOR TESTING)

Run everything on your local machine:

1. **Local Control Plane:**
   ```bash
   cd c:\Omsystems
   npm run dev  # Runs on port 8080
   ```

2. **Local Edge Agent:**
   ```bash
   cd c:\Omsystems\edge-agent
   START_SCANNER_SIMPLE.bat  # Media gateway on port 8090
   ```

3. **Local Dashboard:**
   ```bash
   cd c:\Omsystems\dashboard
   npm run dev  # Runs on port 3000
   ```

4. **Update dashboard/.env.local:**
   ```env
   CONTROL_PLANE_INTERNAL_URL=http://localhost:8080
   MEDIA_GATEWAY_INTERNAL_URL=http://localhost:8090
   ```

## Debugging Steps

### 1. Check Dashboard Server Logs

When you click to view live, check the terminal running `npm run dev` for detailed error messages. You should see something like:

```
Live-session startup failed {
  message: 'Control plane returned 404',
  cause: undefined
}
```

or

```
Live-session startup failed {
  message: 'media_gateway_unavailable',
  cause: { code: 'ECONNREFUSED' }
}
```

### 2. Test Control Plane Session Creation

```bash
# Replace {CAMERA_ID} with actual camera UUID
curl -X POST https://sentinel-grid-control-plane1.onrender.com/v1/cameras/{CAMERA_ID}/live-sessions \
  -H "Content-Type: application/json" \
  -H "x-user-id: 00000000-0000-4000-8000-000000000001" \
  -d "{}"
```

Expected response:
```json
{
  "id": "session-uuid",
  "cameraId": "camera-uuid",
  "userId": "user-uuid",
  "token": "base64-token",
  "expiresAt": "2026-08-01T...",
  "mediaGatewayUrl": "http://127.0.0.1:8090"
}
```

### 3. Test Media Gateway Health

```bash
curl https://sentinel-grid-media-gateway1.onrender.com/health
```

Expected:
```json
{"status":"ok","service":"sentinel-media-gateway"}
```

### 4. Check Database for Cameras

```sql
-- In production PostgreSQL
SELECT 
  c.id,
  c.name,
  c.status,
  c.connection_secret_ref,
  c.edge_agent_id,
  ea.public_media_url
FROM cameras c
LEFT JOIN edge_agents ea ON ea.id = c.edge_agent_id
WHERE c.status != 'offline'
LIMIT 10;
```

## Expected Behavior After Fix

1. User clicks camera in Control Room
2. Dashboard calls `/api/live` with `cameraId`
3. Dashboard server calls Control Plane: `POST /v1/cameras/{id}/live-sessions`
4. Control Plane returns:
   - Live session token
   - Media gateway URL (from edge agent's `public_media_url`)
5. Dashboard server calls Edge Agent: `POST http://127.0.0.1:8090/v1/live/start`
6. Edge Agent validates token with Control Plane
7. Edge Agent tells MediaMTX to pull RTSP stream from camera
8. Edge Agent returns HLS URL to dashboard
9. Browser loads HLS stream and video plays

## Quick Fix (Most Likely Solution)

Based on the architecture, the quickest fix is:

**1. Use local edge agent for media instead of Render:**

```env
# dashboard/.env.local
CONTROL_PLANE_INTERNAL_URL=https://sentinel-grid-control-plane1.onrender.com
MEDIA_GATEWAY_INTERNAL_URL=http://127.0.0.1:8090  # Local edge agent
EDGE_BRIDGE_SHARED_KEY=WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa
DASHBOARD_DEMO_MODE=false
```

**2. Ensure edge agent is running with media enabled:**

Check `edge-agent/.env` has:
```
LIVE_MEDIA_ENABLED=true
EDGE_LIVE_GATEWAY_HOST=127.0.0.1
EDGE_LIVE_GATEWAY_PORT=8090
```

**3. Restart everything:**
```bash
# Terminal 1 - Edge Agent
cd c:\Omsystems\edge-agent
START_SCANNER_SIMPLE.bat

# Terminal 2 - Dashboard
cd c:\Omsystems\dashboard
npm run dev
```

**4. Test live view:**
- Open `http://localhost:3000/control-room`
- Click on approved camera
- Live video should play

---

## Still Not Working?

If you're still getting 502 errors after following this guide, please share:

1. **Dashboard server logs** (from terminal running `npm run dev`)
2. **Browser console errors** (full error objects)
3. **Camera status** from database:
   ```sql
   SELECT id, name, status FROM cameras LIMIT 5;
   ```
4. **Edge agent status:**
   ```
   Scanner terminal output showing "Edge agent X registered"
   ```

---

**Most Likely Issue:** You're trying to use the Render media gateway which cannot reach cameras on your local network. Use the local edge agent's media gateway instead (Option 1).
