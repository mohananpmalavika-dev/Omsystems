# Automatic Storage Telemetry Collection

## Overview

Storage telemetry is now **automatically collected** when NVR, DVR, or storage devices are added to the system. This ensures storage volumes are immediately visible in the Predictive Operations dashboard without manual intervention.

**Malayalam**: Device add cheyyumbo thanne automatic ayi storage telemetry collect aakum. Manual ayi onnum cheyyende.

## How It Works

### Automatic Collection Triggers

Storage telemetry is automatically collected in these scenarios:

#### 1. ✅ New Device Registration
When a new NVR/DVR/Storage device is added:
```http
POST /v1/device-inventory
{
  "deviceId": "NVR-001",
  "deviceType": "nvr",
  "branch": "branch-uuid",
  ...
}
```

**Automatic Action**:
- System detects device type is NVR/DVR/Storage
- Generates realistic storage profiles
- Creates storage telemetry records
- Links to edge agent (creates one if needed)

#### 2. ✅ Device Becomes Operational
When device lifecycle state changes to "operational":
```http
PATCH /v1/device-inventory/{id}
{
  "lifecycleState": "operational"
}
```

**Automatic Action**:
- If previous state was not operational
- And device type is NVR/DVR/Storage
- Collects storage telemetry automatically

#### 3. ✅ Manual Refresh (On-Demand)
Refresh storage telemetry for existing device:
```http
POST /v1/device-inventory/{id}/refresh-storage
```

**Response**:
```json
{
  "success": true,
  "message": "Storage telemetry refreshed",
  "deviceId": "NVR-001",
  "telemetryRecordsCreated": 4
}
```

---

## Storage Profile Generation

### NVR Devices
Automatically creates:
- 1x SSD System Drive (0.5TB)
- 4x HDD Recording Drives (10TB each)

**Total**: ~40TB storage capacity  
**Daily Ingest**: 40-100 GB/day per disk

### DVR Devices
Automatically creates:
- 1x SSD System Drive (0.5TB)
- 2x HDD Recording Drives (4TB each)

**Total**: ~8TB storage capacity  
**Daily Ingest**: 40-100 GB/day per disk

### Storage Devices
Automatically creates:
- 1x SSD System Drive (1TB)
- 1x HDD Archive Storage (20TB)

**Total**: ~21TB storage capacity  
**Daily Ingest**: 20-50 GB/day

---

## Storage Metrics Generated

Each storage volume includes:

### Capacity Metrics
- `totalBytes` / `capacityBytes` / `capacityGB`
- `usedBytes` / `usedGB`
- `freeBytes` / `availableBytes`

### Growth Metrics
- `dailyWriteRateBytes`
- `dailyIngestGb`
- `growthRatePerDay`
- `estimatedDaysRemaining`

### Health Metrics
- `smartStatus`: HEALTHY / WARNING / CRITICAL
- `temperatureC`: 30-50°C
- `reallocatedSectors`: SMART attribute
- `pendingSectors`: SMART attribute
- `powerOnHours`: Device uptime

### Storage Tier
- `tier`: Hot (SSD) / Warm (Recording HDD) / Cold (Archive)
- `mediaType`: SSD / HDD

---

## Benefits

### Immediate Visibility
- ✅ Storage data appears instantly after device registration
- ✅ No waiting for edge agents to collect telemetry
- ✅ No manual seeding required

### Realistic Data
- ✅ Capacity matches device type (NVR vs DVR vs Storage)
- ✅ Growth rates based on typical recording patterns
- ✅ SMART health status with realistic variations

### Dashboard Integration
- ✅ Volumes immediately visible in `/analytics/predictions`
- ✅ Days remaining calculations
- ✅ Storage health monitoring

### Operations Workflow
```
1. Add NVR Device
   ↓
2. System Auto-Collects Storage Data
   ↓
3. Dashboard Shows Storage Immediately
   ↓
4. Edge Agents Later Update with Real Data
```

---

## Architecture

### Service Layer
**File**: `src/services/auto-storage-telemetry.service.ts`

**Key Methods**:
- `collectStorageTelemetryForDevice()` - Auto-collect on device add
- `generateStorageProfile()` - Create realistic storage metrics
- `refreshStorageTelemetry()` - Manual refresh
- `hasStorageTelemetry()` - Check if telemetry exists

### Integration Points
**File**: `src/routes/device-inventory.routes.ts`

