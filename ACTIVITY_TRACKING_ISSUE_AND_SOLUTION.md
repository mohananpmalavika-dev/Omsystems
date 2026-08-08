# Activity Tracking Issue: Root Cause Analysis

## 🔍 **ROOT CAUSE FOUND**

The activity tracker is showing **NO DATA** because the frontend integration **is not implemented**.

### Evidence:
1. ✅ Backend infrastructure EXISTS and is properly set up:
   - Database schema is complete
   - API routes are registered
   - Repository layer is implemented

2. ❌ Frontend integration DOES NOT EXIST:
   - `useActivityTracking` hook is not used anywhere in the codebase
   - ActivityTracker is never initialized
   - No tracking calls are made from the dashboard
   - The hook file `dashboard/hooks/useActivityTracker.ts` exists but is **never imported or used**

3. 🔴 **This is why your screenshot shows all zeros** - no data is being sent to the backend!

## 📊 What This Means

Your activity tracking system has:
- ✅ Complete database schema
- ✅ Backend API endpoints 
- ✅ Repository layer
- ✅ Frontend tracking library code
- ❌ **NO integration between frontend and backend**

It's like having a car with an engine, but the driver never turns the key.

## 🛠️ Solution: Integrate Activity Tracking

You need to integrate the activity tracker into your Next.js dashboard app.

### Step 1: Initialize Tracker in Root Layout

The tracker must be initialized when the app starts and a user logs in.

**File:** `dashboard/app/layout.tsx`

```typescript
import type { Metadata } from "next";
import { GlobalAlertCenter } from "@/components/global-alert-center";
import { SessionProvider } from "@/components/session-provider";
import { ActivityTrackingProvider } from "@/components/activity-tracking-provider"; // ADD THIS
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentinel Grid | Security Operations",
  description: "Multi-branch CCTV monitoring and security operations",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <ActivityTrackingProvider> {/* ADD THIS */}
            {children}
            <GlobalAlertCenter/>
          </ActivityTrackingProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
```

### Step 2: Create Activity Tracking Provider

**File:** `dashboard/components/activity-tracking-provider.tsx`

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getActivityTracker } from '@/lib/activity-tracker';

interface ActivityTrackingProviderProps {
  children: React.ReactNode;
}

export function ActivityTrackingProvider({ children }: ActivityTrackingProviderProps) {
  const pathname = usePathname();
  const tracker = useRef(
    getActivityTracker({
      apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
      enableDebugLogs: process.env.NODE_ENV === 'development',
    })
  );
  const initialized = useRef(false);
  const currentPageVisit = useRef<string | null>(null);

  // Initialize tracker once
  useEffect(() => {
    if (!initialized.current) {
      tracker.current.initialize();
      initialized.current = true;
    }
  }, []);

  // Track page changes
  useEffect(() => {
    if (!pathname) return;

    const trackPage = async () => {
      // Determine module and category from pathname
      const module = getModuleFromPath(pathname);
      const category = getCategoryFromPath(pathname);
      const pageTitle = document.title;

      await tracker.current.trackPageVisit(
        pathname,
        pageTitle,
        module,
        category,
        currentPageVisit.current || undefined
      );

      currentPageVisit.current = pathname;
    };

    trackPage();
  }, [pathname]);

  return <>{children}</>;
}

// Helper to extract module from path
function getModuleFromPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'dashboard';
  
  const moduleMap: Record<string, string> = {
    'dashboard': 'dashboard',
    'cameras': 'camera_management',
    'control-room': 'control_room',
    'incidents': 'incident_management',
    'alerts': 'alert_management',
    'branches': 'branch_management',
    'users': 'user_management',
    'reports': 'reports',
    'settings': 'settings',
    'analytics': 'analytics',
    'audit': 'audit_logs',
    'maintenance': 'maintenance',
    'system': 'system_administration',
  };

  return moduleMap[segments[0]] || segments[0];
}

// Helper to extract category from path
function getCategoryFromPath(pathname: string): string {
  if (pathname.includes('control-room')) return 'monitoring';
  if (pathname.includes('incidents') || pathname.includes('alerts')) return 'operations';
  if (pathname.includes('users') || pathname.includes('settings')) return 'administration';
  if (pathname.includes('reports') || pathname.includes('analytics')) return 'reports';
  return 'general';
}
```

### Step 3: Integrate with Authentication

You need to start a session when a user logs in.

**Find your login component** (likely in `dashboard/app/login` or `dashboard/components`) and add:

```typescript
import { getActivityTracker } from '@/lib/activity-tracker';

// In your login handler
const handleLogin = async (credentials: LoginCredentials) => {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    const { accessToken, user } = await response.json();
    
    // Store token
    sessionStorage.setItem('accessToken', accessToken);
    
    // START ACTIVITY TRACKING SESSION
    const tracker = getActivityTracker({
      apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
    });
    await tracker.startSession(user.id, accessToken);
    
    // Redirect to dashboard
    router.push('/dashboard');
  } catch (error) {
    console.error('Login failed:', error);
  }
};

