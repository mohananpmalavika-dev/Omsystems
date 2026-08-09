# Employee Activity Monitoring - End-to-End Test Guide

## Test Environment Setup

### Prerequisites
1. Backend server running with activity tracking routes enabled
2. Database with activity tracking tables migrated
3. Dashboard frontend running
4. At least 2 test user accounts
5. Browser developer tools open (Console + Network tabs)

### Test User Accounts
- **User 1**: Regular operator (for activity generation)
- **User 2**: Admin user (for viewing reports and live activity)

## Test Scenarios

### Scenario 1: Login to Logout Flow

**Objective**: Verify complete session tracking from login to logout

**Steps**:
1. Open browser in incognito mode
2. Navigate to login page
3. Open browser DevTools (F12)
4. Go to Console tab
5. Enter credentials and click "Sign In"

**Expected Results**:
- ✓ Console log: `[ActivityMonitor] Session started: {sessionId}`
- ✓ Network tab shows `POST /api/control/v1/activity/sessions/start` (Status: 200)
- ✓ SessionStorage has `activitySessionId` key
- ✓ SessionStorage has `activityAccessToken` key
- ✓ Redirected to dashboard (`/`)

**Steps (continued)**:
6. Check sessionStorage in DevTools (Application tab)
7. Wait 30 seconds
8. Check Network tab for heartbeat

**Expected Results**:
- ✓ Network tab shows `POST /api/control/v1/activity/heartbeat` every 30 seconds
- ✓ Heartbeat response: `{status: "ok"}`

**Steps (continued)**:
9. Click logout button in sidebar
10. Check console and network tabs

**Expected Results**:
- ✓ Console log: `[ActivityMonitor] Session ended: {sessionId}`
- ✓ Network tab shows `POST /api/control/v1/activity/sessions/{id}/end` (Status: 200)
- ✓ SessionStorage cleared (no activitySessionId)
- ✓ LocalStorage cleared (no user, accessToken)
- ✓ Redirected to login page with `?logout=true`

**Database Verification**:
```sql
-- Check session was created and ended
SELECT 
  id, 
  user_id, 
  login_time, 
  logout_time, 
  total_duration_seconds, 
  session_status 
FROM user_activity_sessions 
WHERE user_id = '<test_user_id>' 
ORDER BY login_time DESC 
LIMIT 1;

-- Expected: logout_time should be set, session_status = 'logged_out'
```

**Pass Criteria**: All checkmarks achieved, session properly recorded in database

---

### Scenario 2: Page Visit Tracking

**Objective**: Verify automatic page visit tracking on navigation

**Steps**:
1. Log in as test user
2. Wait for session to start
3. Navigate to different pages:
   - Dashboard (`/`)
   - Control Room (`/control-room`)
   - Incidents (`/incidents`)
   - Reports (`/reports`)
   - Camera Management (`/admin`)

**Expected Results** (for each navigation):
- ✓ Console log: `[ActivityMonitor] Page visit tracked: {path}`
- ✓ Network tab shows `POST /api/control/v1/activity/page-visits`
- ✓ Network tab shows `PUT /api/control/v1/activity/page-visits/{id}/end` (for previous page)
- ✓ SessionStorage `currentPageVisitId` updates

**Steps (continued)**:
4. On one page, perform various interactions:
   - Click multiple buttons (5-10 times)
   - Scroll to bottom of page
   - Type in search/filter fields
   - Submit a form (if available)
5. Navigate to next page

**Expected Results**:
- ✓ Page visit end call includes metrics:
  - `durationSeconds` > 0
  - `clickCount` = number of clicks performed
  - `scrollDepthPercentage` = 100 (scrolled to bottom)
  - `formInteractionsCount` > 0

**Database Verification**:
```sql
-- Check page visits were recorded
SELECT 
  page_path,
  page_module,
  visit_start_time,
  visit_end_time,
  duration_seconds,
  click_count,
  scroll_depth_percentage,
  form_interactions_count
FROM user_page_visits
WHERE session_id = '<session_id>'
ORDER BY visit_start_time DESC
LIMIT 10;

-- Expected: All visited pages recorded with metrics
```

**Pass Criteria**: All pages tracked, metrics accurately reflect user interactions

---

### Scenario 3: Idle Detection

**Objective**: Verify idle time tracking works correctly

