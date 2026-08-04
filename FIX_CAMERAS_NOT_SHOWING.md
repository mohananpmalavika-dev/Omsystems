# 🔧 FIX: Cameras Not Showing in System Management

## Problem Identified

Your System Management page shows **"No cameras found"** because:

1. **Frontend is calling:** `/api/admin/system/cameras`
2. **Backend route doesn't exist:** The `adminCameraManagementRoutes` function exists but uses `/v1/admin/cameras/list`
3. **Dashboard API proxy missing:** No proxy route configured in dashboard to forward admin requests

## Root Causes

### Issue 1: API Endpoint Mismatch
```typescript
// Frontend calls:
fetch('/api/admin/system/cameras')  ❌

// But backend route is:
GET /v1/admin/cameras/list  ✅
```

### Issue 2: Backend Route Not Registered
The `adminCameraManagementRoutes` function exists in `src/routes/admin-camera-management.routes.ts` but it's **not being registered** in the main app.

### Issue 3: 502 Error from Earlier
The backend services were crashed (502 error), so even if routes existed, they wouldn't respond.

---

## 🎯 **SOLUTION: 3 Steps**

### **STEP 1: Register Admin Camera Routes in Backend**

The routes exist but aren't registered. We need to add them to the main app.

**File to modify:** `src/app.ts`

**Find this line** (around line 47):
```typescript
import { adminCameraManagementRoutes } from "./routes/admin-camera-management.routes.js";
```

**Then find where routes are registered** (search for `registerAuthRoutes`, around line 600+)

**Add this line:**
```typescript
// After other route registrations, add:
await adminCameraManagementRoutes(app, store);
```

---

### **STEP 2: Create Dashboard API Proxy Route**

The dashboard needs a proxy to forward `/api/admin/system/*` requests to the control plane.

**Create new file:** `dashboard/app/api/admin/system/cameras/route.ts`

