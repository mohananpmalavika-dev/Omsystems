# CCTV Dashboard & Reports - Quick Reference Guide

## Quick Start

### Access the Dashboard
```
URL: https://your-domain.com/dashboards
Role: Any authenticated user with dashboard:view permission
```

### Refresh Intervals
| Data Type | Refresh Rate | Staleness Threshold |
|-----------|--------------|---------------------|
| Critical Alerts | Real-time | 30 seconds |
| Camera Status | 15-30 seconds | 1 minute |
| Recording Status | 1-5 minutes | 5 minutes |
| Storage Capacity | 1-5 minutes | 10 minutes |
| Incidents | Real-time | 30 seconds |
| System Health | 15 minutes | 30 minutes |

## Dashboard API Endpoints

### Quick Reference
```bash
# Get dashboard summary
GET /api/control/v1/dashboard/summary

# Get camera health
GET /api/control/v1/dashboard/camera-health

# Get recording status
GET /api/control/v1/dashboard/recording-status

# Get storage metrics
GET /api/control/v1/dashboard/storage

# Get active alerts
GET /api/control/v1/dashboard/alerts

# Get recent incidents
GET /api/control/v1/dashboard/incidents?limit=10

# Get system health score
GET /api/control/v1/dashboard/system-health
```

### Response Format
```json
{
  "success": true,
  "data": {
    // Metrics data
  }
}
```

## Report API Endpoints

### Available Reports
```bash
# Camera Health Report
GET /api/control/v1/reports/camera-health?from=2026-07-01&to=2026-07-23&branchIds=abc123

# Recording Status Report
GET /api/control/v1/reports/recording-status?from=2026-07-01&to=2026-07-23

# Storage Utilization Report
GET /api/control/v1/reports/storage-utilization

# Incident Register
GET /api/control/v1/reports/incidents?severity=critical&status=open

# Footage Access Log
GET /api/control/v1/reports/footage-access?from=2026-07-01&to=2026-07-23

# Maintenance Log
GET /api/control/v1/reports/maintenance?from=2026-07-01&to=2026-07-23

# Downtime Report
GET /api/control/v1/reports/downtime?from=2026-07-01&to=2026-07-23

# Alert Summary Report
GET /api/control/v1/reports/alerts?from=2026-07-01&to=2026-07-23
```

## Common Filters

### Date Range
```
?from=2026-07-01T00:00:00Z&to=2026-07-23T23:59:59Z
```

### Branch Filter
```
?branchIds=branch-uuid-1&branchIds=branch-uuid-2
```

### Severity Filter
```
?severity=critical
```

### Status Filter
```
?status=open
```

## Health Score Calculation

### Component Weights
```
Camera Availability:        25%
Recording Availability:     25%
Storage Health:             15%
Network Health:             10%
Power & UPS Health:         10%
Integration Health:          5%
Maintenance Compliance:      5%
Security & Audit Health:     5%
─────────────────────────────────
Total:                     100%
```

### Status Thresholds
```
95-100:    Healthy    (Green)
85-94.99:  Good       (Light Green)
70-84.99:  Warning    (Yellow)
50-69.99:  Critical   (Orange)
< 50:      Severe     (Red)
```

## Key Metrics Formulas

### Availability
```
Camera Availability = (Online Cameras ÷ Operational Cameras) × 100
Recording Availability = (Recording Normally ÷ Active Cameras) × 100
Storage Utilization = (Used Capacity ÷ Total Capacity) × 100
```

### Performance
```
MTBF = Total Operational Time ÷ Number of Failures
MTTR = Total Repair Time ÷ Number of Repairs
Availability % = (Operational Time ÷ Total Scheduled Time) × 100
```

### Response Times
```
Acknowledgment Time = Acknowledged At - Triggered At
Resolution Time = Resolved At - Triggered At
```

## Database Tables Quick Reference

### Dashboard Tables
```sql
dashboard_definitions       -- Dashboard configurations
dashboard_widgets          -- Widget definitions
dashboard_user_preferences -- User customizations
dashboard_snapshots        -- Historical states
```

### Report Tables
```sql
report_definitions -- Report types
report_schedules   -- Automated schedules
report_runs        -- Execution history
report_exports     -- Download audit trail
```

### Metrics Tables
```sql
camera_health_daily       -- Daily camera metrics
recording_status_daily    -- Daily recording metrics
recording_gap_summary     -- Gap details
storage_capacity_snapshots-- Storage metrics
incident_metrics_daily    -- Incident summaries
alert_metrics_daily       -- Alert summaries
downtime_events          -- Outage tracking
system_health_scores     -- Health calculations
```

## Common SQL Queries

### Get Current Camera Status
```sql
SELECT 
  c.name,
  c.connectivity_status,
  c.last_heartbeat,
  chd.availability_percentage
FROM cameras c
LEFT JOIN camera_health_daily chd 
  ON c.id = chd.camera_id 
  AND chd.summary_date = CURRENT_DATE
WHERE c.tenant_id = 'your-tenant-id'
  AND c.status = 'active'
ORDER BY c.connectivity_status, c.name;
```

### Get Storage Utilization
```sql
SELECT 
  storage_node_id,
  utilization_percentage,
  forecast_full_days,
  snapshot_time
FROM storage_capacity_snapshots
WHERE tenant_id = 'your-tenant-id'
  AND snapshot_time >= NOW() - INTERVAL '15 minutes'
ORDER BY snapshot_time DESC;
```

