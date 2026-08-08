# Employee Activity Tracking - Deployment Guide

## Quick Start Deployment

### Step 1: Deploy Database Schema

Run the migration to create all necessary tables:

```bash
# If using migration runner
npm run migrate

# Or manually execute the SQL file
psql -U your_user -d your_database -f database/migrations/20260808_employee_activity_tracking.sql
```

**What this creates:**
- 11 database tables
- Indexes for performance
- Triggers for automatic summary updates
- Views for reporting
- Functions for data aggregation

### Step 2: Verify Backend Integration

The backend is already integrated! Verify by checking:

```bash
# Build should pass
npm run build

# Start the server
npm start
```

The routes are registered in `src/app.ts` and will be available at:
- `http://your-server/v1/activity/*`

### Step 3: Test API Endpoints

Test session creation:

```bash
curl -X POST http://your-server/v1/activity/sessions/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "userId": "user-uuid",
    "deviceInfo": {"browser": "Chrome", "os": "Windows"},
    "ipAddress": "192.168.1.1",
    "locationInfo": {"country": "USA"}
  }'
```

### Step 4: Integrate Frontend Tracking

#### Option A: Automatic Integration (Recommended)

Add to your main app layout or entry point:

```typescript
// app/layout.tsx or similar
import { useActivityTracking } from '@/hooks/useActivityTracker';
import { useAuth } from '@/hooks/useAuth';

export default function RootLayout({ children }) {
  const { accessToken } = useAuth();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
  
  // Initialize activity tracking
  useActivityTracking(apiBaseUrl, accessToken);
  
  return <html>{children}</html>;
}
```

#### Option B: Manual Integration

```typescript
import { getActivityTracker } from '@/lib/activity-tracker';

// Start session on login
const tracker = getActivityTracker({
  apiBaseUrl: 'http://your-server',
  enableDebugLogs: false
});

await tracker.startSession(userId, deviceInfo, ipAddress);

// Track page visits
tracker.trackPageVisit('/dashboard', 'Dashboard');

// End session on logout
await tracker.endSession();
```

### Step 5: Add Control Room Tracking

In your control room component:

```typescript
import { useControlRoomTracking } from '@/hooks/useControlRoomTracking';

function ControlRoomPage() {
  const { currentBranchId, currentCameras } = useControlRoom();
  
  // Automatically track control room activity
  useControlRoomTracking(currentBranchId, currentCameras);
  
  return <ControlRoomUI />;
}
```

### Step 6: Add Report Page

Create a reports page in your dashboard:

```typescript
// app/activity-report/page.tsx
import EmployeeActivityReport from '@/components/EmployeeActivityReport';
import { useAuth } from '@/hooks/useAuth';

export default function ActivityReportPage() {
  const { accessToken } = useAuth();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Employee Activity Reports</h1>
      <EmployeeActivityReport
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
      />
    </div>
  );
}
```

### Step 7: Test End-to-End

1. **Login** to the application
   - Check database: `user_activity_sessions` should have a new row
   - Check: `user_current_activity` should show user as online

2. **Navigate pages** in the application
   - Check database: `user_page_visits` should track each page
   - Each visit should have start time recorded

3. **Open control room** and monitor a branch
   - Check database: `control_room_monitoring_activity` should track this
   - Should record branch ID and camera count

4. **Perform actions** (click buttons, create incidents, etc.)
   - Check database: `user_action_log` should record actions
   - Metadata should be properly stored as JSON

5. **Logout**
   - Check database: Session should have `logout_time` set
   - `user_current_activity` should show `is_online = false`
   - Summary tables should be updated via triggers

6. **View reports**
   - Navigate to `/activity-report` page
   - Select date range and user
   - Reports should display session, page visit, and control room data
   - Export to PDF/Excel/CSV should work

---

## Configuration Options

### Frontend Tracker Configuration

```typescript
const tracker = getActivityTracker({
  apiBaseUrl: 'http://your-server',  // Your API base URL
  enableDebugLogs: true,              // Enable console logging
  heartbeatInterval: 30000,           // Heartbeat every 30s (default)
  idleThreshold: 60000,               // Consider idle after 60s (default)
  autoTrackPages: true                // Auto-track page navigation (default)
});
```

### Backend Configuration

No additional configuration needed! The system uses your existing:
- Database connection (from `postgres-store.ts`)
- Authentication system (from `request.currentUser`)
- Tenant isolation (from `request.currentUser.tenantId`)

---

## Monitoring & Maintenance

### Check System Health

