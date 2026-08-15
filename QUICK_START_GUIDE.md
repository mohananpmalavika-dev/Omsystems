# Quick Start Guide - Branch Operational Health System

## 🚀 Getting Started in 5 Minutes

This guide will get your branch operational health system running quickly.

## Prerequisites

- ✅ PostgreSQL 14+ running
- ✅ Node.js 18+ installed
- ✅ Existing Omsystems backend running
- ✅ Database connection configured

## Step 1: Database Setup (2 minutes)

### Run the Migration

```bash
# Navigate to your project
cd backend

# Run the migration
psql $DATABASE_URL -f prisma/migrations/20260815_branch_operational_health_cache.sql

# Verify tables created
psql $DATABASE_URL -c "\dt branch_*"
```

**Expected Output:**
```
 branch_health_change_events
 branch_operational_health_current
 branch_operational_health_history
```

## Step 2: Backend Integration (2 minutes)

### Add to Your Main Server File

```typescript
// backend/src/index.ts or backend/src/server.ts

import { Pool } from 'pg';
import { createOperationalHealthRoutes } from './operational-health/routes/operational-health.routes';
import { HealthChangePublisher } from './operational-health/events/health-change-publisher';

// Create routes
const healthRoutes = createOperationalHealthRoutes(pool);
app.use('/api/v1/operational-health', healthRoutes);

// Start WebSocket event publisher (if you have WebSocket server)
if (wsServer) {
  const healthPublisher = new HealthChangePublisher(pool, wsServer);
  healthPublisher.start();
  
  // Cleanup on shutdown
  process.on('SIGTERM', () => {
    healthPublisher.stop();
  });
}

console.log('✅ Operational health system initialized');
```

### Initial Data Population

```bash
# Trigger initial health computation for all branches
curl -X POST http://localhost:3000/api/v1/operational-health/refresh-all \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

## Step 3: Frontend Integration (1 minute)

### Add Dashboard Route

```typescript
// dashboard/app/operations/page.tsx (Next.js App Router)
import { OperationalDashboard } from '@/components/operational-health/operational-dashboard';

export default function OperationsPage() {
  return <OperationalDashboard />;
}
```

**OR**

```typescript
// dashboard/src/App.tsx (React Router)
import { OperationalDashboard } from './components/operational-health/operational-dashboard';

<Route path="/operations" element={<OperationalDashboard />} />
```

### Configure Environment Variables

```bash
# dashboard/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:3000/ws
```

### Install Dependencies (if needed)

```bash
cd dashboard
npm install
# All dependencies should already be in your package.json
```

## Step 4: Verify It Works

### Test Backend API

```bash
# Get dashboard summary
curl http://localhost:3000/api/v1/operational-health/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected response:
{
  "success": true,
  "data": {
    "generatedAt": "2026-08-15T10:30:00Z",
    "branches": {
      "total": 400,
      "healthy": 348,
      "warning": 31,
      "critical": 17,
      "unknown": 4
    },
    ...
  }
}
```

### Test Frontend

```bash
cd dashboard
npm run dev

# Open browser
open http://localhost:3001/operations
```

**You should see:**
- ✅ Dashboard summary KPIs at the top
- ✅ Branch mosaic grid below
- ✅ "Needs Attention" showing non-healthy branches
- ✅ Auto-refresh every 30 seconds

## Step 5: Configure Auto-Refresh (Optional)

### Add Cron Job for Background Refresh

```typescript
// backend/src/jobs/health-refresh.job.ts
import { CronJob } from 'cron';
import { IntegratedOperationalHealthService } from '../operational-health/services/integrated-operational-health.service';

const healthService = new IntegratedOperationalHealthService(pool);

// Refresh all branches every 5 minutes
const job = new CronJob('*/5 * * * *', async () => {
  console.log('Starting health refresh job...');
  try {
    const result = await healthService.refreshAllBranchesHealth(tenantId);
    console.log(`Health refresh completed:`, result);
  } catch (error) {
    console.error('Health refresh failed:', error);
  }
});

job.start();
```

## Common Issues & Solutions

### Issue: "Table does not exist"

**Solution:**
```bash
# Verify migration ran
psql $DATABASE_URL -c "\dt branch_operational_health_current"

# If not found, run migration again
psql $DATABASE_URL -f backend/prisma/migrations/20260815_branch_operational_health_cache.sql
```

### Issue: "No branches showing in mosaic"

**Solution:**
```bash
# Check if you have branches in database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM branches;"

# If >0, trigger initial health computation
curl -X POST http://localhost:3000/api/v1/operational-health/refresh-all \
  -H "Authorization: Bearer YOUR_TOKEN"

# Wait 30 seconds, then check
curl http://localhost:3000/api/v1/operational-health/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Issue: "API returns 401 Unauthorized"

**Solution:**
```typescript
// Ensure authentication middleware is applied
app.use('/api/v1/operational-health', authenticate, healthRoutes);

// Or temporarily disable for testing
app.use('/api/v1/operational-health', healthRoutes);
```

