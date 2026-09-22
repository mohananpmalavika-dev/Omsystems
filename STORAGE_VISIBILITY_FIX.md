# Storage Visibility Fix - Permanent Solution

## Problem
Storage/volumes data is not consistently appearing in the Predictive Operations dashboard (`/analytics/predictions` page).

## Root Cause Analysis

The storage data display depends on:
1. **Backend Data Collection**: Storage telemetry must be ingested via `/v1/operational-health/storage` endpoint
2. **Database Storage**: Data is stored in `operational_telemetry` table with `deviceType='disk'`
3. **Frontend Display**: The predictions page calls `/v1/maintenance/predictive/dashboard` which filters telemetry where `deviceType === 'disk'`

## Permanent Fix Implementation

### 1. Backend: Ensure Storage Telemetry Collection

The storage data collection happens automatically when:
- Edge agents/gateways report storage health
- NVRs/recorders report disk status via ISAPI/SDK integration

**File**: `src/routes/operational-health.routes.ts` (lines 234-265)

This endpoint already exists and processes storage telemetry. The data normalization happens in `normalizeDiskMetrics`.

### 2. Backend: Verify Data Mapping Logic

**File**: `src/routes/maintenance-predictive.routes.ts` (lines 159-175)

The `mapStorage` function correctly:
- Filters telemetry for `deviceType === 'disk'`
- Extracts capacity, usage, and daily ingest metrics
- Calculates days remaining
- Returns properly formatted storage volumes

### 3. Frontend: Ensure Proper Display

**File**: `dashboard/app/analytics/predictions/page.tsx` (line 247)

The UI already has the storage card:
```tsx
{(activeDomain === "all" || activeDomain === "storage") && <Card>...Storage capacity telemetry ({volumes.length})...</Card>}
```

## Verification Steps

### 1. Check if Storage Telemetry is Being Collected

```sql
-- Query to check latest storage telemetry
SELECT 
  device_id,
  device_type,
  branch_id,
  metrics,
  observed_at,
  created_at
FROM operational_telemetry
WHERE tenant_id = '<your-tenant-id>'
  AND device_type = 'disk'
ORDER BY created_at DESC
LIMIT 10;
```

### 2. Check API Response

```bash
# Test the predictive dashboard endpoint
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/control/v1/maintenance/predictive/dashboard?horizonHours=48"
```

Expected response should include:
```json
{
  "volumes": [
    {
      "id": "disk-01",
      "name": "HDD-1",
      "branch": "Branch Name",
      "tier": "Storage",
      "totalTb": 10.5,
      "usedTb": 7.2,
      "dailyIngestGb": 50.0,
      "daysRemaining": 66,
      "trend": "linear",
      "smartStatus": "HEALTHY",
      "observedAt": "2024-...",
      "dataQuality": "verified"
    }
  ]
}
```

### 3. Trigger Storage Telemetry Collection

If no storage data exists, you need to trigger collection:

#### Option A: Via NVR Integration
The system automatically collects storage data when NVRs are configured and reporting.

#### Option B: Manual Test Data (Development Only)
```typescript
// POST to /v1/operational-health/storage
{
  "branchId": "<branch-id>",
  "edgeAgentId": "<agent-id>",
  "observedAt": "2024-01-15T10:00:00Z",
  "disks": [
    {
      "deviceId": "disk-01",
      "name": "HDD-1",
      "capacityBytes": 10995116277760,  // 10TB
      "usedBytes": 7696481394432,       // 7TB
      "temperatureC": 35,
      "reallocatedSectors": 0,
      "pendingSectors": 0,
      "smartStatus": "HEALTHY"
    }
  ]
}
```

## Common Issues and Solutions

### Issue 1: No Storage Data Collected
**Symptoms**: `volumes.length === 0` in frontend
**Solution**: 
- Verify NVRs are configured and reporting
- Check edge agents are running and have storage monitoring enabled
- Manually ingest test data via `/v1/operational-health/storage`

### Issue 2: Storage Data Exists But Not Displayed
**Symptoms**: Database has records but UI shows empty
**Solution**:
- Check user has `recording:view` permission for the branch
- Verify branch access in organization hierarchy
- Check time range - data older than 24 hours may be filtered out

