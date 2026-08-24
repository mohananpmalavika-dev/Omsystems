# Live Video Wall Troubleshooting Guide

## Quick Diagnosis

1. **Visit the diagnostics page:** `https://your-domain.onrender.com/diagnostics`
2. **Check the debug endpoint:** `https://your-domain.onrender.com/api/live/debug`

## Common Issues and Solutions

### Issue 1: "Live authorization is unavailable"

**Root Cause:** Missing or invalid authentication token

**Solutions:**
- [ ] Navigate to `/login` and sign in with valid credentials
- [ ] Check if `accessToken` exists in localStorage (F12 → Console → `localStorage.getItem('accessToken')`)
- [ ] Clear cookies and localStorage, then log in again

### Issue 2: "Camera inventory is unavailable"

**Root Cause:** Backend control plane not accessible

**Solutions:**
- [ ] Verify `CONTROL_PLANE_URL` environment variable is set in Render
- [ ] Check if the control plane service is running
- [ ] Test the control plane API: `curl https://your-control-plane-url/health`

### Issue 3: "Control plane unavailable" (HTTP 502)

**Root Cause:** Dashboard cannot connect to the control plane backend

**Solutions:**
- [ ] Set `CONTROL_PLANE_INTERNAL_URL` or `CONTROL_PLANE_URL` in Render environment variables
- [ ] Verify the URL is correct and accessible from the dashboard service
- [ ] Check Render logs for connection errors

### Issue 4: Authentication Required (HTTP 401/403)

**Root Cause:** No valid session token

**Solutions:**
- [ ] Log in through the web interface
- [ ] Set `DASHBOARD_DEV_USER_ID` environment variable as fallback (e.g., `user-global-admin`)
- [ ] Check if cookies are being set correctly (`sentinel_access` cookie)

### Issue 5: No cameras visible

**Root Cause:** No cameras registered or permission issues

**Solutions:**
- [ ] Verify cameras are registered in the control plane
- [ ] Check user permissions for `live:view` action
- [ ] Test camera API: `GET /api/control/v1/cameras?limit=10`

## Required Environment Variables (Render)

### Dashboard Service
```bash
# Required
CONTROL_PLANE_URL=https://your-control-plane.railway.app
# or
CONTROL_PLANE_INTERNAL_URL=http://your-control-plane:8080

# Optional - for development/testing
DASHBOARD_DEV_USER_ID=user-global-admin

# Optional - for local media gateway
MEDIA_GATEWAY_INTERNAL_URL=http://localhost:8090
LOCAL_MEDIA_GATEWAY_URL=http://192.168.1.100:8090

# Bridge security
EDGE_BRIDGE_SHARED_KEY=your-shared-secret-key
```

### Control Plane Service
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-64-char-secret
COOKIE_SECRET=your-64-char-secret
PORT=8080
NODE_ENV=production
```

## Step-by-Step Fix

### 1. Check Authentication
```javascript
// Open browser console (F12)
console.log('Token:', localStorage.getItem('accessToken'));
console.log('Cookies:', document.cookie);
```

### 2. Test Camera API
```bash
# From browser console
fetch('/api/control/v1/cameras?limit=1', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('accessToken'),
    'x-sentinel-session': localStorage.getItem('accessToken')
  },
  credentials: 'include'
}).then(r => r.json()).then(console.log);
```

### 3. Test Live Session API
```bash
# From browser console
fetch('/api/live', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
  },
  body: JSON.stringify({ cameraId: 'test', profile: 'sub' })
}).then(r => r.json()).then(console.log);
```

### 4. Check Render Configuration

1. Go to Render dashboard
2. Select your dashboard service
3. Go to "Environment" tab
4. Verify these variables are set:
   - `CONTROL_PLANE_URL`
   - `EDGE_BRIDGE_SHARED_KEY` (if using bridge authentication)

5. Click "Manual Deploy" → "Deploy latest commit"

## Architecture Overview

```
Browser → Dashboard (Next.js on Render)
           ↓
         /api/control/[...path] (proxy)
           ↓
         Control Plane (Fastify on Railway)
           ↓
         PostgreSQL Database
           
Browser → Dashboard /api/live
           ↓
         Control Plane /v1/cameras/{id}/live-sessions
           ↓
         Media Gateway (local or cloud)
           ↓
         HLS/WebRTC Stream
```

## Testing Checklist

- [ ] Can access `/diagnostics` page
- [ ] Can access `/api/live/debug` endpoint
- [ ] All diagnostics pass with green checkmarks
- [ ] Can see cameras in the API response
- [ ] Can fetch camera list: `/api/control/v1/cameras`
- [ ] Browser console shows no authentication errors
- [ ] Token exists in localStorage
- [ ] Cookies are being set correctly
- [ ] Control plane is accessible from dashboard
- [ ] Media gateway is accessible (if using local gateway)

## Debug Logs

### Enable verbose logging in browser
```javascript
localStorage.setItem('debug', 'sentinel:*');
```

### Check Render logs
```bash
# In Render dashboard
Services → [Your Service] → Logs

# Look for:
- "Control-plane proxy request failed"
- "Live-session startup failed"
- Connection errors
- 502/503 errors
```

## Contact Support

If issues persist after following this guide:

1. Export diagnostics: Visit `/diagnostics` and copy all results
2. Check browser console for errors
3. Check Render logs for backend errors
4. Verify all environment variables are set
5. Ensure control plane service is running and healthy

## Recent Changes

- ✅ Added better error messages for camera API failures
- ✅ Added diagnostics page at `/diagnostics`
- ✅ Added debug endpoint at `/api/live/debug`
- ✅ Improved authentication error handling
