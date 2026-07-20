# Quick Start - Testing with 2 Cameras

## Prerequisites

- 2 IP cameras on your network with ONVIF enabled
- Docker Desktop installed
- Node.js 22+ installed
- Camera admin credentials (username/password)

## Step 1: Start the Core Services (5 minutes)

```powershell
# Clone/navigate to the project
cd c:\Omsystems

# Install dependencies
npm install

# Start database and media services
docker-compose up -d postgres mediamtx

# Wait for postgres to be ready (about 10 seconds)
timeout /t 10

# Start the control plane
npm run dev
```

In another terminal:
```powershell
# Start the media gateway
npm run media:dev
```

In a third terminal:
```powershell
# Start the dashboard
npm run dashboard:dev
```

**Check Status:**
- Control Plane: http://localhost:8080/health
- Media Gateway: http://localhost:8090/health
- Dashboard: http://localhost:3000

## Step 2: Discover Your Cameras (5 minutes)

### Configure Edge Agent

Create `edge-agent/.env`:
```bash
CONTROL_PLANE_URL=http://localhost:8080
BRANCH_ID=branch-blr-001
EDGE_AGENT_NAME=Home-Office-Agent
EDGE_AGENT_VERSION=0.1.0
DEV_USER_ID=user-global-admin
CAMERA_USERNAME=your_camera_admin_username
CAMERA_PASSWORD=your_camera_admin_password
DISCOVERY_TIMEOUT_MS=10000
ONVIF_TIMEOUT_MS=8000
```

**Replace:**
- `your_camera_admin_username` - Your camera's ONVIF username
- `your_camera_admin_password` - Your camera's ONVIF password

### Run Discovery

```powershell
# In a new terminal
npm run edge:dev
```

**What happens:**
1. Edge agent discovers ONVIF cameras on your network
2. Connects to each camera and reads capabilities
3. Validates RTSP stream with ffprobe
4. Submits discovery to control plane

**Expected Output:**
```
Edge agent <id> registered; scanning the branch LAN
Discovered 2 ONVIF endpoint(s)
Submitted Hikvision DS-2CD2xxx...
Submitted <Camera 2 brand/model>...
```

## Step 3: Approve Cameras (2 minutes)

The discovered cameras need approval before they can be viewed.

### Option A: Via API

```powershell
# List pending discoveries
curl -H "x-user-id: user-global-admin" http://localhost:8080/v1/branches/branch-blr-001/cameras/discovered

# Approve first camera (use discovery ID from above response)
curl -X POST -H "x-user-id: user-global-admin" -H "Content-Type: application/json" http://localhost:8080/v1/branches/branch-blr-001/cameras -d '{
  "discoveryId": "<discovery-id-from-above>",
  "name": "Front Door Camera",
  "cameraGroupNodeId": "group-entrance"
}'
```

### Option B: Via Database (Quick Method)

```powershell
# Connect to database
docker exec -it sentinel-postgres psql -U sentinel -d sentinel

# List discoveries
SELECT id, vendor, model, ip_address, status FROM camera_discoveries;

# Approve a camera (replace <discovery-id>)
UPDATE camera_discoveries SET status = 'approved' WHERE id = '<discovery-id>';

# Create camera resource manually (simplified for testing)
# Note: In production, use the API endpoint which handles this automatically
```

## Step 4: View Live Stream (2 minutes)

### Via Dashboard

1. Open http://localhost:3000
2. You should see your branch listed
3. Click on the branch
4. Your approved cameras should appear
5. Click "View Live" on a camera

### Via API

```powershell
# List cameras
curl -H "x-user-id: user-global-admin" http://localhost:8080/v1/branches/branch-blr-001/cameras

# Create live session for first camera
curl -X POST -H "x-user-id: user-global-admin" http://localhost:8080/v1/cameras/<camera-id>/live-sessions

# Exchange token with media gateway (copy token from above)
curl -X POST -H "Content-Type: application/json" http://localhost:8090/v1/live/start -d '{
  "controlPlaneToken": "<token-from-above>"
}'

# Response will include HLS URL - open in browser or VLC
```

## Troubleshooting

### Cameras Not Discovered

**Check 1: ONVIF Enabled**
```
Log into camera web interface → Settings → Network → ONVIF
Ensure "Enable ONVIF" is checked
```

**Check 2: Same Network**
```powershell
# Find camera IP (check camera settings or router)
# Verify you can ping it
ping <camera-ip>

# Test ONVIF port (usually 80, 8000, or 8080)
Test-NetConnection -ComputerName <camera-ip> -Port 80
```

**Check 3: Credentials**
```
Verify username/password in edge-agent/.env
Try logging into camera web interface with same credentials
```

**Check 4: Firewall**
```powershell
# ONVIF uses UDP multicast for discovery
# May need to temporarily disable firewall for testing
```

### Discovery Works But No Stream

**Check 1: RTSP Enabled**
```
Camera settings → Network → RTSP
Verify RTSP service is enabled (usually port 554)
```

**Check 2: FFmpeg/FFprobe Installed**
```powershell
# Test if ffprobe is available
ffprobe -version

# If not installed:
# Download from https://ffmpeg.org/download.html
# Add to PATH or set FFPROBE_PATH in edge-agent/.env
```

