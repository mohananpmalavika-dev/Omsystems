# Fix Non-Working Cameras on Video Wall

## Quick Diagnosis

You have a video wall working with most cameras streaming, but **2 channels are not working** (showing "Watch live" button instead of video).

## Step 1: Check Browser Console (1 minute)

1. **Open browser console:** Press `F12` or right-click → Inspect
2. **Go to Console tab**
3. **Look for errors** related to those specific cameras
4. **Look for these error messages:**
   - "live_session_unavailable" → Camera stream not configured
   - "camera_not_found" → Camera deleted or ID changed
   - "forbidden" → No permission to view this camera
   - "media_gateway_unavailable" → Streaming gateway unreachable
   - "Failed to fetch" → Network/connectivity issue

## Step 2: Run Camera Diagnostic Script (2 minutes)

Copy and paste this into browser console (F12):

```javascript
// Camera diagnostic script
async function checkCameras() {
  const tiles = document.querySelectorAll('[data-activity-camera-id]');
  console.log(`\n🔍 Checking ${tiles.length} cameras...\n`);
  
  for (const tile of tiles) {
    const cameraId = tile.getAttribute('data-activity-camera-id');
    const hasVideo = tile.querySelector('video') !== null;
    const hasLive = tile.textContent.includes('LIVE');
    const hasWatch = tile.textContent.includes('Watch live');
    
    if (!hasLive && hasWatch) {
      console.log(`❌ Camera ${cameraId} - NOT STREAMING`);
      
      // Check camera status
      try {
        const response = await fetch(`/api/control/v1/cameras/${cameraId}`, {
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('accessToken') }
        });
        
        if (response.ok) {
          const camera = await response.json();
          console.log(`   Name: ${camera.name}`);
          console.log(`   Online: ${camera.onlineStatus || camera.status}`);
          console.log(`   Main Stream: ${camera.streams?.main || camera.mainStreamUrl || 'NOT CONFIGURED'}`);
          console.log(`   Sub Stream: ${camera.streams?.sub || camera.subStreamUrl || 'NOT CONFIGURED'}`);
          console.log(`   Device Type: ${camera.sourceType || camera.deviceType}`);
        } else {
          console.log(`   ⚠️ Camera API returned: ${response.status}`);
        }
      } catch (error) {
        console.log(`   ⚠️ Error fetching camera: ${error.message}`);
      }
      console.log('');
    }
  }
}

checkCameras();
```

This will show you exactly why those 2 cameras aren't working.

## Common Issues and Solutions

### Issue 1: Camera Offline ❌

**Symptoms:**
- Shows "Watch live" button
- Console shows: Camera status is "offline"

**Solutions:**
1. Check if camera is powered on
2. Check network cable connection
3. Verify camera is on the same network
4. Check DVR is online and recording from that channel
5. Ping camera IP address to verify connectivity

---

### Issue 2: Stream URL Not Configured 🎥

**Symptoms:**
- Shows "Watch live" button
- Console shows: "Main Stream: NOT CONFIGURED" and "Sub Stream: NOT CONFIGURED"

**Solutions:**
1. **For DVR channels:**
   - Check DVR is properly configured in control plane
   - Verify channel numbers are correct
   - Check DVR credentials are valid
   - Ensure DVR supports RTSP streaming

2. **For IP cameras:**
   - Configure RTSP stream URLs in camera settings
   - Typical format: `rtsp://username:password@ip:554/stream`
   - Check camera documentation for correct stream path

3. **Configure streams via API:**
   ```bash
   curl -X PATCH "http://localhost:3000/api/control/v1/cameras/{cameraId}" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "streams": {
         "main": "rtsp://admin:password@192.168.1.100:554/main",
         "sub": "rtsp://admin:password@192.168.1.100:554/sub"
       }
     }'
   ```

---

### Issue 3: Media Gateway Unreachable 🌐

**Symptoms:**
- Shows "Watch live" button
- Console shows: "media_gateway_unavailable" or "Failed to fetch"
- Other cameras work fine

