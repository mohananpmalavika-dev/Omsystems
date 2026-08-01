# Render Dashboard Troubleshooting

## Current Status

✅ Edge agent running locally  
✅ Cloudflare tunnel active: `https://apnic-deserve-evans-yarn.trycloudflare.com`  
✅ Tunnel is publicly accessible (verified)  
✅ Camera is online  
❌ Render dashboard getting 502 errors when trying to start live session  

---

## Checklist: Verify Render Configuration

### 1. Check Environment Variable is Set

Go to: https://dashboard.render.com → sentinel-grid-monitoring1 → Environment

**Verify this variable exists:**
```
MEDIA_GATEWAY_INTERNAL_URL=https://apnic-deserve-evans-yarn.trycloudflare.com
```

**Important:**
- NO trailing slash
- Must be HTTPS (not HTTP)
- Exact URL from the tunnel

### 2. Verify Deployment Completed

After saving environment variables, Render automatically redeploys.

**Check:**
- Go to: https://dashboard.render.com → sentinel-grid-monitoring1 → Events
- Look for: "Deploy succeeded" with a timestamp **AFTER** you updated the env var
- If deployment failed, check logs for errors

### 3. Check Render Logs

**While testing live view, watch the logs:**
- Go to: https://dashboard.render.com → sentinel-grid-monitoring1 → Logs
- Open live view in browser: https://sentinel-grid-monitoring1.onrender.com/control-room
- Click a camera to start live session
- Watch for errors in the logs

**Look for:**
- "Live-session startup failed" errors
- Connection timeout errors
- Media gateway errors
- CORS errors

### 4. Test from Render Server Directly

The Render dashboard server should be able to reach the tunnel. To verify, you can add a test endpoint:

Create `dashboard/app/api/test-tunnel/route.ts`:
```typescript
import { NextResponse } from "next/server";

export async function GET() {
  const tunnelUrl = process.env.MEDIA_GATEWAY_INTERNAL_URL;
  
  try {
    const response = await fetch(`${tunnelUrl}/health`, {
      headers: {
        "x-edge-bridge-key": process.env.EDGE_BRIDGE_SHARED_KEY || "",
      },
    });
    
    const body = await response.text();
    
    return NextResponse.json({
      success: true,
      tunnelUrl,
      status: response.status,
      body,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      tunnelUrl,
      error: error.message,
    }, { status: 500 });
  }
}
```

Then visit: `https://sentinel-grid-monitoring1.onrender.com/api/test-tunnel`

---

## Common Issues and Solutions

### Issue 1: 502 Bad Gateway

**Possible Causes:**
- Environment variable not set or typo in URL
- Deployment didn't complete successfully
- Tunnel URL changed (if you restarted cloudflared)
- Network connectivity issue from Render to Cloudflare

**Solutions:**
1. Double-check environment variable spelling
2. Wait for deployment to complete (can take 2-3 minutes)
3. Verify tunnel is still running: https://apnic-deserve-evans-yarn.trycloudflare.com/health
4. Check if tunnel URL changed (if you restarted the tunnel)

### Issue 2: CORS Errors

**Symptoms:**
- Browser console shows: "Access-Control-Allow-Origin" errors
- Network tab shows preflight requests failing

**Solution:**
The edge media gateway needs to allow CORS from the Render dashboard domain.

Check edge agent CORS configuration in `edge-agent/src/streaming/edge-live-gateway.ts`

### Issue 3: Authentication Errors

**Symptoms:**
- "unauthenticated" or "invalid_token" errors
- 401 status codes

**Solution:**
- Verify `EDGE_BRIDGE_SHARED_KEY` is set correctly in Render dashboard environment
- Must match the key in edge agent `.env`

### Issue 4: Timeout Errors

**Symptoms:**
- Request takes a long time then fails
- "Gateway timeout" errors

**Possible Causes:**
- Edge agent is not responding
- Tunnel is slow or unstable
- Camera is not reachable from edge agent

**Solutions:**
1. Check edge agent is still running (your PC)
2. Check tunnel terminal for errors
3. Verify camera is online: Check edge agent logs for heartbeat status

---

## Debug Commands

### Test Tunnel from Your PC
```bash
curl https://apnic-deserve-evans-yarn.trycloudflare.com/health
```

Should return:
```json
{"status":"ok","service":"sentinel-edge-media-gateway"}
```

### Test Tunnel from Internet
Use an online tool like:
- https://reqbin.com/
- https://httpie.io/app

Make a GET request to:
```
https://apnic-deserve-evans-yarn.trycloudflare.com/health
```

### Check Edge Agent Status
```bash
node c:\Omsystems\check-edge-agent.mjs
```

### Check Tunnel Process
```powershell
Get-Process cloudflared
```

### View Edge Agent Logs (last 50 lines)
```bash
# In Kiro IDE, check the terminal output of the edge agent process
# Process ID: term_1785608011069_ugvrv8sxs1
```

---

## Expected Behavior

When live view is working correctly:

1. User opens: https://sentinel-grid-monitoring1.onrender.com/control-room
2. User clicks camera
3. Dashboard calls: `/api/live` (Next.js API route)
4. API route calls control plane: `POST /v1/cameras/{id}/live-sessions`
5. Control plane returns a token and gateway URL
6. API route calls media gateway: `POST https://apnic-deserve-evans-yarn.trycloudflare.com/v1/live/start`
7. Media gateway starts streaming from camera
8. Media gateway returns HLS URL
9. Dashboard displays video player with HLS stream

**Timeline:** Should complete in 2-5 seconds

---

## Next Steps

1. **Verify environment variable is correctly set on Render**
   - Check spelling, no typos
   - No trailing slash
   - HTTPS not HTTP

2. **Wait for deployment to complete**
   - Check Events tab for "Deploy succeeded"
   - Should happen within 2-3 minutes of saving env vars

3. **Test live view again**
   - Clear browser cache
   - Open control room
   - Click camera
   - Watch Render logs for errors

4. **If still failing, check Render logs** for the actual error message
   - The logs will show exactly what's failing
   - Look for the "Live-session startup failed" error and its details

5. **If tunnel URL changed**, update it again:
   - Get current URL from cloudflared terminal output
   - Run: `node c:\Omsystems\register-tunnel.mjs <new-url>`
   - Update Render environment variable
   - Wait for redeployment

---

## Important Notes

⚠️ **Quick Tunnel Limitation:**  
The tunnel URL (`https://apnic-deserve-evans-yarn.trycloudflare.com`) changes every time you restart cloudflared. If you restart your PC or the tunnel, you must update the Render environment variable again.

✅ **For permanent solution:**  
Set up a named Cloudflare tunnel with a custom domain (e.g., `edge.yourdomain.com`). This URL won't change.

---

**Created:** August 1, 2026  
**Tunnel URL:** https://apnic-deserve-evans-yarn.trycloudflare.com  
**Edge Agent Process:** term_1785608011069_ugvrv8sxs1  
**Tunnel Process:** term_1785608313290_6meb1l52tj7  
