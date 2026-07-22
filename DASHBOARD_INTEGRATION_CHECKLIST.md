# Dashboard & Reports Integration Checklist

## Pre-Integration Verification

### Prerequisites
- [ ] PostgreSQL 13+ database running
- [ ] Node.js 18+ installed
- [ ] Backend services operational
- [ ] Frontend build system configured
- [ ] Authentication system active
- [ ] Organization hierarchy populated

### Required Tables
- [ ] `tenants` table exists
- [ ] `users` table exists
- [ ] `organization_nodes` table exists
- [ ] `cameras` table exists
- [ ] `incidents` table exists
- [ ] `maintenance_work_orders` table exists
- [ ] `analytics_alerts` table exists

## Phase 1: Database Setup

### Step 1: Run Migration
```bash
# Connect to database
psql -h localhost -U postgres -d sentinel_db

# Run migration script
\i database/migrations/20260723_reporting_dashboard_schema.sql

# Verify tables created
\dt+ dashboard_*
\dt+ report_*
\dt+ *_daily
\dt+ *_metrics_*
```

### Step 2: Verify Schema
```sql
-- Check dashboard tables
SELECT COUNT(*) FROM dashboard_definitions;
SELECT COUNT(*) FROM dashboard_widgets;

-- Check report tables
SELECT COUNT(*) FROM report_definitions;
SELECT COUNT(*) FROM report_schedules;

-- Check metrics tables
SELECT COUNT(*) FROM camera_health_daily;
SELECT COUNT(*) FROM system_health_scores;
```

### Step 3: Create Indexes
```sql
-- Verify critical indexes exist
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE tablename LIKE '%_daily' 
   OR tablename LIKE '%_metrics_%'
ORDER BY tablename, indexname;
```

### Step 4: Set Up Sample Data (Development Only)
```sql
-- Insert default dashboard definition
INSERT INTO dashboard_definitions (
  tenant_id, name, slug, target_role, layout_config
) VALUES (
  'default-tenant-id',
  'Executive Operations Dashboard',
  'executive-ops',
  'executive',
  '{}'::jsonb
);

-- Insert default report definitions
INSERT INTO report_definitions (
  tenant_id, name, slug, report_type, category, query_config
) VALUES
  ('default-tenant-id', 'Camera Health Report', 'camera-health', 'camera_health', 'operational', '{}'::jsonb),
  ('default-tenant-id', 'Recording Status Report', 'recording-status', 'recording_status', 'operational', '{}'::jsonb),
  ('default-tenant-id', 'Incident Register', 'incident-register', 'incidents', 'compliance', '{}'::jsonb);
```

### Step 5: Set Up Metric Thresholds
```sql
-- Insert default thresholds
INSERT INTO metric_thresholds (
  tenant_id, metric_name, metric_type, warning_threshold, critical_threshold, threshold_direction, unit
) VALUES
  ('default-tenant-id', 'Camera Availability', 'camera_availability', 98.00, 95.00, 'below', 'percentage'),
  ('default-tenant-id', 'Recording Availability', 'recording_availability', 99.00, 97.00, 'below', 'percentage'),
  ('default-tenant-id', 'Storage Utilization', 'storage_utilization', 80.00, 90.00, 'above', 'percentage'),
  ('default-tenant-id', 'Camera Offline Duration', 'camera_offline', 5.00, 30.00, 'above', 'minutes');
```

## Phase 2: Backend Integration

### Step 1: Install Dependencies
```bash
cd backend

# Check package.json for required dependencies
npm install

# Verify TypeScript compilation
npm run build
```

### Step 2: Register Services
```typescript
// backend/src/index.ts or app.ts

import { dashboardService } from './services/dashboard.service';
import { reportsService } from './services/reports.service';

// Services are now available for import
```

### Step 3: Register Routes
```typescript
// backend/src/routes/index.ts

import dashboardRoutes from './routes/dashboard.routes';
import reportsRoutes from './routes/reports.routes';

// Register routes
app.use('/v1/dashboard', dashboardRoutes);
app.use('/v1/reports', reportsRoutes);
```

