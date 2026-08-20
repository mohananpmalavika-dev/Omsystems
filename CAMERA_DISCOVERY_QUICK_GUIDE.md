# Camera Discovery - Quick Reference Guide

## Fixed Issue ✅
**Problem**: GET `/v1/branches/{branchId}/cameras/discovered` was returning 404
**Solution**: Enabled camera discovery routes that were temporarily disabled
**Status**: FIXED - All routes now active

## Your Question (Malayalam)
> "entha ingane route set cheythekkunne branch id will change so ith possible alla make a fixed solution"

## Answer (English)
Don't worry! The route is **NOT hardcoded**. It uses a **dynamic parameter** `:branchId` that automatically accepts ANY branch ID you provide in the URL. You can use different branch IDs each time - it will work for all of them.

### How It Works:
```bash
# All of these will work - branch ID is dynamic:
GET /v1/branches/d9e77d54-e29f-4f5c-b907-d9c28b287687/cameras/discovered  ✅
GET /v1/branches/abc12345-1234-4567-8901-234567890abc/cameras/discovered  ✅
GET /v1/branches/any-branch-uuid-here/cameras/discovered  ✅
```

The `:branchId` part in the route definition is a **placeholder** that gets replaced with whatever branch ID you send in the request.

---

## Most Common Routes You'll Use

### 1. List Discovered Cameras (View Pending Cameras)
```http
GET /v1/branches/{branchId}/cameras/discovered
Authorization: Bearer YOUR_TOKEN
```

**Response**:
```json
{
  "data": [
    {
      "id": "discovery-uuid-1",
      "manufacturer": "CP PLUS",
      "model": "CP-UNC-TC30L3-D",
      "ipAddress": "192.168.1.100",
      "status": "pending",
      "streamVerified": true,
      "displayName": "Front Gate Camera"
    }
  ]
}
```

### 2. Submit Camera Discovery (Add New Camera)
```http
POST /v1/branches/{branchId}/cameras/discovered
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "manufacturer": "CP PLUS",
  "model": "CP-UNC-TC30L3-D",
  "ipAddress": "192.168.1.100",
  "onvifPort": 80,
  "rtspPort": 554,
  "sourceType": "ip-camera",
  "displayName": "Front Gate Camera"
}
```

### 3. Approve Camera (Make It Active)
```http
POST /v1/branches/{branchId}/cameras/discovered/{discoveryId}/approve
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "name": "Front Gate Camera",
  "protocol": "onvif-t",
  "channel": 1
}
```

### 4. Approve All Pending Cameras (Bulk Operation)
```http
POST /v1/branches/{branchId}/cameras/discovered/approve-all
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "recordingMode": "continuous",
  "retentionDays": 180,
  "enableAnalytics": true,
  "enableAlerts": true
}
```

### 5. Reject Camera Discovery
```http
POST /v1/branches/{branchId}/cameras/discovered/{discoveryId}/reject
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "reason": "Duplicate device"
}
```

---

## Testing After Deployment

### Step 1: Check if Route Works
```bash
# Replace {branchId} with actual branch UUID
curl -X GET "https://sentinel-grid-control-plane.onrender.com/v1/branches/{branchId}/cameras/discovered" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected**: Status 200 with camera list (even if empty)
**Error**: Status 404 means deployment didn't include the fix

### Step 2: Submit a Test Discovery
```bash
curl -X POST "https://sentinel-grid-control-plane.onrender.com/v1/branches/{branchId}/cameras/discovered" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "manufacturer": "CP PLUS",
    "model": "Test Camera",
    "ipAddress": "192.168.1.100",
    "displayName": "Test Discovery"
  }'
```

**Expected**: Status 201 Created

### Step 3: List Discoveries Again
```bash
# Same as Step 1 - should now show the test discovery
curl -X GET "https://sentinel-grid-control-plane.onrender.com/v1/branches/{branchId}/cameras/discovered" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Frontend Integration

The device manager in your React dashboard will now work:

```typescript
// This call was returning 404 before - now it works
const discoveries = await cameraInventoryApi.listDiscovered(branchId);

// discoveries.data will contain array of pending cameras
discoveries.data.forEach(camera => {
  console.log(`Found: ${camera.displayName} at ${camera.ipAddress}`);
});
```

---

## Complete Route List (All 14 Endpoints)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/branches/:branchId/cameras/discovered` | **List pending cameras** |
| POST | `/v1/branches/:branchId/cameras/discovered` | Submit camera discovery |
| GET | `/v1/branches/:branchId/cameras/:cameraId/identity` | Get device identity |
| POST | `/v1/branches/:branchId/cameras/discovered/:discoveryId/approve` | Approve single camera |
| POST | `/v1/branches/:branchId/cameras/discovered/:discoveryId/activate` | Approve + activate camera |
| POST | `/v1/branches/:branchId/cameras/discovered/approve-all` | Approve all pending |
| POST | `/v1/branches/:branchId/cameras/discovered/:discoveryId/reject` | Reject discovery |
| PATCH | `/v1/branches/:branchId/cameras/discovered/:discoveryId/rename` | Rename discovery |
| POST | `/v1/branches/:branchId/edge-agents/register` | Register edge agent |
| GET | `/v1/branches/:branchId/edge-agents` | List edge agents |
| POST | `/v1/edge-agents/:agentId/heartbeat` | Edge agent heartbeat |
| POST | `/v1/branches/:branchId/edge-agents/:agentId/heartbeat` | Branch heartbeat |
| POST | `/v1/cameras/probe-direct` | Test camera connection |
| POST | `/v1/cameras/qr-connect` | QR code onboarding |

---

## Key Points

1. ✅ **Branch ID is DYNAMIC** - not hardcoded
2. ✅ **All routes use `:branchId` parameter** - works with any branch
3. ✅ **14+ endpoints are now active** - full discovery workflow
4. ✅ **Frontend will work** - device manager can load cameras
5. ✅ **Build is passing** - ready for production deployment

## Need Help?

If you still see 404 after deployment:
1. Check if you deployed the latest build with the fix
2. Verify your branch ID is correct (UUID format)
3. Check authorization token is valid
4. Look at Render.com deployment logs for errors

## Deployment Command

```bash
# Push to Render (triggers auto-deploy)
git add src/app.ts CAMERA_DISCOVERY_ROUTE_FIX.md CAMERA_DISCOVERY_QUICK_GUIDE.md
git commit -m "fix: enable camera discovery routes - resolve 404 error"
git push origin main
```

---

**Fix Applied**: ✅ Complete
**Routes Active**: ✅ 14+ Endpoints
**Branch ID**: ✅ Fully Dynamic
**Deploy Status**: ✅ Ready