### Issue: "WebSocket not connecting"

**Solution:**
```javascript
// dashboard/lib/websocket/operational-health-socket.ts
// Update WebSocket URL if different
const wsUrl = 'ws://localhost:3000/ws';

// Check WebSocket server is running
// Verify wsServer instance passed to HealthChangePublisher
```

### Issue: "Dashboard shows stale data"

**Solution:**
```typescript
// Force refresh a specific branch
curl -X POST http://localhost:3000/api/v1/operational-health/branches/BRANCH_ID/refresh \
  -H "Authorization: Bearer YOUR_TOKEN"

// Or refresh all
curl -X POST http://localhost:3000/api/v1/operational-health/refresh-all \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Testing the System

### 1. Create a Test Branch with Issues

```sql
-- Simulate a critical branch
UPDATE cameras 
SET online_status = 'offline' 
WHERE branch_id = 'test-branch-id';

-- Wait 30 seconds for refresh or force refresh
-- Then check dashboard - should show branch as CRITICAL
```

### 2. Test Real-Time Updates

```bash
# Terminal 1: Watch WebSocket events
wscat -c ws://localhost:3000/ws

# Terminal 2: Trigger a change
curl -X POST http://localhost:3000/api/v1/operational-health/branches/BRANCH_ID/refresh

# Terminal 1 should show event broadcast
```

### 3. Test Filtering

```bash
# Get only critical branches
curl "http://localhost:3000/api/v1/operational-health/branches?states=CRITICAL" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get branches with retention violations
curl "http://localhost:3000/api/v1/operational-health/branches?retentionViolation=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Performance Optimization Tips

### 1. Database Indexes (Already Created)

The migration creates optimized indexes automatically:
- State filtering (instant)
- Retention violations (partial index)
- Reason code search (GIN index)

### 2. Cache Configuration

```typescript
// Adjust cache TTL if needed
private isCacheStale(health: BranchOperationalHealth): boolean {
  const ageMs = Date.now() - health.updatedAt.getTime();
  return ageMs > 30_000; // 30 seconds (adjust as needed)
}
```

### 3. Auto-Refresh Interval

```typescript
// dashboard/components/operational-health/operational-dashboard.tsx
// Adjust refresh interval
const { summary } = useDashboardSummary(30000); // 30 seconds (adjust as needed)
```

## Monitoring

### Key Metrics to Watch

```sql
-- Cache hit rate (should be >95%)
SELECT 
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '30 seconds') as cache_hits,
  (COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '30 seconds')::float / COUNT(*)::float * 100) as hit_rate
FROM branch_operational_health_current;

-- Event queue depth (should be <100)
SELECT COUNT(*) as unpublished_events
FROM branch_health_change_events
WHERE NOT published;

-- Average health score
SELECT AVG(health_score) as avg_score
FROM branch_operational_health_current;

-- Critical branches count
SELECT COUNT(*) as critical_count
FROM branch_operational_health_current
WHERE overall_state = 'CRITICAL';
```

## Next Steps

Now that your system is running:

1. ✅ **Verify all 400 branches are displayed**
   - Go to `/operations`
   - Click "All Branches" view mode
   - Verify count matches your database

2. ✅ **Test filtering**
   - Click on KPI cards (should filter mosaic)
   - Use search box
   - Test "Needs Attention" mode

3. ✅ **Test branch detail view**
   - Click any branch card
   - Verify component health panels show
   - Check camera wall displays

4. ✅ **Configure monitoring**
   - Set up database query monitoring
   - Monitor API response times
   - Track cache hit rates

5. ✅ **Customize for your needs**
   - Adjust health rules in `rules/` directory
   - Customize colors in frontend components
   - Configure refresh intervals
   - Set up alerts for critical state changes

## Support Resources

- **Backend README**: `backend/src/operational-health/README.md`
- **Frontend README**: `dashboard/components/operational-health/README.md`
- **Implementation Summary**: `IMPLEMENTATION_SUMMARY.md`
- **API Documentation**: Check routes file for endpoint details

## Production Deployment Checklist

Before deploying to production:

- [ ] Run database migration on production database
- [ ] Configure production environment variables
- [ ] Set up monitoring and alerts
- [ ] Test with production data volume
- [ ] Enable WebSocket server
- [ ] Configure auto-refresh cron job
- [ ] Set up logging and error tracking
- [ ] Test failover scenarios
- [ ] Document any customizations
- [ ] Train operations team on new dashboard

## Success! 🎉

If you see the dashboard with your branches displayed, congratulations! Your branch-centric operational health system is now live.

**Key Features Now Available:**
- ✅ Real-time 400-branch monitoring
- ✅ Intelligent health evaluation
- ✅ Interactive filtering and search
- ✅ Detailed branch control-room views
- ✅ Live camera walls
- ✅ WebSocket real-time updates
- ✅ Health history tracking

---

**Need Help?** Check the comprehensive documentation in the README files or review the implementation summary for detailed architecture information.
