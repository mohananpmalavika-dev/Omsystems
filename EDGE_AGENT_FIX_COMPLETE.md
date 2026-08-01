# Edge Agent (Camera Scanner) Fix Complete ✅

## Problem
The edge agent was failing to start with authentication error:
```
Control plane 401: {"error":"unauthenticated","message":"Missing or invalid authorization header"}
```

## Root Cause
The backend authentication middleware had a logic bug. When an edge agent request included BOTH the `x-edge-bridge-key` header AND a `x-user-id` header, the authentication logic would fall through to the regular auth flow instead of accepting the valid bridge key.

**Buggy code (app.ts line 487):**
```typescript
if (edgeAgentIngressRoute && edgeBridgeAuthenticated && !userIdentitySupplied) {
  request.edgeAgentAuthenticated = true;
  return;
}
```

The condition `!userIdentitySupplied` prevented edge agents from authenticating when they included development user IDs.

## Solution
**Fixed code:**
```typescript
if (edgeAgentIngressRoute && edgeBridgeAuthenticated) {
  request.edgeAgentAuthenticated = true;
  return;
}
```

Removed the `!userIdentitySupplied` condition. If an edge agent route has a valid bridge key, it should be authenticated regardless of other headers.

## Changes Made

### 1. Fixed Backend Authentication (src/app.ts)
- Removed unnecessary `!userIdentitySupplied` condition
- Edge agent routes with valid `x-edge-bridge-key` are now properly authenticated
- Commit: `3cb08aa`

### 2. Created Environment Loading Wrapper (edge-agent/start-with-env.mjs)
- Node.js script that loads `.env` file before starting edge agent
- Ensures all environment variables are properly set in `process.env`
- Cleaner than BAT file approach for environment variable loading

### 3. Updated Startup Script (edge-agent/START_SCANNER_SIMPLE.bat)
- Simplified to just call the Node.js wrapper
- More reliable than parsing .env in BAT

## Scanner Status

✅ **The scanner is now WORKING!**

Scanner Details:
- **ID:** 6a570d4a-2c71-415f-b59a-643cf50d55c5
- **Name:** Main Scanner
- **Branch:** 00000000-0000-4000-8000-000000000104 (Development Branch)
- **Status:** Online
- **Backend:** https://sentinel-grid-control-plane1.onrender.com

## How to Start the Scanner

1. Navigate to edge agent directory:
   ```
   cd c:\Omsystems\edge-agent
   ```

2. Run the start script:
   ```
   START_SCANNER_SIMPLE.bat
   ```

The scanner will:
- Load configuration from `.env`
- Authenticate with the control plane
- Start listening for camera discovery commands
- Send periodic heartbeats to stay online

## How to Stop the Scanner

Press `Ctrl+C` in the terminal running the scanner.

## Testing Commands

### Check Scanner Status
```bash
node c:\Omsystems\edge-agent\start-with-env.mjs --diagnose
```

### Verify Configuration
```bash
node c:\Omsystems\edge-agent\start-with-env.mjs --check-config
```

## What Happens Next

1. Scanner is now running and connected to the backend
2. When you trigger a camera scan from the dashboard, the scanner will:
   - Receive the scan job
   - Discover ONVIF cameras on the local network
   - Send discovered camera information to the control plane
   - Complete the scan job

## Files Modified
- `c:\Omsystems\src\app.ts` - Fixed authentication logic
- `c:\Omsystems\edge-agent\start-with-env.mjs` - New environment loader
- `c:\Omsystems\edge-agent\START_SCANNER_SIMPLE.bat` - Updated startup script

## Deployment
All changes have been pushed to GitHub and automatically deployed to Render production.

---

**Status:** ✅ COMPLETE - Edge agent is working and online
**Date:** August 1, 2026
