# Render Deployment Fix Guide

## Problem
The control plane is failing to start due to placeholder/development values being forbidden in production mode.

## Validation Errors

```
1. AUTH_MODE: "development authentication is forbidden in production"
2. AUTH_MODE: "placeholder secret/value is forbidden in production"  
3. REPORT_DOWNLOAD_SECRET: "placeholder secret/value is forbidden in production"
```

## Root Cause

The `src/config.ts` validation logic rejects:
- `AUTH_MODE=development` in production
- Any string containing: `development`, `change-me`, or `local-development-only`

## Solution

You need to update environment variables in Render Dashboard. Here are the exact steps:

### Option 1: Quick Fix - Update render.yaml and Redeploy

Update `render.yaml` with secure values:

```yaml
# In sentinel-grid-control-plane service
envVars:
  - key: AUTH_MODE
    value: session  # Changed from 'development'
  - key: MEDIA_GATEWAY_SHARED_KEY
    sync: false  # Mark as secret to set in dashboard
  - key: REPORT_DOWNLOAD_SECRET
    sync: false  # Mark as secret to set in dashboard
  - key: EDGE_BRIDGE_SHARED_KEY
    sync: false  # Mark as secret
  - key: ANALYTICS_ENGINE_SHARED_KEY
    sync: false  # Mark as secret
```

Then in Render Dashboard, set these secret values:

1. **MEDIA_GATEWAY_SHARED_KEY**: Generate a 32+ character random string
2. **REPORT_DOWNLOAD_SECRET**: Generate a 32+ character random string  
3. **EDGE_BRIDGE_SHARED_KEY**: Generate a 32+ character random string
4. **ANALYTICS_ENGINE_SHARED_KEY**: Generate a 32+ character random string

### Option 2: Manual Override in Render Dashboard (Faster)

Go to your `sentinel-grid-control-plane` service in Render Dashboard:

1. Navigate to **Environment** tab
2. Add/Update these variables:
   - `AUTH_MODE` = `session`
   - `MEDIA_GATEWAY_SHARED_KEY` = `[generate-32-char-random-string]`
   - `REPORT_DOWNLOAD_SECRET` = `[generate-32-char-random-string]`
   - `EDGE_BRIDGE_SHARED_KEY` = `[generate-32-char-random-string]`
   - `ANALYTICS_ENGINE_SHARED_KEY` = `[generate-32-char-random-string]`

3. Click **Save Changes** (this will trigger auto-redeploy)

### Generating Secure Keys

Use one of these methods to generate secure random keys:

**PowerShell:**
```powershell
# Generate a 32-character random string
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

**Node.js:**
```javascript
require('crypto').randomBytes(32).toString('hex')
```

**Online (secure):**
```
https://www.random.org/strings/?num=1&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=plain
```

### Important Notes

1. **All services must use the same shared keys** for authentication between services:
   - Control plane needs `MEDIA_GATEWAY_SHARED_KEY` 
   - Media gateway needs the same `MEDIA_GATEWAY_SHARED_KEY`
   - Control plane needs `ANALYTICS_ENGINE_SHARED_KEY`
   - Analytics engine needs the same `ANALYTICS_ENGINE_SHARED_KEY`

2. **Keep keys consistent** across:
   - `sentinel-grid-control-plane`
   - `sentinel-grid-media-gateway` 
   - `sentinel-grid-analytics-engine`

3. After setting environment variables, Render will automatically redeploy

## Updated render.yaml (Recommended)

Here's the secure version to commit:

```yaml
  - type: web
    name: sentinel-grid-control-plane
    runtime: docker
    dockerfilePath: ./Dockerfile
    plan: free
    region: singapore
    healthCheckPath: /health
    autoDeployTrigger: commit
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: OMCAMERA
          property: connectionString
      - key: AUTH_MODE
        value: session  # Changed from development
      - key: SKIP_MIGRATION_CHECKSUM_VALIDATION
        value: "true"
      - key: EDGE_BRIDGE_SHARED_KEY
        sync: false  # Set in dashboard
      - key: MEDIA_GATEWAY_SHARED_KEY
        sync: false  # Set in dashboard
      - key: ANALYTICS_ENGINE_SHARED_KEY
        sync: false  # Set in dashboard
      - key: REPORT_DOWNLOAD_SECRET
        sync: false  # Set in dashboard (NEW)
      - key: ANALYTICS_ENGINE_URL
        value: "https://sentinel-grid-analytics-engine.onrender.com"
```

## Verification

After applying changes:

1. Check deployment logs in Render Dashboard
2. Look for successful startup message
3. Test the health endpoint: `https://sentinel-grid-control-plane.onrender.com/health`

## Additional Security Considerations

For production:
- Consider using `AUTH_MODE=oidc` with a proper identity provider
- Store all keys in Render's environment variables (never in code)
- Rotate keys periodically
- Use different keys for each environment (staging vs production)
