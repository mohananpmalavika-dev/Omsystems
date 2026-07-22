# Live Monitoring Module - Quick Start Guide

## 🚀 Quick Start (5 Minutes)

### Step 1: Run Database Migration
```bash
cd c:/Omsystems
psql -U postgres -d omsystems -f database/migrations/019_live_monitoring_enhancements.sql
```

### Step 2: Update Control Plane Store

Edit `src/control-plane-store.ts`:

```typescript
import { PtzRepository } from "./database/ptz-repository.js";
import { GridLayoutRepository } from "./database/grid-layout-repository.js";
import { ShiftRepository } from "./database/shift-repository.js";

export class ControlPlaneStore {
  public readonly ptzRepo: PtzRepository;
  public readonly gridRepo: GridLayoutRepository;
  public readonly shiftRepo: ShiftRepository;

  constructor(pool: Pool) {
    // ... existing repositories ...
    
    this.ptzRepo = new PtzRepository(pool);
    this.gridRepo = new GridLayoutRepository(pool);
    this.shiftRepo = new ShiftRepository(pool);
  }
}
```

### Step 3: Register API Routes

Edit `src/app.ts`:

```typescript
import { createPtzRoutes } from "./routes/ptz.routes.js";
import { createShiftRoutes } from "./routes/shift.routes.js";
import { createGridLayoutRoutes } from "./routes/grid-layout.routes.js";

// After existing route registrations:
app.use("/api/control", createPtzRoutes(store, store.ptzRepo));
app.use("/api/control", createShiftRoutes(store, store.shiftRepo));
app.use("/api/control", createGridLayoutRoutes(store, store.gridRepo));
```

### Step 4: Restart Services

```bash
# Stop services
pm2 stop omsystems-control-plane
pm2 stop omsystems-dashboard

# Start services
pm2 start omsystems-control-plane
pm2 start omsystems-dashboard
```

### Step 5: Access Control Room

Navigate to: `http://your-domain/control-room`

## ✅ Verification Checklist

### Database
- [ ] Run migration successfully
- [ ] Verify tables created: `SELECT * FROM ptz_locks LIMIT 1;`
- [ ] Check functions exist: `SELECT cleanup_expired_ptz_locks();`

### Backend
- [ ] Control plane starts without errors
- [ ] PTZ routes accessible: `curl http://localhost:3000/api/control/v1/shifts`
- [ ] Grid routes accessible: `curl http://localhost:3000/api/control/v1/grids/layouts`

### Frontend
- [ ] Dashboard starts without errors
- [ ] Control Room page loads
- [ ] Camera grid displays
- [ ] PTZ control panel opens

## 📋 Feature Overview

### 1. PTZ Control (Pan-Tilt-Zoom)

**What it does:**
- Remote camera positioning
- Preset position management
- Automated patrol tours
- Exclusive operator locking

**How to use:**
1. Open live camera view
2. Click PTZ button
3. Click "Take Control"
4. Use directional controls
5. Save presets as needed
6. Release control when done

**API Example:**
```bash
# Acquire lock
curl -X POST http://localhost:3000/api/control/v1/cameras/{cameraId}/ptz/lock \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "session-123", "durationSeconds": 300}'

# Move camera
curl -X POST http://localhost:3000/api/control/v1/cameras/{cameraId}/ptz/command \
  -H "Content-Type: application/json" \
  -d '{"action": "move", "direction": "up", "speed": {"pan": 0.5, "tilt": 0.5}}'

# Go to preset
curl -X POST http://localhost:3000/api/control/v1/cameras/{cameraId}/ptz/command \
  -H "Content-Type: application/json" \
  -d '{"action": "preset", "presetId": 1}'
```

### 2. Multi-Camera Grid

**What it does:**
- Display 1-36 cameras simultaneously
- Save/load custom layouts
- Switch between main/sub streams
- Configurable grid sizes

**How to use:**
1. Go to Control Room
2. Select grid size (2x2, 3x3, etc.)
3. Assign cameras to positions
4. Toggle stream quality
5. Save layout with a name

**Grid Sizes:**
- 1×1 = 1 camera (fullscreen)
- 2×2 = 4 cameras
- 3×3 = 9 cameras
- 4×4 = 16 cameras
- 5×5 = 25 cameras
- 6×6 = 36 cameras