### Step 4: Configure Middleware
```typescript
// backend/src/middleware/context.middleware.ts

// Ensure req.context includes:
interface RequestContext {
  tenantId: string;
  userId: string;
  userScope?: {
    branchIds?: string[];
    regionIds?: string[];
  };
}
```

### Step 5: Test Backend Endpoints
```bash
# Start backend server
npm run dev

# Test dashboard endpoints
curl http://localhost:3000/api/control/v1/dashboard/summary
curl http://localhost:3000/api/control/v1/dashboard/camera-health

# Test report endpoints
curl http://localhost:3000/api/control/v1/reports/camera-health
```

### Step 6: Verify Database Connections
```bash
# Check connection pool
# Look for successful database connections in logs

# Test query execution
# Verify no connection errors
```

## Phase 3: Frontend Integration

### Step 1: Update API Client
```bash
cd dashboard

# Verify api-client.ts includes new exports
grep -A 5 "dashboardApi" lib/api-client.ts
grep -A 5 "reportsApi" lib/api-client.ts
```

### Step 2: Build Dashboard Page
```bash
# Verify dashboard page exists
ls -l app/dashboards/page.tsx

# Check for compilation errors
npm run build
```

### Step 3: Update Navigation
```typescript
// components/app-layout.tsx or navigation component

// Add dashboard link
{
  name: 'Dashboard',
  href: '/dashboards',
  icon: DashboardIcon
}

// Add reports link  
{
  name: 'Reports',
  href: '/reports',
  icon: DocumentReportIcon
}
```

### Step 4: Test Dashboard Locally
```bash
# Start development server
npm run dev

# Open browser to http://localhost:3001/dashboards
# Verify all widgets load
# Check browser console for errors
```

### Step 5: Test Data Refresh
```javascript
// In browser console
// Watch network tab for API calls every 30 seconds
// Verify no failed requests
// Check response times
```

## Phase 4: Data Aggregation Setup

### Step 1: Create Aggregation Script
```bash
# Create scripts/aggregate-daily-metrics.ts

import { pool } from '../backend/src/config/database';

async function aggregateCameraHealthDaily() {
  // Insert daily summaries from camera status
  await pool.query(`
    INSERT INTO camera_health_daily (
      tenant_id, camera_id, branch_node_id, summary_date,
      online_minutes, offline_minutes, availability_percentage
    )
    SELECT 
      tenant_id, id, branch_node_id, CURRENT_DATE,
      -- Calculate from status history
    FROM cameras
    ON CONFLICT (camera_id, summary_date) DO UPDATE SET ...
  `);
}

// Export all aggregation functions
```

### Step 2: Set Up Cron Jobs
```bash
# Add to crontab or use node-cron

# Daily at 1 AM - Aggregate previous day metrics
0 1 * * * node scripts/aggregate-daily-metrics.js

# Every 15 minutes - Update system health scores
*/15 * * * * node scripts/calculate-health-scores.js

# Hourly - Update storage forecasts
0 * * * * node scripts/forecast-storage-capacity.js
```

### Step 3: Create Health Score Calculator
```typescript
// scripts/calculate-health-scores.ts

async function calculateSystemHealth(tenantId: string) {
  // Get component scores
  const cameraAvailability = await getCameraAvailability(tenantId);
  const recordingAvailability = await getRecordingAvailability(tenantId);
  // ... other components
  
  // Calculate weighted score
  const overallScore = 
    (cameraAvailability * 0.25) +
    (recordingAvailability * 0.25) +
    // ... other weights
  
  // Insert into system_health_scores
  await pool.query(`
    INSERT INTO system_health_scores (
      tenant_id, overall_score, ...
    ) VALUES ($1, $2, ...)
  `, [tenantId, overallScore, ...]);
}
```

### Step 4: Test Aggregation Scripts
```bash
# Run manually first
node scripts/aggregate-daily-metrics.js

# Verify data inserted
psql -d sentinel_db -c "SELECT COUNT(*) FROM camera_health_daily WHERE summary_date = CURRENT_DATE;"

# Run health score calculation
node scripts/calculate-health-scores.js

# Verify scores calculated
psql -d sentinel_db -c "SELECT * FROM system_health_scores ORDER BY score_time DESC LIMIT 5;"
```

## Phase 5: Permission Configuration

