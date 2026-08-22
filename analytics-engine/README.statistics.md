# Analytics Statistics Implementation

## Quick Start

### 1. Configure Database Connection

```bash
cd analytics-engine
cp .env.statistics.example .env
```

Edit `.env` and set your database connection:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/sentinel
```

### 2. Run Database Migration

Create the necessary indexes:

```bash
psql $DATABASE_URL -f ../database/migrations/018_analytics_statistics_indexes.sql
```

### 3. Start Analytics Engine

```bash
npm install
npm start
```

The statistics service will automatically initialize if `DATABASE_URL` is configured.

### 4. Test the Endpoint

```bash
# Replace <tenant-id> with a valid tenant UUID
curl "http://localhost:3001/v1/analytics/statistics?tenantId=<tenant-id>"
```

## What's Included

```
analytics-engine/
├── src/
│   ├── models/
│   │   └── analytics-statistics.ts              # TypeScript interfaces
│   ├── repositories/
│   │   └── analytics-statistics.repository.ts   # SQL aggregation queries
│   ├── services/
│   │   └── analytics-statistics.service.ts      # Business logic
│   ├── schemas/
│   │   └── analytics-statistics.schema.ts       # Zod validation
│   ├── routes/
│   │   └── detection-api.ts                     # API endpoint
│   ├── statistics-integration.ts                # Database integration
│   └── __tests__/
│       └── analytics-statistics.test.ts         # Unit tests
├── .env.statistics.example                       # Configuration template
├── STATISTICS_API.md                             # API documentation
├── STATISTICS_IMPLEMENTATION_COMPLETE.md         # Architecture guide
└── STATISTICS_DASHBOARD_INTEGRATION.md           # Frontend guide
```

## Architecture

```
Dashboard → GET /v1/analytics/statistics → Service → Repository → PostgreSQL
```

### Key Features

✅ **Tenant Isolation**: Every query enforces `tenant_id` filter  
✅ **Time-Bucketed Aggregation**: minute/hour/day/week buckets  
✅ **Zero-Filled Timeline**: Continuous data for charting  
✅ **Multi-Dimensional Filtering**: By type, severity, camera, branch  
✅ **Efficient Indexes**: Optimized for time-range queries  
✅ **Input Validation**: Zod schemas with type safety  
✅ **Error Handling**: Graceful failures with clear messages  

## Example Response

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
    }
  },
  "bySeverity": {
    "P1": 47,
    "P2": 326,
    "P3": 907
  },
  "timeline": [
    {
      "timestamp": "2026-08-10T00:00:00.000Z",
      "total": 742,
      "alerts": 8,
      "averageConfidence": 0.86,
      "byType": {
        "person": 420,
        "vehicle": 280
      }
    }
  ]
}
```

## Common Queries

### Last 24 Hours (Default)

```bash
curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>"
```

### Custom Time Range with Hourly Buckets

```bash
curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&from=2026-08-10T00:00:00Z&to=2026-08-11T00:00:00Z&bucket=hour"
```

### Filter by Detection Types

```bash
curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&detectorType=person&detectorType=vehicle"
```

### Camera-Specific with Breakdown

```bash
curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&cameraId=<camera-uuid>&includeCameraBreakdown=true"
```

### Branch-Level Aggregation

```bash
curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&branchId=<branch-uuid>&bucket=day"
```

## Database Requirements

### Permissions

The database user needs:

```sql
GRANT SELECT ON analytics_events TO analytics_user;
GRANT SELECT ON analytics_alerts TO analytics_user;
GRANT SELECT ON cameras TO analytics_user;
```

### Indexes

Created by migration `018_analytics_statistics_indexes.sql`:

- `analytics_events_tenant_time_idx` - Core tenant + time
- `analytics_events_tenant_detector_time_idx` - Type filtering
- `analytics_events_tenant_alert_time_idx` - Alert queries
- `analytics_events_tenant_status_type_time_idx` - Complex filters

### Expected Volume

Current implementation queries raw `analytics_events` table:

| Event Volume | Query Time | Recommendation |
|--------------|------------|----------------|
| < 1M events | 50-200ms | Raw queries ✓ |
| 1-10M events | 100-500ms | Raw queries ✓ |
| 10-50M events | 500ms-2s | Consider rollups |
| > 50M events | > 2s | Implement rollups |

## Performance Tuning

