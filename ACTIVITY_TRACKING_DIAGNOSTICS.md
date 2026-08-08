# Activity Tracking Diagnostics Guide

## Issue: Activity Tracker Shows No Data

Based on your screenshot showing all zeros, here's how to diagnose and fix the issue.

## Step 1: Verify Database Has Data

Run the queries in `verify-activity-tracking.sql` to check:

```bash
psql -U your_user -d your_database -f verify-activity-tracking.sql
```

**If no data exists:** Tracking is not being initialized or used.

## Step 2: Check Frontend Integration

### 2.1 Verify Tracker Initialization

Look for this in your main app layout or root component:

```typescript
// Should be in dashboard/app/layout.tsx or similar
import { useActivityTracking } from '@/hooks/useActivityTracker';

export default function RootLayout({ children }) {
  const accessToken = // ... get from your auth system
  
  // This MUST be called
  useActivityTracking(process.env.NEXT_PUBLIC_API_URL, accessToken);
  
  return <>{children}</>;
}
```

### 2.2 Verify Page Tracking

Each page should track visits:

```typescript
// In each page component
import { usePageTracking } from '@/hooks/useActivityTracker';

export default function DashboardPage() {
  usePageTracking('dashboard', 'operations', {
    pageTitle: 'Dashboard',
    enabled: true
  });
  
  return <div>...</div>;
}
```

### 2.3 Verify Action Tracking

User actions must be explicitly tracked:

```typescript
import { useActionTracking } from '@/hooks/useActivityTracker';

export function MyComponent() {
  const trackAction = useActionTracking('incidents');
  
  const handleCreateIncident = async () => {
    // ... create incident
    
    // MUST call this
    trackAction('create_incident', 'data_entry', {
      actionTarget: 'incident',
      actionDescription: 'Created new incident',
      featureName: 'incident_management'
    });
  };
  
  return <button onClick={handleCreateIncident}>Create</button>;
}
```

## Step 3: Check API Connectivity

### 3.1 Verify API Base URL

Check that the frontend can reach the backend:

```typescript
// In your config
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
```

### 3.2 Test Session Start

Open browser console and check network tab for:
- `POST /v1/activity/sessions/start` - Should return `{ sessionId: "..." }`
- `POST /v1/activity/heartbeat` - Should be called every 30 seconds
- `POST /v1/activity/page-visits` - Should be called on navigation

### 3.3 Check Authentication

Activity tracking requires a valid `Authorization: Bearer <token>` header.

**Common Issue:** If auth token is not available when tracker initializes, tracking won't work.

## Step 4: Check Backend Logs

Look for activity tracking errors:

```bash
# Search for activity tracking logs
grep "activity" logs/app.log | grep -i error

# Check if routes are registered
grep "Employee activity tracking routes registered" logs/app.log
```

## Step 5: Common Issues and Fixes

### Issue 1: "No active session"
**Symptom:** Page visits and actions show 0
**Fix:** Ensure `startSession()` is called on login

```typescript
// In your login handler
const handleLogin = async (credentials) => {
  const { accessToken } = await loginUser(credentials);
  
  // Initialize activity tracker
  const tracker = getActivityTracker({ apiBaseUrl: API_URL });
  await tracker.initialize();
  await tracker.startSession(userId, accessToken);
};
```

### Issue 2: "Tracker not initialized"
**Symptom:** Console errors about tracker being undefined
**Fix:** Ensure singleton instance is created before use

```typescript
// dashboard/lib/activity-tracker.ts should export singleton
let trackerInstance: ActivityTracker | null = null;

export function getActivityTracker(config: ActivityTrackerConfig): ActivityTracker {
  if (!trackerInstance) {
    trackerInstance = new ActivityTracker(config);
  }
  return trackerInstance;
}
```

### Issue 3: "Date range shows no data"
**Symptom:** Specific date range shows zeros
**Fix:** 
1. Check date format (YYYY-MM-DD)
2. Verify timezone alignment
3. Check if daily summary aggregation has run

