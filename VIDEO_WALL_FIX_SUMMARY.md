# Live Video Wall Fix - Summary

## Changes Made

### 1. Diagnostics Page ✅
**File:** `dashboard/app/diagnostics/page.tsx` (NEW)

**What it does:**
- Checks authentication token in localStorage
- Tests session authentication
- Verifies environment variables
- Tests camera API connectivity
- Tests live session API
- Checks cookies
- Provides specific error messages for each component

**Access:** `https://your-domain.onrender.com/diagnostics`

### 2. Debug Endpoint ✅
**File:** `dashboard/app/api/live/debug/route.ts` (NEW)

**What it does:**
- Returns authentication status
- Shows environment configuration
- Displays token source
- JSON format for easy testing

**Access:** `https://your-domain.onrender.com/api/live/debug`

### 3. Enhanced Error Handling ✅
**File:** `dashboard/components/adaptive-video-wall.tsx` (MODIFIED)

**Changes:**
- Better error messages based on HTTP status codes
- Specific handling for 401/403 (authentication)
- Specific handling for 502/503 (backend unavailable)
- Specific handling for 404 (endpoint not found)
- Added console logging for debugging
- Better empty state handling

### 4. Video Wall Page Enhancement ✅
**File:** `dashboard/app/operations/video-wall/page.tsx` (MODIFIED)

**Changes:**
- Added authentication check banner
- Added diagnostics link banner
- Better user guidance
- Auto-detects missing authentication
- Made it a client component for interactivity

### 5. Documentation ✅
**Files:**
- `VIDEO_WALL_TROUBLESHOOTING.md` - Comprehensive troubleshooting guide
- `IMMEDIATE_FIX_STEPS.md` - Step-by-step fix instructions
- `VIDEO_WALL_FIX_SUMMARY.md` - This file

## How to Use

### For End Users
1. Visit `/operations/video-wall`
2. If you see errors, click "run diagnostics" link
3. Follow the suggested solutions on the diagnostics page
4. Or follow steps in `IMMEDIATE_FIX_STEPS.md`

### For Administrators
1. Check `VIDEO_WALL_TROUBLESHOOTING.md` for architecture overview
2. Verify Render environment variables are set correctly
3. Ensure control plane backend is running and accessible
4. Check backend logs for connection errors
5. Use `/diagnostics` page to identify specific issues

## Most Common Issues and Quick Fixes

### Issue #1: Not Logged In
**Symptom:** Yellow banner "Authentication Required"
**Fix:** Click "Sign in here" or go to `/login`

### Issue #2: Missing CONTROL_PLANE_URL
**Symptom:** Red error "Control plane service is unavailable"
**Fix:**
1. Render Dashboard → Environment
2. Add: `CONTROL_PLANE_URL=https://your-backend-url`
3. Manual Deploy
4. Wait 2-3 minutes

### Issue #3: Backend Service Down
**Symptom:** Red error "Control plane unavailable (HTTP 502)"
**Fix:**
1. Check Railway/Render dashboard
2. Verify backend service is running
3. Check backend logs
4. Restart if needed

### Issue #4: No Cameras
**Symptom:** "No cameras are assigned to this operator or branch"
**Fix:**
1. Register cameras in control plane
2. Verify user has `live:view` permission
3. Check camera status in control plane

## Environment Variables Required

### Render Dashboard Service
```bash
# Required - points to your control plane backend
CONTROL_PLANE_URL=https://your-control-plane.railway.app

# Optional - for development/testing without login
DASHBOARD_DEV_USER_ID=user-global-admin

# Optional - if using edge agent bridge
EDGE_BRIDGE_SHARED_KEY=your-shared-secret-key

# Optional - for local media gateway
MEDIA_GATEWAY_INTERNAL_URL=http://localhost:8090
```

### Railway Control Plane Service  
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-64-char-secret
COOKIE_SECRET=your-64-char-secret
PORT=8080
NODE_ENV=production
```

## Testing Commands

Run these in browser console (F12):

```javascript
// 1. Check token
localStorage.getItem('accessToken')

// 2. Test camera API
fetch('/api/control/v1/cameras?limit=1', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
  }
}).then(r => r.json()).then(console.log)

// 3. Get debug info
fetch('/api/live/debug').then(r => r.json()).then(console.log)
```

## Architecture

```
┌─────────┐
│ Browser │
└────┬────┘
     │
     ├─── /operations/video-wall (Video Wall Page)
     │         │
     │         └─── AdaptiveVideoWall Component
     │                   │
     │                   └─── fetch('/api/control/v1/cameras')
     │
     ├─── /diagnostics (Diagnostics Page)
     │         │
     │         ├─── Check localStorage
     │         ├─── fetch('/api/live/debug')
     │         ├─── fetch('/api/control/v1/cameras')
     │         └─── fetch('/api/live')
     │
     └─── /api/control/[...path] (Proxy to Control Plane)
               │
               └─── Control Plane Backend (Railway)
                         │
                         ├─── PostgreSQL Database
                         └─── Media Gateway
```

## Success Metrics

When working correctly, you should see:

✅ **Diagnostics Page**
- All checks green
- No red errors
- Shows camera count

✅ **Video Wall Page**
- Camera grid visible
- Camera names displayed
- Either live video or "Watch live" buttons
- No "authorization unavailable" errors

✅ **Browser Console**
- No 401/403 errors
- No 502/503 errors
- Access token present

✅ **Network Tab**
- Camera API returns 200
- Live API returns 200 or 404 (expected if camera doesn't exist)
- No CORS errors

## File Changes Summary

**New Files:**
- `dashboard/app/diagnostics/page.tsx` - Full system diagnostics
- `dashboard/app/api/live/debug/route.ts` - Authentication debug endpoint
- `IMMEDIATE_FIX_STEPS.md` - Quick fix guide
- `VIDEO_WALL_TROUBLESHOOTING.md` - Comprehensive troubleshooting
- `VIDEO_WALL_FIX_SUMMARY.md` - This summary

**Modified Files:**
- `dashboard/components/adaptive-video-wall.tsx` - Better error handling
- `dashboard/app/operations/video-wall/page.tsx` - Added helpful banners

## Next Steps

1. **Test the changes:**
   - Visit `/diagnostics`
   - Run all diagnostic tests
   - Verify all pass or identify issues

2. **Fix identified issues:**
   - Follow suggestions on diagnostics page
   - Set missing environment variables
   - Ensure backend is accessible

3. **Register cameras:**
   - Add cameras to control plane
   - Verify camera connectivity
   - Test live streaming

4. **Configure permissions:**
   - Ensure users have `live:view` action
   - Set up role-based access
   - Test with different user roles

5. **Monitor and maintain:**
   - Check logs regularly
   - Monitor diagnostics page
   - Keep backend services healthy

## Support

If issues persist:

1. Visit `/diagnostics` and screenshot results
2. Check browser console (F12) for errors
3. Check Render logs for backend issues
4. Verify all environment variables
5. Ensure control plane is running
6. Test backend health endpoint: `{CONTROL_PLANE_URL}/health`

## Rollback

If these changes cause issues:

```bash
# Revert adaptive-video-wall.tsx
git checkout HEAD -- dashboard/components/adaptive-video-wall.tsx

# Revert video-wall page
git checkout HEAD -- dashboard/app/operations/video-wall/page.tsx

# Remove new files
rm dashboard/app/diagnostics/page.tsx
rm dashboard/app/api/live/debug/route.ts
```

However, all changes are additive and should not break existing functionality.