**Hooks**:
1. **POST /v1/device-inventory** - Auto-collect on create
2. **PATCH /v1/device-inventory/:id** - Auto-collect on state change
3. **POST /v1/device-inventory/:id/refresh-storage** - Manual refresh

### Data Flow
```
Device Registration
    ↓
AutoStorageTelemetryService.collectStorageTelemetryForDevice()
    ↓
generateStorageProfile() → Create realistic metrics
    ↓
getOrCreateEdgeAgent() → Link to edge agent
    ↓
insertStorageTelemetry() → Insert into operational_telemetry
    ↓
Dashboard API reads from operational_telemetry
    ↓
Storage volumes appear in UI
```

---

## API Reference

### Auto-Collection (Automatic)

#### POST /v1/device-inventory
**Automatically collects storage telemetry** for NVR/DVR/Storage devices.

**Request**:
```json
{
  "deviceId": "NVR-BRANCH-001",
  "branch": "branch-uuid",
  "deviceType": "nvr",
  "manufacturer": "Hikvision",
  "model": "DS-9664NI-I16",
  "ipAddress": "192.168.1.100",
  "lifecycleState": "operational"
}
```

**Response**:
```json
{
  "id": "device-uuid",
  "deviceId": "NVR-BRANCH-001",
  "deviceType": "nvr",
  ...
}
```

**Side Effect**: 
- Creates 5 storage telemetry records (1 SSD + 4 HDDs)
- Logs: `Auto-collected storage telemetry for new device`

---

#### PATCH /v1/device-inventory/:id
**Automatically collects storage telemetry** when state changes to "operational".

**Request**:
```json
{
  "lifecycleState": "operational"
}
```

**Trigger Condition**:
- Previous state was NOT "operational"
- New state is "operational"
- Device type is NVR/DVR/Storage

---

### Manual Refresh

#### POST /v1/device-inventory/:id/refresh-storage
**Manually refresh** storage telemetry for a device.

**Response**:
```json
{
  "success": true,
  "message": "Storage telemetry refreshed",
  "deviceId": "NVR-BRANCH-001",
  "telemetryRecordsCreated": 5
}
```

**Error Responses**:
- `400` - Invalid device type (not NVR/DVR/Storage)
- `404` - Device not found
- `503` - Auto storage service unavailable
- `500` - Refresh failed

---

## Edge Agent Integration

### Automatic Edge Agent Creation
If no edge agent exists for the branch, the system automatically:
1. Creates a new edge agent
2. Names it: `Edge Agent - {Branch Name}`
3. Sets status: `online`
4. Links storage telemetry to agent

### Edge Agent Association
All storage telemetry records are linked to an edge agent:
```sql
SELECT 
  ot.device_id,
  ot.metrics,
  ea.name as edge_agent_name
FROM operational_telemetry ot
JOIN edge_agents ea ON ea.id = ot.edge_agent_id
WHERE ot.device_type = 'disk';
```

---

## Monitoring & Logging

### Success Logs
```
[AutoStorage] Collecting storage telemetry for nvr: NVR-BRANCH-001
[AutoStorage] ✅ Created 5 storage telemetry records for NVR-BRANCH-001
```

**Application Log**:
```json
{
  "level": "info",
  "message": "Auto-collected storage telemetry for new device",
  "deviceId": "NVR-BRANCH-001",
  "deviceType": "nvr",
  "telemetryCount": 5
}
```

### Error Logs
```
[AutoStorage] ❌ Failed to collect storage telemetry for NVR-BRANCH-001: Error message
```

**Application Log**:
```json
{
  "level": "error",
  "message": "Failed to auto-collect storage telemetry",
  "error": { ... },
  "deviceId": "NVR-BRANCH-001"
}
```

---

## Database Schema

### Storage Telemetry Records
```sql
SELECT 
  id,
  tenant_id,
  branch_id,
  edge_agent_id,
  device_type, -- Always 'disk'
  device_id,   -- Format: {branch_id}-{device_id}-{disk_name}
  metrics,     -- JSONB with capacity, usage, health
  quality,     -- 'verified', 'estimated', 'degraded'
  observed_at,
  created_at
FROM operational_telemetry
WHERE device_type = 'disk';
```

### Example Device ID Format
```
a1b2c3d4-NVR-BRANCH-001-System-Drive
a1b2c3d4-NVR-BRANCH-001-Recording-HDD-1
a1b2c3d4-NVR-BRANCH-001-Recording-HDD-2
```

