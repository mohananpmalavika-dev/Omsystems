# Employee Activity Monitoring System

## Overview

This document describes the comprehensive end-to-end employee activity monitoring system that tracks all user activities from login to logout across the Sentinel Grid dashboard.

## Architecture

### Components

1. **ActivityMonitor** (`dashboard/components/activity-monitor.tsx`)
   - Root-level component that initializes tracking on app mount
   - Automatically starts sessions when users log in
   - Tracks page visits on navigation changes
   - Monitors user interactions (clicks, scrolls, keyboard, forms)
   - Handles idle detection (2 minutes of inactivity)
   - Sends heartbeat every 30 seconds to keep session alive
   - Recovers sessions from sessionStorage on page refresh
   - Cleans up sessions on logout or unmount

2. **Activity Tracking Hooks** (`dashboard/hooks/useActivityTracking.ts`)
   - `useActionTracking` - Track general user actions
   - `useButtonTracking` - Track button clicks
   - `useFormTracking` - Track form submissions and field changes
   - `useSearchTracking` - Track search queries
   - `useExportTracking` - Track data exports
   - `useFilterTracking` - Track filter changes
   - `useCameraTracking` - Track camera operations (view, switch, PTZ, snapshot)
   - `usePlaybackTracking` - Track playback operations
   - `useIncidentTracking` - Track incident management actions
   - `useAlertTracking` - Track alert response actions

3. **Control Room Tracker** (`dashboard/lib/control-room-tracker.ts`)
   - Specialized tracking for control room monitoring sessions
   - Tracks monitoring type (single branch, branch group, multi-branch, etc.)
   - Monitors metrics: alerts, incidents, camera switches, playbacks, snapshots, exports
   - Automatic metric batching to reduce API calls

4. **Auth Manager** (`dashboard/lib/auth-manager.ts`)
   - Handles login/logout with activity tracking integration
   - Ensures activity sessions are properly ended before logout
   - Cleans up all tracking-related storage

5. **Live Activity Status** (`dashboard/components/live-activity-status.tsx`)
   - Real-time display of currently active operators
   - Shows current activity, module, and control room status
   - Polls every 30 seconds for updates

## Data Flow

### Login Flow
```
1. User submits login credentials
2. Authentication successful
3. User data stored in localStorage
4. ActivityMonitor detects logged-in user
5. Session started via /v1/activity/sessions/start
6. Session ID stored in sessionStorage
7. Heartbeat timer started (30s interval)
8. Page visit tracking begins
```

### Page Navigation Flow
```
1. User navigates to new page
2. ActivityMonitor detects pathname change
3. Previous page visit ended via /v1/activity/page-visits/{id}/end
   - Duration calculated
   - Metrics sent (clicks, scroll depth, form interactions, idle time)
4. New page visit started via /v1/activity/page-visits
5. Activity listeners reset
6. Idle timer reset
```

### User Interaction Flow
```
1. User performs action (click, scroll, keyboard, form input)
2. Activity detected by event listeners
3. Metrics updated (click count, scroll depth, form interactions)
4. Idle timer reset
5. If was idle, mark as active and update time tracking
```

### Logout Flow
```
1. User clicks logout button
2. Auth manager's logout() called
3. Current page visit ended
4. Activity session ended via /v1/activity/sessions/{id}/end
5. All tracking storage cleared
6. User redirected to login page
```

## Database Schema

### Core Tables

1. **user_activity_sessions**
   - Tracks complete user sessions from login to logout
   - Fields: session_id, user_id, login_time, logout_time, duration, device_info, ip_address, session_status

2. **user_page_visits**
   - Tracks each page visit within a session
   - Fields: page_visit_id, session_id, page_path, page_module, visit_start_time, visit_end_time, duration, click_count, scroll_depth, form_interactions

3. **control_room_monitoring_activity**
   - Tracks control room monitoring sessions
   - Fields: activity_id, session_id, monitoring_type, branch_ids, camera_ids, monitoring_start_time, monitoring_end_time, alert_count, incident_count, camera_switch_count

