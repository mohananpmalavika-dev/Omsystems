# Analytics Statistics API

## Overview

The analytics statistics endpoint provides time-bucketed aggregation over detection events with tenant isolation, flexible filtering, and efficient query patterns.

## Architecture

```
GET /v1/analytics/statistics
         │
         ▼
  detection-api.ts (route)
         │
         ▼
  AnalyticsStatisticsService
         │
         ▼
  AnalyticsStatisticsRepository
         │
         ▼
  PostgreSQL analytics_events table
```

## Endpoint

### `GET /v1/analytics/statistics`

Retrieve aggregated statistics over detection events.

#### Query Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `from` | ISO 8601 datetime | Start of time range | 24 hours ago |
| `to` | ISO 8601 datetime | End of time range | Now |
| `bucket` | `minute\|hour\|day\|week` | Time bucket size | Auto-selected |
| `detectorType` | string or string[] | Filter by detection types | All types |
| `severity` | string or string[] | Filter by severity (P1-P5) | All severities |
| `cameraId` | UUID | Filter by specific camera | All cameras |
| `branchId` | UUID | Filter by branch | All branches |
| `includeTimeline` | boolean | Include time-bucketed timeline | `true` |
| `includeCameraBreakdown` | boolean | Include top cameras | `false` |
| `includeBranchBreakdown` | boolean | Include top branches | `false` |
| `tenantId` | UUID | Tenant identifier (required) | - |

**Security Note:** In production, `tenantId` must come from authenticated user context, not query parameters.

#### Example Requests

**Basic - Last 24 hours:**
```
GET /v1/analytics/statistics?tenantId=<uuid>
```

**Custom time range with hourly buckets:**
```
GET /v1/analytics/statistics
  ?tenantId=<uuid>
  &from=2026-08-10T00:00:00Z
  &to=2026-08-11T00:00:00Z
  &bucket=hour
```

**Filter by detector type:**
```
GET /v1/analytics/statistics
  ?tenantId=<uuid>
  &detectorType=person
  &detectorType=vehicle
  &from=2026-08-10T00:00:00Z
  &to=2026-08-11T00:00:00Z
```

**Camera-specific with breakdown:**
```
GET /v1/analytics/statistics
  ?tenantId=<uuid>
  &cameraId=<uuid>
  &includeCameraBreakdown=true
  &from=2026-08-10T00:00:00Z
  &to=2026-08-11T00:00:00Z
```

**Branch-level aggregation:**
```
GET /v1/analytics/statistics
  ?tenantId=<uuid>
  &branchId=<uuid>
  &includeBranchBreakdown=true
  &bucket=day
```

#### Response Schema

```typescript
{
  range: {
    from: string;          // ISO 8601
    to: string;            // ISO 8601
    bucket: "minute" | "hour" | "day" | "week";
  };

  totalDetections: number;
  averageConfidence: number | null;
  alerts: number;

  byType: {
    [detectorType: string]: {
      count: number;
      averageConfidence: number | null;
      alerts: number;
    };
  };

  bySeverity: {
    [severity: string]: number;
  };

  timeline: Array<{
    timestamp: string;     // ISO 8601
    total: number;
    alerts: number;
    averageConfidence: number | null;
    byType: {
      [detectorType: string]: number;
    };
  }>;

  topCameras?: Array<{
    cameraId: string;
    detections: number;
    alerts: number;
  }>;

  topBranches?: Array<{
    branchId: string;
    detections: number;
    alerts: number;
  }>;

  meta: {
    generatedAt: string;
    source: "raw" | "rollup";
    cached: boolean;
  };
}
```

#### Example Response