**Steps**:
1. Log in as test user
2. Navigate to dashboard
3. Interact with page (click, scroll)
4. Stop all activity for 3 minutes (don't touch mouse/keyboard)
5. Check console logs

**Expected Results**:
- ✓ After 2 minutes: Console log: `[ActivityMonitor] User is now idle`
- ✓ Idle timer visible in activity tracking

**Steps (continued)**:
6. After idle, perform any action (click, move mouse)
7. Check console logs

**Expected Results**:
- ✓ Console log: `[ActivityMonitor] User is now active`
- ✓ Active timer resets

**Steps (continued)**:
8. Navigate to another page
9. Check page visit end metrics

**Expected Results**:
- ✓ `activeTimeSeconds` reflects time before going idle
- ✓ `idleTimeSeconds` reflects idle duration (≈ 60 seconds)
- ✓ Total duration = active + idle time

**Pass Criteria**: Idle detection triggers at 2 minutes, active/idle times accurately tracked

---

### Scenario 4: Action Tracking

**Objective**: Verify manual action tracking works

**Steps**:
1. Log in as test user
2. Navigate to Employee Activity Report page (`/activity-report`)
3. Perform actions:
   - Change report period dropdown
   - Select different employee (if admin)
   - Change start date
   - Change end date
   - Click "Refresh" button
   - Click "Export PDF" button
   - Click "Export CSV" button

**Expected Results** (check Network tab):
- ✓ Each action sends `POST /api/control/v1/activity/actions`
- ✓ Request body includes:
  - `actionType` (e.g., "filter_change", "button_click", "export")
  - `actionCategory` (e.g., "data_view", "navigation", "export")
  - `moduleName` = "activity_report"
  - `actionMetadata` with relevant details

**Database Verification**:
```sql
-- Check actions were logged
SELECT 
  action_type,
  action_category,
  action_target,
  action_description,
  module_name,
  action_metadata,
  action_time
FROM user_action_log
WHERE session_id = '<session_id>'
  AND module_name = 'activity_report'
ORDER BY action_time DESC;

-- Expected: All actions recorded with correct metadata
```

**Pass Criteria**: All actions tracked with accurate metadata

---

### Scenario 5: Control Room Activity Tracking

**Objective**: Verify control room monitoring is tracked

**Prerequisites**: 
- Control room component integrated with control-room-tracker
- Access to a branch with cameras

**Steps**:
1. Log in as test user
2. Navigate to Control Room (`/control-room`)
3. Select a branch to monitor
4. When control room loads, check console

**Expected Results**:
- ✓ Console log: `[ControlRoomTracker] Control room activity started: {activityId}`
- ✓ Network tab shows `POST /api/control/v1/activity/control-room/start`
- ✓ Request body includes:
  - `monitoringType`
  - `branchNodeId`
  - `branchNames`
  - `cameraIds`
  - `monitoringMode`

**Steps (continued)**:
5. In control room, perform actions:
   - Switch cameras 15 times (triggers batch update at 10)
   - View 7 alerts (triggers batch update at 5)
   - Create 2 incidents
   - Take snapshots
   - Start playback
6. Check Network tab

**Expected Results**:
- ✓ `PATCH /api/control/v1/activity/control-room/{id}` called after:
  - 5th alert viewed
  - 10th alert viewed
  - 10th camera switch
  - Each incident created

**Steps (continued)**:
7. Navigate away from control room
8. Check console and network

**Expected Results**:
- ✓ Console log: `[ControlRoomTracker] Control room activity ended: {activityId}`
- ✓ Network tab shows `PUT /api/control/v1/activity/control-room/{id}/end`
- ✓ End request includes all metrics:
  - `alertCount` = 7
  - `incidentCount` = 2
  - `cameraSwitchCount` = 15
  - `snapshotCount`, `playbackCount`, etc.

**Database Verification**:
```sql
-- Check control room activity was recorded
SELECT 
  monitoring_type,
  branch_names,
  camera_count,
  monitoring_start_time,
  monitoring_end_time,
  duration_seconds,
  alert_count,
  incident_count,
  camera_switch_count,
  playback_count,
  snapshot_count
FROM control_room_monitoring_activity
WHERE session_id = '<session_id>'
ORDER BY monitoring_start_time DESC
LIMIT 5;

-- Expected: Activity recorded with accurate metrics
```

**Pass Criteria**: Control room activity tracked with all metrics accurately recorded

---

### Scenario 6: Session Recovery on Page Refresh

**Objective**: Verify session persists across page refreshes

**Steps**:
1. Log in as test user
2. Wait for session to start
3. Note the session ID from sessionStorage
4. Navigate to a few pages
5. Refresh the browser (F5)
6. Check console logs

**Expected Results**:
- ✓ Console log: `[ActivityMonitor] Recovered session: {sessionId}`
- ✓ Session ID matches the one noted before refresh
- ✓ No new session created (`POST /v1/activity/sessions/start` not called)
- ✓ Heartbeat continues from recovered session
- ✓ Page visit tracking continues normally

**Steps (continued)**:
7. Navigate to new page
8. Check that page visits are properly tracked

**Expected Results**:
- ✓ Previous page before refresh ended
- ✓ New page visit started
- ✓ All tied to same session ID

**Pass Criteria**: Session persists across refresh, no duplicate sessions created

---

### Scenario 7: Live Activity Status

**Objective**: Verify real-time activity monitoring works

**Prerequisites**: 
- LiveActivityStatus component added to a page
- Multiple test users available

**Steps**:
1. Open browser window 1: Log in as User 1
2. Open browser window 2: Log in as User 2 (admin)
3. In User 2's window, navigate to page with LiveActivityStatus component
4. Check that User 1 appears in live activity list

**Expected Results**:
- ✓ User 1 appears in active operators list
- ✓ Shows User 1's display name
- ✓ Shows current module (e.g., "Dashboard")
- ✓ Shows "Just now" or recent timestamp
- ✓ Online indicator is green/pulsing

**Steps (continued)**:
5. In User 1's window, navigate to Control Room
6. Wait 30 seconds (for live status to refresh)
7. In User 2's window, check live activity

**Expected Results**:
- ✓ User 1's activity updates to "Control Room"
- ✓ Shows control room icon
- ✓ If monitoring branch, shows branch name
- ✓ Shows camera count if available

**Steps (continued)**:
8. In User 1's window, click logout
9. Wait 30 seconds
10. In User 2's window, check live activity

**Expected Results**:
- ✓ User 1 no longer appears in active operators list
- ✓ Active count decremented

**Pass Criteria**: Live activity accurately reflects real-time user status

---

### Scenario 8: Comprehensive Activity Report

**Objective**: Verify activity report shows accurate data

**Prerequisites**: Complete Scenarios 1-5 to generate activity data

**Steps**:
1. Log in as admin user
2. Navigate to Employee Activity Report (`/activity-report`)
3. Select test user from dropdown
4. Set date range to "Last 7 days"
5. Click "Refresh"
6. Wait for report to load

**Expected Results**:
- ✓ Report shows test user's name
- ✓ Session Summary section shows:
  - Total sessions > 0
  - Total active time > 0
  - Average session duration calculated
- ✓ Module Usage section shows:
  - All visited modules listed
  - Visit counts match navigation history
  - Time distribution shown
- ✓ Control Room Activity section shows:
  - Monitoring time (if control room was used)
  - Branches monitored
  - Alerts/incidents handled
  - Camera switches
- ✓ Action Summary shows:
  - Categories of actions taken
  - Action counts

**Steps (continued)**:
7. Click "Export PDF"
8. Click "Export CSV"
9. Check Network tab

**Expected Results**:
- ✓ Export actions tracked (`POST /v1/activity/actions`)
- ✓ Export metadata includes format and user info
- ✓ PDF/CSV downloads successfully

**Database Verification**:
```sql
-- Get comprehensive report data
SELECT * FROM get_comprehensive_activity_report(
  '<tenant_id>',
  '<user_id>',
  CURRENT_DATE - INTERVAL '7 days',
  CURRENT_DATE
);

-- Expected: Report matches dashboard display
```

**Pass Criteria**: Report accurately reflects all tracked activity

---

## Automated Test Script

```javascript
// activity-monitoring.test.js
// Run with: node activity-monitoring.test.js

const assert = require('assert');
const { chromium } = require('playwright');

describe('Activity Monitoring End-to-End', () => {
  let browser, context, page;
  
  before(async () => {
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext();
    page = await context.newPage();
    
    // Enable console logging
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  });
  
  after(async () => {
    await browser.close();
  });
  
  it('should start session on login', async () => {
    await page.goto('http://localhost:3000/login');
    
    // Setup network listener
    const sessionStarted = page.waitForResponse(
      res => res.url().includes('/v1/activity/sessions/start')
    );
    
    // Login
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]');
    
    // Wait for session start
    const response = await sessionStarted;
    assert.strictEqual(response.status(), 200);
    
    const sessionId = await page.evaluate(() => 
      sessionStorage.getItem('activitySessionId')
    );
    assert.ok(sessionId, 'Session ID should be stored');
  });
  
  it('should track page visits', async () => {
    const pageVisitTracked = page.waitForResponse(
      res => res.url().includes('/v1/activity/page-visits') && res.request().method() === 'POST'
    );
    
    await page.click('a[href="/incidents"]');
    
    const response = await pageVisitTracked;
    assert.strictEqual(response.status(), 200);
  });
  
  it('should send heartbeat every 30 seconds', async () => {
    let heartbeatCount = 0;
    
    page.on('response', res => {
      if (res.url().includes('/v1/activity/heartbeat')) {
        heartbeatCount++;
      }
    });
    
    // Wait 65 seconds (should get 2 heartbeats)
    await page.waitForTimeout(65000);
    
    assert.ok(heartbeatCount >= 2, `Expected 2+ heartbeats, got ${heartbeatCount}`);
  });
  
  it('should end session on logout', async () => {
    const sessionEnded = page.waitForResponse(
      res => res.url().includes('/v1/activity/sessions/') && res.url().includes('/end')
    );
    
    await page.click('button[aria-label="Sign out"]');
    
    const response = await sessionEnded;
    assert.strictEqual(response.status(), 200);
    
    const sessionId = await page.evaluate(() => 
      sessionStorage.getItem('activitySessionId')
    );
    assert.strictEqual(sessionId, null, 'Session ID should be cleared');
  });
});
```

---

## Performance Testing

### Load Test: Multiple Concurrent Users

**Objective**: Verify system handles multiple users tracking simultaneously

**Tools**: Apache JMeter or k6

**Test Plan**:
1. Simulate 50 concurrent users
2. Each user:
   - Logs in
   - Navigates through 10 pages (30s between each)
   - Performs 5 actions per page
   - Stays active for 10 minutes
   - Logs out

**Success Criteria**:
- All session start/end calls succeed (100% success rate)
- All page visit tracking succeeds (>99% success rate)
- All action logging succeeds (>99% success rate)
- API response times < 200ms (p95)
- Database CPU usage < 70%
- No memory leaks in frontend

---

## Troubleshooting Common Issues

### Issue: Session not starting
**Symptoms**: No session ID in sessionStorage, no console logs
**Check**:
1. User object in localStorage
2. Network tab for errors
3. Backend service running
4. CORS configuration

### Issue: Page visits not tracked
**Symptoms**: No page visit calls in network tab
**Check**:
1. Session started successfully
2. Pathname changes detected
3. ActivityMonitor component rendered
4. JavaScript errors in console

### Issue: Heartbeat not sending
**Symptoms**: No heartbeat calls after 30s
**Check**:
1. Heartbeat timer started
2. No JavaScript errors preventing timer
3. Tab is active (not background)

### Issue: Session not ending on logout
**Symptoms**: Session remains active after logout
**Check**:
1. Logout button calls auth-manager's logout()
2. End session API call succeeds
3. SessionStorage cleared
4. Network connectivity

---

## Test Completion Checklist

- [ ] Scenario 1: Login to Logout Flow - PASSED
- [ ] Scenario 2: Page Visit Tracking - PASSED
- [ ] Scenario 3: Idle Detection - PASSED
- [ ] Scenario 4: Action Tracking - PASSED
- [ ] Scenario 5: Control Room Activity Tracking - PASSED
- [ ] Scenario 6: Session Recovery on Page Refresh - PASSED
- [ ] Scenario 7: Live Activity Status - PASSED
- [ ] Scenario 8: Comprehensive Activity Report - PASSED
- [ ] Automated Test Script - PASSED
- [ ] Performance Testing - PASSED
- [ ] All database records verified - PASSED

**Sign-off**: ___________________ Date: ___________
