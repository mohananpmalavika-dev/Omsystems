# ✅ FIXED: 401 Authentication Error

## Problem
The admin API routes were not passing authentication headers to the backend, causing 401 Unauthorized errors.

## Solution Applied
Updated both API routes to include authentication headers (matching the pattern used in `/api/control/[...path]/route.ts`):

### Files Updated:
1. `dashboard/app/api/admin/system/cameras/route.ts`
2. `dashboard/app/api/admin/system/stats/route.ts`

### What Changed:

**Before (BROKEN):**
```typescript
const response = await fetch(`${controlPlaneUrl}/v1/admin/cameras/list`, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',  // ❌ No authentication!
  },
});
```

**After (FIXED):**
```typescript
// Get authentication from cookie or header
const employeeSession = request.cookies.get('sentinel_access')?.value ??
  request.headers.get('x-sentinel-session');
const devUserId = process.env.DASHBOARD_DEV_USER_ID || 'user-global-admin';

const headers: HeadersInit = {
  'Content-Type': 'application/json',
};

// Add authentication
if (employeeSession) {
  headers['authorization'] = `Bearer ${employeeSession}`;  // ✅ Session auth
} else {
  headers['x-user-id'] = devUserId;  // ✅ Dev mode auth
}

// Add bridge key if available
const bridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY;
if (bridgeKey) {
  headers['x-edge-bridge-key'] = bridgeKey;  // ✅ Edge auth
}

const response = await fetch(`${controlPlaneUrl}/v1/admin/cameras/list`, {
  method: 'GET',
  headers,
  cache: 'no-store',
});
```

## How It Works Now

```
User → Dashboard → API Route → Control Plane
                     ↓
              Passes authentication:
              - Cookie: sentinel_access (session mode)
              - Header: x-user-id (dev mode)
              - Header: x-edge-bridge-key (if set)
```

## Deploy & Test

### 1. Commit Changes:
```bash
git add dashboard/app/api/admin/system/
git commit -m "Fix: Add authentication to admin API routes"
git push origin main
```

### 2. Wait for Deployment (2-3 minutes)

### 3. Test:
Go to: **Admin → System Management**

You should now see:
- ✅ Camera count displayed
- ✅ Camera list with names, status, vendor
- ✅ No more 401 errors

## If Still Getting 401

Check environment variables in Render Dashboard:

**sentinel-grid-dashboard:**
- `DASHBOARD_DEV_USER_ID` (if using dev mode) = `user-global-admin`
- `CONTROL_PLANE_INTERNAL_URL` = internal URL of control-plane service
- `EDGE_BRIDGE_SHARED_KEY` (optional) = same as control-plane

**sentinel-grid-control-plane:**
- `AUTH_MODE` = `development` or `session`
- `EDGE_BRIDGE_SHARED_KEY` (if dashboard has it)

## Verification

Open browser console (F12) and check:
```
Before fix:
/api/admin/system/cameras - Status: 401 ❌

After fix:
/api/admin/system/cameras - Status: 200 ✅
Response: [{ id: "xxx", name: "Camera 1", ... }]
```

