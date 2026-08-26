# 🚀 Quick Fix: Live Feed Not Working

## The Problem
**"Live feed unavailable - The media gateway is unavailable"**

The Render-hosted media gateway (https://sentinel-grid-media-gateway-ogqi.onrender.com) is **asleep** or **unreachable**.

## The Fastest Solution

### ✅ Run This PowerShell Script

```powershell
.\start-local.ps1
```

This single command will:
1. Start your **Control Plane** on port 8080
2. Start your **Edge Agent/Media Gateway** on port 8090
3. Start your **Dashboard** on port 3000

Each service opens in a new terminal window.

## What Happens Next?

1. **Wait 20-30 seconds** for all services to start
2. **Open your browser**: http://localhost:3000
3. **Login** with your credentials
4. **Navigate to**: Operations > Live View
5. **See your cameras** 🎉

## If It Doesn't Work

### Check 1: Are services running?

Visit these URLs:
- ✅ Control Plane: http://localhost:8080/health
- ✅ Media Gateway: http://localhost:8090/health  
- ✅ Dashboard: http://localhost:3000

### Check 2: Are cameras configured?

The edge agent needs:
1. Camera records in the database ✅ (You have 9 cameras)
2. Valid DVR/camera credentials
3. Network access to cameras
4. Cameras assigned to edge agent

### Check 3: Port conflicts?

If you get "port already in use":

```powershell
# Kill processes on ports
npx kill-port 8080 8090 3000
```

Then run `.\start-local.ps1` again.

## Alternative: Wake Up Render Services

If you prefer using Render instead of local:

1. **Go to**: https://render.com (login)
2. **Find**: sentinel-grid-media-gateway-ogqi
3. **Click**: "Manual Deploy" or restart
4. **Revert .env**: Change back to Render URL
   ```env
   MEDIA_GATEWAY_INTERNAL_URL=https://sentinel-grid-media-gateway-ogqi.onrender.com
   ```

## Configuration Summary

**Current Setup (Local Development):**
```
Dashboard        → http://localhost:3000
Control Plane    → http://localhost:8080  
Media Gateway    → http://localhost:8090 ← Changed from Render
Cameras          → Your local DVR/cameras
```

## Files Created/Modified

✅ **Modified**: `.env` (changed MEDIA_GATEWAY_INTERNAL_URL to localhost)
✅ **Created**: `start-local.ps1` (quick start script)
✅ **Created**: `LIVE_FEED_FIX.md` (detailed guide)
✅ **Created**: `START_LOCAL_SERVICES.md` (comprehensive docs)
✅ **Created**: `edge-agent/.env.example` (edge config template)

## Next Steps

1. **Run** `.\start-local.ps1`
2. **Wait** for services to start (20-30 seconds)
3. **Open** http://localhost:3000
4. **Check** camera feeds in Operations view

## Still Need Help?

Check the logs in each terminal window for specific errors. Common issues:

- **Database connection**: Check DATABASE_URL in .env
- **Camera connection**: Verify camera IPs and credentials in database
- **Port conflicts**: Use `npx kill-port 8080 8090 3000`
- **Missing dependencies**: Run `npm install` in each folder

---

**TL;DR**: Run `.\start-local.ps1`, wait 30 seconds, open http://localhost:3000
