/**
 * Activity Monitor Component
 * Initializes and manages end-to-end employee activity tracking
 * from login to logout
 */

'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface ActivityMonitorProps {
  children?: React.ReactNode;
}

// Singleton activity tracker instance
let activityTracker: ActivityTrackerInstance | null = null;
let currentSessionId: string | null = null;
let currentPageVisitId: string | null = null;

interface ActivityTrackerInstance {
  sessionId: string | null;
  pageVisitId: string | null;
  isInitialized: boolean;
  heartbeatInterval: NodeJS.Timeout | null;
  idleTimer: NodeJS.Timeout | null;
  lastActivityTime: Date;
  isIdle: boolean;
  activeTimeStart: Date;
  totalActiveTime: number;
  totalIdleTime: number;
  clickCount: number;
  maxScrollDepth: number;
  formInteractions: number;
}

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE || '/api/control';
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  // Try multiple storage locations
  return sessionStorage.getItem('activityAccessToken') || 
         localStorage.getItem('accessToken') || 
         null;
}

function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.id || null;
    }
  } catch (e) {
    console.error('[ActivityMonitor] Error parsing user:', e);
  }
  return null;
}

function getDeviceInfo() {
  if (typeof window === 'undefined') return {};
  
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * Start activity session
 */
async function startSession(): Promise<string | null> {
  const token = getAccessToken();
  const userId = getUserId();
  
  if (!token || !userId) {
    console.warn('[ActivityMonitor] No auth token or user ID, skipping session start');
    return null;
  }
  
  try {
    const response = await fetch(`${getApiBase()}/v1/activity/sessions/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-session': token,
      },
      credentials: 'include',
      body: JSON.stringify({
        deviceInfo: getDeviceInfo(),
      }),
    });
    
    if (!response.ok) {
      console.error('[ActivityMonitor] Failed to start session:', response.status);
      return null;
    }
    
    const data = await response.json();
    currentSessionId = data.sessionId;
    
    // Store for recovery
    sessionStorage.setItem('activitySessionId', data.sessionId);
    sessionStorage.setItem('activityAccessToken', token);
    
    console.log('[ActivityMonitor] Session started:', data.sessionId);
    
    // Start heartbeat
    startHeartbeat();
    
    return data.sessionId;
  } catch (error) {
    console.error('[ActivityMonitor] Error starting session:', error);
    return null;
  }
}

/**
 * End activity session
 */
async function endSession(): Promise<void> {
  if (!currentSessionId) return;
  
  try {
    // End current page visit first
    await endPageVisit();
    
    const token = getAccessToken();
    if (!token) return;
    
    await fetch(`${getApiBase()}/v1/activity/sessions/${currentSessionId}/end`, {
      method: 'POST',
      headers: {
        'x-sentinel-session': token,
      },
      credentials: 'include',
    });
    
    console.log('[ActivityMonitor] Session ended:', currentSessionId);
  } catch (error) {
    console.error('[ActivityMonitor] Error ending session:', error);
  } finally {
    stopHeartbeat();
    currentSessionId = null;
    currentPageVisitId = null;
    sessionStorage.removeItem('activitySessionId');
    sessionStorage.removeItem('activityAccessToken');
  }
}

/**
 * Start heartbeat to keep session alive
 */
function startHeartbeat() {
  if (!activityTracker || activityTracker.heartbeatInterval) return;
  
  activityTracker.heartbeatInterval = setInterval(async () => {
    if (!currentSessionId) return;
    
    try {
      const token = getAccessToken();
      if (!token) return;
      
      await fetch(`${getApiBase()}/v1/activity/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sentinel-session': token,
        },
        credentials: 'include',
        body: JSON.stringify({ sessionId: currentSessionId }),
      });
    } catch (error) {
      console.error('[ActivityMonitor] Heartbeat error:', error);
    }
  }, 30000); // Every 30 seconds
}

/**
 * Stop heartbeat
 */
function stopHeartbeat() {
  if (activityTracker?.heartbeatInterval) {
    clearInterval(activityTracker.heartbeatInterval);
    activityTracker.heartbeatInterval = null;
  }
}

