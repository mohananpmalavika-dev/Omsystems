# Camera Location Map Feature

## Overview

The Camera Location Map feature provides GPS-based visualization of camera locations across your surveillance network. This feature helps operators quickly understand camera deployment, monitor device health by location, and identify coverage gaps.

## Features

### 1. Individual Camera View
- Real-time GPS-based camera locations on interactive map
- Color-coded status markers:
  - 🟢 **Green** - Healthy/Online cameras
  - 🟡 **Yellow** - Warning/Degraded cameras
  - 🔴 **Red** - Critical status cameras
  - ⚫ **Gray** - Offline cameras
- Click markers to view camera details:
  - Camera name and branch
  - Current status
  - Last seen timestamp
  - Uptime percentage
  - Location type
  - Physical type
  - Vendor and model

### 2. Branch Cluster View
- Aggregated branch-level visualization
- Shows total cameras per branch
- Health statistics breakdown per location
- Cluster markers sized by camera count
- Color-coded by overall branch health

### 3. Interactive Features
- **Status Filtering**: Filter cameras by health status
- **Toggle Views**: Switch between individual cameras and branch clusters
- **Show/Hide Offline**: Option to include or exclude offline cameras
- **Real-time Refresh**: Manual refresh button to update map data
- **Zoom & Pan**: Standard map controls (scroll to zoom, drag to pan)

## API Endpoints

### GET `/api/control/v1/camera-locations`
Fetch all cameras with GPS coordinates.

**Query Parameters:**
- `branchId` (optional): Filter by specific branch
- `status` (optional): Filter by status (`online`, `offline`, `degraded`, `unknown`)
- `includeOffline` (optional): `true` or `false` to include/exclude offline cameras

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cam-001",
      "name": "Main Entrance Camera",
      "branchId": "branch-123",
      "branchName": "Downtown Branch",
      "latitude": 12.9716,
      "longitude": 77.5946,
      "status": "online",
      "lastSeen": "2024-03-15T10:30:00Z",
      "locationType": "branch-entrance",
      "physicalType": "dome-outdoor",
      "vendor": "hikvision",
      "model": "DS-2CD2143G0-I",
      "uptime": 99.5
    }
  ],
  "total": 150
}
```

### GET `/api/control/v1/camera-locations/branches`
Fetch branch clusters with camera counts and health statistics.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "branch-123",
      "name": "Downtown Branch",
      "latitude": 12.9716,
      "longitude": 77.5946,
      "totalCameras": 25,
      "healthyCameras": 23,
      "warningCameras": 1,
      "criticalCameras": 0,
      "offlineCameras": 1
    }
  ],
  "total": 45
}
```

### GET `/api/control/v1/camera-locations/:cameraId`
Get specific camera location details.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "cam-001",
    "name": "Main Entrance Camera",
    "branchId": "branch-123",
    "branchName": "Downtown Branch",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "status": "online",
    "lastSeen": "2024-03-15T10:30:00Z"
  }
}
```

## Configuration

### Adding GPS Coordinates to Branches

To display cameras on the map, you need to configure GPS coordinates for each branch:

1. **Via Organization Management UI:**
   - Navigate to: Settings → Organization → Branches
   - Edit a branch
   - Add metadata field: `location`
   - Set value: `{"latitude": 12.9716, "longitude": 77.5946}`
   - Save

2. **Via Bulk Upload:**
   ```csv
   branch_name,address,latitude,longitude
   Downtown Branch,123 Main St,12.9716,77.5946
   Airport Branch,456 Airport Rd,12.9500,77.6200
   ```

3. **Via API:**
   ```typescript
   await store.updateNode(branchId, {
     metadata: {
       location: {
         latitude: 12.9716,
         longitude: 77.5946
       }
     }
   });
   ```

### Coordinate Formats Supported

Both formats are accepted:
- `{"latitude": 12.9716, "longitude": 77.5946}`
- `{"lat": 12.9716, "lng": 77.5946}`

## Access & Permissions

- Requires authenticated user session
- Users can only see cameras within their tenant
- Respects existing branch-level access controls
- Camera details require `live:view` permission

## Frontend Integration

### Page Location
- URL: `/maintenance/camera-map`
- Navigation: **Main Menu → Fleet Maintenance → Camera Location Map**
- Also accessible from: Maintenance Dashboard → Quick Actions → 📍 Camera locations map

### Technologies Used
- **Leaflet.js** - Interactive map library
- **React Leaflet** - React bindings for Leaflet
- **OpenStreetMap** - Free map tile provider
- **Next.js** - React framework

### Component Structure
```
dashboard/
├── app/
│   └── maintenance/
│       └── camera-map/
│           └── page.tsx          # Main page component
└── components/
    └── maintenance/
        └── map-view.tsx          # Reusable map components
```

## Usage Examples

### Viewing Camera Locations
1. Navigate to Maintenance → Camera Locations Map
2. The map automatically loads all cameras with configured GPS coordinates
3. Click on any camera marker to see details

### Filtering by Status
1. Use the filter panel on the right side of the map
2. Click a status button (Healthy, Warning, Critical, Offline)
3. The map updates to show only cameras with that status

### Switching to Branch View
1. Click "Branch Clusters" toggle at the top
2. Map shows aggregated branch-level data
3. Click a branch marker to see statistics

### Finding Coverage Gaps
1. Switch to Branch Clusters view
2. Look for branches with red markers (high offline count)
3. Click to see detailed health breakdown

## Troubleshooting

### No Cameras Showing on Map
**Issue**: Map is empty despite having cameras configured.

**Solution**: 
- Verify GPS coordinates are configured for branches
- Check browser console for errors
- Ensure cameras are assigned to branches with GPS data

### Incorrect Camera Positions
**Issue**: Cameras appear in wrong locations.

**Solution**:
- Verify latitude/longitude format in branch metadata
- Ensure coordinates use decimal degrees (not DMS format)
- Check for swapped latitude/longitude values

### Map Not Loading
**Issue**: "Loading map..." message persists.

**Solution**:
- Check network connectivity
- Verify API endpoint is accessible
- Check browser console for errors
- Ensure leaflet CSS is loaded

### Status Not Updating
**Issue**: Camera status colors don't match actual status.

**Solution**:
- Click the "Refresh" button to reload data
- Check if camera status is being reported correctly
- Verify edge agent connectivity

## Performance Considerations

- Map renders client-side using React
- Initial load fetches all camera locations
- Consider pagination for very large deployments (>1000 cameras)
- Branch cluster view recommended for large networks

## Future Enhancements

Planned features:
- [ ] Heat map overlay for incident density
- [ ] Real-time status updates via WebSocket
- [ ] Custom map layers (satellite, terrain)
- [ ] Drawing tools for coverage areas
- [ ] Export map as image/PDF
- [ ] Routing between cameras
- [ ] Historical playback of camera status
- [ ] Integration with patrol routes
- [ ] Geofencing alerts

## Related Documentation

- [Maintenance Dashboard](./MAINTENANCE_DASHBOARD.md)
- [Camera Management](./CAMERA_MANAGEMENT.md)
- [Branch Configuration](./BRANCH_CONFIGURATION.md)
- [Bulk Upload Guide](./BULK_UPLOAD.md)

## Support

For issues or questions:
- Check troubleshooting section above
- Review server logs: `src/routes/camera-location-map.routes.ts`
- Review frontend console errors
- Contact: support@sentinel-grid.com