```sql
-- Manually trigger daily summary
SELECT update_user_daily_activity_summary(
  'USER_ID_HERE'::uuid, 
  CURRENT_DATE
);
```

### Issue 4: "Actions not being tracked"
**Symptom:** Sessions exist but action count is 0
**Fix:** Developers must explicitly call tracking API for each action

**This is the most common issue!** The system doesn't automatically track all API calls - only those explicitly instrumented.

## Step 6: Implementation Checklist

Use this checklist to ensure complete tracking:

### Backend ✓
- [ ] Migration `20260808_employee_activity_tracking.sql` has been run
- [ ] ActivityTrackingRepository is registered in DI container
- [ ] Employee activity routes are registered in app
- [ ] Daily summary cron job is configured (for aggregations)

### Frontend ✓
- [ ] ActivityTracker is initialized in root layout
- [ ] `startSession()` is called on login
- [ ] `endSession()` is called on logout
- [ ] Each page uses `usePageTracking()`
- [ ] Each significant user action calls `trackAction()`
- [ ] Heartbeat is running (check network tab for periodic calls)

### Testing ✓
- [ ] Can see session start in network tab
- [ ] Can see heartbeat every 30 seconds
- [ ] Can see page visit tracking on navigation
- [ ] Database has records in `user_activity_sessions`
- [ ] Database has records in `user_page_visits`
- [ ] Database has records in `user_action_log`

## Step 7: Enable Debug Logging

Temporarily enable debug logging to see what's happening:

```typescript
const tracker = getActivityTracker({
  apiBaseUrl: API_URL,
  enableDebugLogs: true  // Enable this
});
```

This will log all tracking events to browser console.

## Step 8: What Gets Tracked vs What Doesn't

### ✅ AUTOMATICALLY Tracked
- User login/logout (if startSession/endSession called)
- Page navigation (if usePageTracking used)
- Idle vs active time (automatic)
- Heartbeat (automatic once session started)

### ❌ NOT Automatically Tracked
- Button clicks (must call trackAction)
- Form submissions (must call trackAction)
- Search queries (must call trackAction)
- Data exports (must call trackAction)
- API calls (must call trackAction)
- Control room monitoring (must call startControlRoomActivity)
- Camera switches (must update control room activity)
- Alert handling (must call logUserAction)

**Key Point:** This is an **instrumentation-based** tracking system, not an automatic analytics system. Developers must add tracking calls to their code.

## Recommended Fix Strategy

Based on your screenshot showing zeros, I recommend:

1. **First**: Run the verification SQL to confirm if ANY data exists
2. **If no data**: Frontend integration is missing - check if ActivityTracker is initialized
3. **If data exists but not for your date**: Check date range and timezone
4. **If sessions exist but actions are 0**: Need to add trackAction() calls throughout your app

## Quick Test

Add this to any page to verify tracking works:

```typescript
'use client';

import { useEffect } from 'react';
import { useActivityTracking, usePageTracking, useActionTracking } from '@/hooks/useActivityTracker';

export default function TestPage() {
  const tracker = useActivityTracking(process.env.NEXT_PUBLIC_API_URL!, 'YOUR_TOKEN');
  usePageTracking('test', 'testing');
  const trackAction = useActionTracking('test');
  
  useEffect(() => {
    console.log('Tracker initialized:', tracker);
  }, [tracker]);
  
  const handleTestAction = () => {
    trackAction('test_button', 'test_category', {
      actionDescription: 'Test action clicked'
    });
    alert('Action tracked! Check database.');
  };
  
  return (
    <div>
      <h1>Activity Tracking Test</h1>
      <button onClick={handleTestAction}>Test Action Tracking</button>
      <p>Check browser console and network tab</p>
    </div>
  );
}
```

## Need More Help?

If issue persists after following this guide:
1. Share the results of the verification SQL queries
2. Share browser console logs with debug enabled
3. Share backend logs for activity tracking routes
4. Confirm which authentication system you're using