**API Example:**
```bash
# Save layout
curl -X POST http://localhost:3000/api/control/v1/grids/layouts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Main Entrance View",
    "gridSize": "2x2",
    "cameraPositions": [
      {"position": 0, "cameraId": "cam-1", "stream": "main"},
      {"position": 1, "cameraId": "cam-2", "stream": "main"},
      {"position": 2, "cameraId": "cam-3", "stream": "sub"},
      {"position": 3, "cameraId": "cam-4", "stream": "sub"}
    ]
  }'

# Load layouts
curl http://localhost:3000/api/control/v1/grids/layouts
```

### 3. Shift Management

**What it does:**
- Define shift schedules
- Assign operators to shifts
- Track clock in/out times
- Manage shift handovers

**How to use:**
1. Define shifts (Morning, Evening, Night)
2. Assign operators to shifts
3. Operators clock in at shift start
4. Operators clock out at shift end

**API Example:**
```bash
# Create shift
curl -X POST http://localhost:3000/api/control/v1/shifts \
  -H "Content-Type: application/json" \
  -d '{
    "shiftName": "Morning Shift",
    "startTime": "06:00",
    "endTime": "14:00",
    "daysOfWeek": [1, 2, 3, 4, 5]
  }'

# Assign operator
curl -X POST http://localhost:3000/api/control/v1/shifts/assignments \
  -H "Content-Type: application/json" \
  -d '{
    "shiftId": "shift-id",
    "operatorId": "user-id",
    "operatorName": "John Doe",
    "assignedDate": "2024-07-22"
  }'

# Clock in
curl -X POST http://localhost:3000/api/control/v1/shifts/assignments/{id}/clock-in
```

### 4. Shift Handover

**What it does:**
- Track shift transitions
- Document open items
- Ensure nothing is missed
- Maintain operational continuity

**How to use:**
1. Outgoing operator creates handover
2. Add items (incidents, alerts, maintenance)
3. Incoming operator reviews items
4. Acknowledge and resolve items
5. Complete handover acknowledgement

**API Example:**
```bash
# Create handover
curl -X POST http://localhost:3000/api/control/v1/shifts/handovers \
  -H "Content-Type: application/json" \
  -d '{
    "outgoingOperatorId": "user-1",
    "outgoingOperatorName": "John Doe",
    "incomingOperatorId": "user-2",
    "incomingOperatorName": "Jane Smith",
    "shiftStart": "2024-07-22T06:00:00Z",
    "shiftEnd": "2024-07-22T14:00:00Z",
    "handoverNotes": "3 cameras offline, maintenance scheduled for tomorrow"
  }'

# Add handover item
curl -X POST http://localhost:3000/api/control/v1/shifts/handovers/{id}/items \
  -H "Content-Type: application/json" \
  -d '{
    "itemType": "offline_camera",
    "priority": "high",
    "description": "Camera CAM-03 at Branch Main offline since 10:00"
  }'

# Acknowledge handover
curl -X POST http://localhost:3000/api/control/v1/shifts/handovers/{id}/acknowledge
```

## 🔧 Configuration

### PTZ Lock Duration

Default: 5 minutes (300 seconds)

Adjust in API call:
```json
{
  "sessionId": "session-123",
  "durationSeconds": 600  // 10 minutes
}
```

### Grid Stream Quality

**Main Stream:**
- Higher resolution (1920×1080)
- Higher bitrate
- Use for detailed viewing

**Sub Stream:**
- Lower resolution (640×480)
- Lower bitrate
- Use for multi-camera grids to save bandwidth

### Shift Schedule

Example 24/7 coverage:
```json
[
  {
    "shiftName": "Morning Shift",
    "startTime": "06:00",
    "endTime": "14:00",
    "daysOfWeek": [0, 1, 2, 3, 4, 5, 6]  // All days
  },
  {
    "shiftName": "Evening Shift",
    "startTime": "14:00",
    "endTime": "22:00",
    "daysOfWeek": [0, 1, 2, 3, 4, 5, 6]
  },
  {
    "shiftName": "Night Shift",
    "startTime": "22:00",
    "endTime": "06:00",
    "daysOfWeek": [0, 1, 2, 3, 4, 5, 6]
  }
]
```

## 🔒 Permissions

### PTZ Control
- **Required:** `ptz:operate`
- **Granted to:** Control Room Operators, Branch Managers

### Live Viewing
- **Required:** `live:view`
- **Granted to:** All monitoring roles

### Grid Management
- **Required:** `live:view`
- **Granted to:** Control Room Operators

### Shift Management
- **Required:** Admin role
- **Granted to:** Shift Supervisors, System Administrators

