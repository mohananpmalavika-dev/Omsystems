# Recording Compliance System Migration Guide

## Overview

This document guides the migration from **simulated optimistic health data** to **evidence-based verification** for recording compliance.

## Critical Problem Fixed

### Before (UNSAFE)
```typescript
// Line 414-426 in recording-compliance.service.ts
return {
  recording: true,              // ❌ FABRICATED
  lastRecordingTime: new Date(), // ❌ FABRICATED (current time!)
  storageStatus: 'normal'        // ❌ FABRICATED
};
```

**Problem**: A completely dead recorder could report as healthy.

### After (SAFE)
```typescript
// Evidence-based verification via recorder adapters
const result = await checker.check({ adapter, recorder, camera });

return {
  recording: result.recording.status === 'healthy',  // ✅ VERIFIED
  lastRecordingTime: result.archive.lastRecordingTime, // ✅ ACTUAL TIMESTAMP
  storageStatus: mapStorageStatus(result.storage)     // ✅ ACTUAL STATUS
};
```

**Result**: Only marks healthy when positive evidence confirms it.

## Architecture Changes

### New Three-State Health Model

```
HEALTHY   = Positive evidence confirms proper operation
UNHEALTHY = Evidence confirms failure
UNKNOWN   = Cannot verify (device offline, API unavailable, etc.)
```

**Critical rule**: `UNKNOWN ≠ HEALTHY`

### New Component Structure

```
recording-compliance.service.ts
        │
        ▼
RecorderHealthChecker (orchestrator)
        │
        ▼
RecorderAdapterFactory
        │
        ├─── HikvisionRecorderAdapter
        ├─── DahuaRecorderAdapter  
        ├─── OnvifRecorderAdapter
        └─── GenericRecorderAdapter (fallback)
                │
                ▼
        Actual Recorder Device
```

## Migration Steps

### Step 1: Run Database Migration

```bash
psql -d your_database -f backend/src/database/migrations/032_create_recording_compliance_checks_table.sql
```

This creates:
- `recording_compliance_checks` table (detailed evidence storage)
- `recorders` table (if not exists)
- `device_credentials` table (secure credential storage)
- Helper views and functions

### Step 2: Update Existing Code

#### Option A: Use New V2 API (Recommended)

```typescript
import { RecordingComplianceService } from './services/recording-compliance.service.js';

const service = new RecordingComplianceService(pool);

// New V2 method returns full evidence
const result = await service.checkRecordingComplianceV2(cameraId);

if (result) {
  console.log('Overall status:', result.overallStatus);
  console.log('Recording:', result.recording.status);
  console.log('Archive lag:', result.archive.archiveLagSeconds, 'seconds');
  console.log('Last recording:', result.archive.lastRecordingTime);
  console.log('Storage:', result.storage.usagePercent, '%');
  console.log('All errors:', result.errors);
}
```

#### Option B: Keep Legacy API (Still Fixed)

```typescript
// Legacy API now uses adapters internally
const dvrValidation = await service.validateWithDVR(cameraId);

// Now returns actual evidence instead of fabricated data
console.log('Recording:', dvrValidation.dvrRecording); // Based on actual check
console.log('Last recording:', dvrValidation.dvrLastRecordingTime); // Actual timestamp or undefined
console.log('Storage:', dvrValidation.dvrStorageStatus); // 'normal', 'full', or 'error'
```

### Step 3: Configure Recorders

Ensure recorders are properly configured in the database:

```sql
INSERT INTO recorders (
  name,
  vendor,
  model,
  ip_address,
  port,
  protocol,
  username,
  password_encrypted,
  branch_id,
  tenant_id
) VALUES (
  'Branch-01-NVR',
  'hikvision',
  'DS-7616NI-K2',
  '192.168.1.100',
  80,
  'http',
  'admin',
  -- Use encrypted password
  encode(encrypt('password123'::bytea, 'encryption-key', 'aes'), 'base64'),
  'branch-uuid',
  'tenant-uuid'
);
```

**Security Note**: Implement proper encryption for `password_encrypted`. The current base64 is a placeholder.

### Step 4: Link Cameras to Recorders

