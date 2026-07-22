# Maintenance Module - Phase 4.1: Dashboard Enhancements

## ✅ Implementation Status: COMPLETE

**Date Completed**: January 2025  
**Phase Duration**: 1 week  
**Implementation**: Production-ready

---

## 📋 Overview

Phase 4.1 implements advanced dashboard enhancements including chart visualizations, interactive map views, CSV export functionality, and real-time WebSocket updates for the Aditi Sentinel CCTV Maintenance System.

---

## 🎯 Features Implemented

### 1. Chart Visualizations ✅

**File**: `dashboard/components/maintenance/chart-components.tsx`

**Charts Implemented** (8 types):

1. **Health Trend Chart** (Area Chart)
   - Shows healthy/warning/critical status over 24 hours
   - Stacked area visualization
   - Real-time data updates

2. **Alert Distribution Chart** (Pie Chart)
   - Alert breakdown by category
   - Color-coded segments
   - Percentage labels

3. **Work Order Status Chart** (Bar Chart)
   - Work orders grouped by status
   - Count visualization
   - Status breakdown

4. **Cost Trend Chart** (Line Chart)
   - Corrective, preventive, and AMC costs
   - Monthly trend analysis
   - Currency formatted tooltips

5. **Camera Health by Branch Chart** (Stacked Bar Chart)
   - Branch-wise camera health distribution
   - Stacked healthy/warning/critical/offline
   - Comparative analysis

6. **SLA Compliance Chart** (Line Chart)
   - Actual vs target compliance
   - 12-week trend
   - Percentage display

7. **Storage Capacity Chart** (Area Chart)
   - Used vs available storage
   - Capacity trend over time
   - Forecast integration

8. **MTTR Chart** (Line Chart)
   - Mean Time To Repair tracking
   - Target comparison
   - Performance monitoring

**Features**:
- ✅ Responsive design (adapts to screen size)
- ✅ Interactive tooltips
- ✅ Legend support
- ✅ Color-coded by status/severity
- ✅ Customizable height
- ✅ Professional styling
- ✅ Reusable components

### 2. Interactive Map View ✅

**File**: `dashboard/components/maintenance/map-view.tsx`

**Technology**: React-Leaflet + OpenStreetMap

**Components**:

1. **CameraMapView**
   - Individual camera locations
   - Status-based markers (green/yellow/red/gray)
   - Interactive popups with details
   - Filter by status
   - Real-time status updates

2. **BranchClusterMap**
   - Branch-level aggregation
   - Camera count badges
   - Health percentage visualization
   - Cluster view for multiple cameras

**Features**:
- ✅ Custom status-based markers
- ✅ Interactive popups with camera details
- ✅ Filter controls (healthy/warning/critical/offline)
- ✅ Zoom and pan controls
- ✅ Real-time marker updates
- ✅ Branch clustering
- ✅ Mobile-responsive
- ✅ OpenStreetMap tiles

**Marker Colors**:
- 🟢 Green: Healthy
- 🟡 Yellow: Warning
- 🔴 Red: Critical
- ⚫ Gray: Offline

### 3. CSV Export Functionality ✅

**Files**:
- `src/utils/csv-export.ts` - Frontend utility
- `src/routes/maintenance-export.routes.ts` - Backend API

**Export Types** (7):

1. **Alerts Export**
   - Alert ID, severity, category, message
   - Status, timestamps
   - Acknowledged/resolved information
   - Endpoint: `GET /v1/maintenance/export/alerts`

2. **Work Orders Export**
   - WO number, problem, severity, status
   - Created/resolved dates
   - Cost, technician, root cause
   - Endpoint: `GET /v1/maintenance/export/work-orders`

3. **Camera Health Export**
   - Camera ID, name, branch
   - Status, uptime, metrics
   - Frame rate, bitrate, resolution
   - Endpoint: `GET /v1/maintenance/export/camera-health`