4. **user_action_log**
   - Tracks individual user actions
   - Fields: action_id, session_id, page_visit_id, action_type, action_category, action_target, module_name, action_time

5. **user_current_activity**
   - Real-time snapshot of current user activity
   - Fields: user_id, is_online, current_page_path, current_module, is_in_control_room, current_branch_name, monitoring_camera_count, last_activity_time

### Summary Tables

1. **user_activity_daily_summary**
   - Aggregated daily metrics per user
   - Auto-updated via database trigger

2. **user_activity_weekly_summary**
   - Aggregated weekly metrics per user

3. **user_activity_monthly_summary**
   - Aggregated monthly metrics per user

## API Endpoints

### Session Management
- `POST /v1/activity/sessions/start` - Start activity session
- `POST /v1/activity/sessions/{id}/end` - End activity session
- `POST /v1/activity/heartbeat` - Update session heartbeat

### Page Visit Tracking
- `POST /v1/activity/page-visits` - Track page visit
- `PUT /v1/activity/page-visits/{id}/end` - End page visit

### Control Room Activity
- `POST /v1/activity/control-room/start` - Start control room activity
- `PUT /v1/activity/control-room/{id}/end` - End control room activity
- `PATCH /v1/activity/control-room/{id}` - Update control room metrics

### Action Tracking
- `POST /v1/activity/actions` - Log user action

### Current Activity
- `GET /v1/activity/current` - Get all active users (admin)
- `GET /v1/activity/current/me` - Get current user's activity

### Reports
- `GET /v1/activity/sessions` - Get session history
- `GET /v1/activity/page-visits` - Get page visit history
- `GET /v1/activity/control-room` - Get control room activity history
- `GET /v1/activity/summary/daily` - Get daily summary
- `GET /v1/activity/summary/weekly` - Get weekly summary
- `GET /v1/activity/summary/monthly` - Get monthly summary
- `GET /v1/activity/report/comprehensive` - Get comprehensive report

## Integration Guide

### Tracking Custom Actions

```typescript
import { useActionTracking } from '@/hooks/useActivityTracking';

function MyComponent() {
  const trackAction = useActionTracking('my_module');
  
  const handleCustomAction = () => {
    // Your logic here
    
    // Track the action
    trackAction('custom_action', 'data_view', {
      actionTarget: 'some_target',
      actionDescription: 'User performed custom action',
      featureName: 'my_feature',
      actionMetadata: {
        customField: 'value',
      },
    });
  };
  
  return <button onClick={handleCustomAction}>Do Something</button>;
}
```

### Tracking Button Clicks

```typescript
import { useButtonTracking } from '@/hooks/useActivityTracking';

function MyComponent() {
  const trackButton = useButtonTracking('my_module');
  
  return (
    <button onClick={() => {
      trackButton('submit_form', { featureName: 'user_registration' });
      // Handle submit
    }}>
      Submit
    </button>
  );
}
```

### Tracking Form Submissions

```typescript
import { useFormTracking } from '@/hooks/useActivityTracking';

function MyComponent() {
  const { trackFormSubmit } = useFormTracking('my_module', 'registration_form');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await submitForm();
      trackFormSubmit(true, { formData: 'metadata' });
    } catch (error) {
      trackFormSubmit(false, { error: error.message });
    }
  };
  
  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Tracking Control Room Activity

```typescript
import { 
  startControlRoomActivity, 
  endControlRoomActivity,
  trackControlRoomCameraSwitch,
  trackControlRoomAlert,
  trackControlRoomIncident 
} from '@/lib/control-room-tracker';

function ControlRoomComponent() {
  useEffect(() => {
    // Start tracking when entering control room
    const activityId = await startControlRoomActivity(
      'single_branch',
      branchId,
      undefined,
      undefined,
      cameraIds,
      [branchId],
      [branchName],
      'live'
    );
    
    return () => {
      // End tracking when leaving control room
      endControlRoomActivity();
    };
  }, [branchId]);
  
  const handleCameraSwitch = (fromId, toId, toName) => {
    // Switch camera logic
    trackControlRoomCameraSwitch();
  };
  
  const handleAlert = () => {
    // Handle alert logic
    trackControlRoomAlert();
  };
  
  const handleIncident = () => {
    // Create incident logic
    trackControlRoomIncident();
  };
}
```

### Displaying Live Activity Status

```typescript
import { LiveActivityStatus } from '@/components/live-activity-status';

