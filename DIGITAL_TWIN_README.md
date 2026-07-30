# Sentinel Grid Digital Twin System

## Overview

The **Digital Twin** is an interactive 2D/3D visualization system that provides real-time spatial awareness of branch operations. It displays cameras, sensors, doors, equipment, and security events on floor plans with live status overlays.

---

## ✨ Key Features

### 🏢 Multi-Level Hierarchy
- **Sites** → Organizations or major facilities
- **Buildings** → Individual branches, datacenters, or offices
- **Floors** → Multiple levels with independent floor plans
- **Objects** → Cameras, sensors, doors, equipment positioned on plans

### 📐 Floor Plan Management
- Upload PNG, JPG, SVG, or PDF floor plans
- Version control with plan history
- Scale and transformation configuration
- Normalized coordinate system (position-independent)

### 📹 Device Visualization
- **Live Status Overlays**: Green (online), Red (offline), Yellow (degraded)
- **Device Types**: Cameras, DVRs, NVRs, doors, sensors, UPS, switches, ATMs, vaults
- **Drag-and-Drop Positioning**: Place and reposition devices interactively
- **Field-of-View Visualization**: Camera coverage cones and blind spots
- **Status Indicators**: Recording status, analytics state, door state

### 🚨 Spatial Alerts
- Real-time alert markers with pulsing effects
- **Alert Types**: Intrusion, fire, panic, door forced, camera offline, unauthorized access
- **Severity Levels**: Critical, High, Medium, Low (color-coded)
- **Auto-Zoom**: Automatically focus on triggered alerts
- **Nearby Cameras**: Show related cameras for operator awareness
- Acknowledge and resolve workflow

### 🔥 Heat Maps
- **People Movement**: Foot traffic density
- **Dwell Time**: Time spent in areas
- **Incidents**: Spatial alert concentration
- **Device Failures**: Equipment reliability by location
- **Queue Density**: Customer queue visualization
- **Intrusions**: Security breach patterns

### 🎯 Zone Management
- **Polygonal Zones**: Draw custom areas on floor plans
- **Zone Types**: Restricted, public, emergency, queue, coverage
- **Point-in-Polygon Detection**: Automatic zone violation detection
- **Alert Configuration**: Entry alerts, dwell alerts, analytics triggers

### 🕐 Timeline Playback
- **Historical State Replay**: Rewind floor state to any point in time
- **Event Timeline**: Door events, alerts, status changes
- **Incident Investigation**: Reconstruct security event progression
- **Camera Snapshots**: Time-synced device states

### 🔗 Device Binding
- Link Digital Twin objects to real physical devices
- **Automatic Status Sync**: Live updates from cameras, sensors, doors
- **Custom Status Mapping**: Define color codes per device
- **Multi-Table Support**: Cameras, recorders, access control, sensors

### 🌐 Real-Time Updates
- WebSocket-based live synchronization
- Room-based subscriptions (per floor or building)
- Object status changes broadcast instantly
- Alert notifications with auto-refresh

---

## 📁 Architecture

### Database Schema

**14 core tables**:
```
digital_twin_sites
digital_twin_buildings
digital_twin_floors
digital_twin_floor_plans
digital_twin_objects
digital_twin_device_bindings
digital_twin_zones
digital_twin_camera_views
digital_twin_heatmaps
digital_twin_alert_markers
digital_twin_scene_versions
digital_twin_user_preferences
digital_twin_permissions
digital_twin_audit_log
```

### Backend Services

1. **DigitalTwinService**: Sites, buildings, floors CRUD
2. **FloorPlanService**: Upload, versioning, transformations
3. **TwinObjectService**: Device placement and management
4. **DeviceBindingService**: Link objects to real devices
5. **ZoneService**: Polygonal zone management
6. **SpatialAlertService**: Alert markers and notifications
7. **FloorStateService**: Consolidated floor state
8. **HeatMapService**: Spatial analytics aggregation
9. **DigitalTwinEventMapper**: Maps real events to spatial alerts
10. **DigitalTwinAnalyticsIntegration**: Connects AI detections to map

### REST API Endpoints