4. **Storage Health Export**
   - Storage ID, capacity metrics
   - Usage percentage
   - Days left estimation
   - Endpoint: `GET /v1/maintenance/export/storage-health`

5. **Maintenance Visits Export**
   - Visit ID, plan, branch
   - Due/completed dates
   - Technician, findings, notes
   - Endpoint: `GET /v1/maintenance/export/visits`

6. **Vendor Performance Export**
   - Vendor name, work order count
   - SLA compliance, cost
   - Resolution time, rating
   - (Frontend utility)

7. **Custom Data Export**
   - Generic CSV export
   - Custom headers support
   - Endpoint: `POST /v1/maintenance/export/custom`

**Features**:
- ✅ Papaparse library integration
- ✅ Custom header labels
- ✅ Field selection
- ✅ Date range filtering
- ✅ Status filtering
- ✅ Auto-download to browser
- ✅ Audit logging
- ✅ Tenant isolation

### 4. WebSocket Real-Time Updates ✅

**Files**:
- `src/services/websocket-service.ts` - Backend service
- `dashboard/hooks/useWebSocket.ts` - Frontend hook

**Technology**: Socket.IO

**Features**:

1. **Health Updates**
   - Real-time camera/storage/network/UPS status
   - Automatic dashboard refresh
   - Live metrics updates

2. **Alert Notifications**
   - Instant alert delivery
   - Browser notifications
   - Sound alerts (optional)

3. **Work Order Updates**
   - Status changes
   - Assignment notifications
   - Completion alerts

4. **System Events**
   - Service status changes
   - Maintenance windows
   - System announcements

**WebSocket Events**:
```typescript
// Client → Server
- authenticate: { tenantId, userId }
- subscribe: channel
- unsubscribe: channel
- request-health-status

// Server → Client
- health-update: { type, assetId, status, metrics }
- alert: { severity, category, message }
- work-order-update: { workOrderId, status }
- system-event: { type, message, data }
```

**Connection Features**:
- ✅ Auto-reconnection
- ✅ Authentication
- ✅ Tenant-based rooms
- ✅ Channel subscriptions
- ✅ Heartbeat monitoring
- ✅ Error handling
- ✅ Connection status indicator

---

## 📦 Dependencies Added

```json
{
  "dependencies": {
    "recharts": "^2.10.3",
    "react-leaflet": "^4.2.1",
    "leaflet": "^1.9.4",
    "socket.io": "^4.7.2",
    "socket.io-client": "^4.7.2",
    "papaparse": "^5.4.1"
  },
  "devDependencies": {
    "@types/leaflet": "^1.9.8",
    "@types/papaparse": "^5.3.14"
  }
}
```

---

## 🔧 Configuration

### Environment Variables

```env
# WebSocket Configuration
NEXT_PUBLIC_WS_URL=http://localhost:3000
WS_PATH=/ws
CORS_ORIGIN=*

# Map Configuration (optional)
MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
DEFAULT_MAP_CENTER_LAT=28.6139
DEFAULT_MAP_CENTER_LNG=77.2090
DEFAULT_MAP_ZOOM=12
```

---

## 🎨 Usage Examples

### 1. Using Chart Components

```typescript
import { HealthTrendChart, CostTrendChart } from '@/components/maintenance/chart-components';

// In your page component
const data = [
  { timestamp: '00:00', healthy: 45, warning: 3, critical: 2 },
  { timestamp: '01:00', healthy: 46, warning: 2, critical: 2 },
  // ...
];

<HealthTrendChart data={data} height={300} />
```

### 2. Using Map View

```typescript
import { CameraMapView } from '@/components/maintenance/map-view';

const cameras = [
  {
    id: '1',
    name: 'Camera 01',
    branchName: 'Main Branch',
    latitude: 28.6139,
    longitude: 77.2090,
    status: 'healthy',
    uptime: 99.5,
  },
  // ...
];

<CameraMapView 
  cameras={cameras} 
  center={[28.6139, 77.2090]} 
  zoom={12}
  height="600px"
/>
```

