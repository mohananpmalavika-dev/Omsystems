# URL Update Complete - Summary

## ✅ All URLs Updated

Your Sentinel Grid platform URLs have been updated throughout the codebase:

### Official Render Service URLs:

1. **Dashboard**: `https://sentinel-grid-monitoring-xgrr.onrender.com`
2. **Control Plane**: `https://sentinel-grid-control-plane-3i3r.onrender.com`
3. **Analytics Engine**: `https://sentinel-grid-analytics-engine-6woo.onrender.com`
4. **Media Gateway**: `https://sentinel-grid-media-gateway-ltkx.onrender.com`

## Files Updated

### Documentation
- ✅ `EDGE_ACTIVATION_BLOCKED_FIX.md`
- ✅ `SIMPLE_SETUP.txt`
- ✅ `edge-agent/installer/windows/BRANCH_INSTALLATION_GUIDE.md`

### Configuration Files
- ✅ `edge-agent/installer/windows/install-gui.ps1`

### Scripts
- ✅ `check-production-gateway.mjs`
- ✅ `register-tunnel.mjs`
- ✅ `.scanner-runtime/check-archived-identities.ts`
- ✅ `.scanner-runtime/submit-dvr-login-required.ts`

### New Files Created
- 📄 `RENDER_URLS_CONFIG.md` - Comprehensive URL configuration guide
- 📄 `scripts/verify-render-urls.ps1` - Service health check script

## ⚠ Required Actions

### 1. Update Render Environment Variables

Each service needs environment variables updated:

**Dashboard** (sentinel-grid-monitoring-xgrr):
```bash
CONTROL_PLANE_API_URL=https://sentinel-grid-control-plane-3i3r.onrender.com
ANALYTICS_ENGINE_URL=https://sentinel-grid-analytics-engine-6woo.onrender.com
MEDIA_GATEWAY_URL=https://sentinel-grid-media-gateway-ltkx.onrender.com
NEXT_PUBLIC_DASHBOARD_URL=https://sentinel-grid-monitoring-vhid.onrender.com
```

**Control Plane** (sentinel-grid-control-plane-ocn1):
```bash
DASHBOARD_URL=https://sentinel-grid-monitoring-vhid.onrender.com
ANALYTICS_ENGINE_URL=https://sentinel-grid-analytics-engine-j0py.onrender.com
MEDIA_GATEWAY_URL=https://sentinel-grid-media-gateway-04ae.onrender.com
CONTROL_PLANE_PUBLIC_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
```

**Analytics Engine** (sentinel-grid-analytics-engine-j0py):
```bash
CONTROL_PLANE_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
```

**Media Gateway** (sentinel-grid-media-gateway-04ae):
```bash
CONTROL_PLANE_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
```

### 2. Redeploy All Services

After updating environment variables:
1. Go to https://dashboard.render.com
2. For each service, click "Manual Deploy" → "Deploy latest commit"
3. Wait for deployment to complete

### 3. Regenerate Edge Agent Installers

If you have edge agents already deployed or installer packages distributed:

1. **Generate new activation codes** in dashboard
2. **Download new installer packages** with updated control plane URL
3. **Update existing edge agents** (if any):
   ```powershell
   # On each edge agent machine
   $configPath = "C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env"
   # Edit CONTROL_PLANE_URL line
   Restart-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
   ```

### 4. Test Services

Run the verification script:
```powershell
cd C:\Omsystems
.\scripts\verify-render-urls.ps1 -WakeServices
```

Expected output:
```
Services: 4/4 healthy (100%)
✓ All services are healthy!
```

## 🔧 Fixing Your Activation Issue

Now that URLs are correct, to fix the "Activation blocked" issue:

### Option 1: Wake Services First (RECOMMENDED)
```powershell
# Wake up all services
.\scripts\verify-render-urls.ps1 -WakeServices

# Wait for "All services are healthy!"

# Then run your installer
```

### Option 2: Use Edge Agent Wake Script
```powershell
# Wake just the control plane
.\edge-agent\scripts\wake-control-plane.ps1

# Once it shows "✓ Control Plane is Ready!"
# Run your installer
```

### Option 3: Generate Fresh Installer
1. Go to: https://sentinel-grid-monitoring-vhid.onrender.com/admin/branch-onboarding
2. Click "Install Scanner" tab
3. Generate new activation code
4. Download fresh installer (will have correct URLs)

## 📋 Quick Reference

### For End Users
**Dashboard URL**: https://sentinel-grid-monitoring-vhid.onrender.com

### For Edge Agent Installation
**Control Plane URL**: https://sentinel-grid-control-plane-ocn1.onrender.com

### For API Integration
Use dashboard proxy (recommended):
- Control API: `https://sentinel-grid-monitoring-vhid.onrender.com/api/control`
- Analytics API: `https://sentinel-grid-monitoring-vhid.onrender.com/api/analytics`
- Media API: `https://sentinel-grid-monitoring-vhid.onrender.com/api/media`

Or direct access:
- Control Plane: `https://sentinel-grid-control-plane-ocn1.onrender.com`
- Analytics: `https://sentinel-grid-analytics-engine-j0py.onrender.com`
- Media: `https://sentinel-grid-media-gateway-04ae.onrender.com`

### Health Check URLs
```bash
curl https://sentinel-grid-monitoring-vhid.onrender.com/health
curl https://sentinel-grid-control-plane-ocn1.onrender.com/health
curl https://sentinel-grid-analytics-engine-j0py.onrender.com/health
curl https://sentinel-grid-media-gateway-04ae.onrender.com/health
```

## 🎯 Next Steps

1. ✅ URLs updated in codebase
2. ⏳ Update Render environment variables (required)
3. ⏳ Redeploy all 4 services (required)
4. ⏳ Test with verify-render-urls.ps1
5. ⏳ Generate fresh edge agent installer
6. ⏳ Try installation again (should work now!)

## 💡 Pro Tips

### Keep Services Awake (Render Free Tier)
If using Render free tier, set up UptimeRobot (https://uptimerobot.com):
- Monitor all 4 health endpoints
- Check interval: 5 minutes
- This prevents cold starts and keeps services responsive

### Monitor Service Health
Run verification script periodically:
```powershell
# Manual check
.\scripts\verify-render-urls.ps1

# Wake sleeping services
.\scripts\verify-render-urls.ps1 -WakeServices
```

## 📚 Documentation

For complete details, see:
- **`RENDER_URLS_CONFIG.md`** - Full URL configuration guide
- **`EDGE_ACTIVATION_BLOCKED_FIX.md`** - Activation troubleshooting
- **`EDGE_AGENT_TROUBLESHOOTING.md`** - Live video troubleshooting

## ✅ Verification Checklist

Before trying edge agent installation again:

- [ ] Render environment variables updated for all services
- [ ] All services redeployed on Render
- [ ] Run `verify-render-urls.ps1` - all services healthy
- [ ] Dashboard accessible at new URL
- [ ] Control plane responding to health checks
- [ ] Fresh activation code generated
- [ ] New installer downloaded (or wake services before installing)

Once all checked, installation should succeed!