```json
{
  "range": {
    "from": "2026-08-10T00:00:00.000Z",
    "to": "2026-08-11T00:00:00.000Z",
    "bucket": "hour"
  },
  "totalDetections": 18342,
  "averageConfidence": 0.873,
  "alerts": 173,
  "byType": {
    "person": {
      "count": 9120,
      "averageConfidence": 0.91,
      "alerts": 51
    },
    "vehicle": {
      "count": 5944,
      "averageConfidence": 0.88,
      "alerts": 20
    },
    "anpr": {
      "count": 2877,
      "averageConfidence": 0.84,
      "alerts": 92
    },
    "intrusion": {
      "count": 401,
      "averageConfidence": 0.78,
      "alerts": 10
    }
  },
  "bySeverity": {
    "P1": 47,
    "P2": 326,
    "P3": 907,
    "P4": 1920,
    "P5": 15142
  },
  "timeline": [
    {
      "timestamp": "2026-08-10T00:00:00.000Z",
      "total": 742,
      "alerts": 8,
      "averageConfidence": 0.86,
      "byType": {
        "person": 420,
        "vehicle": 280,
        "anpr": 42
      }
    }
    // ... 23 more hourly buckets
  ],
  "meta": {
    "generatedAt": "2026-08-11T10:18:00.000Z",
    "source": "raw",
    "cached": false
  }
}
```

## Features

### 1. Tenant Isolation (Mandatory)

Every query is scoped to a single tenant. The `tenantId` parameter is **required** and must come from authenticated user context in production.

```sql
WHERE tenant_id = $1  -- Always present
```

### 2. Time-Bucketed Aggregation

Statistics are aggregated into time buckets:
- **Minute**: Ranges ≤ 2 hours
- **Hour**: Ranges ≤ 72 hours  
- **Day**: Ranges ≤ 90 days
- **Week**: Ranges > 90 days

The service automatically selects an appropriate bucket size based on the requested range, or you can specify it explicitly.

### 3. Zero-Filled Timeline

Missing time buckets are filled with zeros to produce continuous timelines suitable for charting:

```json
[
  { "timestamp": "10:00", "total": 32 },
  { "timestamp": "11:00", "total": 0 },   // ← Filled
  { "timestamp": "12:00", "total": 57 }
]
```

### 4. Multi-Dimensional Filtering

Filter by:
- Detection type(s)
- Severity level(s)  
- Camera ID
- Branch ID
- Time range

Filters are combined with AND logic.

### 5. Efficient Query Patterns

The repository layer uses:
- Parameterized queries (SQL injection safe)
- Tenant-scoped indexes
- Partial indexes for alerts
- Parallel query execution with `Promise.all`

### 6. Authorization-Aware

The service layer validates:
- Time range limits (max 90 days)
- Detector type allowlist
- Severity allowlist

Future enhancement: Branch/camera authorization based on user permissions.

## Database Indexes

The following indexes are created by migration `018_analytics_statistics_indexes.sql`:

```sql
-- Core tenant + time
CREATE INDEX analytics_events_tenant_time_idx
ON analytics_events (tenant_id, occurred_at DESC)
WHERE status = 'accepted';

-- Tenant + detector + time
CREATE INDEX analytics_events_tenant_detector_time_idx  
ON analytics_events (tenant_id, detection_type, occurred_at DESC)
WHERE status = 'accepted';

-- Alert events only (partial index)
CREATE INDEX analytics_events_tenant_alert_time_idx
ON analytics_events (tenant_id, occurred_at DESC)
WHERE status = 'accepted' AND primary_rule_id IS NOT NULL;

-- Multi-column for complex filters
CREATE INDEX analytics_events_tenant_status_type_time_idx
ON analytics_events (tenant_id, status, detection_type, occurred_at DESC);
```

## Performance Considerations

### Current Implementation

- **Raw table queries**: Directly aggregates from `analytics_events`
- **Suitable for**: Small to medium deployments (< 10M events)
- **Query time**: Typically 50-500ms for 24-hour range

### Future Enhancements

For large-scale deployments (> 50M events), consider:

1. **Hourly/Daily Rollups**
   ```sql
   CREATE TABLE analytics_stats_hourly (
     tenant_id UUID,
     bucket_start TIMESTAMPTZ,
     detector_type TEXT,
     detection_count BIGINT,
     confidence_sum DOUBLE PRECISION,
     confidence_count BIGINT,
     alert_count BIGINT,
     PRIMARY KEY (tenant_id, bucket_start, detector_type)
   );
   ```

2. **TimescaleDB Hypertables**
   - Automatic partitioning by time
   - Built-in continuous aggregates
   - Time-series optimized queries

