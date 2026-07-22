# Getting Started with Dashboard Module

## Quick Integration in 5 Steps

### Step 1: Run Database Migration (5 minutes)

```bash
# Connect to your PostgreSQL database
psql -h localhost -U postgres -d sentinel_db

# Run the migration
\i database/migrations/20260723_reporting_dashboard_schema.sql

# Verify tables were created
\dt dashboard_*
\dt report_*
\dt *_daily
\dt system_health_*

# Exit psql
\q
```

Expected output: Should see 24 new tables created.

### Step 2: Register Routes (5 minutes)

Find your main application file (likely `src/index.ts`, `src/app.ts`, or `src/server.ts`).

Look for where other routes are registered. You'll see something like:

```typescript
import createIntegrationRoutes from './backend/src/routes/integration.routes';

// ... after pool is created ...

app.use('/v1/integration', createIntegrationRoutes(pool));
```

Add these two lines in the same location:

```typescript
import createDashboardRoutes from './backend/src/routes/dashboard.routes';
import createReportsRoutes from './backend/src/routes/reports.routes';

// ... after pool is created ...

app.use('/v1/dashboard', createDashboardRoutes(pool));
app.use('/v1/reports', createReportsRoutes(pool));
```

### Step 3: Build Backend (2 minutes)

```bash
cd backend
npm run build
```

Expected output: No TypeScript errors. Build should complete successfully.

If you see errors, check:
- Routes are imported correctly
- Pool is available where routes are registered
- TypeScript version is compatible

### Step 4: Build Frontend (3 minutes)

```bash
cd dashboard
npm run build
```

Expected output: No compilation errors. Build should complete successfully.

### Step 5: Test the Dashboard (5 minutes)

Start your backend server:

```bash
cd backend
npm start
# or
npm run dev
```

Test the API endpoints:

```bash
# Test dashboard summary
curl http://localhost:3000/api/control/v1/dashboard/summary

# If authentication is required
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/control/v1/dashboard/summary
```

Expected response:
```json
{
  "success": true,
  "data": {
    "systemStatus": "operational",
    "systemHealthScore": 0,
    "criticalAlerts": 0,
    "activeIncidents": 0,
    "lastUpdated": "2026-07-23T..."
  }
}
```

Open your browser and navigate to:
```
http://localhost:3001/dashboards
```

You should see the executive dashboard page!

## That's It! 🎉

Your dashboard is now integrated. Initially, metrics will show zeros or empty data because:
1. No daily aggregations have run yet
2. Tables are empty

## Next Steps

### Populate Sample Data (Optional for Development)

```sql
-- Insert sample system health score
INSERT INTO system_health_scores (
  tenant_id, overall_score, camera_availability_score,
  recording_availability_score, storage_health_score,
  health_status, score_time
) VALUES (
  'your-tenant-id', 94.5, 97.8, 96.5, 92.0, 'good', NOW()
);

-- Insert sample camera health data
INSERT INTO camera_health_daily (
  tenant_id, camera_id, branch_node_id, summary_date,
  online_minutes, offline_minutes, availability_percentage
) VALUES (
  'your-tenant-id', 'camera-1', 'branch-1', CURRENT_DATE,
  1440, 0, 100.0
);
```

### Set Up Daily Aggregation Jobs

Create a cron job or scheduled task to aggregate data daily:

```bash
# Run at 1 AM daily
0 1 * * * node /path/to/scripts/aggregate-daily-metrics.js
```

### Configure Thresholds

```sql
INSERT INTO metric_thresholds (
  tenant_id, metric_name, metric_type,
  warning_threshold, critical_threshold, threshold_direction, unit
) VALUES
  ('your-tenant-id', 'Camera Availability', 'camera_availability', 98.00, 95.00, 'below', 'percentage'),
  ('your-tenant-id', 'Storage Utilization', 'storage_utilization', 80.00, 90.00, 'above', 'percentage');
```

## Troubleshooting

### Dashboard shows all zeros
**Cause:** No data in aggregation tables yet
**Solution:** Wait for daily aggregation to run, or populate sample data

### API returns 500 error
**Cause:** Database connection or table doesn't exist
**Solution:** Check migration ran successfully, verify pool connection

### TypeScript compilation errors
**Cause:** Routes not properly imported or pool not available
**Solution:** Check import statements match existing route patterns

### Dashboard page won't load
**Cause:** Frontend build incomplete or API endpoints not responding
**Solution:** Check browser console for errors, verify API responds

### "Unauthorized" errors
**Cause:** Authentication middleware expects context
**Solution:** Ensure auth middleware populates req.context with tenantId

## Common Questions

**Q: Do I need to create aggregation scripts?**
A: Not immediately. The dashboard will work with real-time data, but daily aggregations improve performance for large deployments.

**Q: Can I customize the dashboard layout?**
A: Yes! Edit `dashboard/app/dashboards/page.tsx` to modify widgets and layout.

**Q: How do I add more report types?**
A: Add methods to `ReportsService` and corresponding routes in `reports.routes.ts`.

**Q: Is authentication required?**
A: Yes, the routes expect `req.context.tenantId` to be populated by your auth middleware.

**Q: Can I use this with multiple tenants?**
A: Yes! All queries are scoped by `tenant_id` for complete isolation.

## Need Help?

Check these resources:

1. **Detailed Guide:** `REPORTS_DASHBOARD_IMPLEMENTATION_GUIDE.md`
2. **Quick Reference:** `DASHBOARD_QUICK_REFERENCE.md`
3. **Integration Checklist:** `DASHBOARD_INTEGRATION_CHECKLIST.md`
4. **Build Fixes:** `DASHBOARD_BUILD_FIX_SUMMARY.md`
5. **Final Status:** `MODULE_2.11_FINAL_STATUS.md`

## Success! 🚀

If you've completed all 5 steps and the dashboard loads, you're done!

The dashboard will auto-refresh every 30 seconds and display real-time operational metrics for your CCTV system.

---

**Estimated Time:** 20 minutes for basic integration
**Difficulty:** Easy (copy-paste integration)
**Requirements:** PostgreSQL, Node.js, existing backend with pool
