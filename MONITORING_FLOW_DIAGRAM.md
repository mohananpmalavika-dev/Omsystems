# Employee Activity Monitoring - Flow Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Dashboard)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Root Layout (layout.tsx)                    │  │
│  │  ┌────────────────────────────────────────────────────────┐   │  │
│  │  │            ActivityMonitor Component                   │   │  │
│  │  │  • Initializes on mount                               │   │  │
│  │  │  • Starts session on login                            │   │  │
│  │  │  • Tracks page changes                                │   │  │
│  │  │  • Monitors interactions                              │   │  │
│  │  │  • Handles idle detection                             │   │  │
│  │  │  • Sends heartbeat every 30s                          │   │  │
│  │  └────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                  │                                   │
│                                  ↓                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              Activity Tracking Hooks                          │  │
│  │  ┌────────────┬────────────┬────────────┬────────────────┐   │  │
│  │  │ Button     │ Form       │ Search     │ Export         │   │  │
│  │  │ Tracking   │ Tracking   │ Tracking   │ Tracking       │   │  │
│  │  └────────────┴────────────┴────────────┴────────────────┘   │  │
│  │  ┌────────────┬────────────┬────────────┬────────────────┐   │  │
│  │  │ Camera     │ Playback   │ Incident   │ Alert          │   │  │
│  │  │ Tracking   │ Tracking   │ Tracking   │ Tracking       │   │  │
│  │  └────────────┴────────────┴────────────┴────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                  │                                   │
│                                  ↓                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │         Control Room Tracker (control-room-tracker.ts)        │  │
│  │  • Tracks control room sessions                              │  │
│  │  • Monitors metrics (alerts, incidents, cameras)             │  │
│  │  • Batches updates (every 5 alerts, 10 camera switches)      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ HTTPS/JSON
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND API (Fastify)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │      Activity Tracking Routes (employee-activity-tracking.    │  │
│  │                         routes.ts)                            │  │
│  │  ┌────────────────────────────────────────────────────────┐   │  │
│  │  │ POST /v1/activity/sessions/start                       │   │  │
│  │  │ POST /v1/activity/sessions/{id}/end                    │   │  │
│  │  │ POST /v1/activity/heartbeat                            │   │  │
│  │  ├────────────────────────────────────────────────────────┤   │  │
│  │  │ POST /v1/activity/page-visits                          │   │  │
│  │  │ PUT  /v1/activity/page-visits/{id}/end                 │   │  │
│  │  ├────────────────────────────────────────────────────────┤   │  │
│  │  │ POST /v1/activity/control-room/start                   │   │  │
│  │  │ PUT  /v1/activity/control-room/{id}/end                │   │  │
│  │  │ PATCH /v1/activity/control-room/{id}                   │   │  │
│  │  ├────────────────────────────────────────────────────────┤   │  │
│  │  │ POST /v1/activity/actions                              │   │  │
│  │  ├────────────────────────────────────────────────────────┤   │  │
│  │  │ GET  /v1/activity/current                              │   │  │
│  │  │ GET  /v1/activity/report/comprehensive                 │   │  │
│  │  └────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                  │                                   │
│                                  ↓                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │    Activity Tracking Repository (activity-tracking-          │  │
│  │                   repository.ts)                              │  │
│  │  • Database operations                                        │  │
│  │  • Query optimization                                         │  │
│  │  • Data aggregation                                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ PostgreSQL
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        DATABASE (PostgreSQL)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────┐  ┌────────────────────────────┐    │
│  │ user_activity_sessions     │  │ user_page_visits           │    │
│  │ • session_id (PK)          │  │ • page_visit_id (PK)       │    │
│  │ • user_id                  │  │ • session_id (FK)          │    │
│  │ • login_time               │  │ • page_path                │    │
│  │ • logout_time              │  │ • duration_seconds         │    │
│  │ • total_duration           │  │ • click_count              │    │
│  │ • device_info              │  │ • scroll_depth             │    │
│  └────────────────────────────┘  └────────────────────────────┘    │
│                                                                       │
│  ┌────────────────────────────┐  ┌────────────────────────────┐    │
│  │ control_room_monitoring_   │  │ user_action_log            │    │
│  │         activity           │  │ • action_id (PK)           │    │
│  │ • activity_id (PK)         │  │ • session_id (FK)          │    │
│  │ • session_id (FK)          │  │ • action_type              │    │
│  │ • branch_ids               │  │ • action_category          │    │
│  │ • camera_ids               │  │ • module_name              │    │
│  │ • alert_count              │  │ • action_metadata          │    │
│  │ • incident_count           │  │ • action_time              │    │
│  │ • camera_switch_count      │  └────────────────────────────┘    │
│  └────────────────────────────┘                                     │
│                                                                       │
│  ┌────────────────────────────┐  ┌────────────────────────────┐    │
│  │ user_current_activity      │  │ user_activity_daily_       │    │
│  │ • user_id (PK)             │  │        summary             │    │
│  │ • is_online                │  │ • user_id                  │    │
│  │ • current_page             │  │ • summary_date             │    │
│  │ • current_module           │  │ • total_sessions           │    │
│  │ • is_in_control_room       │  │ • total_duration           │    │
│  │ • current_branch_name      │  │ • module_usage_breakdown   │    │
│  │ • monitoring_camera_count  │  │ • control_room_metrics     │    │
│  │ • last_activity_time       │  │ • action_metrics           │    │
│  └────────────────────────────┘  └────────────────────────────┘    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## User Journey Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER JOURNEY                               │
└─────────────────────────────────────────────────────────────────────┘