3. **Redis Caching**
   - Cache relative-time queries (last 24h, last 7d)
   - TTL: 15-60 seconds
   - Normalize timestamps to minute boundary

4. **Materialized Views**
   - Pre-compute common aggregations
   - Refresh every 5-15 minutes

## Error Handling

### Validation Errors (400)

```json
{
  "error": "validation_error",
  "message": "`from` must be before `to`"
}
```

### Service Unavailable (503)

```json
{
  "error": "statistics_unavailable",
  "message": "Statistics service is not available",
  "hint": "DATABASE_URL must be configured"
}
```

### Database Errors (503)

```json
{
  "error": "analytics_statistics_unavailable", 
  "message": "Unable to retrieve analytics statistics",
  "details": "connection timeout"
}
```

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/sentinel

# Optional tuning
STATISTICS_DB_POOL_MAX=5          # Max pool connections (default: 5)
DB_STATEMENT_TIMEOUT_MS=15000     # Query timeout (default: 15s)
```

## Testing

See `analytics-engine/src/__tests__/analytics-statistics.test.ts` for repository and service tests.

### Test Coverage

- Tenant isolation
- Time range validation
- Empty result handling
- Zero-filled timeline buckets
- Multi-type filtering
- Alert aggregation
- Confidence averaging

## Production Checklist

- [ ] Replace query-parameter `tenantId` with authenticated user context
- [ ] Implement branch/camera authorization checks
- [ ] Add Prometheus metrics for query latency
- [ ] Set up database connection pooling alerts
- [ ] Configure query timeout alerts
- [ ] Create runbook for statistics performance issues
- [ ] Document rollup strategy for large installations

## API Integration Examples

### JavaScript/TypeScript

```typescript
const response = await fetch(
  `/v1/analytics/statistics?` +
  `tenantId=${tenantId}&` +
  `from=${from.toISOString()}&` +
  `to=${to.toISOString()}&` +
  `bucket=hour&` +
  `includeTimeline=true`
);

const stats = await response.json();
console.log(`Total detections: ${stats.totalDetections}`);
```

### Python

```python
import requests
from datetime import datetime, timedelta

to_time = datetime.now()
from_time = to_time - timedelta(hours=24)

response = requests.get(
    "http://analytics-engine/v1/analytics/statistics",
    params={
        "tenantId": tenant_id,
        "from": from_time.isoformat(),
        "to": to_time.isoformat(),
        "bucket": "hour",
    }
)

stats = response.json()
print(f"Total: {stats['totalDetections']}")
```

### cURL

```bash
curl -X GET "http://localhost:3001/v1/analytics/statistics" \
  -G \
  --data-urlencode "tenantId=<uuid>" \
  --data-urlencode "from=2026-08-10T00:00:00Z" \
  --data-urlencode "to=2026-08-11T00:00:00Z" \
  --data-urlencode "bucket=hour" \
  --data-urlencode "detectorType=person" \
  --data-urlencode "detectorType=vehicle"
```

## Dashboard Integration

The endpoint is designed for real-time dashboard displays:

```typescript
// Dashboard refresh every 30 seconds
setInterval(async () => {
  const stats = await fetchStatistics({
    from: new Date(Date.now() - 24 * 60 * 60 * 1000),
    to: new Date(),
    bucket: "hour",
  });
  
  updateChart(stats.timeline);
  updateCounters({
    total: stats.totalDetections,
    alerts: stats.alerts,
    confidence: stats.averageConfidence,
  });
}, 30000);
```

## Maintenance

### Index Health

```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'analytics_events'
ORDER BY idx_scan DESC;
```

### Query Performance

```sql
-- Analyze query plan
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  COUNT(*),
  AVG(confidence)
FROM analytics_events
WHERE tenant_id = '<uuid>'
  AND occurred_at >= NOW() - INTERVAL '24 hours'
  AND occurred_at < NOW()
  AND status = 'accepted';
```

### Data Retention

Consider implementing retention policies:

```sql
-- Delete old raw events (keep aggregates)
DELETE FROM analytics_events
WHERE occurred_at < NOW() - INTERVAL '90 days'
  AND tenant_id = '<uuid>';
```
