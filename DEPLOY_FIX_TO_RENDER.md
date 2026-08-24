# Deploy Video Wall Fix to Render

## Problem
The diagnostics page shows "Not Found" because Render hasn't deployed the latest code yet.

## Solution: Trigger a Render Deployment

### Option 1: Manual Deploy (Fastest - 2 minutes)

1. **Go to Render Dashboard:**
   - Visit: https://dashboard.render.com
   - Log in with your account

2. **Select Your Service:**
   - Find: `sentinel-grid-monitoring-b54t`
   - Click on it

3. **Trigger Manual Deploy:**
   - Click "Manual Deploy" button (top right)
   - Select "Deploy latest commit"
   - Click "Deploy"

4. **Wait for Deployment:**
   - Watch the logs
   - Wait 3-5 minutes for build and deployment
   - Status will change to "Live"

5. **Test:**
   - Visit: `https://sentinel-grid-monitoring-b54t.onrender.com/diagnostics`
   - Should now show the diagnostics page instead of "Not Found"

### Option 2: Push a New Commit (Automatic Deploy)

If auto-deploy is enabled, just push any change:

```bash
cd c:\Omsystems
echo "# Trigger deployment" >> README.md
git add README.md
git commit -m "Trigger Render deployment for video wall fixes"
git push origin main
```

Render will automatically detect the push and deploy.

### Option 3: Use Render Deploy Hook (If Configured)

If you have a deploy hook URL:

```bash
curl -X POST "https://api.render.com/deploy/srv-YOUR-SERVICE-ID?key=YOUR-KEY"
```

## What to Expect After Deployment

### New Routes Available:
1. **`/diagnostics`** - Full system diagnostics page
2. **`/api/live/debug`** - Authentication debug endpoint
3. **`/operations/video-wall`** - Enhanced with helpful banners

### Files Deployed:
- ✅ `dashboard/app/diagnostics/page.tsx`
- ✅ `dashboard/app/api/live/debug/route.ts`
- ✅ `dashboard/components/adaptive-video-wall.tsx` (improved)
- ✅ `dashboard/app/operations/video-wall/page.tsx` (improved)

## Testing After Deployment

### 1. Test Diagnostics Page
Visit: `https://sentinel-grid-monitoring-b54t.onrender.com/diagnostics`

**Expected:** Full diagnostics page with system checks

### 2. Test Debug Endpoint
Visit: `https://sentinel-grid-monitoring-b54t.onrender.com/api/live/debug`

**Expected:** JSON response with authentication and environment info

### 3. Test Video Wall
Visit: `https://sentinel-grid-monitoring-b54t.onrender.com/operations/video-wall`

**Expected:** 
- Yellow banner if not logged in
- Blue info banner with diagnostics link
- Better error messages if issues exist

## Common Deployment Issues

### Issue: Build Fails
**Symptoms:** Render shows "Build failed" in logs
**Solution:**
1. Check Render logs for specific error
2. Verify `package.json` is correct
3. Ensure all dependencies are installed
4. Check for TypeScript errors

### Issue: Deployment Times Out
**Symptoms:** Build takes too long, Render stops it
**Solution:**
1. Check if build is hanging on TypeScript
2. Increase build timeout in Render settings
3. Consider simplifying the diagnostics page

### Issue: Routes Still Show 404
**Symptoms:** After deployment, pages still not found
**Solution:**
1. Clear browser cache (Ctrl+Shift+R)
2. Check Render logs to confirm deployment succeeded
3. Verify the files are in the deployed build
4. Check Next.js routing is working

### Issue: Environment Variables Missing
**Symptoms:** Diagnostics show environment errors
**Solution:**
1. Render Dashboard → Service → Environment
2. Add required variables:
   - `CONTROL_PLANE_URL`
   - `DASHBOARD_DEV_USER_ID`
   - `EDGE_BRIDGE_SHARED_KEY`
3. Redeploy after adding variables

## Verify Deployment Success

Run these commands in browser console after deployment:

```javascript
// 1. Test diagnostics endpoint exists
fetch('/diagnostics').then(r => console.log('Diagnostics:', r.status))

// 2. Test debug API
fetch('/api/live/debug').then(r => r.json()).then(console.log)

// 3. Check if logged in
console.log('Token:', localStorage.getItem('accessToken'))
```

## Expected Timeline

- **Manual Deploy:** 3-5 minutes
- **Auto Deploy:** 3-7 minutes (depending on git push detection)
- **Total Time:** ~5-10 minutes from trigger to live

## If Deployment Succeeds But Still Have Issues

Follow the diagnostics:
1. Visit `/diagnostics`
2. Check which tests fail
3. Follow solutions in `IMMEDIATE_FIX_STEPS.md`
4. Most likely issues:
   - Not logged in → Go to `/login`
   - Missing `CONTROL_PLANE_URL` → Add in Render environment
   - Backend service down → Check Railway/backend hosting

## Next Steps After Successful Deployment

1. ✅ Visit `/diagnostics` and verify all checks
2. ✅ Fix any issues found (authentication, environment, etc.)
3. ✅ Visit `/operations/video-wall` to test live cameras
4. ✅ Register cameras if none exist
5. ✅ Configure permissions and streaming

## Quick Reference

| What | Where |
|------|-------|
| **Render Dashboard** | https://dashboard.render.com |
| **Your Service** | sentinel-grid-monitoring-b54t |
| **Diagnostics** | /diagnostics |
| **Debug API** | /api/live/debug |
| **Video Wall** | /operations/video-wall |
| **Manual Deploy** | Dashboard → Service → "Manual Deploy" button |

## Support

If deployment fails or issues persist:
1. Check Render deployment logs
2. Look for build errors or runtime errors
3. Verify environment variables are set
4. Test locally with `npm run dev` first
5. Check this repo's recent commits are all pushed