**Check 3: Stream URL**
```powershell
# Test RTSP stream directly with ffprobe
ffprobe -rtsp_transport tcp "rtsp://username:password@camera-ip:554/Streaming/Channels/101"

# Common RTSP URLs by vendor:
# Hikvision: rtsp://ip:554/Streaming/Channels/101
# Dahua: rtsp://ip:554/cam/realmonitor?channel=1&subtype=0
# TP-Link: rtsp://ip:554/stream1
# Generic: rtsp://ip:554/
```

### Stream Starts But No Video in Dashboard

**Check 1: MediaMTX Running**
```powershell
# Check MediaMTX logs
docker-compose logs mediamtx

# Verify MediaMTX API accessible
curl http://localhost:9997/v3/config/get
```

**Check 2: HLS Accessible**
```powershell
# After starting a live session, check if HLS playlist exists
curl http://localhost:8888/<path-from-media-gateway>/index.m3u8
```

**Check 3: Browser Console**
```
Open browser DevTools (F12)
Check Console tab for errors
Check Network tab to see if video segments are loading
```

## Common Camera Ports

| Vendor | ONVIF Port | RTSP Port | Web Interface |
|--------|-----------|-----------|---------------|
| Hikvision | 80 | 554 | 80 |
| Dahua | 80 | 554 | 80 |
| TP-Link | 2020 | 554 | 80 |
| Axis | 80 | 554 | 80 |
| Reolink | 8000 | 554 | 80 |
| Generic | 80/8080 | 554 | 80 |

## Firewall Rules Needed

If running on Windows with firewall enabled:

```powershell
# Allow ONVIF discovery (UDP multicast)
New-NetFirewallRule -DisplayName "ONVIF Discovery" -Direction Inbound -Protocol UDP -LocalPort 3702 -Action Allow

# Allow RTSP (TCP)
New-NetFirewallRule -DisplayName "RTSP" -Direction Outbound -Protocol TCP -RemotePort 554 -Action Allow
```

## Configuration for Different Camera Vendors

### Hikvision
```bash
# Usually works with:
CAMERA_USERNAME=admin
CAMERA_PASSWORD=<your-password>
# RTSP: rtsp://ip:554/Streaming/Channels/101 (main stream)
# RTSP: rtsp://ip:554/Streaming/Channels/102 (sub stream)
```

### Dahua/Lorex
```bash
CAMERA_USERNAME=admin
CAMERA_PASSWORD=<your-password>
# RTSP: rtsp://ip:554/cam/realmonitor?channel=1&subtype=0
```

### TP-Link Tapo
```bash
CAMERA_USERNAME=admin
CAMERA_PASSWORD=<your-password>
# RTSP: rtsp://ip:554/stream1 (high quality)
# RTSP: rtsp://ip:554/stream2 (low quality)
```

### Reolink
```bash
CAMERA_USERNAME=admin
CAMERA_PASSWORD=<your-password>
# RTSP: rtsp://ip:554/h264Preview_01_main (main stream)
# RTSP: rtsp://ip:554/h264Preview_01_sub (sub stream)
```

## Testing ONVIF Manually

If you want to verify ONVIF without running the edge agent:

### Using ONVIF Device Manager (Windows)
1. Download from https://sourceforge.net/projects/onvifdm/
2. Launch and click "Refresh"
3. Your cameras should appear
4. Double-click to view details and test stream

### Using onvif-cli (Command Line)
```powershell
npm install -g onvif

# Discover cameras
onvif-device-manager discover

# Get device info
onvif-device-manager info <camera-ip>
```

## Success Checklist

- [ ] All services running (control plane, media gateway, dashboard)
- [ ] Edge agent discovers 2 cameras
- [ ] Cameras appear in pending discoveries
- [ ] Cameras approved and appear in camera list
- [ ] Can create live session (get token)
- [ ] Media gateway returns HLS URL
- [ ] Video plays in dashboard

## What You Should See

### Terminal Outputs

**Edge Agent:**
```
Edge agent abc-123 registered; scanning the branch LAN
Discovered 2 ONVIF endpoint(s)
Submitted Hikvision DS-2CD2xxx (Compatibility note: ...)
Submitted <Vendor> <Model>
```

**Control Plane:**
```
{"level":30,"msg":"Request started"}
{"level":30,"msg":"Request completed","statusCode":201}
```

**Dashboard:**
- Branch list showing "Bengaluru Branch" (default)
- Camera tiles with "View Live" button
- Clicking shows live video feed

## Next Steps After Testing

Once you've verified it works with your 2 cameras:

1. **Add More Cameras:** Just ensure they're on the network and run discovery again
2. **Add Real Users:** Set up OIDC authentication (see PRODUCTION_READINESS_GAPS.md)
3. **Production Deployment:** Follow CRITICAL_FIXES_CHECKLIST.md
4. **Multiple Branches:** Create additional branches and assign cameras to them

## Support

If you run into issues:
1. Check the troubleshooting section above
2. Review logs: `docker-compose logs`
3. Verify camera ONVIF compatibility with vendor documentation
4. Test camera RTSP stream directly with VLC or ffprobe

## Estimated Time

- **Setup:** 10 minutes
- **Discovery:** 5 minutes (automatic)
- **Approval:** 2 minutes
- **First View:** 1 minute
- **Total:** ~20 minutes from zero to live video

Good luck! 🎥
