# Employee Activity Tracking System - Integration Guide

## Overview

This comprehensive employee activity tracking system monitors every user action from login to logout, including:

- **Session tracking**: Login/logout times, session duration, active vs idle time
- **Page visits**: Track every page visited with time spent and interaction metrics
- **Control room monitoring**: Track which branches/groups are being monitored and for how long
- **Action logging**: Log all user actions (clicks, searches, exports, etc.)
- **Comprehensive reports**: Daily, weekly, and monthly activity summaries

## System Components

### 1. Database Schema
- **Location**: `database/migrations/20260808_employee_activity_tracking.sql`
- **Tables**: 
  - `user_activity_sessions` - Complete session tracking
  - `user_page_visits` - Page visit history with interaction metrics
  - `control_room_monitoring_activity` - Branch/camera monitoring tracking
  - `user_action_log` - Detailed action logging
  - `user_activity_daily_summary` - Daily aggregated metrics
  - `user_activity_weekly_summary` - Weekly summaries
  - `user_activity_monthly_summary` - Monthly summaries
  - `user_current_activity` - Real-time activity status

### 2. Backend API Routes
- **Location**: `src/routes/employee-activity-tracking.routes.ts`
- **Endpoints**:
  - `POST /v1/activity/sessions/start` - Start tracking session
  - `POST /v1/activity/sessions/:id/end` - End tracking session
  - `POST /v1/activity/heartbeat` - Keep session alive
  - `POST /v1/activity/page-visits` - Track page visit
  - `PUT /v1/activity/page-visits/:id/end` - End page visit
  - `POST /v1/activity/control-room/start` - Start control room monitoring
  - `PUT /v1/activity/control-room/:id/end` - End control room monitoring
  - `POST /v1/activity/actions` - Log user action
  - `GET /v1/activity/sessions` - Get session history
  - `GET /v1/activity/summary/daily` - Get daily summaries
  - `GET /v1/activity/summary/weekly` - Get weekly summaries
  - `GET /v1/activity/summary/monthly` - Get monthly summaries
  - `GET /v1/activity/report/comprehensive` - Get full activity report

### 3. Frontend Tracking Library
- **Location**: `dashboard/lib/activity-tracker.ts`
- **Features**:
  - Automatic session management
  - Page visit tracking
  - Idle detection
  - Click, scroll, and interaction tracking
  - Heartbeat mechanism
  - BeforeUnload data preservation

### 4. React Hooks
- **Location**: `dashboard/hooks/useActivityTracker.ts`
- **Hooks**:
  - `useActivityTracking` - Initialize tracking
  - `usePageTracking` - Auto-track page visits
  - `useActionTracking` - Track user actions
  - `useButtonTracking` - Track button clicks
  - `useFormTracking` - Track form submissions
  - `useSearchTracking` - Track searches
  - `useExportTracking` - Track data exports

### 5. Control Room Tracker
- **Location**: `dashboard/lib/control-room-tracker.ts`
- **Hook**: `dashboard/hooks/useControlRoomTracking.ts`
- **Features**:
  - Track branch monitoring
  - Track branch group monitoring
  - Count alerts, incidents, camera switches
  - Periodic updates to backend

### 6. Report UI Component
- **Location**: `dashboard/components/EmployeeActivityReport.tsx`
- **Features**:
  - Comprehensive activity visualization
  - Date range filters
  - Module usage breakdown
  - Control room activity details
  - Branch monitoring breakdown
  - Export to PDF, Excel, CSV

## Integration Steps

### Step 1: Run Database Migration

```bash
# Run the migration to create all tables
psql -U your_user -d your_database -f database/migrations/20260808_employee_activity_tracking.sql
```

### Step 2: Initialize Activity Tracking in Your App

```typescript
// In your main app layout or component
import { useEffect } from 'react';
import { getActivityTracker } from '@/lib/activity-tracker';

function App() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
  const accessToken = // ... get from your auth system
  
  useEffect(() => {
    const tracker = getActivityTracker({
      apiBaseUrl,
      heartbeatInterval: 30000, // 30 seconds
      idleThreshold: 120000, // 2 minutes
      enableDebugLogs: process.env.NODE_ENV === 'development',
    });
    
    tracker.initialize();
    
    // Start session on login
    if (accessToken) {
      tracker.startSession(userId, accessToken);
    }
    
    return () => {
      if (accessToken) {
        tracker.endSession(accessToken);
      }
    };
  }, [accessToken]);
  
  return <YourApp />;
}
```

### Step 3: Track Page Visits

```typescript
// In each page component
import { usePageTracking } from '@/hooks/useActivityTracker';

function DashboardPage() {
  usePageTracking('dashboard', 'monitoring', {
    pageTitle: 'Main Dashboard',
    enabled: true,
  });
  
  return <div>Your dashboard content</div>;
}
```

### Step 4: Track User Actions

```typescript
// Track button clicks
import { useButtonTracking } from '@/hooks/useActivityTracker';

function MyComponent() {
  const trackButtonClick = useButtonTracking('camera_management');
  
  const handleExport = () => {
    trackButtonClick('export_cameras', {
      featureName: 'bulk_export',
      metadata: { format: 'csv', count: 50 },
    });
    // ... your export logic
  };
  
  return <button onClick={handleExport}>Export</button>;
}
```

