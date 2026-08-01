# Live View Not Working - Configuration Needed

## Current Status

- ✅ Edge agent (scanner) is working
- ✅ Backend control plane is working  
- ✅ Media gateway is deployed and healthy
- ❌ Live video streaming is failing with 502 errors

## Root Cause

The media gateway at `https://sentinel-grid-media-gateway1.onrender.com` is missing required environment variables in its Render configuration.

## Required Render Environment Variables

Go to the Render dashboard for the `sentinel-grid-media-gateway1` service and add these environment variables:

### 1. CONTROL_PLANE_URL
```
CONTROL_PLANE_URL=https://sentinel-grid-control-plane1.onrender.com
```
This tells the media gateway where to validate live session tokens.

### 2. EDGE_BRIDGE_SHARED_KEY  
```
EDGE_BRIDGE_SHARED_KEY=WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa
```
This authenticates requests from the dashboard to the media gateway.

### 3. PUBLIC_HLS_BASE_URL
```
PUBLIC_HLS_BASE_URL=https://sentinel-grid-media-gateway1.onrender.com/hls
```
This is the public URL where video streams will be served.

### 4. PUBLIC_WEBRTC_BASE_URL
```
PUBLIC_WEBRTC_BASE_URL=https://sentinel-grid-media-gateway1.onrender.com
```
This is the public URL for WebRTC streaming.

### 5. MEDIAMTX_API_URL
```
MEDIAMTX_API_URL=http://localhost:9997
```
This is the internal MediaMTX API endpoint.

### 6. MEDIAMTX_HLS_URL
```
MEDIAMTX_HLS_URL=http://localhost:8888
```
This is the internal MediaMTX HLS endpoint.

### 7. MEDIA_ACCESS_TTL_SECONDS
```
MEDIA_ACCESS_TTL_SECONDS=300
```
How long stream access tokens are valid (5 minutes).

### 8. STREAM_SECRET_PROVIDER_URL (Optional)
If you're using a centralized stream secret provider:
```
STREAM_SECRET_PROVIDER_URL=http://127.0.0.1:8093
```

Or leave empty if using the edge agent's secret provider.

## How to Add Variables in Render

1. Go to https://dashboard.render.com
2. Find the `sentinel-grid-media-gateway1` service
3. Click on "Environment" in the left sidebar
4. Click "Add Environment Variable"
5. Add each variable listed above
6. Click "Save Changes"
7. Wait for the service to redeploy (2-3 minutes)

## After Configuration

Once the environment variables are set and the service has redeployed:

1. **Restart your local dashboard** (if testing locally):
   ```bash
   cd c:\Omsystems\dashboard
   # Press Ctrl+C to stop
   npm run dev
   ```

2. **Test live streaming**:
   - Open the dashboard
   - Go to Control Room
   - Click on a camera
   - The live view should now work!

## Architecture Overview

```
User Browser
    ↓
Dashboard (localhost:3000 or monitoring1.onrender.com)
    ↓
1. POST /api/live → calls backend
    ↓
Control Plane (control-plane1.onrender.com)
    ↓
2. POST /v1/cameras/{id}/live-sessions → creates token
    ↓
Dashboard receives: { token, mediaGatewayUrl }
    ↓
3. POST https://media-gateway1.onrender.com/v1/live/start
   Headers: x-edge-bridge-key
   Body: { controlPlaneToken }
    ↓
Media Gateway validates token with Control Plane
    ↓
4. Returns HLS stream URL
    ↓
Video Player loads: https://media-gateway1.onrender.com/hls/camera-{id}/index.m3u8
```

## Important Notes

### Camera Connection Secrets

For live streaming to work, cameras need to have valid connection secrets. These are set when cameras are approved:

- Format: `edge://{edgeAgentId}/{discoveryId}` for edge agent cameras
- Format: `rtsp://username:password@ip:port/path` for direct RTSP
- Format: `vault://path/to/secret` for secret vault

The media gateway uses these to connect to the actual camera streams.

### Edge Agent Consideration

If you're using the local edge agent for camera discovery:

1. The edge agent has its own media gateway at `http://127.0.0.1:8090`
2. Cameras discovered by the edge agent should reference the edge agent's gateway
3. The control plane should return the edge agent's `publicMediaUrl` in the live session

### Troubleshooting

**If still getting 502 after configuration:**

1. **Check Render logs** for media-gateway1 service:
   - Look for "stream_secret_unavailable" errors
   - Look for connection errors to MediaMTX

2. **Verify cameras exist and are approved**:
   - Run scanner to discover cameras
   - Approve cameras in dashboard
   - Check camera `connectionSecretRef` is valid

3. **Check MediaMTX is running**:
   - MediaMTX should start with the media gateway
   - Check Render logs for MediaMTX startup messages

4. **Verify camera is actually streaming**:
   - The physical camera must be powered on
   - Network must allow RTSP connections
   - Camera credentials must be correct

## Alternative: Use Edge Agent Media Gateway

If the production media gateway is too complex to configure, you can use the edge agent's built-in media gateway:

1. **Keep edge agent running** on your local machine
2. **Use ngrok or Cloudflare tunnel** to expose port 8090
3. **Update edge agent** to report its public URL:
   ```env
   PUBLIC_MEDIA_GATEWAY_URL=https://your-tunnel-url.ngrok.io
   ```
4. **Restart edge agent** to register the new URL

The edge agent will then handle all media streaming directly.

## Summary

The live view failure is due to missing environment configuration in Render. Once you add the required environment variables listed above to the media gateway service in Render and let it redeploy, live streaming should work.

The key variables are:
- ✅ CONTROL_PLANE_URL
- ✅ EDGE_BRIDGE_SHARED_KEY  
- ✅ PUBLIC_HLS_BASE_URL
- ✅ MEDIAMTX_API_URL
- ✅ MEDIAMTX_HLS_URL

After configuration, test by clicking any camera in the dashboard's Control Room view.

---

**Next Step:** Configure the environment variables in Render dashboard, wait for redeploy, then test!