/**
 * Track page visit
 */
async function trackPageVisit(
  pagePath: string,
  pageModule: string,
  pageCategory?: string,
  pageTitle?: string
): Promise<string | null> {
  if (!currentSessionId) {
    console.warn('[ActivityMonitor] No active session, skipping page tracking');
    return null;
  }
  
  // End previous page visit
  await endPageVisit();
  
  try {
    const token = getAccessToken();
    if (!token) return null;
    
    const response = await fetch(`${getApiBase()}/v1/activity/page-visits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-session': token,
      },
      credentials: 'include',
      body: JSON.stringify({
        sessionId: currentSessionId,
        pagePath,
        pageTitle: pageTitle || document.title,
        pageModule,
        pageCategory,
        referrerPath: currentPageVisitId ? document.referrer : null,
        queryParameters: Object.fromEntries(new URLSearchParams(window.location.search)),
      }),
    });
    
    if (!response.ok) {
      console.error('[ActivityMonitor] Failed to track page visit:', response.status);
      return null;
    }
    
    const data = await response.json();
    currentPageVisitId = data.pageVisitId;
    
    // Reset tracking metrics
    if (activityTracker) {
      activityTracker.pageVisitId = data.pageVisitId;
      activityTracker.activeTimeStart = new Date();
      activityTracker.totalActiveTime = 0;
      activityTracker.totalIdleTime = 0;
      activityTracker.clickCount = 0;
      activityTracker.maxScrollDepth = 0;
      activityTracker.formInteractions = 0;
      activityTracker.isIdle = false;
      activityTracker.lastActivityTime = new Date();
    }
    
    // Store for recovery
    sessionStorage.setItem('currentPageVisitId', data.pageVisitId);
    
    console.log('[ActivityMonitor] Page visit tracked:', pagePath);
    
    // Reset idle timer
    resetIdleTimer();
    
    return data.pageVisitId;
  } catch (error) {
    console.error('[ActivityMonitor] Error tracking page visit:', error);
    return null;
  }
}

/**
 * End current page visit
 */
async function endPageVisit(): Promise<void> {
  if (!currentPageVisitId || !activityTracker) return;
  
  try {
    const token = getAccessToken();
    if (!token) return;
    
    const durationSeconds = Math.floor(
      (new Date().getTime() - activityTracker.activeTimeStart.getTime()) / 1000
    );
    
    // Update active/idle time
    if (!activityTracker.isIdle) {
      activityTracker.totalActiveTime += Math.floor(
        (new Date().getTime() - activityTracker.activeTimeStart.getTime()) / 1000
      );
    }
    
    await fetch(`${getApiBase()}/v1/activity/page-visits/${currentPageVisitId}/end`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-session': token,
      },
      credentials: 'include',
      body: JSON.stringify({
        pageVisitId: currentPageVisitId,
        durationSeconds,
        activeTimeSeconds: activityTracker.totalActiveTime,
        idleTimeSeconds: activityTracker.totalIdleTime,
        clickCount: activityTracker.clickCount,
        scrollDepthPercentage: activityTracker.maxScrollDepth,
        formInteractionsCount: activityTracker.formInteractions,
      }),
    });
    
    console.log('[ActivityMonitor] Page visit ended:', currentPageVisitId);
  } catch (error) {
    console.error('[ActivityMonitor] Error ending page visit:', error);
  } finally {
    sessionStorage.removeItem('currentPageVisitId');
    currentPageVisitId = null;
  }
}

/**
 * Track user action
 */
export async function trackUserAction(
  actionType: string,
  actionCategory: string,
  moduleName: string,
  options?: {
    actionTarget?: string;
    actionDescription?: string;
    featureName?: string;
    actionMetadata?: Record<string, any>;
  }
): Promise<void> {
  if (!currentSessionId) return;
  
  try {
    const token = getAccessToken();
    if (!token) return;
    
    await fetch(`${getApiBase()}/v1/activity/actions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-session': token,
      },
      credentials: 'include',
      body: JSON.stringify({
        sessionId: currentSessionId,
        pageVisitId: currentPageVisitId,
        actionType,
        actionCategory,
        actionTarget: options?.actionTarget,
        actionDescription: options?.actionDescription,
        moduleName,
        featureName: options?.featureName,
        actionMetadata: options?.actionMetadata,
      }),
    });
    
    console.log('[ActivityMonitor] Action tracked:', actionType);
  } catch (error) {
    console.error('[ActivityMonitor] Error tracking action:', error);
  }
}