**Solutions:**
1. Check media gateway URL in environment: `MEDIA_GATEWAY_INTERNAL_URL`
2. Verify Cloudflare Tunnel is active (you're using trycloudflare.com)
3. Restart Cloudflare Tunnel if it expired
4. Check tunnel logs for errors
5. Test gateway URL: `https://apnic-deserve-evans-yarn.trycloudflare.com/health`

**Your Current Gateway:**
```
MEDIA_GATEWAY_INTERNAL_URL=https://apnic-deserve-evans-yarn.trycloudflare.com
```

**Note:** Cloudflare Tunnel URLs expire! You may need to update this URL if the tunnel restarted.

---

### Issue 4: Authentication/Permission Issues 🔐

**Symptoms:**
- Shows "Watch live" button
- Console shows: "forbidden" or "approval_required"

**Solutions:**
1. Check user has permission to view those specific cameras
2. Verify camera access control settings
3. Check if camera requires approval workflow
4. Ensure user role has `live:view` permission

---

### Issue 5: DVR Channel Issues 📺

**Symptoms:**
- Other channels from same DVR work
- Console shows camera is online but no stream

**Solutions:**
1. **Check DVR channel is active:**
   - Log into DVR web interface
   - Verify that specific channel is enabled
   - Check channel has a connected camera

2. **Verify channel number mapping:**
   - Channel numbers in control plane must match DVR
   - CP PLUS DVR channels typically: 1-8, 1-16, etc.

3. **Check DVR stream limits:**
   - DVRs have max simultaneous stream limits
   - You might be hitting the stream limit
   - Reduce number of live streams or upgrade DVR

4. **Test DVR stream directly:**
   ```bash
   # Test if DVR channel stream works
   ffplay "rtsp://admin:password@dvr-ip:554/cam/realmonitor?channel=5&subtype=0"
   ```

---

## Step 3: Identify Which Cameras Are Failing

From your screenshot, identify the specific cameras showing "Watch live":
1. Note their channel numbers (e.g., "CP PLUS DVR - Channel 5")
2. Note their IP addresses if visible
3. Check if they're from the same DVR or different devices

## Step 4: Check DVR Stream Limits

If all non-working cameras are from the same DVR:

**Problem:** DVR has a maximum stream limit (typically 4-8 simultaneous streams)

**Solution:**
1. Check DVR specifications for max streams
2. Count how many streams are currently active
3. Options:
   - Use sub-streams instead of main streams (lower bandwidth)
   - Reduce number of cameras displayed simultaneously
   - Use rotation/sequencing mode
   - Upgrade to a DVR with higher stream capacity

## Step 5: Test Individual Camera Stream

For each non-working camera, test if the stream URL works:

### Using VLC Player:
1. Open VLC
2. Media → Open Network Stream
3. Enter RTSP URL: `rtsp://admin:password@dvr-ip:554/cam/realmonitor?channel=X&subtype=1`
4. If it works in VLC but not in the video wall, it's a configuration issue
5. If it doesn't work in VLC, it's a camera/DVR issue

### Using Browser:
```javascript
// Test in browser console
const testCameraId = 'YOUR_CAMERA_ID';
fetch(`/api/live`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
  },
  body: JSON.stringify({ cameraId: testCameraId, profile: 'sub' })
})
.then(r => r.json())
.then(response => {
  console.log('Live session response:', response);
  if (response.error) {
    console.error('❌ Error:', response.error);
  } else {
    console.log('✅ Stream URL:', response.hls?.url || response.webRtc?.whepUrl);
  }
});
```

## Step 6: Quick Fixes

### Quick Fix #1: Switch to Sub-Stream
If using main streams, try sub-streams (uses less bandwidth):
1. Click on the camera tile
2. Click the "MAIN" button to switch to "SUB"
3. Try "Watch live" again

### Quick Fix #2: Restart Media Gateway
If using Cloudflare Tunnel, restart it:
```bash
# Your tunnel might have expired
# Restart the tunnel process
# Update MEDIA_GATEWAY_INTERNAL_URL with new URL
```

### Quick Fix #3: Reduce Concurrent Streams
1. Close some live streams
2. Try starting the non-working cameras
3. If they work, you've hit stream/decoder limit

### Quick Fix #4: Check Decoder Limit
The video wall has a decoder limit. Check if you've exceeded it:
- Look for "Decoder capacity" setting in the toolbar
- Current limit shown at top (e.g., "16 live max")
- If all slots are used, close some streams first

## Step 7: Check Control Plane Logs

If still not working, check backend logs:

### For Render-hosted control plane:
1. Go to Render Dashboard
2. Select control plane service
3. Check Logs tab
4. Look for errors related to those camera IDs
5. Search for: "live-session", camera IDs, "stream", "gateway"

### Common log errors:
- "Camera not found" → Camera deleted or ID mismatch
- "Stream URL not configured" → Missing RTSP URLs
- "Media gateway timeout" → Gateway connectivity issue
- "DVR authentication failed" → Wrong DVR credentials

## Expected Results

After following these steps, you should identify one of these causes:

✅ **Camera Offline** → Power on camera or check network  
✅ **Stream Not Configured** → Add RTSP URLs to camera  
✅ **DVR Stream Limit** → Reduce concurrent streams  
✅ **Gateway Unreachable** → Restart/reconfigure media gateway  
✅ **Permission Issue** → Grant user access to cameras  
✅ **DVR Channel Inactive** → Enable channel in DVR settings  

## Need More Help?

Run the full diagnostic:
```javascript
// Paste this in browser console
fetch('/api/cameras/YOUR_CAMERA_ID/status')
  .then(r => r.json())
  .then(status => {
    console.log('Camera Status:', status);
    console.log('Can Stream:', status.diagnostics?.canStream);
    console.log('Issues:', status.diagnostics?.issues);
    console.log('Warnings:', status.diagnostics?.warnings);
  });
```

Share the output with your admin or support team.

## Summary Checklist

- [ ] Checked browser console for errors
- [ ] Ran camera diagnostic script
- [ ] Verified cameras are online
- [ ] Checked stream URLs are configured
- [ ] Tested RTSP stream with VLC/ffplay
- [ ] Verified not hitting DVR stream limit
- [ ] Checked media gateway is accessible
- [ ] Verified user has camera permissions
- [ ] Checked DVR channels are active
- [ ] Reviewed control plane logs
- [ ] Tested switching main/sub streams
- [ ] Checked decoder capacity limit

Once you identify the root cause, follow the specific solution steps above to fix it!
