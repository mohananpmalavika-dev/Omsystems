# 🎯 Update Render Dashboard for Live Streaming

## Current Situation

✅ Edge agent is running on your PC with live media gateway  
✅ Cloudflare tunnel is exposing it publicly: `https://apnic-deserve-evans-yarn.trycloudflare.com`  
✅ Tunnel health check works: Returns `{"status":"ok","service":"sentinel-edge-media-gateway"}`  
✅ Camera is online and heartbeating  
❌ Render dashboard returns 502 errors when trying to start live sessions  

**Why?** The Render dashboard doesn't know about your tunnel URL yet!

---

## Solution: Update Render Environment Variables

### Step 1: Go to Render Dashboard

1. Open: **https://dashboard.render.com**
2. Sign in to your account
3. Find and click: **sentinel-grid-monitoring1** (your dashboard service)

### Step 2: Update Environment Variables

1. In the left sidebar, click: **Environment**
2. You'll see a list of environment variables
3. Find or add these variables:

#### Required Update:

**`MEDIA_GATEWAY_INTERNAL_URL`**
- **Current value:** Probably `https://sentinel-grid-media-gateway1.onrender.com` or empty
- **New value:** `https://apnic-deserve-evans-yarn.trycloudflare.com`
- **Why:** This tells the dashboard where to find your local camera gateway

#### Verify These Are Set (should already be there):

**`CONTROL_PLANE_INTERNAL_URL`** or **`CONTROL_PLANE_PUBLIC_URL`**
- Value: `https://sentinel-grid-control-plane1.onrender.com`
- Why: Dashboard needs to talk to control plane

**`EDGE_BRIDGE_SHARED_KEY`**
- Value: `WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa`
- Why: Authentication between services

**`DASHBOARD_DEMO_MODE`**
- Value: `false`
- Why: Use real backend, not demo data

### Step 3: Save and Deploy

1. Click: **Save Changes** (usually at the top or bottom)
2. Render will automatically redeploy your dashboard
3. Wait for deployment to complete (~2-3 minutes)
   - You'll see a "Deploying..." indicator
   - Wait until it shows "Live"

### Step 4: Test Live Streaming

1. Open: **https://sentinel-grid-monitoring1.onrender.com**
2. Log in if needed (username: admin@sentinel.local, password: admin123)
3. Go to: **Control Room** or **Cameras** page
4. Find your camera: **IPC_NT98566_IPG-N4C-WQ2_S38**
5. Click: **Watch Live** or the camera tile
6. Wait 5-10 seconds for stream to start
7. **Video should play!** 🎉

---

## Screenshot Guide

### Finding the Environment Tab

```
Render Dashboard
├── [Your Services]
│   └── sentinel-grid-monitoring1  ← Click here
│       ├── Overview
│       ├── Events
│       ├── Logs
│       ├── Shell
│       ├── Environment  ← Click here
│       ├── Settings
│       └── ...
```

### Adding/Editing Environment Variables

You'll see a table like this:

```
┌───────────────────────────────────┬─────────────────────────────────────┬─────────┐
│ Key                               │ Value                               │ Actions │
├───────────────────────────────────┼─────────────────────────────────────┼─────────┤
│ CONTROL_PLANE_PUBLIC_URL          │ https://sentinel-grid-control-...   │ [Edit]  │
│ EDGE_BRIDGE_SHARED_KEY            │ WBRrQzol9g...                       │ [Edit]  │
│ MEDIA_GATEWAY_INTERNAL_URL        │ https://sentinel-grid-media-gat...  │ [Edit]  │← Edit this one!
│ DASHBOARD_DEMO_MODE               │ false                               │ [Edit]  │
└───────────────────────────────────┴─────────────────────────────────────┴─────────┘

                         [Add Environment Variable]  [Save Changes]
```

**Click [Edit]** next to `MEDIA_GATEWAY_INTERNAL_URL`

Change from: `https://sentinel-grid-media-gateway1.onrender.com`  
Change to: `https://apnic-deserve-evans-yarn.trycloudflare.com`

**Click [Save Changes]**

---

## Alternative: Using Render CLI

If you have Render CLI installed:

```bash
# Install Render CLI (if not installed)
npm install -g @render/cli

# Login
render login

# Update environment variable
render env set \
  --service sentinel-grid-monitoring1 \
  MEDIA_GATEWAY_INTERNAL_URL=https://apnic-deserve-evans-yarn.trycloudflare.com

# Check it was updated
render env list --service sentinel-grid-monitoring1
```

---

## Troubleshooting

### After updating, still getting 502 errors?

1. **Check deployment completed:**
   - Render dashboard → sentinel-grid-monitoring1 → Events
   - Look for "Deploy succeeded" message

2. **Check environment variable was saved:**
   - Render dashboard → sentinel-grid-monitoring1 → Environment
   - Verify `MEDIA_GATEWAY_INTERNAL_URL` shows the tunnel URL

3. **Check tunnel is still active:**
   ```bash
   curl https://apnic-deserve-evans-yarn.trycloudflare.com/health
   ```
   Should return: `{"status":"ok","service":"sentinel-edge-media-gateway"}`

4. **Check Render logs:**
   - Render dashboard → sentinel-grid-monitoring1 → Logs
   - Look for errors mentioning "MEDIA_GATEWAY" or "live session"

5. **Restart dashboard manually:**
   - Render dashboard → sentinel-grid-monitoring1
   - Click: **Manual Deploy** → **Deploy latest commit**

### Edge agent or tunnel stopped working?

**Check if processes are running:**
```bash
# From your PC
cd c:\Omsystems

# Check edge agent
node check-edge-agent.mjs

# Check tunnel health
curl https://apnic-deserve-evans-yarn.trycloudflare.com/health
```

**If edge agent stopped:**
```bash
cd c:\Omsystems\edge-agent
node start-with-env.mjs
```

**If tunnel stopped:**
```bash
cd c:\Omsystems\edge-agent
.\cloudflared.exe tunnel --url http://localhost:8090

# Copy the new URL that appears
# Then register it:
cd c:\Omsystems
node register-tunnel.mjs https://NEW-TUNNEL-URL.trycloudflare.com

# And update Render dashboard with the NEW URL
```

---

## Understanding the Flow

When you click "Watch Live" on Render dashboard:

```
1. Browser → Render Dashboard: "Start live for camera X"
   
2. Render Dashboard → Control Plane: "Create live session"
   
3. Control Plane → Edge Agent (via tunnel): "Start streaming"
   ↓
   https://apnic-deserve-evans-yarn.trycloudflare.com/v1/live/start
   
4. Edge Agent → Camera: Connect to rtsp://192.168.x.x:554
   
5. Edge Agent → Browser: "Stream ready at tunnel-url/hls/..."
   
6. Browser → Cloudflare Tunnel → Edge Agent → Camera: Video flows!
```

**The critical piece:** Render dashboard must know the tunnel URL in step 3!

---

## Important Notes

### ⚠️ Quick Tunnel URL Changes

Remember, this is a "quick tunnel" - the URL changes every restart!

**When you restart the tunnel:**
1. Get new URL from cloudflared output
2. Register with control plane:
   ```bash
   node c:\Omsystems\register-tunnel.mjs <new-url>
   ```
3. Update Render dashboard environment variable
4. Wait for Render redeployment

**For permanent solution:** Set up a named Cloudflare tunnel (requires domain)

### 🔄 Keeping Services Running

**Your PC must stay on with:**
- Edge agent running
- Cloudflare tunnel running

**If PC restarts or processes stop:**
- Live streaming will fail
- Dashboard will show "Camera offline" or 502 errors

---

## Next Steps After This Works

1. **Test from mobile device** (outside your network)
2. **Set up named tunnel** for permanent URL
3. **Install as Windows services** for auto-start
4. **Add more cameras** to the system
5. **Enable recording** for cameras

---

## Quick Checklist

Before testing live streaming on Render:

- [ ] Edge agent is running (`node check-edge-agent.mjs` shows all green)
- [ ] Cloudflare tunnel is active (health check works)
- [ ] Tunnel URL registered in control plane
- [ ] Render dashboard environment updated with tunnel URL
- [ ] Render dashboard redeployment completed
- [ ] Camera shows as "online" in admin panel

---

**Created:** August 1, 2026  
**Tunnel URL:** `https://apnic-deserve-evans-yarn.trycloudflare.com`  
**Status:** Waiting for Render environment update

Once you update Render and redeploy, test the live stream and let me know the result!