/**
 * Handle user activity (click, scroll, keyboard, etc.)
 */
function handleActivity() {
  if (!activityTracker) return;
  
  activityTracker.lastActivityTime = new Date();
  
  // If was idle, mark as active now
  if (activityTracker.isIdle) {
    const idleEnd = new Date();
    activityTracker.totalIdleTime += Math.floor(
      (idleEnd.getTime() - activityTracker.activeTimeStart.getTime()) / 1000
    );
    activityTracker.isIdle = false;
    activityTracker.activeTimeStart = new Date();
    console.log('[ActivityMonitor] User is now active');
  }
  
  resetIdleTimer();
}

/**
 * Reset idle timer
 */
function resetIdleTimer() {
  if (!activityTracker) return;
  
  if (activityTracker.idleTimer) {
    clearTimeout(activityTracker.idleTimer);
  }
  
  activityTracker.idleTimer = setTimeout(() => {
    if (!activityTracker) return;
    
    const activeEnd = new Date();
    activityTracker.totalActiveTime += Math.floor(
      (activeEnd.getTime() - activityTracker.activeTimeStart.getTime()) / 1000
    );
    activityTracker.isIdle = true;
    activityTracker.activeTimeStart = new Date();
    console.log('[ActivityMonitor] User is now idle');
  }, 120000); // 2 minutes
}

/**
 * Calculate scroll depth percentage
 */
function calculateScrollDepth(): number {
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight;
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  
  if (documentHeight <= windowHeight) return 100;
  
  return Math.min(100, Math.round((scrollTop + windowHeight) / documentHeight * 100));
}

/**
 * Initialize activity listeners
 */
function initializeListeners() {
  if (typeof window === 'undefined') return;
  
  // Track clicks
  document.addEventListener('click', () => {
    handleActivity();
    if (activityTracker) {
      activityTracker.clickCount++;
    }
  });
  
  // Track scroll
  let scrollTimeout: NodeJS.Timeout;
  document.addEventListener('scroll', () => {
    handleActivity();
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (activityTracker) {
        const scrollDepth = calculateScrollDepth();
        if (scrollDepth > activityTracker.maxScrollDepth) {
          activityTracker.maxScrollDepth = scrollDepth;
        }
      }
    }, 100);
  });
  
  // Track keyboard
  document.addEventListener('keydown', () => {
    handleActivity();
  });
  
  // Track mouse movement
  let mouseMoveTimeout: NodeJS.Timeout;
  document.addEventListener('mousemove', () => {
    clearTimeout(mouseMoveTimeout);
    mouseMoveTimeout = setTimeout(() => {
      handleActivity();
    }, 200);
  });
  
  // Track form interactions
  document.addEventListener('input', (e) => {
    handleActivity();
    if (activityTracker &&
        ((e.target as HTMLElement).tagName === 'INPUT' ||
         (e.target as HTMLElement).tagName === 'TEXTAREA' ||
         (e.target as HTMLElement).tagName === 'SELECT')) {
      activityTracker.formInteractions++;
    }
  });
  
  // Handle visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Save state when tab becomes hidden
      if (activityTracker && !activityTracker.isIdle) {
        activityTracker.totalActiveTime += Math.floor(
          (new Date().getTime() - activityTracker.activeTimeStart.getTime()) / 1000
        );
      }
    } else {
      // Resume tracking when tab becomes visible
      if (activityTracker) {
        activityTracker.activeTimeStart = new Date();
      }
    }
  });
  
  // Handle before unload
  window.addEventListener('beforeunload', async () => {
    // Try to end page visit (may not complete due to browser constraints)
    await endPageVisit();
  });
}