```
Sites
POST   /v1/digital-twin/sites
GET    /v1/digital-twin/sites/:siteId
GET    /v1/digital-twin/organizations/:orgId/sites
PATCH  /v1/digital-twin/sites/:siteId
DELETE /v1/digital-twin/sites/:siteId

Buildings
POST   /v1/digital-twin/buildings
GET    /v1/digital-twin/buildings/:buildingId
GET    /v1/digital-twin/sites/:siteId/buildings
GET    /v1/digital-twin/branches/:branchId/building
PATCH  /v1/digital-twin/buildings/:buildingId
DELETE /v1/digital-twin/buildings/:buildingId

Floors
POST   /v1/digital-twin/floors
GET    /v1/digital-twin/floors/:floorId
GET    /v1/digital-twin/buildings/:buildingId/floors
PATCH  /v1/digital-twin/floors/:floorId
DELETE /v1/digital-twin/floors/:floorId

Floor Plans
POST   /v1/digital-twin/floor-plans (multipart/form-data)
GET    /v1/digital-twin/floors/:floorId/floor-plan
GET    /v1/digital-twin/floors/:floorId/floor-plan-versions
PATCH  /v1/digital-twin/floor-plans/:planId/transform
POST   /v1/digital-twin/floor-plans/:planId/activate
DELETE /v1/digital-twin/floor-plans/:planId

Objects
POST   /v1/digital-twin/objects
POST   /v1/digital-twin/objects/bulk
GET    /v1/digital-twin/objects/:objectId
GET    /v1/digital-twin/floors/:floorId/objects
PATCH  /v1/digital-twin/objects/:objectId
PATCH  /v1/digital-twin/objects/:objectId/position
DELETE /v1/digital-twin/objects/:objectId

Device Bindings
POST   /v1/digital-twin/device-bindings
GET    /v1/digital-twin/objects/:objectId/binding
GET    /v1/digital-twin/devices/:type/:id/binding
PATCH  /v1/digital-twin/device-bindings/:bindingId
DELETE /v1/digital-twin/device-bindings/:bindingId

Zones
POST   /v1/digital-twin/zones
GET    /v1/digital-twin/zones/:zoneId
GET    /v1/digital-twin/floors/:floorId/zones
POST   /v1/digital-twin/floors/:floorId/zones/find-point
PATCH  /v1/digital-twin/zones/:zoneId
DELETE /v1/digital-twin/zones/:zoneId

Alerts
POST   /v1/digital-twin/alerts
GET    /v1/digital-twin/alerts/:alertId
GET    /v1/digital-twin/floors/:floorId/alerts/active
GET    /v1/digital-twin/floors/:floorId/alerts/history
POST   /v1/digital-twin/alerts/:alertId/acknowledge
POST   /v1/digital-twin/alerts/:alertId/resolve
DELETE /v1/digital-twin/alerts/:alertId

Floor State
GET    /v1/digital-twin/floors/:floorId/state
GET    /v1/digital-twin/buildings/:buildingId/state

Heat Maps
POST   /v1/digital-twin/heatmaps/generate
GET    /v1/digital-twin/floors/:floorId/heatmaps/latest/:type
GET    /v1/digital-twin/floors/:floorId/heatmaps
```

### WebSocket Events

**Namespace**: `/digital-twin`

**Client → Server**:
- `subscribe:floor` - Subscribe to floor updates
- `unsubscribe:floor` - Unsubscribe from floor
- `subscribe:building` - Subscribe to all building floors
- `request:floor:state` - Request current floor state

**Server → Client**:
- `floor:event` - Generic floor event
- `alert:triggered` - New alert created
- `object:status` - Device status changed
- `door:state` - Door state changed
- `floor:state` - Complete floor state response

---

## 🚀 Quick Start

### 1. Database Setup

```bash
# Run migration
psql -U postgres -d sentinel_grid -f database/migrations/037_digital_twin_core.sql
```

### 2. Configure Environment

