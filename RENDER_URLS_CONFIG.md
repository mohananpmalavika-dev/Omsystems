# Sentinel Grid - Render URLs Configuration

## Official Render Service URLs

Your Sentinel Grid platform is deployed across **4 Render services**:

### 1. **Dashboard** (Frontend + API Proxy)
- **URL**: https://sentinel-grid-monitoring-vhid.onrender.com
- **Purpose**: Main web dashboard, user interface, session management
- **Endpoints**:
  - `/` - Dashboard UI
  - `/api/control/*` - Proxied control plane API
  - `/api/analytics/*` - Proxied analytics engine API
  - `/api/media/*` - Proxied media gateway API
- **Health Check**: `/health`
- **Used By**: End users, operators, administrators

### 2. **Control Plane** (Core Backend)
- **URL**: https://sentinel-grid-control-plane-ocn1.onrender.com
- **Purpose**: Core backend API, database operations, authentication, device management
- **Endpoints**:
  - `/v1/edge-enrollment/activate` - Edge agent activation
  - `/v1/edge-agents/*` - Edge agent management
  - `/v1/branches/*` - Branch/site management
  - `/v1/cameras/*` - Camera management
  - `/health` - Health check
  - `/ready` - Readiness check (requires DB)
- **Health Check**: `/health`
- **Used By**: Dashboard (via proxy), Edge agents, External API clients

### 3. **Analytics Engine** (AI Processing)
- **URL**: https://sentinel-grid-analytics-engine-j0py.onrender.com
- **Purpose**: AI/ML analytics, video processing, event detection
- **Endpoints**:
  - `/v1/analytics/frames` - Frame submission
  - `/v1/analytics/events` - Event queries
  - `/v1/analytics/cameras/:id/status` - Camera analytics status
  - `/health` - Health check with AI state
- **Health Check**: `/health`
- **Used By**: Control plane, Edge agents (frame submission), Dashboard (analytics queries)

### 4. **Media Gateway** (Live Streaming)
- **URL**: https://sentinel-grid-media-gateway-04ae.onrender.com
- **Purpose**: Live video streaming, HLS transcoding, media delivery
- **Endpoints**:
  - `/v1/live/sessions` - Create live session
  - `/v1/live/streams/:id` - Stream access
  - `/hls/*` - HLS manifests and segments
  - `/health` - Health check
- **Health Check**: `/health`
- **Used By**: Dashboard (live video player), Mobile apps, External video clients

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ sentinel-grid-monitoring-vhid.onrender.com (Dashboard)          │
│  - Next.js frontend                                             │
│  - API proxy routes                                             │
│  - Session management                                           │
└───────────┬─────────────────────────────────────────────────────┘
            │ Proxies API calls to:
            │
    ┌───────┼──────────────┬──────────────────┐
    │       │              │                  │
    ▼       ▼              ▼                  ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐
│Control │ │Analytics│ │ Media  │ │ Edge Agents  │
│ Plane  │ │ Engine │ │Gateway │ │ (On-premise) │
└────────┘ └────────┘ └────────┘ └──────────────┘
    │          │          │              │
    │          │          │              │
    └──────────┴──────────┴──────────────┘
                    │
                    ▼
            ┌──────────────┐
            │  PostgreSQL  │
            │  (Render DB) │
            └──────────────┘
```

## Configuration Files Updated

The following files have been updated with correct URLs:

### Edge Agent Configuration
- ✓ `edge-agent/installer/windows/install-gui.ps1`
- ✓ `edge-agent/installer/windows/BRANCH_INSTALLATION_GUIDE.md`

### Documentation
- ✓ `EDGE_ACTIVATION_BLOCKED_FIX.md`
- ✓ `SIMPLE_SETUP.txt`

### Scripts
- ✓ `check-production-gateway.mjs`
- ✓ `register-tunnel.mjs`
- ✓ `.scanner-runtime/check-archived-identities.ts`
- ✓ `.scanner-runtime/submit-dvr-login-required.ts`

## URL Usage Guide

### For Edge Agent Installation

**Control Plane URL** (used in installer):
```
https://sentinel-grid-control-plane-ocn1.onrender.com
```

**Dashboard URL** (for downloading installers):
```
https://sentinel-grid-monitoring-vhid.onrender.com/admin/branch-onboarding
```

### For API Integration

**If integrating directly** (bypassing dashboard):
- Control Plane: `https://sentinel-grid-control-plane-ocn1.onrender.com`
- Analytics: `https://sentinel-grid-analytics-engine-j0py.onrender.com`
- Media: `https://sentinel-grid-media-gateway-04ae.onrender.com`

**If integrating via dashboard proxy** (recommended):
- Control API: `https://sentinel-grid-monitoring-vhid.onrender.com/api/control`
- Analytics API: `https://sentinel-grid-monitoring-vhid.onrender.com/api/analytics`
- Media API: `https://sentinel-grid-monitoring-vhid.onrender.com/api/media`

### For Health Checks / Monitoring

```bash
# Dashboard
curl https://sentinel-grid-monitoring-vhid.onrender.com/health

# Control Plane
curl https://sentinel-grid-control-plane-ocn1.onrender.com/health

# Analytics Engine
curl https://sentinel-grid-analytics-engine-j0py.onrender.com/health

# Media Gateway
curl https://sentinel-grid-media-gateway-04ae.onrender.com/health
```