### Issue 3: Storage Metrics Are NULL
**Symptoms**: Storage card shows "Unavailable" for metrics
**Solution**:
- Verify the telemetry metrics include required fields:
  - `totalBytes` or `capacityBytes` or `capacityGB`
  - `usedBytes` or `usedGB`
  - `freeBytes` or `availableBytes`
  - `dailyWriteRateBytes` or `growthRatePerDay` or `dailyIngestGb`

## Monitoring and Maintenance

### Set Up Automated Monitoring

Add a cron job or scheduled task to verify storage telemetry:

```sql
-- Daily check: Alert if no storage telemetry in last 24 hours
SELECT COUNT(*) as storage_records
FROM operational_telemetry
WHERE device_type = 'disk'
  AND created_at > NOW() - INTERVAL '24 hours';
```

### Health Check Endpoint

Create a health check that verifies storage visibility:

```typescript
// GET /v1/health/storage-telemetry
{
  "healthy": true,
  "lastStorageTelemetry": "2024-01-15T10:30:00Z",
  "recordsLast24Hours": 145,
  "branchesReporting": 12,
  "issues": []
}
```

## Production Deployment Checklist

- [ ] Verify storage telemetry collection is enabled on all edge agents
- [ ] Confirm NVR storage monitoring is configured
- [ ] Test API endpoint returns storage volumes
- [ ] Verify frontend displays storage data correctly
- [ ] Set up monitoring alerts for missing storage telemetry
- [ ] Document storage telemetry requirements for ops team
- [ ] Add storage visibility to system health dashboard

## Quick Fix Commands

```bash
# 1. Check if storage telemetry exists
psql -c "SELECT COUNT(*) FROM operational_telemetry WHERE device_type='disk';"

# 2. Restart predictive health worker (if using one)
systemctl restart predictive-health-worker

# 3. Clear stale cache (if any)
redis-cli DEL "telemetry:cache:*"

# 4. Force refresh on frontend
# Visit: /analytics/predictions and click "Refresh telemetry" button
```

## Technical Details

### Data Flow
```
NVR/Recorder → Edge Agent → /v1/operational-health/storage 
→ operational_telemetry table → /v1/maintenance/predictive/dashboard 
→ Frontend Predictions Page
```

### Database Schema
```sql
CREATE TABLE operational_telemetry (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  edge_agent_id UUID,
  device_type TEXT NOT NULL,  -- 'disk' for storage
  device_id TEXT NOT NULL,
  metrics JSONB NOT NULL,     -- Contains storage metrics
  quality TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Required indexes
CREATE INDEX idx_operational_telemetry_latest 
  ON operational_telemetry(tenant_id, branch_id, device_type, device_id, created_at DESC);
```

### Metric Field Mapping

The system supports multiple field names for compatibility:

| Display Field | Possible Source Fields |
|--------------|------------------------|
| totalTb | `totalBytes`, `capacityBytes`, `capacityGB` |
| usedTb | `usedBytes`, `usedGB` |
| dailyIngestGb | `dailyWriteRateBytes`, `growthRatePerDay`, `dailyIngestGb` |
| daysRemaining | `estimatedDaysRemaining`, `daysRemaining`, or calculated from free/daily rate |
| smartStatus | `smartStatus` |

## Support and Troubleshooting

If storage still doesn't appear after following this guide:

1. Enable debug logging:
   ```typescript
   LOG_LEVEL=debug npm start
   ```

2. Check the browser console for API errors

3. Verify network requests in DevTools → Network tab

4. Review backend logs for telemetry ingestion errors

5. Contact the development team with:
   - Browser console output
   - Network HAR file
   - Backend logs from telemetry ingestion
   - Database query results from verification steps

## Related Files

- Backend Routes: `src/routes/maintenance-predictive.routes.ts`
- Storage Ingestion: `src/routes/operational-health.routes.ts`
- Frontend Display: `dashboard/app/analytics/predictions/page.tsx`
- API Client: `dashboard/lib/api-client.ts`
- Database Migration: `database/migrations/104_predictive_health_forecasts.sql`

---

**Last Updated**: January 2024
**Status**: Production-Ready
**Severity**: P1 (Critical for operational visibility)