### Step 1: Define Permissions
```sql
-- Insert dashboard permissions
INSERT INTO permissions (name, category, description) VALUES
  ('dashboard:view', 'dashboard', 'View dashboards'),
  ('dashboard:configure', 'dashboard', 'Configure dashboard layout'),
  ('report:view', 'reports', 'View reports'),
  ('report:create', 'reports', 'Create ad-hoc reports'),
  ('report:schedule', 'reports', 'Schedule automated reports'),
  ('report:export', 'reports', 'Export report data'),
  ('camera-health-report:view', 'reports', 'View camera health reports'),
  ('incident-report:view', 'reports', 'View incident reports');
```

### Step 2: Assign to Roles
```sql
-- Control room operator
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'control_room_operator'
  AND p.name IN ('dashboard:view', 'report:view', 'camera-health-report:view');

-- Branch manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'branch_manager'
  AND p.name IN ('dashboard:view', 'report:view', 'report:export');

-- Executive
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'executive'
  AND p.name IN ('dashboard:view', 'report:view', 'report:export');
```

### Step 3: Test Permission Enforcement
```bash
# Login as different roles
# Verify dashboard access
# Test report generation
# Check export capabilities
```

## Phase 6: Testing & Validation

### Unit Tests
```bash
# Run backend unit tests
cd backend
npm run test

# Verify tests pass for:
# - dashboard.service.ts
# - reports.service.ts
```

### Integration Tests
```bash
# Run integration tests
npm run test:integration

# Test scenarios:
# - Dashboard data fetching
# - Report generation with filters
# - Scope enforcement
# - Export audit logging
```

### Performance Tests
```bash
# Load test dashboard endpoint
ab -n 100 -c 10 http://localhost:3000/api/control/v1/dashboard/summary

# Verify response time < 500ms
# Check for no errors

# Test report generation
ab -n 20 -c 5 http://localhost:3000/api/control/v1/reports/camera-health
```

### End-to-End Tests
```bash
# Start Cypress or Playwright
npm run test:e2e

# Test scenarios:
# - User logs in
# - Navigates to dashboard
# - All widgets load successfully
# - Data refreshes automatically
# - User generates report
# - Export works correctly
```

## Phase 7: Deployment

### Step 1: Database Migration
```bash
# Production database
psql -h prod-db-host -U postgres -d sentinel_prod

# Run migration with backup
pg_dump sentinel_prod > backup_before_dashboard_migration.sql
\i database/migrations/20260723_reporting_dashboard_schema.sql
```

### Step 2: Deploy Backend
```bash
# Build backend
cd backend
npm run build

# Deploy to production
# Copy dist/ to production server
# Restart backend services
pm2 restart backend
```

### Step 3: Deploy Frontend
```bash
# Build frontend
cd dashboard
npm run build

# Deploy to production
# Copy .next/ to production server
# Restart frontend service
pm2 restart dashboard
```

### Step 4: Start Aggregation Jobs
```bash
# Production cron setup
crontab -e

# Add jobs
0 1 * * * /usr/bin/node /opt/sentinel/scripts/aggregate-daily-metrics.js
*/15 * * * * /usr/bin/node /opt/sentinel/scripts/calculate-health-scores.js
0 * * * * /usr/bin/node /opt/sentinel/scripts/forecast-storage-capacity.js
```

### Step 5: Verify Deployment
```bash
# Check backend health
curl https://prod-domain.com/api/control/health

# Test dashboard
curl https://prod-domain.com/api/control/v1/dashboard/summary

# Check logs for errors
tail -f /var/log/sentinel/backend.log
tail -f /var/log/sentinel/dashboard.log
```

## Phase 8: Monitoring Setup

### Application Monitoring
```javascript
// Configure application monitoring
// Add to backend/src/monitoring.ts

import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1
});

// Track dashboard performance
app.use('/v1/dashboard/*', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.recordDashboardLoadTime(req.path, duration);
  });
  next();
});
```