### Get Recent Incidents
```sql
SELECT 
  incident_number,
  occurred_at,
  severity,
  status,
  incident_type
FROM incidents
WHERE tenant_id = 'your-tenant-id'
  AND occurred_at >= NOW() - INTERVAL '24 hours'
ORDER BY 
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  occurred_at DESC
LIMIT 10;
```

## Frontend Component Usage

### Import Dashboard API
```typescript
import { dashboardApi } from '@/lib/api-client';

// Get summary
const summary = await dashboardApi.getSummary();

// Get camera health
const cameras = await dashboardApi.getCameraHealth();

// Get incidents
const incidents = await dashboardApi.getIncidents(5);
```

### Import Reports API
```typescript
import { reportsApi } from '@/lib/api-client';

// Get camera health report
const report = await reportsApi.getCameraHealthReport({
  from: '2026-07-01',
  to: '2026-07-23',
  branchIds: ['branch-id']
});
```

### Display Metric Card
```typescript
<MetricCard 
  label="System Health Score" 
  value="94.6%"
  status="good"
  detail="All systems operational"
/>
```

## Color Coding Standards

### Status Colors
```
Healthy/Good:    #10b981 (Green)
Warning:         #f59e0b (Amber)
Critical:        #ef4444 (Red)
Info:            #3b82f6 (Blue)
Maintenance:     #8b5cf6 (Purple)
Unknown:         #6b7280 (Gray)
```

### Severity Colors
```
Critical:  #dc2626 (Dark Red)
High:      #f59e0b (Amber)
Medium:    #3b82f6 (Blue)
Low:       #10b981 (Green)
```

### Background Colors
```
Success Background:  #ecfdf5
Warning Background:  #fef3c7
Error Background:    #fee2e2
Info Background:     #eff6ff
Neutral Background:  #f9fafb
```

## Troubleshooting

### Dashboard Not Loading
```bash
# Check API connectivity
curl https://your-domain.com/api/control/v1/dashboard/summary

# Check browser console for errors
# Verify authentication token
# Check network tab for failed requests
```

### Stale Data Warning
```sql
-- Check last aggregation run
SELECT MAX(summary_date) 
FROM camera_health_daily 
WHERE tenant_id = 'your-tenant-id';

-- Check aggregation job status
SELECT * FROM system_jobs 
WHERE job_type = 'daily_aggregation' 
ORDER BY created_at DESC 
LIMIT 5;
```

### Report Generation Failed
```sql
-- Check recent report runs
SELECT * FROM report_runs 
WHERE status = 'failed' 
ORDER BY created_at DESC 
LIMIT 10;

-- View error details
SELECT 
  report_definition_id,
  error_message,
  filters_applied,
  created_at
FROM report_runs 
WHERE id = 'report-run-id';
```

### Slow Dashboard Load
```sql
-- Check for missing indexes
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE tablename IN (
  'camera_health_daily',
  'recording_status_daily',
  'storage_capacity_snapshots'
);

-- Analyze query performance
EXPLAIN ANALYZE
SELECT ... -- Your slow query
```

## Performance Tips

### Optimize Dashboard Queries
1. Always include tenant_id filter
2. Use date range limits
3. Leverage indexes on filtered columns
4. Cache results client-side (30s TTL)
5. Use pagination for large result sets

### Reduce API Calls
1. Fetch all dashboard data in parallel
2. Implement client-side caching
3. Use server-sent events for real-time updates
4. Batch related requests

### Speed Up Reports
1. Pre-aggregate data in daily tables
2. Use materialized views for complex queries
3. Limit date ranges to necessary period
4. Generate large reports asynchronously
5. Cache frequently-run reports

## Security Checklist

### Access Control
- [ ] Verify tenant isolation in all queries
- [ ] Check role-based permissions
- [ ] Validate branch/region scope
- [ ] Test unauthorized access attempts

### Audit Logging
- [ ] Log all report exports
- [ ] Track video access requests
- [ ] Record approval workflows
- [ ] Monitor unusual access patterns

### Data Protection
- [ ] Mask sensitive data in exports
- [ ] Use watermarks for external sharing
- [ ] Implement time-limited download links
- [ ] Enable export revocation

## Monitoring Alerts

### Dashboard Health
```
Alert: Dashboard unavailable
Condition: API returns 5xx for > 1 minute
Action: Check backend services

Alert: Stale data warning
Condition: Last update > 5 minutes ago
Action: Check aggregation jobs

Alert: Slow dashboard load
Condition: Load time > 5 seconds
Action: Review database performance
```

### Report Alerts
```
Alert: Report generation failed
Condition: Report run status = 'failed'
Action: Check error logs

Alert: Export approval backlog
Condition: Pending approvals > 10
Action: Notify approvers

Alert: Storage forecast critical
Condition: Forecast full < 7 days
Action: Escalate to infrastructure team
```

## Support Contacts

### Technical Issues
- Email: tech-support@example.com
- Slack: #cctv-dashboard-support
- Phone: +1-XXX-XXX-XXXX (24/7)

### Feature Requests
- Portal: https://feedback.example.com
- Email: product@example.com

### Security Concerns
- Email: security@example.com
- Phone: +1-XXX-XXX-XXXX (Emergency)

## Useful Links

- [Complete Implementation Guide](./REPORTS_DASHBOARD_IMPLEMENTATION_GUIDE.md)
- [Module Completion Summary](./MODULE_2.11_COMPLETION_SUMMARY.md)
- [API Documentation](/api/docs)
- [User Training Videos](/training)
- [Release Notes](/releases)

---

**Last Updated:** July 23, 2026
**Version:** 1.0.0
**Status:** Production Ready