```env
FLOOR_PLAN_UPLOAD_DIR=./uploads/floor-plans
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

### 3. Create Your First Site

```typescript
POST /api/digital-twin/sites
{
  "organizationId": "your-org-id",
  "name": "Head Office",
  "address": "123 Main St, City",
  "timezone": "America/New_York"
}
```

### 4. Add a Building

```typescript
POST /api/digital-twin/buildings
{
  "siteId": "site-id",
  "branchId": "branch-id", // Optional
  "name": "Main Branch",
  "buildingType": "branch",
  "totalFloors": 3
}
```

### 5. Create Floors

```typescript
POST /api/digital-twin/floors
{
  "buildingId": "building-id",
  "floorNumber": 1,
  "name": "Ground Floor",
  "areaSquareMeters": 500
}
```

### 6. Upload Floor Plan

```typescript
// Form data
POST /api/digital-twin/floor-plans
Content-Type: multipart/form-data

file: floor-plan.png
floorId: floor-id
scaleMetersPerPixel: 0.01
```

### 7. Place Devices

```typescript
POST /api/digital-twin/objects
{
  "floorId": "floor-id",
  "objectType": "camera",
  "name": "Main Entrance Camera",
  "positionX": 0.5,
  "positionY": 0.3,
  "rotation": 90,
  "showStatus": true
}
```

### 8. Bind to Real Device

```typescript
POST /api/digital-twin/device-bindings
{
  "twinObjectId": "object-id",
  "deviceType": "camera",
  "deviceId": "camera-uuid",
  "deviceTable": "cameras",
  "statusSource": "camera.health",
  "autoUpdate": true
}
```

---

## 🎨 Frontend Components

### Main Pages
- **/digital-twin** - Site and building selector
- **/digital-twin/buildings/[id]** - Multi-floor viewer

### Key Components
- **FloorPlanViewer** - Interactive canvas with zoom/pan/drag
- **FloorPlanUploadModal** - File upload with preview
- **DevicePlacementPanel** - Device library and creation
- **DeviceStatusOverlay** - Device details and controls
- **HeatMapOverlay** - Spatial analytics visualization
- **ZoneEditor** - Polygon drawing tool
- **AlertPanel** - Real-time alert list
- **TimelinePlayer** - Historical playback controls

---

## 🔗 Integration Points

### Analytics Engine Integration

```typescript
import digitalTwinAnalyticsIntegration from './services/digital-twin-analytics-integration.service';

// On intrusion detection
await digitalTwinAnalyticsIntegration.handleIntrusionDetection(
  cameraId,
  'Restricted Area',
  personCount,
  confidence
);

// On fire/smoke detection
await digitalTwinAnalyticsIntegration.handleFireSmokeDetection(
  cameraId,
  'fire',
  confidence,
  location
);
```

### Camera Health Integration

```typescript
import digitalTwinEventMapper from './services/digital-twin-event-mapper.service';