## 📊 Monitoring & Maintenance

### Scheduled Tasks

Add to crontab or Windows Task Scheduler:

```bash
# Every 5 minutes - cleanup expired PTZ locks
*/5 * * * * psql -U postgres -d omsystems -c "SELECT cleanup_expired_ptz_locks();"

# Every hour - cleanup abandoned operator sessions
0 * * * * psql -U postgres -d omsystems -c "SELECT cleanup_abandoned_operator_sessions(24);"

# Every hour - cleanup abandoned audio sessions
0 * * * * psql -U postgres -d omsystems -c "SELECT cleanup_abandoned_audio_sessions(60);"
```

### Health Checks

```bash
# Check active PTZ locks
psql -U postgres -d omsystems -c "SELECT * FROM ptz_locks WHERE expires_at > now();"

# Check active shifts
psql -U postgres -d omsystems -c "SELECT * FROM shift_assignments WHERE status='active';"

# Check pending handovers
psql -U postgres -d omsystems -c "SELECT * FROM shift_handover_logs WHERE acknowledged_at IS NULL;"
```

### Performance Monitoring

Key metrics to watch:
- Active streams per operator (recommend ≤16)
- PTZ lock duration (watch for stuck locks)
- Handover acknowledgement time
- Grid layout load time

## 🐛 Troubleshooting

### Issue: PTZ Commands Not Working

**Symptoms:** Camera doesn't respond to PTZ commands

**Solutions:**
1. Verify camera supports PTZ
2. Check ONVIF credentials
3. Verify camera connectivity
4. Check lock status
5. Review audit logs

```bash
# Check camera capabilities
curl http://localhost:3000/api/control/v1/cameras/{cameraId}/ptz/capabilities

# Check lock status
curl http://localhost:3000/api/control/v1/cameras/{cameraId}/ptz/lock
```

### Issue: Grid Layout Won't Save

**Symptoms:** Save button doesn't work or returns error

**Solutions:**
1. Check browser console for errors
2. Verify all cameras are accessible
3. Check user permissions
4. Verify database connection

```bash
# Test API directly
curl -X POST http://localhost:3000/api/control/v1/grids/layouts \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "gridSize": "2x2", "cameraPositions": []}'
```

### Issue: Handover Not Showing

**Symptoms:** Pending handover panel shows "No Pending Handover"

**Solutions:**
1. Verify handover was created
2. Check operator ID matches
3. Verify handover not already acknowledged
4. Check database

```bash
# Check pending handovers
psql -U postgres -d omsystems -c \
  "SELECT * FROM shift_handover_logs WHERE acknowledged_at IS NULL;"
```

### Issue: Lock Won't Release

**Symptoms:** PTZ lock stuck even after operator disconnects

**Solutions:**
1. Wait for lock expiration (5 minutes)
2. Run cleanup function manually
3. Direct database update (last resort)

```bash
# Manual cleanup
psql -U postgres -d omsystems -c "SELECT cleanup_expired_ptz_locks();"

# Force release (use with caution)
psql -U postgres -d omsystems -c \
  "DELETE FROM ptz_locks WHERE camera_id='camera-id-here';"
```

## 📞 Support

For issues not covered in this guide:

1. Check `LIVE_MONITORING_IMPLEMENTATION.md` for detailed documentation
2. Review audit logs for error details
3. Check application logs
4. Contact system administrator

## 🎓 Training Resources

### For Operators
1. Control Room interface overview
2. PTZ control basics
3. Grid layout management
4. Shift handover procedures

### For Administrators
1. Database schema overview
2. API endpoint documentation
3. Permission configuration
4. Performance tuning
5. Troubleshooting guide

## 📈 Next Steps

After completing quick start:

1. Configure shifts for your organization
2. Create standard grid layouts
3. Train operators on PTZ controls
4. Establish handover procedures
5. Configure cleanup schedules
6. Implement monitoring dashboards
7. Plan for mobile deployment

## 🔗 Related Documentation

- [Complete Implementation Guide](./LIVE_MONITORING_IMPLEMENTATION.md)
- [CCTV Implementation Summary](./CCTV_IMPLEMENTATION_SUMMARY.md)
- [Infrastructure Integration](./CCTV_INFRASTRUCTURE_INTEGRATION.md)

---

**Quick Start Complete!** 🎉

Your Live Monitoring module is now operational. Operators can access the Control Room, manage PTZ cameras, create grid layouts, and handle shift handovers.