```sql
UPDATE cameras
SET 
  recorder_id = 'recorder-uuid',
  recorder_channel = '1', -- Channel number on recorder
  recording_mode = 'continuous'
WHERE id = 'camera-uuid';
```

### Step 5: Schedule Regular Compliance Checks

```typescript
// Run compliance checks every 5 minutes
setInterval(async () => {
  const cameras = await getCamerasWithRecorders();
  
  for (const camera of cameras) {
    try {
      await complianceService.checkRecordingComplianceV2(camera.id);
    } catch (error) {
      logger.error('Compliance check failed', { cameraId: camera.id, error });
    }
  }
}, 5 * 60 * 1000);
```

## Understanding Results

### Healthy Result Example

```json
{
  "overallStatus": "healthy",
  "reachable": { "status": "healthy", "latencyMs": 45 },
  "authentication": { "status": "healthy" },
  "recording": { "status": "healthy", "value": "recording" },
  "archive": {
    "status": "healthy",
    "lastRecordingTime": "2026-08-11T01:23:42Z",
    "archiveLagSeconds": 18,
    "retentionDays": 185,
    "retentionCompliant": true
  },
  "storage": {
    "status": "healthy",
    "usagePercent": 73.5,
    "freeBytes": 2100000000000
  },
  "clock": {
    "status": "healthy",
    "driftSeconds": 4
  }
}
```

### Unknown Result Example (Device Offline)

```json
{
  "overallStatus": "unknown",
  "reachable": {
    "status": "unknown",
    "message": "Connection timed out after 5000ms",
    "errorCode": "NETWORK_TIMEOUT"
  },
  "authentication": {
    "status": "unknown",
    "message": "Cannot verify without connectivity"
  },
  "recording": {
    "status": "unknown",
    "message": "Cannot verify without connectivity"
  },
  "archive": {
    "status": "unknown",
    "message": "Cannot verify without connectivity"
  }
}
```

### Unhealthy Result Example (Recording Stopped)

```json
{
  "overallStatus": "unhealthy",
  "reachable": { "status": "healthy" },
  "authentication": { "status": "healthy" },
  "recording": {
    "status": "unhealthy",
    "value": "stopped",
    "message": "Recording stopped",
    "errorCode": "RECORDING_STOPPED"
  },
  "archive": {
    "status": "unhealthy",
    "lastRecordingTime": "2026-08-10T21:04:17Z",
    "archiveLagSeconds": 15385,
    "message": "Archive stale: last recording 15385s ago"
  },
  "storage": { "status": "healthy" }
}
```

## Implementing Vendor Adapters

### Current Support

- **Hikvision**: Structure complete, needs ISAPI XML parsing
- **Dahua**: Structure complete, needs API implementation
- **ONVIF**: Structure complete, needs SOAP implementation
- **Generic**: Complete (connectivity only)

### Adding Hikvision ISAPI Parsing

Edit `backend/src/recorders/adapters/hikvision-recorder.adapter.ts`:

```typescript
private parseRecordingStatus(xmlData: string): 'recording' | 'stopped' | 'paused' | 'error' {
  // Parse Hikvision XML response
  const parser = new XMLParser();
  const data = parser.parse(xmlData);
  
  const status = data?.RecordStatus?.status;
  
  if (status === 'record') return 'recording';
  if (status === 'stop') return 'stopped';
  if (status === 'pause') return 'paused';
  
  return 'error';
}
```

### Adding New Vendor

1. Create adapter file: `backend/src/recorders/adapters/vendor-recorder.adapter.ts`
2. Extend `BaseRecorderAdapter`
3. Implement `RecorderAdapter` interface
4. Declare capabilities
5. Add to factory in `recorder-adapter.factory.ts`

Example:

```typescript
export class AxisRecorderAdapter extends BaseRecorderAdapter implements RecorderAdapter {
  getAdapterType(): string {
    return 'axis';
  }
  
  getCapabilities(): RecorderCapabilities {
    return {
      liveStreamStatus: true,
      recordingStatus: true,
      archiveSearch: true,
      storageStatus: false, // Axis doesn't expose this
      diskHealth: false,
      deviceTime: true,
      retentionQuery: false,
      channelEnumeration: true
    };
  }
  
  // Implement other methods...
}
```