/**
 * Determine page module from pathname
 */
function getPageModule(pathname: string): string {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/control-room')) return 'control_room';
  if (pathname.startsWith('/incidents')) return 'incidents';
  if (pathname.startsWith('/cameras')) return 'camera_management';
  if (pathname.startsWith('/playback')) return 'playback';
  if (pathname.startsWith('/analytics')) return 'analytics';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/admin')) return 'administration';
  if (pathname.startsWith('/audit')) return 'audit';
  if (pathname.startsWith('/activity-report')) return 'activity_report';
  if (pathname.startsWith('/account')) return 'account';
  if (pathname.startsWith('/operations')) return 'operations';
  if (pathname.startsWith('/digital-twin')) return 'digital_twin';
  if (pathname.startsWith('/evidence')) return 'evidence';
  if (pathname.startsWith('/compliance')) return 'compliance';
  if (pathname.startsWith('/health')) return 'system_health';
  if (pathname.startsWith('/maintenance')) return 'maintenance';
  if (pathname.startsWith('/security-operations')) return 'security_operations';
  if (pathname.startsWith('/video-search')) return 'video_search';
  if (pathname.startsWith('/recordings')) return 'recordings';
  return 'other';
}

/**
 * Get page category from module
 */
function getPageCategory(module: string): string {
  if (['control_room', 'incidents', 'operations'].includes(module)) return 'operations';
  if (['camera_management', 'maintenance', 'system_health'].includes(module)) return 'monitoring';
  if (['admin', 'administration', 'account'].includes(module)) return 'administration';
  if (['reports', 'analytics', 'activity_report', 'audit'].includes(module)) return 'reports';
  return 'general';
}

/**
 * Activity Monitor Component
 */
export function ActivityMonitor({ children }: ActivityMonitorProps) {
  const pathname = usePathname();
  const isInitializedRef = useRef(false);
  const previousPathRef = useRef<string>('');
  
  // Initialize tracker on mount
  useEffect(() => {
    if (isInitializedRef.current) return;
    
    // Check if we're on an auth page
    const isAuthPage = pathname?.startsWith('/login') || 
                       pathname?.startsWith('/forgot-password') || 
                       pathname?.startsWith('/reset-password');
    
    if (isAuthPage) return;
    
    // Initialize tracker instance
    if (!activityTracker) {
      activityTracker = {
        sessionId: null,
        pageVisitId: null,
        isInitialized: false,
        heartbeatInterval: null,
        idleTimer: null,
        lastActivityTime: new Date(),
        isIdle: false,
        activeTimeStart: new Date(),
        totalActiveTime: 0,
        totalIdleTime: 0,
        clickCount: 0,
        maxScrollDepth: 0,
        formInteractions: 0,
      };
    }
    
    // Check if we have a user logged in
    const userId = getUserId();
    if (!userId) return;
    
    // Try to recover existing session
    const savedSessionId = sessionStorage.getItem('activitySessionId');
    if (savedSessionId) {
      currentSessionId = savedSessionId;
      console.log('[ActivityMonitor] Recovered session:', savedSessionId);
      startHeartbeat();
    } else {
      // Start new session
      startSession();
    }
    
    // Initialize activity listeners
    initializeListeners();
    
    activityTracker.isInitialized = true;
    isInitializedRef.current = true;
    
    // Cleanup on unmount
    return () => {
      endSession();
    };
  }, [pathname]);
  
  // Track page changes
  useEffect(() => {
    if (!pathname || !activityTracker?.isInitialized) return;
    
    // Skip auth pages
    const isAuthPage = pathname.startsWith('/login') || 
                       pathname.startsWith('/forgot-password') || 
                       pathname.startsWith('/reset-password');
    
    if (isAuthPage) return;
    
    // Skip if same page
    if (pathname === previousPathRef.current) return;
    
    previousPathRef.current = pathname;
    
    // Track the page visit
    const module = getPageModule(pathname);
    const category = getPageCategory(module);
    
    trackPageVisit(pathname, module, category);
  }, [pathname]);
  
  return <>{children}</>;
}
