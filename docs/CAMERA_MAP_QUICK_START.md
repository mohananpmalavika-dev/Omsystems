# Camera Location Map - Quick Start Guide

## 🚀 5-Minute Setup

### Step 1: Add GPS Coordinates to a Branch

Choose any method:

**Method A: SQL (Fastest)**
```sql
UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 12.9716, "longitude": 77.5946}'::jsonb
)
WHERE type = 'branch' AND name = 'Your Branch Name';
```

**Method B: UI**
1. Go to Settings → Organization → Branches
2. Click Edit on any branch
3. Add to metadata: `"location": {"latitude": 12.9716, "longitude": 77.5946}`
4. Save

### Step 2: Ensure Cameras are Assigned to That Branch
```sql
-- Verify cameras are assigned
SELECT id, name, branch_id FROM cameras WHERE branch_id = 'your-branch-id';
```

### Step 3: Open the Camera Map
Navigate to: **http://localhost:3000/maintenance/camera-map**

Or: Dashboard → Maintenance → 📍 Camera Locations Map

### Step 4: See Your Cameras!
You should now see:
- Cameras displayed as colored dots on the map
- Statistics at the top
- Click any marker for details

## 📍 Finding GPS Coordinates

### Google Maps Method:
1. Open https://www.google.com/maps
2. Right-click on your branch location
3. Click "What's here?"
4. Copy the latitude and longitude numbers

Example: `12.9716, 77.5946`

### Format for Database:
```json
{
  "latitude": 12.9716,
  "longitude": 77.5946
}
```

## 🎨 Understanding Marker Colors

| Color | Status | Meaning |
|-------|--------|---------|
| 🟢 Green | Healthy | Camera is online and functioning |
| 🟡 Yellow | Warning | Camera is degraded or has issues |
| 🔴 Red | Critical | Camera has critical problems |
| ⚫ Gray | Offline | Camera is not connected |

## 📊 Using the Map

### View Individual Cameras
1. Click "📹 Individual Cameras" button
2. All cameras with GPS coordinates appear
3. Click any marker to see camera details

### View Branch Clusters
1. Click "🏢 Branch Clusters" button
2. See aggregated camera counts per branch
3. Number on marker = total cameras
4. Color indicates overall branch health

### Filter by Status
1. Use the filter panel on the right
2. Click: All / Healthy / Warning / Critical / Offline
3. Map updates instantly

### Show/Hide Offline Cameras
- Uncheck "Show Offline" to hide offline cameras
- Useful for focusing on active surveillance

### Refresh Data
- Click "🔄 Refresh" button to reload latest status
- Recommended after making changes to cameras

## 🗺️ Sample Locations (India)

Quick test data for Indian cities:

```sql
-- Bangalore
UPDATE resource_nodes SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{location}', '{"latitude": 12.9716, "longitude": 77.5946}'::jsonb) WHERE type = 'branch' AND name = 'Bangalore Main';

-- Mumbai
UPDATE resource_nodes SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{location}', '{"latitude": 19.0760, "longitude": 72.8777}'::jsonb) WHERE type = 'branch' AND name = 'Mumbai Central';

-- Delhi
UPDATE resource_nodes SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{location}', '{"latitude": 28.6139, "longitude": 77.2090}'::jsonb) WHERE type = 'branch' AND name = 'Delhi CP';

-- Chennai
UPDATE resource_nodes SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{location}', '{"latitude": 13.0827, "longitude": 80.2707}'::jsonb) WHERE type = 'branch' AND name = 'Chennai Central';

-- Hyderabad
UPDATE resource_nodes SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{location}', '{"latitude": 17.3850, "longitude": 78.4867}'::jsonb) WHERE type = 'branch' AND name = 'Hyderabad HITEC';
```

## ❓ Troubleshooting

### "No cameras with GPS locations found"
**Fix**: Add GPS coordinates to at least one branch (see Step 1)

### "Loading map..." never finishes
**Fix**: 
1. Check browser console for errors
2. Verify backend is running on port 3001
3. Check `/api/control/v1/camera-locations` returns data

### Cameras in wrong location
**Fix**: 
1. Double-check latitude/longitude values
2. Ensure format: `"latitude": 12.9716, "longitude": 77.5946`
3. Don't swap latitude and longitude!

### Map not interactive
**Fix**:
1. Scroll to zoom (or use +/- buttons)
2. Click and drag to pan
3. Check if JavaScript errors in console

## 📝 Quick Reference

### API Endpoints
```
GET /api/control/v1/camera-locations
GET /api/control/v1/camera-locations/branches
GET /api/control/v1/camera-locations/:cameraId
```

### Query Parameters
```
?branchId=branch-123          # Filter by branch
?status=online                # Filter by status
?includeOffline=false         # Exclude offline cameras
```

### Response Example
```json
{
  "success": true,
  "data": [
    {
      "id": "cam-001",
      "name": "Main Entrance",
      "branchName": "Downtown",
      "latitude": 12.9716,
      "longitude": 77.5946,
      "status": "online"
    }
  ]
}
```

## 💡 Pro Tips

1. **Use Branch View** for large deployments (faster rendering)
2. **Hide Offline** cameras to focus on active surveillance
3. **Click markers** for quick camera details
4. **Zoom in/out** using mouse scroll wheel
5. **Filter by status** to find problematic cameras quickly

## 🎯 Common Use Cases

### Find Offline Cameras
1. Click "Offline" filter
2. See all offline cameras on map
3. Click marker to identify specific camera

### Check Branch Health
1. Switch to "Branch Clusters" view
2. Red markers = branches with issues
3. Click to see breakdown

### Verify Camera Deployment
1. Use Individual Cameras view
2. Check if all expected locations have cameras
3. Identify coverage gaps

## 📚 Next Steps

- Read full documentation: `docs/CAMERA_LOCATION_MAP.md`
- Check SQL examples: `docs/examples/camera-locations-sample.sql`
- Review implementation: `CAMERA_MAP_IMPLEMENTATION.md`

## ✅ Success!

If you can see cameras on the map with colored markers and can click them for details, **you're all set!** 🎉

Enjoy visualizing your surveillance network! 🗺️📹