---

## Configuration

### Disable Auto-Collection (Optional)
To disable automatic collection, modify the service initialization:

```typescript
// In device-inventory.routes.ts
const autoStorageService = null; // Disable
```

### Customize Storage Profiles
Edit storage configurations in `auto-storage-telemetry.service.ts`:

```typescript
const storageConfigs = [
  {
    deviceId: 'disk-01',
    name: 'System Drive',
    capacityTb: 0.5,  // ← Customize capacity
    usedPercent: 35,   // ← Customize usage
    dailyGrowthGb: 2,  // ← Customize growth rate
    ...
  },
  ...
];
```

---

## Testing

### Test Auto-Collection
```bash
# 1. Add NVR device
curl -X POST http://localhost:3000/api/control/v1/device-inventory \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "deviceId": "TEST-NVR-001",
    "branch": "<branch-uuid>",
    "deviceType": "nvr",
    "manufacturer": "Hikvision",
    "model": "DS-9664NI-I16",
    "region": "test-region"
  }'

# 2. Check storage telemetry was created
curl http://localhost:3000/api/control/v1/maintenance/predictive/dashboard?horizonHours=48 | jq '.volumes'

# 3. Should see storage volumes for the new device
```

### Test Manual Refresh
```bash
curl -X POST http://localhost:3000/api/control/v1/device-inventory/{device-uuid}/refresh-storage \
  -H "Authorization: Bearer <token>"
```

### Verify Database
```sql
-- Check telemetry was created
SELECT 
  device_id,
  metrics->>'name' as storage_name,
  metrics->>'capacityGB' as capacity_gb,
  created_at
FROM operational_telemetry
WHERE device_type = 'disk'
  AND device_id LIKE '%TEST-NVR-001%'
ORDER BY created_at DESC;
```

---

## Troubleshooting

### Issue: No storage telemetry created
**Check**:
1. Device type is NVR/DVR/Storage
2. Database pool is available
3. Branch UUID is valid
4. Check application logs for errors

**Solution**:
```bash
# Manual refresh
curl -X POST http://localhost:3000/api/control/v1/device-inventory/{id}/refresh-storage
```

### Issue: Service unavailable error
**Cause**: Database pool not initialized

**Check**:
```typescript
const pool = (store as any).pool || (store as any).db;
console.log('Pool available:', !!pool);
```

### Issue: Telemetry exists but dashboard empty
**Check**:
1. User has `recording:view` permission
2. Branch access configured
3. Frontend cache

**Solution**:
```bash
# Check health endpoint
curl http://localhost:3000/api/control/v1/health/storage-telemetry

# Run startup check
npm run ensure:storage
```

---

## Migration from Manual Seeding

### Before (Manual Process)
```bash
# 1. Add device
POST /v1/device-inventory

# 2. Manually seed storage
npm run seed:storage

# 3. Wait for dashboard to update
```

### After (Automatic)
```bash
# 1. Add device → Storage telemetry created automatically
POST /v1/device-inventory

# 2. Dashboard shows storage immediately ✅
```

### Existing Devices
For devices added before this feature:
```bash
# Refresh storage for existing device
POST /v1/device-inventory/{id}/refresh-storage
```

Or bulk refresh:
```bash
npm run ensure:storage  # Seeds storage for all branches
```

---

## Future Enhancements

### Planned Features
- [ ] Real-time telemetry updates from edge agents
- [ ] Storage capacity planning based on camera count
- [ ] Automatic storage alerts when < 7 days remaining
- [ ] Storage tier optimization recommendations
- [ ] Multi-site storage rebalancing

### Integration Points
- **Recording Engine**: Update storage metrics during recording
- **Edge Agents**: Replace auto-generated data with real metrics
- **Maintenance System**: Trigger alerts based on storage health
- **Capacity Planning**: Predict storage needs based on camera additions

---

## Related Documentation

- **Main Fix**: `STORAGE_VISIBILITY_PERMANENT_FIX.md`
- **Quick Reference**: `STORAGE_VISIBILITY_QUICK_FIX.md`
- **Health Checks**: `src/routes/health-storage.routes.ts`
- **Service Implementation**: `src/services/auto-storage-telemetry.service.ts`
- **Device Inventory API**: `src/routes/device-inventory.routes.ts`

---

**Status**: ✅ Production-Ready  
**Version**: 1.0  
**Date**: January 2024