### Database Monitoring
```sql
-- Create monitoring view
CREATE VIEW dashboard_health AS
SELECT 
  'camera_health_daily' as table_name,
  MAX(summary_date) as latest_data,
  COUNT(*) as record_count
FROM camera_health_daily
UNION ALL
SELECT 
  'system_health_scores',
  MAX(score_time::date),
  COUNT(*)
FROM system_health_scores;

-- Query periodically
SELECT * FROM dashboard_health;
```

### Alerting
```yaml
# Prometheus alerts.yml

groups:
  - name: dashboard_alerts
    rules:
      - alert: DashboardHighLatency
        expr: dashboard_load_time_seconds > 2
        for: 5m
        annotations:
          summary: "Dashboard loading slowly"
          
      - alert: ReportGenerationFailed
        expr: rate(report_generation_failures[5m]) > 0.1
        annotations:
          summary: "High report failure rate"
          
      - alert: StaleDataWarning
        expr: time() - dashboard_last_update_timestamp > 300
        annotations:
          summary: "Dashboard data is stale"
```

## Phase 9: User Training

### Control Room Operators
- [ ] Dashboard overview training
- [ ] Alert management
- [ ] Quick incident reporting
- [ ] Camera status monitoring

### Branch Managers
- [ ] Branch-specific dashboard
- [ ] Report generation
- [ ] Export procedures
- [ ] Maintenance tracking

### Security Managers
- [ ] Regional dashboard
- [ ] Trend analysis
- [ ] Vendor performance
- [ ] Compliance reporting

### Executives
- [ ] Executive dashboard briefing
- [ ] Key metrics interpretation
- [ ] Strategic decision support
- [ ] Board reporting

## Phase 10: Post-Deployment Validation

### Week 1 Checks
- [ ] Monitor dashboard load times
- [ ] Check aggregation job success
- [ ] Verify report generation
- [ ] Review error logs
- [ ] Gather user feedback

### Week 2 Checks
- [ ] Analyze usage patterns
- [ ] Optimize slow queries
- [ ] Adjust refresh intervals
- [ ] Fine-tune thresholds
- [ ] Address user issues

### Month 1 Review
- [ ] Performance benchmarks met
- [ ] User satisfaction survey
- [ ] Feature adoption rate
- [ ] Technical debt assessment
- [ ] Enhancement prioritization

## Rollback Procedure

### If Issues Occur
```bash
# Stop new services
pm2 stop dashboard
pm2 stop backend

# Restore database
psql -d sentinel_prod < backup_before_dashboard_migration.sql

# Revert code
git revert <dashboard-commit-hash>
git push

# Restart old version
pm2 start backend
pm2 start dashboard

# Notify users
echo "Dashboard temporarily unavailable" > /var/www/maintenance.html
```

## Success Criteria

### Technical
- [ ] All API endpoints respond < 500ms
- [ ] Dashboard loads < 2 seconds
- [ ] No critical errors in logs
- [ ] Data refreshes automatically
- [ ] Reports generate successfully
- [ ] Exports work correctly

### Functional
- [ ] All widgets display correct data
- [ ] Filters work as expected
- [ ] Drill-down navigation works
- [ ] Permissions enforced correctly
- [ ] Email delivery operational
- [ ] Audit logging complete

### User Acceptance
- [ ] Users can access dashboard
- [ ] Data is accurate and timely
- [ ] Interface is intuitive
- [ ] Reports meet requirements
- [ ] Performance is acceptable
- [ ] No blocking issues

## Support Plan

### First 48 Hours
- On-call support team available 24/7
- Monitor logs and metrics continuously
- Respond to issues within 15 minutes
- Daily status updates to stakeholders

### First Week
- Daily health checks
- User feedback sessions
- Performance optimization
- Bug fixes deployed daily

### First Month
- Weekly review meetings
- Feature enhancement planning
- Documentation updates
- User training sessions

## Contact Information

### Technical Support
- Email: devops@example.com
- Slack: #dashboard-deployment
- Phone: +1-XXX-XXX-XXXX (Emergency)

### Product Team
- Email: product@example.com
- Slack: #product-dashboard

### Management
- Email: management@example.com
- Phone: +1-XXX-XXX-XXXX

---

**Integration Lead:** [Name]
**Target Completion:** [Date]
**Status:** [ ] Not Started [ ] In Progress [ ] Complete
**Last Updated:** July 23, 2026
