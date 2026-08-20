# Render.com URL Update - August 20, 2026

## New Service URLs

All Render.com service URLs have been updated to the latest deployment instances:

1. **Control Plane**: `https://sentinel-grid-control-plane-3i3r.onrender.com`
2. **Media Gateway**: `https://sentinel-grid-media-gateway-ltkx.onrender.com`
3. **Analytics Engine**: `https://sentinel-grid-analytics-engine-6woo.onrender.com`
4. **Dashboard/Monitoring**: `https://sentinel-grid-monitoring-b54f.onrender.com`

## Previous URLs (Now Obsolete)

- Control Plane: ~~`sentinel-grid-control-plane-ocn1.onrender.com`~~
- Media Gateway: ~~`sentinel-grid-media-gateway-04ae.onrender.com`~~
- Analytics Engine: ~~`sentinel-grid-analytics-engine-j0py.onrender.com`~~
- Dashboard: ~~`sentinel-grid-monitoring-vhid.onrender.com`~~ → ~~`sentinel-grid-monitoring-xgrr.onrender.com`~~

## Files Updated

### Configuration Files (.env)
- ✅ `.env` - Main control plane environment
- ✅ `dashboard/.env.local` - Dashboard local development
- ✅ `dashboard/.env.production` - Dashboard production
- ✅ `edge-agent/.env` - Edge agent configuration

### Documentation Files
- ✅ `QUICK_FIX_GUIDE.md`
- ✅ `URL_UPDATE_SUMMARY.md`
- ✅ `WHY_INSTALLER_DOWNLOADS_NEEDED.md`
- ✅ `analytics-engine/AI_ENGINE_STATUS.md`
- ✅ `analytics-engine/RENDER_DEPLOYMENT_GUIDE.md`

### Source Code Files
- ✅ `dashboard/components/device-manager.tsx`

## Required Actions After URL Update

### 1. Redeploy All Services
Each service must be redeployed for environment variable changes to take effect:

```bash
# Trigger redeploy on Render.com dashboard or use CLI
# Services will automatically use new URLs from their .env files
```

### 2. Download Fresh Edge Agent Installers
All branch locations must download new installer packages with updated URLs:

1. Go to: https://sentinel-grid-monitoring-b54f.onrender.com/admin/branch-onboarding
2. Navigate to "Install Scanner" tab
3. Download fresh installer for each branch

**⚠️ Old installers will fail** - they contain the old URLs and will try to connect to deactivated services.

### 3. Update UptimeRobot Monitors
If using UptimeRobot for health monitoring:

1. Sign in to https://uptimerobot.com
2. Update monitor URLs to:
   - https://sentinel-grid-monitoring-b54f.onrender.com/health
   - https://sentinel-grid-control-plane-3i3r.onrender.com/health
   - https://sentinel-grid-analytics-engine-6woo.onrender.com/health
   - https://sentinel-grid-media-gateway-ltkx.onrender.com/health

### 4. Verify Deployment
After redeploying, verify each service is online:

```bash
# Control Plane
curl https://sentinel-grid-control-plane-3i3r.onrender.com/health

# Analytics Engine
curl https://sentinel-grid-analytics-engine-6woo.onrender.com/health

# Media Gateway
curl https://sentinel-grid-media-gateway-ltkx.onrender.com/health

# Dashboard
curl https://sentinel-grid-monitoring-b54f.onrender.com/health
```

## Why URLs Changed

Render.com assigns unique subdomain identifiers to each service deployment. When services are redeployed or recreated, new subdomain identifiers are generated. This is standard practice for:

- Service migrations
- Infrastructure updates
- Region changes
- Service recreations after deletion

## Migration Checklist

- [x] Update all .env files with new URLs
- [x] Update documentation with new URLs
- [x] Update hardcoded fallback URLs in source code
- [ ] Commit and push changes to Git
- [ ] Redeploy all 4 services on Render.com
- [ ] Verify all health endpoints respond
- [ ] Download fresh edge agent installers
- [ ] Update external monitoring (UptimeRobot, etc.)
- [ ] Test end-to-end: Dashboard → Control Plane → Edge Agent

## Commit and Deploy

```bash
# Stage all changes
git add .env dashboard/.env.local dashboard/.env.production edge-agent/.env
git add QUICK_FIX_GUIDE.md URL_UPDATE_SUMMARY.md WHY_INSTALLER_DOWNLOADS_NEEDED.md
git add analytics-engine/AI_ENGINE_STATUS.md analytics-engine/RENDER_DEPLOYMENT_GUIDE.md
git add dashboard/components/device-manager.tsx
git add src/app.ts database/migrations/20260723_reporting_dashboard_schema.sql

# Commit with descriptive message
git commit -m "Update all Render.com service URLs to new instances

- Control Plane: 3i3r
- Media Gateway: ltkx  
- Analytics Engine: 6woo
- Dashboard: xgrr

Includes bug fixes:
- Comment out duplicate camera discovery routes
- Add IF NOT EXISTS to migration indexes"

# Push to trigger Render deployments
git push
```

## Post-Deployment Verification

Once all services are deployed and healthy:

1. **Test Dashboard Access**: https://sentinel-grid-monitoring-b54f.onrender.com
2. **Test API**: Check control plane `/health` endpoint
3. **Test Analytics**: Check analytics engine status
4. **Download Installer**: Generate new activation code and download fresh installer
5. **Test Scanner**: Run installer on a test branch to verify connectivity

---

**Date Updated**: August 20, 2026  
**Updated By**: System Administrator  
**Reason**: Render.com service URL updates
