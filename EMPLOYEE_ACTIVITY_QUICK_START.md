# Employee Activity Tracking - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Deploy Database (1 minute)
```bash
psql -U your_user -d your_database -f database/migrations/20260808_employee_activity_tracking.sql
```

### Step 2: Backend Already Ready! (0 minutes)
✅ Build is passing  
✅ Routes are registered  
✅ APIs are live at `/v1/activity/*`

### Step 3: Add Frontend Tracking (2 minutes)

**In your root layout file:**
```typescript
import { useActivityTracking } from '@/hooks/useActivityTracker';
import { useAuth } from '@/hooks/useAuth';

export default function RootLayout({ children }) {
  const { accessToken } = useAuth();
  
  useActivityTracking(
    process.env.NEXT_PUBLIC_API_URL,
    accessToken
  );
  
  return <html>{children}</html>;
}
```

**In your control room component:**
```typescript
import { useControlRoomTracking } from '@/hooks/useControlRoomTracking';

function ControlRoom() {
  const { currentBranchId, cameraIds } = useControlRoom();
  
  useControlRoomTracking(currentBranchId, cameraIds);
  
  return <YourControlRoomUI />;
}
```

### Step 4: Add Reports Page (1 minute)

```typescript
// app/activity-report/page.tsx
import EmployeeActivityReport from '@/components/EmployeeActivityReport';

export default function ReportsPage() {
  return (
    <div className="p-6">
      <h1>Employee Activity Reports</h1>
      <EmployeeActivityReport
        apiBaseUrl={process.env.NEXT_PUBLIC_API_URL}
        accessToken={accessToken}
      />
    </div>
  );
}
```

### Step 5: Test (1 minute)

1. Login → Session created ✅
2. Navigate pages → Visits tracked ✅
3. Open control room → Monitoring tracked ✅
4. View `/activity-report` → Reports display ✅
5. Export report → PDF/Excel/CSV work ✅

---

## 📊 What You Get

### Automatic Tracking
- ✅ Login/logout sessions
- ✅ Page visits with time
- ✅ Control room monitoring
- ✅ User actions
- ✅ Engagement metrics

### Reports Available
- ✅ Daily summaries
- ✅ Weekly summaries
- ✅ Monthly summaries
- ✅ Comprehensive reports
- ✅ Export to PDF/Excel/CSV

---

## 🔗 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v1/activity/sessions/start` | Start session |
| POST | `/v1/activity/sessions/:id/end` | End session |
| POST | `/v1/activity/page-visits` | Track page |
| POST | `/v1/activity/control-room/start` | Start monitoring |
| GET | `/v1/activity/current` | Active users now |
| GET | `/v1/activity/sessions` | Query sessions |
| GET | `/v1/activity/summary/daily` | Daily report |
| GET | `/v1/activity/summary/weekly` | Weekly report |
| GET | `/v1/activity/summary/monthly` | Monthly report |
| GET | `/v1/activity/report/comprehensive` | Full report |

---

## 🗄️ Database Tables

11 tables created:
1. `user_activity_sessions` - Login/logout tracking
2. `user_page_visits` - Page navigation
3. `control_room_monitoring_activity` - Branch monitoring
4. `user_action_log` - Action logging
5. `user_current_activity` - Real-time status
6. `user_activity_daily_summary` - Daily aggregates
7. `user_activity_weekly_summary` - Weekly aggregates
8. `user_activity_monthly_summary` - Monthly aggregates
9. `user_activity_module_summary` - Module stats
10. `user_activity_branch_summary` - Branch stats
11. `user_activity_report_cache` - Report caching

---

## 🎯 Quick Test Queries

```sql
-- Active users right now
SELECT * FROM v_active_users_now;

-- Sessions today
SELECT * FROM user_activity_sessions 
WHERE DATE(login_time) = CURRENT_DATE;

-- User's daily summary
SELECT * FROM user_activity_daily_summary 
WHERE user_id = 'USER_ID' 
ORDER BY summary_date DESC LIMIT 7;
```

---

## 📚 Documentation

- **EMPLOYEE_ACTIVITY_TRACKING_COMPLETE.md** - Full documentation
- **EMPLOYEE_ACTIVITY_DEPLOYMENT.md** - Deployment guide
- **EMPLOYEE_ACTIVITY_TRACKING_INTEGRATION.md** - Integration guide
- **EMPLOYEE_ACTIVITY_TRACKING_FINAL_SUMMARY.md** - Summary

---

## 🆘 Troubleshooting

**Sessions not tracking?**
- Check: Is migration applied?
- Check: Is `useActivityTracking` in root?
- Check: Browser console for errors

**Page visits not working?**
- Check: Is session started?
- Check: Navigation (not full reload)
- Enable debug: `{ enableDebugLogs: true }`

**Reports not loading?**
- Check: API endpoint accessible
- Check: User has data for date range
- Check: Browser console for errors

---

## ✅ Status

**Implementation:** 100% Complete  
**Build:** ✅ Passing  
**Documentation:** ✅ Complete  
**Status:** 🚀 Production Ready

---

**Ready to deploy!** 🎉