// On camera health change
await digitalTwinEventMapper.onCameraHealthChange(
  cameraId,
  previousStatus,
  newStatus
);
```

### Access Control Integration

```typescript
// On door state change
await digitalTwinEventMapper.onDoorStateChange(
  doorId,
  previousState,
  newState,
  authorizedUser
);
```

---

## 📊 Use Cases

### Banking Branch Security
- ATM lobby monitoring with zone analytics
- Vault and strong-room real-time status
- Panic button spatial awareness
- After-hours intrusion tracking
- Queue density heat maps

### Multi-Site Operations
- Central monitoring of all branches
- Equipment health by location
- Incident density analysis
- Maintenance scheduling by device clusters

### Incident Investigation
- Timeline playback of events
- Spatial reconstruction of incidents
- Nearby camera discovery
- Event correlation by proximity

### Operational Analytics
- High-traffic area identification
- Queue bottleneck detection
- Device reliability patterns
- Coverage gap analysis

---

## 🛡️ Security & Permissions

### Permission Types
- `can_view_floors` - View floor plans
- `can_edit_floors` - Modify floor configurations
- `can_place_devices` - Add/move devices
- `can_edit_zones` - Create/modify zones
- `can_view_3d` - Access 3D view (future)
- `can_export_plans` - Export floor plans
- `can_playback_timeline` - Historical playback

### Audit Logging
All Digital Twin changes are logged:
- Floor plan uploads
- Device placement/movement
- Zone modifications
- Device bindings
- User and timestamp tracked

---

## 🔮 Future Enhancements (Phase 2)

### 3D Visualization
- Three.js-based 3D rendering
- glTF/GLB building models
- BIM import (IFC, DXF, DWG)
- First-person navigation
- Animated alert markers in 3D

### Advanced Analytics
- Person journey tracking
- Predictive risk visualization
- Evacuation simulation
- Federated multi-site Digital Twin

### Enhanced Features
- PTZ camera control from map
- Camera footage overlay on plan
- Mobile app for field technicians
- AR overlay for on-site navigation

---

## 📝 Best Practices

### Floor Plan Preparation
1. Use high-resolution images (min 2000px wide)
2. Ensure walls and rooms are clearly visible
3. PNG or SVG preferred for clarity
4. Set correct scale (typical: 0.01-0.05 meters/pixel)

### Device Placement
1. Place cameras at actual physical locations
2. Set rotation to match camera direction
3. Use field-of-view visualization for coverage
4. Group related devices logically

### Zone Configuration
1. Draw precise polygon boundaries
2. Name zones descriptively
3. Configure alerts for restricted areas
4. Use queue zones for analytics

### Performance Optimization
1. Limit simultaneous live streams (4-6 max)
2. Generate heat maps on-demand or scheduled
3. Archive old scene versions periodically
4. Use appropriate zoom levels for large plans

---

## 🐛 Troubleshooting

### Device Not Showing Status
- Verify device binding exists
- Check device ID matches exactly
- Ensure `autoUpdate` is enabled
- Confirm device table name is correct

### Floor Plan Not Loading
- Check file size (max 50MB)
- Verify file type (PNG, JPG, SVG, PDF)
- Ensure upload directory is writable
- Check browser console for errors

### Real-Time Updates Not Working
- Confirm WebSocket connection
- Check `subscribe:floor` message sent
- Verify floor ID is correct
- Test WebSocket URL in environment

### Alert Markers Not Appearing
- Ensure device binding exists for camera
- Check alert was created successfully
- Verify twin object ID is linked
- Confirm floor ID matches

---

## 📚 API Examples

### Generate People Movement Heat Map

```typescript
POST /api/digital-twin/heatmaps/generate
{
  "floorId": "floor-uuid",
  "heatmapType": "people_movement",
  "timePeriodStart": "2024-01-01T00:00:00Z",
  "timePeriodEnd": "2024-01-01T23:59:59Z",
  "gridResolution": 50,
  "sourceCameras": ["camera-1-uuid", "camera-2-uuid"]
}
```

### Find Zones Containing Point

```typescript
POST /api/digital-twin/floors/:floorId/zones/find-point
{
  "x": 0.45,
  "y": 0.67
}

Response: [
  {
    "id": "zone-uuid",
    "name": "Restricted Area",
    "isRestricted": true,
    ...
  }
]
```

### Get Floor State with All Devices

```typescript
GET /api/digital-twin/floors/:floorId/state

Response: {
  "floorId": "floor-uuid",
  "objects": [
    {
      "id": "object-uuid",
      "name": "Main Camera",
      "objectType": "camera",
      "positionX": 0.5,
      "positionY": 0.3,
      "currentStatus": {
        "status": "online",
        "statusColor": "#22c55e",
        "isOnline": true,
        "isRecording": true
      },
      ...
    }
  ],
  "zones": [...],
  "alerts": [...],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## 🎯 Success Metrics

After Digital Twin implementation, you should see:
- ✅ **95%+ visual monitoring coverage**
- ✅ **Real-time device status awareness**
- ✅ **Faster incident response** (30-50% reduction)
- ✅ **Spatial investigation capability**
- ✅ **Heat map-driven optimization**
- ✅ **Reduced blind spots** (coverage analysis)
- ✅ **Enterprise-grade presentation**

---

## 📞 Support

For issues or questions about the Digital Twin system:
1. Check this README first
2. Review API documentation
3. Check browser console for frontend errors
4. Review backend logs for service errors
5. Test WebSocket connectivity
6. Verify database schema is up to date

---

**The Digital Twin transforms Sentinel Grid from a monitoring system into an intelligent spatial awareness platform.**