### For UptimeRobot Monitoring

To keep Render services awake (free tier prevention):

1. **Dashboard**: https://sentinel-grid-monitoring-vhid.onrender.com/health
2. **Control Plane**: https://sentinel-grid-control-plane-ocn1.onrender.com/health
3. **Analytics Engine**: https://sentinel-grid-analytics-engine-j0py.onrender.com/health
4. **Media Gateway**: https://sentinel-grid-media-gateway-04ae.onrender.com/health

Recommended interval: **5 minutes**

## Environment Variables to Update

### Dashboard (.env)
```bash
# Control plane API (direct access, not via proxy)
CONTROL_PLANE_API_URL=https://sentinel-grid-control-plane-ocn1.onrender.com

# Analytics engine
ANALYTICS_ENGINE_URL=https://sentinel-grid-analytics-engine-j0py.onrender.com

# Media gateway
MEDIA_GATEWAY_URL=https://sentinel-grid-media-gateway-04ae.onrender.com

# Public dashboard URL (for redirects/links)
NEXT_PUBLIC_DASHBOARD_URL=https://sentinel-grid-monitoring-vhid.onrender.com
```

### Control Plane (.env)
```bash
# Dashboard URL (for CORS, webhooks, etc.)
DASHBOARD_URL=https://sentinel-grid-monitoring-vhid.onrender.com

# Analytics engine
ANALYTICS_ENGINE_URL=https://sentinel-grid-analytics-engine-j0py.onrender.com

# Media gateway
MEDIA_GATEWAY_URL=https://sentinel-grid-media-gateway-04ae.onrender.com

# Public control plane URL (for edge agents)
CONTROL_PLANE_PUBLIC_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
```

### Edge Agent (.env or installer)
```bash
# Only needs control plane URL
CONTROL_PLANE_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
```

## Troubleshooting

### Services Not Responding

**Issue**: Timeout or "service unavailable"
**Cause**: Render free tier cold start (services spin down after 15 mins)
**Solution**: 
```bash
# Wake up all services
curl https://sentinel-grid-monitoring-vhid.onrender.com/health
curl https://sentinel-grid-control-plane-ocn1.onrender.com/health
curl https://sentinel-grid-analytics-engine-j0py.onrender.com/health
curl https://sentinel-grid-media-gateway-04ae.onrender.com/health
```

### Edge Agent Can't Connect

**Issue**: `Cannot reach control plane: fetch failed`
**Cause**: Control plane is cold starting
**Solution**:
1. Wake up control plane first:
   ```powershell
   Invoke-WebRequest -Uri "https://sentinel-grid-control-plane-ocn1.onrender.com/health" -TimeoutSec 90
   ```
2. Wait for "200 OK" response
3. Then run edge agent installer

### Wrong URL in Configuration

**Check these files**:
1. Dashboard: `dashboard/.env` or Render environment variables
2. Control Plane: `.env` or Render environment variables
3. Edge Agent: `edge-agent/config/edge-agent.env` (after installation)
4. Installer: `edge-agent/installer/windows/install-gui.ps1` (line 10)

## Migration from Old URLs

If you have existing installations with old URLs:

### For Edge Agents
1. Go to installation directory: `C:\Program Files\Sentinel Grid\Edge Agent`
2. Edit: `config\edge-agent.env`
3. Update: `CONTROL_PLANE_URL=https://sentinel-grid-control-plane-ocn1.onrender.com`
4. Restart: `Restart-ScheduledTask -TaskName "Sentinel Grid Edge Agent"`

### For Dashboard Users
- No action needed - just use new URL: https://sentinel-grid-monitoring-vhid.onrender.com
- Update bookmarks if needed

### For API Integrations
- Update base URL in your API client configuration
- Control Plane: `https://sentinel-grid-control-plane-ocn1.onrender.com`

## Quick Reference Card

```
╔═══════════════════════════════════════════════════════════════╗
║           Sentinel Grid - Render Services                     ║
╠═══════════════════════════════════════════════════════════════╣
║ Dashboard (Users)                                             ║
║ https://sentinel-grid-monitoring-vhid.onrender.com            ║
║                                                               ║
║ Control Plane (API)                                           ║
║ https://sentinel-grid-control-plane-ocn1.onrender.com         ║
║                                                               ║
║ Analytics Engine (AI)                                         ║
║ https://sentinel-grid-analytics-engine-j0py.onrender.com      ║
║                                                               ║
║ Media Gateway (Video)                                         ║
║ https://sentinel-grid-media-gateway-04ae.onrender.com         ║
╚═══════════════════════════════════════════════════════════════╝
```

## Next Steps

1. ✓ URLs updated in codebase
2. ⚠ **Update Render environment variables** for each service
3. ⚠ **Redeploy all services** after environment variable changes
4. ⚠ **Regenerate edge agent installers** with new control plane URL
5. ⚠ **Update existing edge agents** if already deployed
6. ⚠ **Set up UptimeRobot** to keep services awake (if using free tier)

## Support

For URL-related issues:
- Check service status: https://dashboard.render.com
- View service logs in Render dashboard
- Test health endpoints with curl
- Verify environment variables in Render service settings