## Monitoring and Alerting

### Query Examples

#### Find All Unhealthy Recorders

```sql
SELECT 
  r.name,
  r.ip_address,
  c.overall_status,
  c.recording_status,
  c.archive_lag_seconds,
  c.checked_at
FROM recorders r
JOIN recorder_latest_compliance_status c ON c.recorder_id = r.id
WHERE c.overall_status = 'unhealthy';
```

#### Find Recorders with Stale Archives

```sql
SELECT 
  r.name,
  c.last_recording_time,
  c.archive_lag_seconds,
  EXTRACT(EPOCH FROM (NOW() - c.last_recording_time)) / 3600 as hours_since_recording
FROM recorders r
JOIN recorder_latest_compliance_status c ON c.recorder_id = r.id
WHERE c.archive_lag_seconds > 300; -- More than 5 minutes
```

#### Find Recorders Not Checked Recently

```sql
SELECT * FROM stale_compliance_checks;
```

#### Get Compliance Summary

```sql
SELECT * FROM get_recorder_compliance_summary('recorder-uuid', 24);
```

### Alert Conditions

Set up alerts for:

1. **Critical**: `overall_status = 'unhealthy'`
2. **Warning**: `overall_status = 'unknown'` for > 15 minutes
3. **Warning**: `archive_lag_seconds > 300` for continuous recording
4. **Critical**: `storage_usage_percent > 95`
5. **Warning**: `clock_drift_seconds > 60`
6. **Critical**: `retention_compliant = false`

## Testing

### Test Scenarios

```typescript
// Test 1: Verify offline recorder returns UNKNOWN
test('offline recorder returns unknown status', async () => {
  const result = await service.checkRecordingComplianceV2(cameraId);
  expect(result.overallStatus).toBe('unknown');
  expect(result.reachable.status).toBe('unknown');
});

// Test 2: Verify auth failure doesn't fabricate health
test('auth failure returns unhealthy, not healthy', async () => {
  // Mock bad credentials
  const result = await service.checkRecordingComplianceV2(cameraId);
  expect(result.authentication.status).toBe('unhealthy');
  expect(result.overallStatus).not.toBe('healthy');
});

// Test 3: Verify stale archive detected
test('stale archive detected as unhealthy', async () => {
  // Mock archive with old recording
  const result = await service.checkRecordingComplianceV2(cameraId);
  expect(result.archive.status).toBe('unhealthy');
  expect(result.archive.archiveLagSeconds).toBeGreaterThan(300);
});

// Test 4: Verify never fabricates current time
test('never returns current time as lastRecordingTime', async () => {
  const now = new Date();
  const result = await service.checkRecordingComplianceV2(cameraId);
  
  if (result.archive.lastRecordingTime) {
    const diff = Math.abs(now.getTime() - result.archive.lastRecordingTime.getTime());
    expect(diff).toBeGreaterThan(10000); // At least 10 seconds old
  }
});
```

## Rollback Plan

If issues occur:

1. The legacy API still works (it now uses adapters but returns same format)
2. Old `recording_compliance_scores` table is unchanged
3. New system only adds data, doesn't modify existing tables
4. Disable by reverting `queryDVRRecordingStatus` to return errors instead of calling adapters

## Performance Considerations

- Each compliance check makes multiple HTTP requests to recorder
- Recommend checking each camera every 5-10 minutes
- Use connection pooling and timeouts (already implemented)
- Consider batching checks for many cameras
- Database indexes are optimized for time-series queries

## Security Considerations

1. **Credential Storage**: Implement proper encryption for `password_encrypted` field
2. **Network Access**: Recorders should be on isolated VLAN
3. **API Access**: Limit which services can call compliance checks
4. **Audit Logging**: All checks are logged with full evidence
5. **Error Messages**: Don't expose credentials in error messages (already handled)

## Support

For issues or questions:
1. Check logs for detailed error messages
2. Query `recording_compliance_checks` table for historical evidence
3. Review adapter capabilities to understand limitations
4. Test with Generic adapter first to isolate network vs. API issues