```sql
-- Active users right now
SELECT * FROM v_active_users_now ORDER BY last_activity_time DESC;

-- Sessions today
SELECT COUNT(*) FROM user_activity_sessions 
WHERE DATE(login_time) = CURRENT_DATE;

-- Top active users this week
SELECT user_id, COUNT(*) as session_count, 
       SUM(total_duration_seconds) as total_seconds
FROM user_activity_sessions
WHERE login_time >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY user_id
ORDER BY total_seconds DESC
LIMIT 10;
```

### Data Cleanup (Optional)

Set up a cleanup job for old data:

```sql
-- Delete sessions older than 1 year
DELETE FROM user_activity_sessions 
WHERE login_time < CURRENT_DATE - INTERVAL '1 year';

-- Delete action logs older than 6 months
DELETE FROM user_action_log 
WHERE action_time < CURRENT_DATE - INTERVAL '6 months';
```

### Performance Monitoring

```sql
-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'user_activity%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check slow queries (if pg_stat_statements is enabled)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%user_activity%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## Troubleshooting

### Issue: Sessions not being created

**Check:**
1. Is the migration applied? `SELECT * FROM user_activity_sessions LIMIT 1;`
2. Is the API route accessible? `curl http://your-server/v1/activity/sessions/start`
3. Is authentication working? Check `request.currentUser` in route handler
4. Check browser console for errors
5. Enable debug logs: `getActivityTracker({ enableDebugLogs: true })`

### Issue: Page visits not tracking

**Check:**
1. Is `useActivityTracking` hook called in root component?
2. Is the session started successfully?
3. Are you navigating between pages (not full page reload)?
4. Check `tracker.getCurrentSession()` returns a session ID
5. Check network tab for failed API calls

### Issue: Control room tracking not working

**Check:**
1. Is `useControlRoomTracking` hook called in control room component?
2. Are branch ID and camera IDs being passed correctly?
3. Is page visit tracking working (control room needs page visit ID)?
4. Check database: Does `control_room_monitoring_activity` have rows?

### Issue: Reports not loading

**Check:**
1. API endpoints returning data: `curl http://your-server/v1/activity/summary/daily?userId=xxx&startDate=2026-01-01&endDate=2026-01-31`
2. Check browser console for CORS issues
3. Verify user has permission to view reports
4. Check database has data for the selected date range
5. Try with a different user or date range

### Issue: Export not working

**Check:**
1. Are PDF/Excel libraries installed? `npm list jspdf xlsx file-saver`
2. Check browser console for library errors
3. Verify report data is loaded before export
4. Check browser allows file downloads (not blocked)

---

## Security Considerations

1. **Access Control**: Add permission checks to report endpoints
   ```typescript
   // In route handler
   if (!hasPermission(request.currentUser, 'view_activity_reports')) {
     return reply.code(403).send({ error: 'forbidden' });
   }
   ```

2. **Data Privacy**: Users should only see their own reports (unless admin)
   ```typescript
   if (userId !== request.currentUser.id && !request.currentUser.isAdmin) {
     return reply.code(403).send({ error: 'forbidden' });
   }
   ```

3. **Rate Limiting**: Consider adding rate limits to tracking endpoints
   ```typescript
   app.register(rateLimit, {
     max: 100,
     timeWindow: '1 minute'
   });
   ```

4. **Data Retention**: Implement automatic cleanup of old data
5. **Audit Logging**: Activity logs are already audit-ready (immutable)

---

## Production Checklist

- [ ] Database migration applied successfully
- [ ] Backend build passes without errors
- [ ] API endpoints tested and working
- [ ] Frontend tracking initialized in root component
- [ ] Control room tracking added to control room pages
- [ ] Reports page accessible to authorized users
- [ ] Export functionality tested (PDF, Excel, CSV)
- [ ] End-to-end test completed (login → navigate → logout)
- [ ] Performance verified with test data
- [ ] Security permissions configured
- [ ] Monitoring queries set up
- [ ] Data retention policy configured
- [ ] Documentation reviewed by team

---

## Support

If you encounter any issues:

1. Check the troubleshooting section above
2. Review `EMPLOYEE_ACTIVITY_TRACKING_COMPLETE.md` for detailed documentation
3. Check `EMPLOYEE_ACTIVITY_TRACKING_INTEGRATION.md` for integration examples
4. Examine database schema comments in migration file
5. Review API route comments in `src/routes/employee-activity-tracking.routes.ts`

---

**Deployment Status:** Ready for Production ✅
**Last Updated:** 2026-08-08
