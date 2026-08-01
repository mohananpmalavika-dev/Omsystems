# Render Deployment Fix - API Connection Issues

## ❌ Current Problem

Browser errors show:
```
DELETE https://sentinel-grid-monitoring1.onrender.com/api/admin/system/gateways/...
500 (Internal Server Error)
```

This means the dashboard is trying to connect to a **non-existent domain** instead of using the proxy.

## 🎯 Root Cause

The dashboard was built with hardcoded API URL instead of relative paths. This happens when `NEXT_PUBLIC_API_BASE` is not set correctly in Render environment variables.

## ✅ Solution: Fix Render Environment Variables

### Step 1: Update Dashboard Service on Render

1. **Login to Render.com**
2. **Go to your Dashboard service** (the Next.js app)
3. **Click "Environment" tab** in left sidebar
4. **Add these environment variables:**

```bash
# CRITICAL: Use relative path for API calls
NEXT_PUBLIC_API_BASE=/api/control

# Control Plane URL (update with your actual Render service URL)
CONTROL_PLANE_URL=https://YOUR-CONTROL-PLANE-SERVICE.onrender.com
```

5. **Click "Save Changes"**
6. **Trigger Manual Deploy** (or wait for auto-deploy)

### Step 2: Find Your Control Plane URL

1. Go to your **Control Plane service** on Render
2. Copy the service URL (e.g., `https://omsystems-control.onrender.com`)
3. Update `CONTROL_PLANE_URL` with this URL

### Step 3: Verify After Deployment

After deployment completes:
1. Open browser DevTools (F12) → Network tab
2. Login to dashboard
3. Check API calls - they should go to:
   - ✅ **Correct**: `/api/control/v1/...` (relative path)
   - ❌ **Wrong**: `https://sentinel-grid-monitoring1.onrender.com/...` (absolute URL)

## 🔧 Alternative: Deploy with Correct Config

If you have access to the repository on Render:

### Option A: Set in Render Dashboard (Recommended)

Follow Step 1 above

### Option B: Update Build Command

In Render service settings:
```bash
# Build Command
npm ci --workspace @sentinel/dashboard && NEXT_PUBLIC_API_BASE=/api/control npm run dashboard:build
```

### Option C: Add .env.production to Repository

Create `.env.production` in dashboard directory:
```bash
NEXT_PUBLIC_API_BASE=/api/control
CONTROL_PLANE_URL=${CONTROL_PLANE_URL}
```

Then commit and push:
```bash
git add dashboard/.env.production
git commit -m "Add production environment config"
git push origin main
```

## 🧪 Testing Locally Before Deploy

Test the production build locally:

```bash
# Set production env
export NEXT_PUBLIC_API_BASE=/api/control
# Or on Windows:
set NEXT_PUBLIC_API_BASE=/api/control

# Build
cd dashboard
npm run build

# Start production server
npm start
```

Then test in browser at `http://localhost:3000`

## 📋 Render Service Configuration Checklist

### Dashboard Service Settings

**Environment Variables:**
```
NEXT_PUBLIC_API_BASE=/api/control
CONTROL_PLANE_URL=https://your-control-plane.onrender.com
NODE_VERSION=22.23.2
```

**Build Command:**
```bash
npm ci --workspace @sentinel/dashboard && npm run dashboard:build
```

**Start Command:**
```bash
npm run dashboard:start
```

### Control Plane Service Settings

**Environment Variables:**
```
NODE_ENV=production
DATABASE_URL=postgresql://your-database-url
PORT=3000
```

**Build Command:**
```bash
npm ci && npm run build
```

**Start Command:**
```bash
npm start
```

## 🐛 Troubleshooting

### Issue: Still seeing old domain after deploy
**Solution**: 
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+F5)
- Try incognito/private window

### Issue: 500 errors on API calls
**Solution**:
- Check Control Plane service is running
- Verify `CONTROL_PLANE_URL` is correct
- Check Control Plane logs for errors

### Issue: CORS errors
**Solution**: 
The proxy route in dashboard handles CORS. Make sure:
- `dashboard/app/api/control/[...path]/route.ts` exists
- It's properly proxying to `CONTROL_PLANE_URL`

### Issue: Environment variables not taking effect
**Solution**:
- Render caches builds - try "Clear build cache & deploy"
- Make sure you saved changes in Render dashboard
- Wait for deployment to complete (check logs)

## 🔍 How to Find Your Services on Render

1. **Login to Render.com**
2. **Dashboard** → You'll see all your services
3. Look for:
   - **Dashboard service** (Next.js app) - This serves the UI
   - **Control Plane service** (Node.js API) - This is the backend

Click on Control Plane service to get its URL.

## 📊 Expected Architecture

```
Browser
   ↓
Dashboard Service (Next.js on Render)
   ↓ (proxies via /api/control/*)
Control Plane Service (Node.js API on Render)
   ↓
Database (PostgreSQL on Render)
```

## 🎯 Quick Fix Summary

**Most Common Issue**: Missing `NEXT_PUBLIC_API_BASE` environment variable

**Quick Fix**:
1. Render Dashboard → Your dashboard service
2. Environment tab
3. Add: `NEXT_PUBLIC_API_BASE=/api/control`
4. Save & Deploy
5. Wait 5-10 minutes
6. Clear browser cache
7. Reload dashboard

## 🚀 Verification Commands

After fixing, test these URLs:

1. **Dashboard Homepage**:
   ```
   https://your-dashboard.onrender.com
   ```
   Should show login page

2. **Control Plane Health**:
   ```
   https://your-control-plane.onrender.com/health
   ```
   Should return: `{"status":"ok"}`

3. **Dashboard API Proxy**:
   ```
   https://your-dashboard.onrender.com/api/control/health
   ```
   Should proxy to control plane

## 💡 Pro Tips

1. **Use Render Environment Groups**: Create an env group for shared configs
2. **Enable Auto-Deploy**: Automatic deployment on git push
3. **Set up Health Checks**: Render can auto-restart failed services
4. **Monitor Logs**: Check logs regularly for errors
5. **Use Render CLI**: Deploy from command line

## 📞 Need Help?

If issues persist:
1. Check Render service logs (Dashboard service → Logs)
2. Check Control Plane logs
3. Verify database is accessible
4. Test API directly with curl:
   ```bash
   curl https://your-control-plane.onrender.com/health
   ```

## 🔗 Useful Render Docs

- Environment Variables: https://render.com/docs/environment-variables
- Build & Deploy: https://render.com/docs/deploys
- Troubleshooting: https://render.com/docs/troubleshooting-deploys
- Node.js on Render: https://render.com/docs/deploy-node-express-app

---

**Last Updated**: After build fix
**Status**: ⚠️ Waiting for Render environment variable update