function AdminDashboard() {
  return (
    <div>
      <h1>Active Operators</h1>
      <LiveActivityStatus 
        apiBaseUrl="/api/control"
        refreshInterval={30000}
        maxUsers={20}
      />
    </div>
  );
}
```

## Metrics Tracked

### Session Metrics
- Total sessions
- Total duration (active + idle)
- Active duration (actual interaction time)
- Idle duration (no activity for 2+ minutes)
- Average session duration
- First login time
- Last logout time
- Device information
- IP address
- Geographic location (if available)

### Page Visit Metrics
- Page path and module
- Visit duration
- Active time on page
- Idle time on page
- Click count
- Maximum scroll depth (%)
- Form interactions count
- Referrer path
- Navigation flow

### Control Room Metrics
- Monitoring type (single branch, group, multi-branch)
- Branch names and IDs monitored
- Camera IDs monitored
- Monitoring duration
- Alert count
- Incident count
- Camera switch count
- Playback count
- Snapshot count
- Export count

### User Action Metrics
- Action type (button_click, form_submit, search, filter, export, etc.)
- Action category (navigation, data_entry, data_view, monitoring, etc.)
- Action target (specific entity acted upon)
- Module and feature name
- Action metadata (contextual data)
- Action timestamp

## Privacy & Compliance

### Data Collection
- Only authenticated users are tracked
- No sensitive data (passwords, PII) is logged
- Data is scoped to tenant boundaries
- Users can request their activity data via reports

### Data Retention
- Raw activity logs: 90 days (configurable)
- Daily summaries: 1 year
- Weekly summaries: 2 years
- Monthly summaries: 5 years

### Data Access
- Users can view their own activity
- Admins can view all users' activity within their tenant
- No cross-tenant data access
- Audit logs for all report access

## Performance Considerations

### Client-Side
- Automatic metric batching reduces API calls
- Heartbeat every 30 seconds (not every action)
- Control room metrics batch: every 5 alerts, every 10 camera switches
- SessionStorage used for recovery (not localStorage)
- No blocking operations on main thread

### Server-Side
- Database indexes on all query columns
- Materialized views for summary tables
- Automatic cleanup of old sessions
- Pagination on all list endpoints
- Caching of current activity status

### Database Optimization
- Partitioning on date columns for large tables
- Background jobs for summary generation
- Archived data moved to cold storage after retention period
- Triggers for automatic summary updates

## Monitoring & Alerting

### Health Checks
- Monitor heartbeat success rate
- Track session start/end success rate
- Alert on high error rates (>5%)
- Alert on tracking service downtime

### Metrics to Monitor
- Active sessions count
- Average session duration
- Page visit completion rate
- API endpoint response times
- Database query performance

## Troubleshooting

### Session Not Starting
1. Check browser console for errors
2. Verify user is authenticated (localStorage has 'user')
3. Check network tab for /v1/activity/sessions/start call
4. Verify backend service is running
5. Check database connectivity

### Page Visits Not Tracking
1. Verify session was started successfully
2. Check sessionStorage for 'activitySessionId'
3. Look for page visit API calls in network tab
4. Check pathname changes are being detected

### Metrics Not Updating
1. Verify heartbeat is running (every 30s)
2. Check for JavaScript errors in console
3. Verify metric batching thresholds
4. Check API endpoint responses

### Session Not Ending on Logout
1. Check auth-manager.ts logout flow
2. Verify /v1/activity/sessions/{id}/end is called
3. Check sessionStorage is cleared
4. Verify redirect to login occurs

## Testing

See ACTIVITY_MONITORING_TEST_GUIDE.md for comprehensive testing procedures.
