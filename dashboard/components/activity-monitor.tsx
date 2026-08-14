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
let sessionStartPromise: Promise<string | null> | null = null;
let pageTransitionPromise: Promise<void> = Promise.resolve();
let removeActivityListeners: (() => void) | null = null;

interface ActivityTrackerInstance {
  sessionId: string | null;
  pageVisitId: string | null;
  isInitialized: boolean;
  heartbeatInterval: NodeJS.Timeout | null;
  idleTimer: NodeJS.Timeout | null;
  lastActivityTime: Date;
  isIdle: boolean;
  pageVisitStartTime: Date;
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

function activityHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (json) headers['Content-Type'] = 'application/json';
  // Legacy deployments still accept this header. Current deployments use the
  // HttpOnly session cookie, so a JavaScript-readable token is not required.
  if (token) headers['x-sentinel-session'] = token;
  return headers;
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
  const userId = getUserId();
  
  if (!userId) {
    console.warn('[ActivityMonitor] No authenticated user, skipping session start');
    return null;
  }

  if (sessionStartPromise) return sessionStartPromise;
  
  sessionStartPromise = (async () => { try {
    const response = await fetch(`${getApiBase()}/v1/activity/sessions/start`, {
      method: 'POST',
      headers: activityHeaders(true),
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
    const token = getAccessToken();
    if (token) sessionStorage.setItem('activityAccessToken', token);
    
    console.log('[ActivityMonitor] Session started:', data.sessionId);
    
    // Start heartbeat
    startHeartbeat();
    
    return data.sessionId;
  } catch (error) {
    console.error('[ActivityMonitor] Error starting session:', error);
    return null;
  } finally {
    sessionStartPromise = null;
  } })();

  return sessionStartPromise;
}

/**
 * End activity session
 */
async function endSession(): Promise<void> {
  if (!currentSessionId) return;
  
  try {
    // End current page visit first
    await endPageVisit();
    
    await fetch(`${getApiBase()}/v1/activity/sessions/${currentSessionId}/end`, {
      method: 'POST',
      headers: activityHeaders(true),
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ terminationReason: 'component_unmount' }),
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
      await fetch(`${getApiBase()}/v1/activity/heartbeat`, {
        method: 'POST',
        headers: activityHeaders(true),
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
    const response = await fetch(`${getApiBase()}/v1/activity/page-visits`, {
      method: 'POST',
      headers: activityHeaders(true),
      credentials: 'include',
      body: JSON.stringify({
        sessionId: currentSessionId,
        pagePath,
        pageTitle: pageTitle || document.title,
        pageModule,
        pageCategory,
        referrerPath: currentPageVisitId ? document.referrer : null,
        // Query strings can contain searches, tokens, or personal data. Branch
        // and camera context is captured explicitly by monitoring events.
        queryParameters: {},
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
      activityTracker.pageVisitStartTime = new Date();
      activityTracker.activeTimeStart = activityTracker.pageVisitStartTime;
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
    const now = new Date();
    const durationSeconds = Math.floor(
      (now.getTime() - activityTracker.pageVisitStartTime.getTime()) / 1000
    );
    
    // Finalize whichever activity phase is currently open.
    if (activityTracker.isIdle) {
      activityTracker.totalIdleTime += Math.floor(
        (now.getTime() - activityTracker.activeTimeStart.getTime()) / 1000
      );
    } else {
      activityTracker.totalActiveTime += Math.floor(
        (now.getTime() - activityTracker.activeTimeStart.getTime()) / 1000
      );
    }
    activityTracker.activeTimeStart = now;
    
    await fetch(`${getApiBase()}/v1/activity/page-visits/${currentPageVisitId}/end`, {
      method: 'PUT',
      headers: activityHeaders(true),
      credentials: 'include',
      keepalive: true,
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
    await fetch(`${getApiBase()}/v1/activity/actions`, {
      method: 'POST',
      headers: activityHeaders(true),
      credentials: 'include',
      keepalive: true,
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
    if (!activityTracker || activityTracker.isIdle) return;
    
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

const SENSITIVE_LABEL = /password|passcode|secret|token|credential|api\s*key|private\s*key/i;

function safeControlLabel(element: HTMLElement): string {
  const candidate = element.dataset.activityAction ||
    element.getAttribute('aria-label') ||
    element.getAttribute('title') ||
    element.getAttribute('name') ||
    element.id ||
    element.textContent ||
    element.tagName.toLowerCase();
  const normalized = candidate.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!normalized || SENSITIVE_LABEL.test(normalized)) return 'redacted_control';
  return normalized;
}

function captureControlClick(event: MouseEvent) {
  const origin = event.target instanceof Element ? event.target : null;
  const control = origin?.closest<HTMLElement>(
    'button, a, [role="button"], [role="menuitem"], [data-activity-action]',
  );
  if (!control || control.dataset.activityIgnore === 'true') return;

  const label = safeControlLabel(control);
  const isLink = control instanceof HTMLAnchorElement;
  let destination: string | undefined;
  if (isLink && control.href) {
    try {
      destination = new URL(control.href, window.location.origin).pathname;
    } catch {
      destination = undefined;
    }
  }

  const context = control.closest<HTMLElement>('[data-activity-branch-id], [data-activity-camera-id]') || control;
  const metadata: Record<string, string> = {
    captureSource: 'delegated_click',
    elementRole: control.getAttribute('role') || control.tagName.toLowerCase(),
    pagePath: window.location.pathname,
  };
  if (destination) metadata.destination = destination;
  if (context.dataset.activityBranchId) metadata.branchId = context.dataset.activityBranchId;
  if (context.dataset.activityBranchName) metadata.branchName = context.dataset.activityBranchName.slice(0, 120);
  if (context.dataset.activityCameraId) metadata.cameraId = context.dataset.activityCameraId;

  void trackUserAction('button_click', isLink ? 'navigation' : 'interaction', getPageModule(window.location.pathname), {
    actionTarget: label,
    actionDescription: `${isLink ? 'Opened' : 'Clicked'} ${label}`,
    featureName: control.dataset.activityFeature,
    actionMetadata: metadata,
  });
}

function captureFormSubmit(event: SubmitEvent) {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form || form.dataset.activityIgnore === 'true') return;
  const label = safeControlLabel(form);
  void trackUserAction('form_submit', 'data_entry', getPageModule(window.location.pathname), {
    actionTarget: label,
    actionDescription: `Submitted ${label}`,
    actionMetadata: {
      captureSource: 'delegated_submit',
      pagePath: window.location.pathname,
      // Deliberately never capture field names or values here.
      fieldCount: String(form.elements.length),
    },
  });
}

/**
 * Initialize activity listeners
 */
function initializeListeners() {
  if (typeof window === 'undefined' || removeActivityListeners) return;
  
  // Track clicks
  const onClick = (event: MouseEvent) => {
    handleActivity();
    if (activityTracker) {
      activityTracker.clickCount++;
    }
    captureControlClick(event);
  };
  document.addEventListener('click', onClick);
  
  // Track scroll
  let scrollTimeout: NodeJS.Timeout;
  const onScroll = () => {
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
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  
  // Track keyboard
  const onKeydown = () => handleActivity();
  document.addEventListener('keydown', onKeydown);
  
  // Track mouse movement
  let mouseMoveTimeout: NodeJS.Timeout;
  const onMousemove = () => {
    clearTimeout(mouseMoveTimeout);
    mouseMoveTimeout = setTimeout(() => {
      handleActivity();
    }, 200);
  };
  document.addEventListener('mousemove', onMousemove, { passive: true });
  
  // Track form interactions
  const onInput = (e: Event) => {
    handleActivity();
    if (activityTracker &&
        ((e.target as HTMLElement).tagName === 'INPUT' ||
         (e.target as HTMLElement).tagName === 'TEXTAREA' ||
         (e.target as HTMLElement).tagName === 'SELECT')) {
      activityTracker.formInteractions++;
    }
  };
  document.addEventListener('input', onInput);
  document.addEventListener('submit', captureFormSubmit);
  
  // Handle visibility change
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      if (activityTracker && !activityTracker.isIdle) {
        if (activityTracker.idleTimer) clearTimeout(activityTracker.idleTimer);
        activityTracker.totalActiveTime += Math.floor(
          (new Date().getTime() - activityTracker.activeTimeStart.getTime()) / 1000
        );
        activityTracker.isIdle = true;
        activityTracker.activeTimeStart = new Date();
      }
    } else {
      if (activityTracker) {
        if (activityTracker.isIdle) {
          activityTracker.totalIdleTime += Math.floor(
            (new Date().getTime() - activityTracker.activeTimeStart.getTime()) / 1000
          );
        }
        activityTracker.isIdle = false;
        activityTracker.activeTimeStart = new Date();
        resetIdleTimer();
      }
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  
  // Handle before unload
  const onBeforeUnload = () => {
    const sessionId = currentSessionId;
    if (!sessionId) return;
    // The session endpoint closes the active page and monitoring record on the
    // server. keepalive gives refresh/browser-close requests time to finish.
    void fetch(`${getApiBase()}/v1/activity/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: activityHeaders(true),
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ terminationReason: 'browser_exit' }),
    });
    sessionStorage.removeItem('activitySessionId');
    sessionStorage.removeItem('currentPageVisitId');
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  removeActivityListeners = () => {
    document.removeEventListener('click', onClick);
    document.removeEventListener('scroll', onScroll);
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('mousemove', onMousemove);
    document.removeEventListener('input', onInput);
    document.removeEventListener('submit', captureFormSubmit);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('beforeunload', onBeforeUnload);
    clearTimeout(scrollTimeout);
    clearTimeout(mouseMoveTimeout);
    removeActivityListeners = null;
  };
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
  
  // Initialize after authentication, then serialize the first page entry behind
  // session creation so it cannot be lost while the request is in flight.
  useEffect(() => {
    const isAuthPage = pathname?.startsWith('/login') || 
                       pathname?.startsWith('/forgot-password') || 
                       pathname?.startsWith('/reset-password');
    if (!pathname || isAuthPage || !getUserId()) return;

    let cancelled = false;
    const initializeAndTrack = async () => {
      if (!activityTracker) {
        activityTracker = {
          sessionId: null,
          pageVisitId: null,
          isInitialized: false,
          heartbeatInterval: null,
          idleTimer: null,
          lastActivityTime: new Date(),
          isIdle: false,
          pageVisitStartTime: new Date(),
          activeTimeStart: new Date(),
          totalActiveTime: 0,
          totalIdleTime: 0,
          clickCount: 0,
          maxScrollDepth: 0,
          formInteractions: 0,
        };
      }

      initializeListeners();

      if (!currentSessionId) {
        const savedSessionId = sessionStorage.getItem('activitySessionId');
        if (savedSessionId) {
          currentSessionId = savedSessionId;
          startHeartbeat();
        } else {
          await startSession();
        }
      }

      if (cancelled || !currentSessionId || !activityTracker) return;
      activityTracker.sessionId = currentSessionId;
      activityTracker.isInitialized = true;
      isInitializedRef.current = true;

      if (pathname === previousPathRef.current) return;
      previousPathRef.current = pathname;
      const module = getPageModule(pathname);
      pageTransitionPromise = pageTransitionPromise
        .catch(() => undefined)
        .then(async () => {
          await trackPageVisit(pathname, module, getPageCategory(module));
        });
      await pageTransitionPromise;
    };

    void initializeAndTrack();
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => () => {
    removeActivityListeners?.();
    if (activityTracker?.idleTimer) clearTimeout(activityTracker.idleTimer);
    void endSession();
    isInitializedRef.current = false;
  }, []);
  
  return <>{children}</>;
}