### 3. Exporting to CSV (Frontend)

```typescript
import { exportAlertsToCSV } from '@/utils/csv-export';

const alerts = await fetch('/v1/maintenance/alerts').then(r => r.json());
exportAlertsToCSV(alerts, 'my_alerts.csv');
```

### 4. Exporting via API

```bash
# Export alerts
curl http://localhost:3000/v1/maintenance/export/alerts?severity=critical \
  -H "Authorization: Bearer <token>" \
  -O alerts.csv

# Export work orders
curl "http://localhost:3000/v1/maintenance/export/work-orders?startDate=2024-01-01T00:00:00Z" \
  -H "Authorization: Bearer <token>" \
  -O work_orders.csv

# Export camera health
curl http://localhost:3000/v1/maintenance/export/camera-health \
  -H "Authorization: Bearer <token>" \
  -O camera_health.csv
```

### 5. Using WebSocket Hook

```typescript
import { useWebSocket } from '@/hooks/useWebSocket';

function DashboardPage() {
  const {
    isConnected,
    isAuthenticated,
    healthUpdates,
    alerts,
    subscribe,
    unsubscribe,
  } = useWebSocket({
    tenantId: 'your-tenant-id',
    userId: 'your-user-id',
    autoConnect: true,
  });

  useEffect(() => {
    if (isAuthenticated) {
      subscribe('health');
      subscribe('alerts');
    }

    return () => {
      unsubscribe('health');
      unsubscribe('alerts');
    };
  }, [isAuthenticated]);

  return (
    <div>
      {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
      {healthUpdates.map(update => (
        <div key={update.assetId}>{update.message}</div>
      ))}
    </div>
  );
}
```

---

## 📊 Chart Data Formats

### Health Trend Data
```typescript
interface HealthTrendData {
  timestamp: string; // '00:00', '01:00', etc.
  healthy: number;
  warning: number;
  critical: number;
}
```

### Alert Distribution Data
```typescript
interface AlertDistributionData {
  category: string; // 'Camera', 'Storage', etc.
  count: number;
  color: string; // '#ef4444', '#f59e0b', etc.
}
```

### Cost Trend Data
```typescript
interface CostTrendData {
  month: string; // 'Jan 2024', 'Feb 2024', etc.
  corrective: number;
  preventive: number;
  amc: number;
}
```

---

## 🗺️ Map Integration

### Camera Locations Data Format
```typescript
interface CameraLocation {
  id: string;
  name: string;
  branchName: string;
  latitude: number;
  longitude: number;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  lastSeen?: string;
  uptime?: number;
}
```

### Branch Locations Data Format
```typescript
interface BranchLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  totalCameras: number;
  healthyCameras: number;
  warningCameras: number;
  criticalCameras: number;
  offlineCameras: number;
}
```

---

## 🔐 Security & Access Control

- ✅ WebSocket authentication required
- ✅ Tenant-based data isolation
- ✅ Export endpoints require auth
- ✅ Audit logging for all exports
- ✅ CSV sanitization
- ✅ Rate limiting (via middleware)
- ✅ No cross-tenant data access

---

## 🚀 Performance Considerations

### Charts
- Limit data points (max 100 for performance)
- Use responsive containers
- Debounce real-time updates
- Implement lazy loading

### Maps
- Cluster markers for large datasets
- Use marker caching
- Limit visible markers
- Implement viewport filtering

### WebSocket
- Connection pooling
- Message throttling
- Auto-reconnection with backoff
- Heartbeat monitoring

### CSV Export
- Stream large datasets
- Implement pagination
- Server-side generation
- Compression support

---

## 📝 Testing

### Manual Testing Checklist

**Charts**:
- [x] All 8 chart types render correctly
- [x] Charts are responsive
- [x] Tooltips show correct data
- [x] Legend is visible and accurate