1. LOGIN
   ┌─────────────────────────────────────────────────────────────┐
   │ User enters credentials → Authentication → Login successful  │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ ActivityMonitor detects user → Starts session               │
   │ POST /v1/activity/sessions/start                            │
   │ • Stores session_id in sessionStorage                       │
   │ • Starts heartbeat timer (30s)                              │
   │ • Initializes activity listeners                            │
   └─────────────────────────────────────────────────────────────┘

2. NAVIGATION
   ┌─────────────────────────────────────────────────────────────┐
   │ User navigates to new page (pathname changes)               │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Previous page visit ended                                   │
   │ PUT /v1/activity/page-visits/{id}/end                       │
   │ • Sends duration, clicks, scroll depth, form interactions   │
   │ • Includes active time and idle time                        │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ New page visit started                                      │
   │ POST /v1/activity/page-visits                               │
   │ • Records page path, module, timestamp                      │
   │ • Resets interaction metrics                                │
   │ • Resets idle timer                                         │
   └─────────────────────────────────────────────────────────────┘

3. INTERACTION
   ┌─────────────────────────────────────────────────────────────┐
   │ User interacts with page                                    │
   │ • Clicks buttons → clickCount++                             │
   │ • Scrolls page → maxScrollDepth updated                     │
   │ • Types in forms → formInteractions++                       │
   │ • Moves mouse → lastActivityTime updated                    │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Tracked actions (via hooks)                                 │
   │ POST /v1/activity/actions                                   │
   │ • Button clicks: useButtonTracking                          │
   │ • Form submits: useFormTracking                             │
   │ • Searches: useSearchTracking                               │
   │ • Exports: useExportTracking                                │
   │ • Filters: useFilterTracking                                │
   └─────────────────────────────────────────────────────────────┘

4. IDLE DETECTION
   ┌─────────────────────────────────────────────────────────────┐
   │ No activity for 2 minutes                                   │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ User marked as idle                                         │
   │ • activeTime stops accumulating                             │
   │ • idleTime starts accumulating                              │
   │ • Console log: "User is now idle"                           │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ User performs action (click/type/move)                      │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ User marked as active                                       │
   │ • idleTime stops accumulating                               │
   │ • activeTime resumes accumulating                           │
   │ • Console log: "User is now active"                         │
   └─────────────────────────────────────────────────────────────┘

5. CONTROL ROOM (Optional)
   ┌─────────────────────────────────────────────────────────────┐
   │ User enters control room page                               │
   │ • Selects branch to monitor                                 │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Control room activity started                               │
   │ POST /v1/activity/control-room/start                        │
   │ • Records branch_ids, camera_ids, monitoring_type           │
   │ • Initializes metric counters                               │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ User performs control room actions                          │
   │ • Views alert → alertCount++ (batch at 5)                   │
   │ • Creates incident → incidentCount++                        │
   │ • Switches camera → cameraSwitchCount++ (batch at 10)       │
   │ • Takes snapshot → snapshotCount++                          │
   │ • Starts playback → playbackCount++                         │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Metric batching triggers                                    │
   │ PATCH /v1/activity/control-room/{id}                        │
   │ • After 5th alert viewed                                    │
   │ • After 10th camera switch                                  │
   │ • After each incident created                               │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ User exits control room (navigates away)                    │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Control room activity ended                                 │
   │ PUT /v1/activity/control-room/{id}/end                      │
   │ • Records final metrics (all counts)                        │
   │ • Calculates duration                                       │
   └─────────────────────────────────────────────────────────────┘

6. HEARTBEAT (Continuous)
   ┌─────────────────────────────────────────────────────────────┐
   │ Every 30 seconds while logged in                            │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Send heartbeat                                              │
   │ POST /v1/activity/heartbeat                                 │
   │ • Updates last_activity_time                                │
   │ • Keeps session alive                                       │
   │ • Updates user_current_activity table                       │
   └─────────────────────────────────────────────────────────────┘