### 1. Connection Pool

Adjust pool size based on concurrent dashboard users:

```bash
STATISTICS_DB_POOL_MAX=10  # 10 connections for statistics queries
```

### 2. Query Timeout

Increase for large datasets:

```bash
DB_STATEMENT_TIMEOUT_MS=30000  # 30 seconds
```

### 3. Read Replica (Recommended for Production)

Point statistics queries to a read replica:

```bash
STATISTICS_DATABASE_URL=postgresql://user:pass@read-replica:5432/sentinel
```

### 4. Monitoring

Track query performance:

```sql
-- Find slow statistics queries
SELECT
  query,
  mean_exec_time,
  calls
FROM pg_stat_statements
WHERE query LIKE '%analytics_events%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

## Troubleshooting

### Statistics Endpoint Returns 503

**Cause**: `DATABASE_URL` not configured or database unreachable

**Solution**:
```bash
# Check environment variable
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT COUNT(*) FROM analytics_events LIMIT 1"

# Check analytics-engine logs
npm start
# Look for: "[Statistics] Successfully initialized with control plane database"
```

### Empty Results for Known Data

**Cause**: Tenant ID mismatch or `status != 'accepted'`

**Solution**:
```sql
-- Verify data exists for tenant
SELECT
  tenant_id,
  detection_type,
  status,
  COUNT(*)
FROM analytics_events
WHERE tenant_id = '<your-tenant-id>'
GROUP BY tenant_id, detection_type, status;

-- Only 'accepted' events are counted
```

### Slow Query Performance

**Cause**: Missing indexes or large date range

**Solution**:
1. Verify indexes exist:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'analytics_events';
```

2. Reduce date range:
```bash
# Instead of 90 days, try 7 days
curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&from=2026-08-04T00:00:00Z&to=2026-08-11T00:00:00Z"
```

3. Consider implementing rollups (see `STATISTICS_IMPLEMENTATION_COMPLETE.md`)

### Invalid Detector Type Error

**Cause**: Using unsupported detector type

**Solution**: Use only allowed types:
- motion, person, vehicle, object
- line-crossing, intrusion, loitering
- crowd-density, camera-tampering, video-loss
- fire-smoke, face, anpr, helmet, fall
- tailgating, queue

## Testing

### Run Unit Tests

```bash
npm test -- analytics-statistics.test.ts
```

### Manual Testing

1. Insert test data:
```sql
INSERT INTO analytics_events (
  tenant_id, camera_id, source_event_id,
  detection_type, occurred_at, confidence,
  model_version, status
) VALUES (
  '<tenant-id>', '<camera-id>', 'test-event-1',
  'person', NOW(), 0.92,
  'yolov8-1.0', 'accepted'
);
```

2. Query statistics:
```bash
curl "http://localhost:3001/v1/analytics/statistics?tenantId=<tenant-id>"
```

3. Verify result includes the test event

## Production Checklist

Before deploying to production:

- [ ] `DATABASE_URL` configured with production credentials
- [ ] Database migration `018_analytics_statistics_indexes.sql` applied
- [ ] Read replica configured for statistics queries
- [ ] Connection pool size tuned for expected load
- [ ] Query timeout configured appropriately
- [ ] Monitoring and alerting set up for slow queries
- [ ] Rate limiting enabled on statistics endpoint
- [ ] `tenantId` comes from authenticated user context (not query param)
- [ ] SSL/TLS enabled for database connections
- [ ] Load testing completed for expected traffic

## Next Steps

### Immediate (Production Hardening)

1. Replace query-parameter `tenantId` with auth middleware
2. Add Prometheus metrics
3. Set up database monitoring
4. Configure rate limiting

### Future Enhancements

1. Implement hourly/daily rollup tables for large scale
2. Add Redis caching for common queries
3. Support TimescaleDB continuous aggregates
4. Export statistics to CSV/Excel
5. Scheduled report generation
6. WebSocket updates for real-time dashboards

## Documentation

- **API Reference**: `STATISTICS_API.md`
- **Architecture**: `STATISTICS_IMPLEMENTATION_COMPLETE.md`
- **Frontend Guide**: `STATISTICS_DASHBOARD_INTEGRATION.md`

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review API documentation in `STATISTICS_API.md`
3. Verify database connection and indexes
4. Check analytics-engine logs for errors

## License

Same as parent project.
