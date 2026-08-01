# 🎉 Cloudflare Tunnel Active!

**Status:** ✅ ACTIVE  
**Tunnel URL:** `https://apnic-deserve-evans-yarn.trycloudflare.com`  
**Started:** August 1, 2026 at 6:18 PM IST  

---

## What's Working

✅ Edge agent running locally (port 8090)  
✅ Cloudflare tunnel exposing edge agent publicly  
✅ Tunnel URL registered in control plane  
✅ Public health check working: https://apnic-deserve-evans-yarn.trycloudflare.com/health  

---

## Next Step: Update Render Dashboard

To make live streaming work on the Render-hosted dashboard, you need to update the environment variable:

### Option 1: Using Render Dashboard (Recommended)

1. **Go to Render Dashboard:**
   - Open: https://dashboard.render.com
   - Navigate to: `sentinel-grid-monitoring1` (your dashboard service)

2. **Update Environment Variable:**
   - Click "Environment" in the left sidebar
   - Find or add: `MEDIA_GATEWAY_INTERNAL_URL`
   - Set value to: `https://apnic-deserve-evans-yarn.trycloudflare.com`
   - Click "Save Changes"

3. **Wait for Redeployment:**
   - Render will automatically redeploy your dashboard
   - Wait ~2-3 minutes for deployment to complete

4. **Test Live Streaming:**
   - Open: https://sentinel-grid-monitoring1.onrender.com/control-room
   - Click on your camera (IPC_NT98566_IPG-N4C-WQ2_S38)
   - Live video should now work! 🎥

### Option 2: Using Render CLI

If you have Render CLI installed:

```bash
render env set MEDIA_GATEWAY_INTERNAL_URL=https://apnic-deserve-evans-yarn.trycloudflare.com --service=sentinel-grid-monitoring1
```

---

## Important Notes

### ⚠️ Quick Tunnel Limitations

This is a "quick tunnel" which means:
- **The URL changes every time you restart the tunnel**
- No uptime guarantee
- Best for testing and development

**For each restart, you must:**
1. Get the new tunnel URL from cloudflared output
2. Run: `node c:\Omsystems\register-tunnel.mjs <new-tunnel-url>`
3. Update Render dashboard environment variable
4. Restart Render dashboard

### 🔄 Keeping Tunnel Running 24/7

**Current Setup:**
- Terminal 1: Edge agent (`term_1785608011069_ugvrv8sxs1`)
- Terminal 2: Cloudflare tunnel (`term_1785608313290_6meb1l52tj7`)

**To keep running:**
- Keep both terminals open
- Don't close or stop these processes

**If tunnel stops:**
```bash
cd c:\Omsystems\edge-agent
.\cloudflared.exe tunnel --url http://localhost:8090
```
Then register the new URL.

### 🚀 Permanent Solution (Coming Soon)

For production 24/7 operation, we should set up:
1. **Named Cloudflare Tunnel** (requires Cloudflare account + domain)
   - Permanent URL (e.g., `edge.yourdomain.com`)
   - Automatic reconnection
   - No URL changes

2. **Windows Services**
   - Edge agent runs as Windows service (auto-start on boot)
   - Cloudflare tunnel runs as Windows service
   - Survives restarts and crashes

Let me know if you want to set this up!

---

## Testing Checklist

Before updating Render:

- [x] Edge agent running locally
- [x] Cloudflare tunnel active
- [x] Tunnel URL registered in control plane
- [x] Public health check working
- [ ] Render dashboard environment updated
- [ ] Render dashboard redeployed
- [ ] Live streaming tested

---

## Troubleshooting

### If live streaming still doesn't work after updating Render:

1. **Check tunnel is still active:**
   ```bash
   curl https://apnic-deserve-evans-yarn.trycloudflare.com/health
   ```
   Should return: `{"status":"ok","service":"sentinel-edge-media-gateway"}`

2. **Check Render logs:**
   - Go to Render dashboard → sentinel-grid-monitoring1 → Logs
   - Look for errors about MEDIA_GATEWAY_INTERNAL_URL

3. **Verify environment variable is set:**
   - Render dashboard → sentinel-grid-monitoring1 → Environment
   - Confirm `MEDIA_GATEWAY_INTERNAL_URL` shows the tunnel URL

4. **Restart edge agent if needed:**
   ```bash
   # Stop current processes
   # Then restart:
   cd c:\Omsystems\edge-agent
   node start-with-env.mjs
   ```

5. **Check camera status:**
   - Is camera online?
   - Is camera approved?
   - Check: https://sentinel-grid-control-plane1.onrender.com/admin

---

## Contact

If you encounter issues, check:
- Edge agent terminal output
- Cloudflare tunnel terminal output  
- Render dashboard logs
- Browser console errors

---

**Created:** August 1, 2026  
**Tunnel Process ID:** term_1785608313290_6meb1l52tj7  
**Edge Agent Process ID:** term_1785608011069_ugvrv8sxs1