```typescript
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL || 'http://localhost:8080';
    
    const response = await fetch(`${controlPlaneUrl}/v1/admin/cameras/list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch cameras' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data.cameras || []);
  } catch (error) {
    console.error('Error fetching cameras:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Create file:** `dashboard/app/api/admin/system/stats/route.ts`

```typescript
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL || 'http://localhost:8080';
    
    // Fetch camera count
    const cameraResponse = await fetch(`${controlPlaneUrl}/v1/admin/cameras/count`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    let stats = {
      gateways: 0,
      cameras: 0,
      branches: 0,
      live_sessions: 0,
      telemetry_records: 0,
    };

    if (cameraResponse.ok) {
      const cameraData = await cameraResponse.json();
      stats.cameras = parseInt(cameraData.total_cameras) || 0;
    }

    // TODO: Add queries for other stats if needed
    // For now, returning cameras count only

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({
      gateways: 0,
      cameras: 0,
      branches: 0,
      live_sessions: 0,
      telemetry_records: 0,
    });
  }
}
```

---

### **STEP 3: Fix Database Schema (If Needed)**

The admin camera routes query the `cameras` table directly, but your schema might use `resource_nodes` for camera names.

**Check if query works:**

Run this in your database to verify:
```sql
SELECT 
  c.id,
  c.name,  -- This might not exist!
  c.branch_node_id,
  c.status,
  c.vendor,
  c.model
FROM cameras c
LIMIT 5;
```

**If you get error:** `column "cameras.name" does not exist`

**Then modify:** `src/routes/admin-camera-management.routes.ts`

Change line ~140:
```typescript
// FROM:
SELECT 
  c.id,
  c.name,  ❌ cameras table doesn't have name column
  c.branch_node_id,
  ...

// TO:
SELECT 
  c.id::text,
  rn.name,  ✅ Get name from resource_nodes
  c.branch_node_id::text,
  c.status,
  c.vendor,
  c.model,
  b.name as branch_name
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id  ← Add this join
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
ORDER BY rn.name
LIMIT 100
```

---

## 🚀 **QUICK FIX (If You Just Want to See Cameras Now)**

If you want a quick test without modifying backend, update the frontend to use the correct endpoint:

**File:** `dashboard/app/admin/system/page.tsx`

**Change line ~79:**
```typescript
// FROM:
const response = await fetch('/api/admin/system/cameras');

// TO:
const response = await fetch('/api/control/v1/admin/cameras/list');
```

**Change line ~62:**
```typescript
// FROM:
const response = await fetch('/api/admin/system/stats');

// TO:
const response = await fetch('/api/control/v1/admin/cameras/count');
```

**And update the data parsing** (line ~80):
```typescript
if (response.ok) {
  const data = await response.json();
  setCameras(data.cameras || []); // Add .cameras
}
```

---

## 📝 **VERIFICATION STEPS**

### 1. Check Backend Route is Registered

**File:** `src/app.ts`

Search for where `adminCameraManagementRoutes` is called:
```typescript
// Should be somewhere around line 600-800
await adminCameraManagementRoutes(app, store);
```

If it's **not there**, add it after other route registrations.

### 2. Test Backend Endpoint Directly

```bash
# Test from your local machine:
curl https://YOUR-APP.onrender.com/v1/admin/cameras/list

# Should return:
{
  "cameras": [
    {
      "id": "xxx",
      "name": "Camera 1",
      "branch_node_id": "xxx",
      "status": "online",
      "vendor": "hikvision",
      "model": "DS-2CD2385G1",
      "branch_name": "Branch 001"
    }
  ]
}
```

If you get **404 Not Found** → Route not registered in app.ts
If you get **500 Error** → Database query issue (check schema fix above)
If you get **502 Bad Gateway** → Backend service crashed (fix 502 error first!)

### 3. Verify Database Has Cameras

```sql
-- In Render Dashboard → sentinel-grid-db → Query tab
SELECT 
  c.id,
  rn.name as camera_name,
  c.status,
  c.vendor,
  c.model,
  b.name as branch_name
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
LIMIT 10;
```

If this returns **0 rows** → No cameras in database! You need to add cameras first.
If this returns **cameras** → Great! Now fix the API route.

---

## 🐛 **TROUBLESHOOTING**

### Cameras Show in Other Pages But Not System Management

**Cause:** Different pages use different API endpoints.

**Fix:** The camera inventory and other pages use different queries (probably through `camera-repository.ts`). System management uses admin routes which might have different schema expectations.

**Solution:** Use the same query pattern everywhere:
```typescript
// Good pattern (from camera-repository.ts):
SELECT 
  cameras.id::text,
  cameras.resource_node_id::text,
  camera_node.name,  ← Get from resource_nodes
  cameras.vendor,
  cameras.model,
  cameras.status
FROM cameras
JOIN resource_nodes camera_node ON camera_node.id = cameras.resource_node_id
```

### "No cameras found" But Database Has Cameras

1. **Check browser console** (F12) for errors
2. **Check Network tab** - is API call succeeding?
3. **Check response** - does it return data in expected format?

### Still Getting 502 Error

Fix the backend crash first (see `QUICK_FIX_502.md`):
1. Check Render logs
2. Run database migrations
3. Verify environment variables
4. Upgrade to Standard plan if out of memory

---

## ✅ **EXPECTED RESULT**

After applying fixes, you should see:

```
System Management Page:
┌─────────────────────────────────────┐
│ Cameras: 15                          │ ← Shows actual count
├─────────────────────────────────────┤
│ Camera 1  | Branch 001 | online     │
│ Camera 2  | Branch 001 | online     │
│ Camera 3  | Branch 002 | offline    │
│ ...                                  │
└─────────────────────────────────────┘
```

---

## 🎯 **RECOMMENDED APPROACH**

**Option 1: Quick Fix (5 minutes)**
- Modify frontend to call correct endpoint directly
- Update data parsing to handle response format
- Test and verify

**Option 2: Proper Fix (20 minutes)**
- Register admin routes in backend (if not registered)
- Fix database query schema mismatch
- Create dashboard API proxy routes
- Test end-to-end

**Option 3: Start Fresh (if database is empty)**
1. Add cameras through edge agent or manual API
2. Verify cameras exist in database
3. Then fix API routing issues

---

## 📞 **Need Help?**

Tell me:
1. **Do you see cameras in other pages?** (e.g., Camera Monitoring, Live View)
2. **What does this query return?**
   ```sql
   SELECT COUNT(*) FROM cameras;
   ```
3. **What's in your browser console** when you visit System Management?
4. **Can you curl** `https://YOUR-APP.onrender.com/v1/admin/cameras/list`?

I'll give you the exact fix based on your responses!

