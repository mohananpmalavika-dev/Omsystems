# Immediate Steps to Fix Live Video Wall

## Problem
The live video wall at `/operations/video-wall` is showing "Live feed unavailable" and "Live authorization is unavailable".

## Root Cause
One or more of these issues:
1. Not logged in / no authentication token
2. Missing `CONTROL_PLANE_URL` environment variable on Render
3. Control plane backend service not accessible
4. No cameras registered in the system

## Immediate Fix Steps

### Step 1: Run Diagnostics (2 minutes)

Visit: `https://sentinel-grid-monitoring-b54t.onrender.com/diagnostics`

This will show you exactly what's wrong:
- ✅ Green = Working
- ⚠️ Yellow = Warning  
- ❌ Red = Problem

### Step 2: Check If You're Logged In (30 seconds)

1. Open browser console (Press F12)
2. Run this command:
```javascript
localStorage.getItem('accessToken')
```

**If it returns `null`:**
- Go to `/login` and sign in
- Then return to `/operations/video-wall`

**If it returns a token:**
- Continue to Step 3

### Step 3: Verify Environment Variables in Render (3 minutes)

1. Go to your Render dashboard: https://dashboard.render.com
2. Select service: `sentinel-grid-monitoring-b54t`
3. Click "Environment" tab
4. Check these variables exist:

```bash
# Required - must point to your control plane backend
CONTROL_PLANE_URL=https://your-backend.railway.app
# OR
CONTROL_PLANE_INTERNAL_URL=http://your-backend:8080

# Optional but recommended for development
DASHBOARD_DEV_USER_ID=user-global-admin

# If using edge agent bridge
EDGE_BRIDGE_SHARED_KEY=your-shared-key
```

**If `CONTROL_PLANE_URL` is missing:**
- Add it with your Railway control plane URL
- Click "Manual Deploy" → "Deploy latest commit"
- Wait 2-3 minutes for deployment
- Test again

### Step 4: Test Camera API (1 minute)

Open browser console and run:
```javascript
fetch('/api/control/v1/cameras?limit=1', {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('accessToken'),
    'x-sentinel-session': localStorage.getItem('accessToken')
  },
  credentials: 'include'
})
.then(r => r.json())
.then(console.log)
```

**Expected response:**
```json
{
  "data": [ /* array of cameras */ ]
}
```

**If you get an error:**
- Check Step 3 again
- Verify your control plane backend is running

### Step 5: Check Backend Service (2 minutes)

1. Go to your Railway dashboard (or wherever control plane is hosted)
2. Check if the service is running and healthy
3. Check logs for any errors
4. Test health endpoint: `https://your-backend.railway.app/health`

## Quick Test Commands

Run these in your browser console to test each component:

```javascript
// 1. Check authentication
console.log('Token:', localStorage.getItem('accessToken'));

// 2. Test camera API
fetch('/api/control/v1/cameras?limit=1', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
  }
}).then(r => r.json()).then(console.log);

// 3. Test live debug endpoint
fetch('/api/live/debug').then(r => r.json()).then(console.log);

// 4. Check cookies
console.log('Cookies:', document.cookie);
```

## Most Likely Solutions

### Solution A: Not Logged In ✅
```
1. Go to /login
2. Sign in with credentials
3. Return to /operations/video-wall
```

### Solution B: Missing CONTROL_PLANE_URL ✅
```
1. Render Dashboard → Your Service → Environment
2. Add: CONTROL_PLANE_URL=https://your-backend-url
3. Click "Manual Deploy"
4. Wait 2-3 minutes
5. Refresh page
```

### Solution C: Backend Service Down ✅
```
1. Check your backend hosting platform (Railway/Render)
2. Verify service is running
3. Check logs for errors
4. Restart service if needed
```

## Success Criteria

When fixed, you should see:
- ✅ Camera grid with tiles
- ✅ Camera names and locations
- ✅ Live video feeds (or "Watch live" buttons)
- ✅ No "Live authorization unavailable" errors

## Need More Help?

If still not working after these steps:

1. **Visit** `/diagnostics` - Shows detailed system status
2. **Check** browser console (F12) for JavaScript errors
3. **Review** Render logs for backend errors
4. **Verify** all cameras are registered in control plane
5. **Confirm** user has `live:view` permission

## Changes Made

I've added the following to help diagnose and fix this issue:

1. ✅ **Diagnostics page** at `/diagnostics`
   - Shows authentication status
   - Tests all API endpoints
   - Displays configuration
   - Provides specific error messages

2. ✅ **Debug endpoint** at `/api/live/debug`
   - Shows authentication details
   - Shows environment configuration
   - JSON format for easy testing

3. ✅ **Improved error messages**
   - Better error handling in `adaptive-video-wall.tsx`
   - Specific HTTP status code messages
   - Helpful suggestions for common issues

4. ✅ **Documentation**
   - This immediate fix guide
   - Comprehensive troubleshooting guide
   - Architecture overview

## Next Steps After Fix

Once the video wall is working:

1. Register cameras in the control plane
2. Configure camera permissions
3. Set up media gateway (if using local/edge streaming)
4. Configure recording policies
5. Test live streaming with real cameras
