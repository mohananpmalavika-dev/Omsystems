# Quick Fix for Render Deployment

## Step 1: Generate Secure Keys

Run this PowerShell script:
```powershell
.\generate-secrets.ps1
```

This will output all the keys you need to set in Render.

## Step 2: Set Environment Variables in Render Dashboard

Go to each service in Render Dashboard and add these environment variables:

### sentinel-grid-control-plane
1. Go to **Environment** tab
2. Add these variables:
   - `EDGE_BRIDGE_SHARED_KEY` = [from script output]
   - `MEDIA_GATEWAY_SHARED_KEY` = [from script output]
   - `ANALYTICS_ENGINE_SHARED_KEY` = [from script output]
   - `REPORT_DOWNLOAD_SECRET` = [from script output]
3. **Save Changes**

### sentinel-grid-media-gateway
1. Go to **Environment** tab
2. Add these variables:
   - `EDGE_BRIDGE_SHARED_KEY` = [same as control-plane]
   - `MEDIA_GATEWAY_SHARED_KEY` = [same as control-plane]
3. **Save Changes**

### sentinel-grid-analytics-engine
1. Go to **Environment** tab
2. Add these variables:
   - `ANALYTICS_ENGINE_SHARED_KEY` = [same as control-plane]
   - `ANALYTICS_SOURCE_SHARED_KEY` = [from script output]
3. **Save Changes**

### sentinel-grid-monitoring (dashboard)
1. Go to **Environment** tab
2. Add this variable:
   - `EDGE_BRIDGE_SHARED_KEY` = [same as control-plane]
3. **Save Changes**

## Step 3: Commit and Push Updated render.yaml

```bash
git add render.yaml
git commit -m "fix: Update render.yaml to use secure environment variables"
git push
```

This will trigger automatic redeployment of all services.

## Step 4: Verify Deployment

After services redeploy, check:
1. Control plane health: https://sentinel-grid-control-plane.onrender.com/health
2. Media gateway health: https://sentinel-grid-media-gateway.onrender.com/health
3. Analytics engine health: https://sentinel-grid-analytics-engine.onrender.com/health

## What Changed?

1. **AUTH_MODE**: Changed from `development` to `session`
2. **All shared keys**: Moved from hardcoded values to Render environment secrets
3. **REPORT_DOWNLOAD_SECRET**: Added (was missing before)

## Why This Failed Before?

The validation in `src/config.ts` rejects:
- `AUTH_MODE=development` in production
- Any string containing: `development`, `change-me`, or `local-development-only`

The old render.yaml had:
- `AUTH_MODE: development` ❌
- `MEDIA_GATEWAY_SHARED_KEY: dev-media-gateway-key-change-in-production` ❌
- No `REPORT_DOWNLOAD_SECRET` (used default with "development") ❌

## Need Help?

See `RENDER_DEPLOYMENT_FIX.md` for detailed explanation.