### Step 5: Track Control Room Activity

```typescript
// In your control room component
import { useControlRoomTracking } from '@/hooks/useControlRoomTracking';

function ControlRoom() {
  const {
    startBranchMonitoring,
    switchBranch,
    endCurrentActivity,
    incrementAlertCount,
  } = useControlRoomTracking({
    apiBaseUrl,
    sessionId,
    accessToken,
  });
  
  const handleSelectBranch = async (branchId, branchName, cameraIds) => {
    await startBranchMonitoring(branchId, branchName, cameraIds, 'live');
  };
  
  const handleAlertReceived = () => {
    incrementAlertCount();
  };
  
  return <div>Your control room UI</div>;
}
```

### Step 6: Add Activity Report Page

```typescript
// Create a route for the activity report
// app/activity-report/page.tsx (already created)

// Add to your navigation
<Link href="/activity-report">
  Activity Reports
</Link>
```

## Usage Examples

### Track Form Submission

```typescript
import { useFormTracking } from '@/hooks/useActivityTracker';

function CameraForm() {
  const { trackFormSubmit } = useFormTracking('camera_management', 'add_camera_form');
  
  const handleSubmit = async (data) => {
    try {
      await saveCamera(data);
      trackFormSubmit(true, { cameraCount: 1 });
    } catch (error) {
      trackFormSubmit(false, { error: error.message });
    }
  };
}
```

### Track Search

```typescript
import { useSearchTracking } from '@/hooks/useActivityTracker';

function SearchBar() {
  const trackSearch = useSearchTracking('incident_search');
  
  const handleSearch = async (query) => {
    const results = await searchIncidents(query);
    trackSearch(query, results.length, 'incident_finder');
  };
}
```

### Track Export

```typescript
import { useExportTracking } from '@/hooks/useActivityTracker';

function ReportExport() {
  const trackExport = useExportTracking('reports');
  
  const handleExport = async () => {
    const data = await generateReport();
    exportToCSV(data);
    trackExport('camera_status_report', data.length, 'csv');
  };
}
```

## Report Features

### Daily Reports
- Total sessions and duration
- Module usage breakdown
- Control room activity
- Action counts

### Weekly Reports
- Working days count
- Activity consistency
- Top modules used
- Most/least active days

### Monthly Reports
- Month-over-month trends
- Module diversity score
- Branch monitoring breakdown
- Productivity metrics

### Comprehensive Report
- Complete period overview
- Session timeline
- Detailed module usage with percentages
- Branch-by-branch monitoring details
- Control room metrics (alerts, incidents, switches)
- Action category breakdown

## Export Formats

### PDF Export
- Professional formatted report
- Includes all charts and tables
- Print-ready layout
- Generated via browser print dialog

### Excel/CSV Export
- Structured data for analysis
- Separate sheets for each section
- Import into analytics tools
- Share with stakeholders

## Performance Considerations

1. **Heartbeat Interval**: Default 30 seconds (adjustable)
2. **Idle Detection**: Default 2 minutes (adjustable)
3. **Data Aggregation**: Daily summaries generated automatically
4. **Batch Updates**: Control room metrics updated every 30 seconds
5. **BeforeUnload**: Uses navigator.sendBeacon for reliable data transmission

## Privacy & Compliance

- All tracking is transparent to users
- Data is stored securely with tenant isolation
- Access controls via existing permission system
- Audit trail for all activity
- GDPR-compliant data retention policies (configurable)
- Export capabilities for data subject requests

## Administration

### View Active Users
```typescript
const response = await fetch(`${apiBaseUrl}/v1/activity/current`, {
  headers: { Authorization: `Bearer ${accessToken}` }
});
const { data } = await response.json();
// Shows all currently active users and what they're doing
```

### Generate Reports for Any User
```typescript
const response = await fetch(
  `${apiBaseUrl}/v1/activity/report/comprehensive?userId=${userId}&startDate=${start}&endDate=${end}`,
  { headers: { Authorization: `Bearer ${accessToken}` } }
);
```

### Trigger Manual Summary Update
```sql
SELECT update_user_daily_activity_summary(
  'user-id'::uuid,
  CURRENT_DATE
);
```

## Troubleshooting

### Sessions Not Starting
- Check that accessToken is valid
- Verify backend routes are registered
- Check browser console for errors
- Ensure database tables exist

### Page Visits Not Tracking
- Verify `usePageTracking` hook is called
- Check that session exists
- Verify API endpoint connectivity

### Control Room Tracking Not Working
- Ensure session and page visit IDs are provided
- Check that monitoring is started before increments
- Verify periodic updates are running

### Reports Not Loading
- Check date range is valid
- Verify user has permission to view reports
- Check for database connectivity
- Review backend logs for errors

## Support & Maintenance

For questions or issues:
1. Check backend logs: Look for activity tracking errors
2. Check browser console: Look for frontend tracking errors
3. Verify database: Check that data is being inserted
4. Review API responses: Use browser network tab

## Future Enhancements

Potential additions:
- Real-time dashboard of active users
- Heatmaps of most-used features
- Productivity scoring algorithms
- Anomaly detection for unusual patterns
- Manager dashboards for team overview
- Goal tracking and KPIs
- Integration with performance reviews