7. LOGOUT
   ┌─────────────────────────────────────────────────────────────┐
   │ User clicks logout button                                   │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Auth manager's logout() called                              │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ End current page visit                                      │
   │ PUT /v1/activity/page-visits/{id}/end                       │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ End activity session                                        │
   │ POST /v1/activity/sessions/{id}/end                         │
   │ • Calculates total duration                                 │
   │ • Sets logout_time                                          │
   │ • Sets session_status = 'logged_out'                        │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Cleanup                                                     │
   │ • Stop heartbeat timer                                      │
   │ • Clear sessionStorage (activitySessionId, etc.)            │
   │ • Clear localStorage (user, tokens)                         │
   │ • Update user_current_activity (is_online = false)          │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Redirect to login page                                      │
   │ • URL: /login?logout=true                                   │
   └─────────────────────────────────────────────────────────────┘

8. REPORTING (Anytime)
   ┌─────────────────────────────────────────────────────────────┐
   │ Admin views Employee Activity Report                        │
   │ GET /v1/activity/report/comprehensive                       │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Report displays:                                            │
   │ • Session summary (count, duration, avg)                    │
   │ • Module usage (time per module)                            │
   │ • Control room activity (alerts, incidents, cameras)        │
   │ • Branch monitoring breakdown                               │
   │ • Action summary (by category)                              │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Admin exports report                                        │
   │ • PDF, Excel, or CSV format                                 │
   │ • Export action tracked                                     │
   │ POST /v1/activity/actions (export action logged)            │
   └─────────────────────────────────────────────────────────────┘

9. LIVE MONITORING (Real-time)
   ┌─────────────────────────────────────────────────────────────┐
   │ Admin views LiveActivityStatus component                    │
   │ GET /v1/activity/current (polls every 30s)                  │
   └─────────────────────────────────────────────────────────────┘
                              ↓
   ┌─────────────────────────────────────────────────────────────┐
   │ Displays:                                                   │
   │ • List of currently active users                            │
   │ • Current page/module each user is on                       │
   │ • Control room status                                       │
   │ • Branch being monitored                                    │
   │ • Camera count                                              │
   │ • Time since last activity                                  │
   │ • Time on current page                                      │
   └─────────────────────────────────────────────────────────────┘
```

## Data Storage Flow

```
Frontend            API Layer           Repository          Database
────────────────────────────────────────────────────────────────────

Session Start
   │                   │                   │                   │
   ├──POST────────────→│                   │                   │
   │  /sessions/start  │                   │                   │
   │                   ├─startSession()───→│                   │
   │                   │                   ├──INSERT──────────→│
   │                   │                   │  user_activity_   │
   │                   │                   │  sessions         │
   │                   │                   │                   │
   │                   │                   ├──INSERT──────────→│
   │                   │                   │  user_current_    │
   │                   │                   │  activity         │
   │                   │←─session_id───────┤                   │
   │←─{sessionId}──────┤                   │                   │
   │                   │                   │                   │

Page Visit
   │                   │                   │                   │
   ├──POST────────────→│                   │                   │
   │  /page-visits     │                   │                   │
   │                   ├─trackPageVisit()─→│                   │
   │                   │                   ├──INSERT──────────→│
   │                   │                   │  user_page_visits │
   │                   │←─page_visit_id────┤                   │
   │←─{pageVisitId}────┤                   │                   │
   │                   │                   │                   │

Action Log
   │                   │                   │                   │
   ├──POST────────────→│                   │                   │
   │  /actions         │                   │                   │
   │                   ├─logUserAction()──→│                   │
   │                   │                   ├──INSERT──────────→│
   │                   │                   │  user_action_log  │
   │←─{success}────────┤                   │                   │
   │                   │                   │                   │

Session End
   │                   │                   │                   │
   ├──POST────────────→│                   │                   │
   │  /sessions/end    │                   │                   │
   │                   ├─endSession()─────→│                   │
   │                   │                   ├──UPDATE──────────→│
   │                   │                   │  user_activity_   │
   │                   │                   │  sessions         │
   │                   │                   │  (logout_time,    │
   │                   │                   │   duration)       │
   │                   │                   │                   │
   │                   │                   ├──UPDATE──────────→│
   │                   │                   │  user_current_    │
   │                   │                   │  activity         │
   │                   │                   │  (is_online=false)│
   │                   │                   │                   │
   │                   │                   ├──CALL FUNCTION───→│
   │                   │                   │  update_daily_    │
   │                   │                   │  summary()        │
   │←─{success}────────┤                   │                   │
   │                   │                   │                   │
```

---

**Legend**:
- `→` Data flow direction
- `├──` API call or function call
- `│` Connection/relationship
- `PK` Primary Key
- `FK` Foreign Key