// In your logout handler
const handleLogout = async () => {
  const accessToken = sessionStorage.getItem('accessToken');
  
  // END ACTIVITY TRACKING SESSION
  const tracker = getActivityTracker({
    apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  });
  await tracker.endSession(accessToken || undefined);
  
  // Clear session
  sessionStorage.clear();
  router.push('/login');
};
```

### Step 4: Track User Actions

For every important user action, add tracking calls.

**Example: Incident creation**

```typescript
import { useActionTracking } from '@/hooks/useActivityTracker';

export function CreateIncidentButton() {
  const trackAction = useActionTracking('incident_management');
  
  const handleCreateIncident = async () => {
    try {
      // Create incident
      const response = await createIncident(incidentData);
      
      // TRACK THE ACTION
      trackAction('create_incident', 'data_entry', {
        actionTarget: response.id,
        actionDescription: 'Created new incident',
        featureName: 'incident_creation',
        actionMetadata: {
          incidentType: incidentData.type,
          severity: incidentData.severity,
        },
      });
      
      toast.success('Incident created successfully');
    } catch (error) {
      console.error('Failed to create incident:', error);
    }
  };
  
  return <button onClick={handleCreateIncident}>Create Incident</button>;
}
```

**Example: Search tracking**

```typescript
import { useSearchTracking } from '@/hooks/useActivityTracker';

export function CameraSearchBar() {
  const trackSearch = useSearchTracking('camera_management');
  
  const handleSearch = async (query: string) => {
    const results = await searchCameras(query);
    
    // TRACK THE SEARCH
    trackSearch(query, results.length, 'camera_search');
    
    setSearchResults(results);
  };
  
  return <input onChange={(e) => handleSearch(e.target.value)} />;
}
```

### Step 5: Track Control Room Activity

For the control room monitoring page:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { getActivityTracker } from '@/lib/activity-tracker';

export function ControlRoomPage() {
  const tracker = useRef(getActivityTracker({ apiBaseUrl: API_URL }));
  const activityId = useRef<string | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [cameraIds, setCameraIds] = useState<string[]>([]);

  // Start tracking when entering control room
  useEffect(() => {
    const startTracking = async () => {
      const sessionId = sessionStorage.getItem('activitySessionId');
      if (!sessionId) return;

      activityId.current = await tracker.current.startControlRoomActivity(
        sessionId,
        'single_branch',
        {
          branchId: currentBranchId,
          cameraIds: cameraIds,
          monitoringMode: 'live',
        }
      );
    };

    startTracking();

    // Stop tracking when leaving
    return () => {
      if (activityId.current) {
        const duration = Math.floor((Date.now() - startTime) / 1000);
        tracker.current.endControlRoomActivity(activityId.current, {
          durationSeconds: duration,
          alertCount: alertCount,
        });
      }
    };
  }, []);

  // Update alert count when alerts are handled
  const handleAlertViewed = () => {
    setAlertCount(prev => prev + 1);
    
    if (activityId.current) {
      tracker.current.updateControlRoomActivity(activityId.current, {
        alertCount: alertCount + 1,
      });
    }
  };

  return (
    <div>
      {/* Control room UI */}
    </div>
  );
}
```

## 🎯 Implementation Priority

Implement in this order for quickest results:

1. **HIGH PRIORITY** - Session tracking (login/logout)
   - Will show sessions and page visits
   - Shows user is online
   
2. **MEDIUM PRIORITY** - Page visit tracking
   - Automatically tracks navigation
   - Shows module usage
   
3. **MEDIUM PRIORITY** - Common actions (create, update, delete)
   - Shows user activity
   - Populates action logs
   
4. **LOW PRIORITY** - Advanced tracking (control room, searches, exports)
   - Nice to have for detailed analytics

## 🧪 Testing Your Implementation

After implementing:

1. **Login to the dashboard**
2. **Check browser console** - should see activity tracking logs (if debug enabled)
3. **Check network tab** - should see:
   - `POST /v1/activity/sessions/start`
   - `POST /v1/activity/heartbeat` (every 30 seconds)
   - `POST /v1/activity/page-visits` (on navigation)
4. **Run verification SQL**:
   ```sql
   SELECT COUNT(*) FROM user_activity_sessions WHERE user_id = 'YOUR_USER_ID';
   SELECT COUNT(*) FROM user_page_visits WHERE user_id = 'YOUR_USER_ID';
   ```

## 📈 Expected Results After Implementation

Once implemented, your activity report should show:
- **Sessions**: Number of login sessions
- **Monitoring Time**: Time spent in control room
- **Tracking Locations**: Branches/cameras monitored
- **Resources Explored**: Pages visited
- **Intervention Actions**: Actions taken (create incident, etc.)
- **Module Usage**: Breakdown of time per module
- **Control Room Monitoring**: Specific monitoring activities

## 🚀 Quick Start Template

I can create all these files for you automatically. Would you like me to:
1. Create the ActivityTrackingProvider component
2. Update your root layout
3. Create tracking integration examples for your existing components
4. Set up the login/logout integration

Just let me know and I'll generate all the code!