**Maps**:
- [x] Markers display correctly
- [x] Popups show camera details
- [x] Filter controls work
- [x] Map is responsive

**CSV Export**:
- [x] All export endpoints work
- [x] CSV files download correctly
- [x] Data is properly formatted
- [x] Filters apply correctly

**WebSocket**:
- [x] Connection establishes
- [x] Authentication works
- [x] Real-time updates arrive
- [x] Reconnection works
- [x] Multiple clients supported

---

## 🔮 Future Enhancements (Phase 4.2 - Optional)

### Advanced Charts
- [ ] Interactive drill-down
- [ ] Custom date range selector
- [ ] Chart annotations
- [ ] Export charts as images
- [ ] Dark mode support

### Enhanced Maps
- [ ] Heat map visualization
- [ ] Route planning for technicians
- [ ] Geofencing alerts
- [ ] Traffic layer integration
- [ ] Satellite view

### Export Features
- [ ] Scheduled exports
- [ ] Email delivery
- [ ] Excel format support
- [ ] Custom templates
- [ ] Bulk export jobs

### WebSocket Features
- [ ] Binary data support
- [ ] File transfer
- [ ] Video streaming
- [ ] Voice communication
- [ ] Screen sharing

### Mobile App
- [ ] React Native app
- [ ] Offline support
- [ ] Push notifications
- [ ] Camera QR code scanner
- [ ] Technician location tracking

---

## 📚 Related Documentation

- [MAINTENANCE_MODULE_INDEX.md](./MAINTENANCE_MODULE_INDEX.md) - Module overview
- [MAINTENANCE_PHASE4_FRONTEND_COMPLETE.md](./MAINTENANCE_PHASE4_FRONTEND_COMPLETE.md) - Phase 4 dashboard
- [MAINTENANCE_PHASE5_REPORTING_COMPLETE.md](./MAINTENANCE_PHASE5_REPORTING_COMPLETE.md) - Phase 5 reporting

---

## ✅ Phase 4.1 Checklist

- [x] Install chart library (Recharts)
- [x] Install map library (React-Leaflet)
- [x] Install WebSocket library (Socket.IO)
- [x] Install CSV library (Papaparse)
- [x] Create 8 chart components
- [x] Create camera map view
- [x] Create branch cluster map
- [x] Create CSV export utilities
- [x] Create export API endpoints
- [x] Create WebSocket service
- [x] Create WebSocket client hook
- [x] Integration into app.ts
- [x] Documentation complete

---

## 💡 Key Achievements

✅ **8 Chart Types**: Comprehensive visual analytics  
✅ **Interactive Maps**: Real-time camera location tracking  
✅ **CSV Export**: 7 export types with filtering  
✅ **WebSocket**: Real-time updates for all events  
✅ **Production-Ready**: All components fully implemented  
✅ **Well-Documented**: Complete usage guides and examples  
✅ **Mobile-Responsive**: Works on all screen sizes  
✅ **Reusable**: All components are modular

---

## 📞 Support

### Quick Links
- **Chart Components**: `dashboard/components/maintenance/chart-components.tsx`
- **Map Components**: `dashboard/components/maintenance/map-view.tsx`
- **CSV Utilities**: `src/utils/csv-export.ts`
- **WebSocket Service**: `src/services/websocket-service.ts`
- **WebSocket Hook**: `dashboard/hooks/useWebSocket.ts`

### Common Issues
| Issue | Solution |
|-------|----------|
| Charts not rendering | Check data format matches interface |
| Map not loading | Ensure leaflet CSS is imported |
| CSV download fails | Check browser download permissions |
| WebSocket not connecting | Verify NEXT_PUBLIC_WS_URL is set |

---

**Phase 4.1 Status**: ✅ **COMPLETE**

All enhancements have been successfully implemented and are production-ready. The maintenance dashboard now has advanced visualizations, interactive maps, export capabilities, and real-time updates.
