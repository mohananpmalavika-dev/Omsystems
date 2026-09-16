/**
 * Session Guard
 * Monitors session validity and redirects to login when expired
 */

import { logout as authManagerLogout } from './auth-manager';
import { refreshCookieBackedSession } from './api-client';
import { loginPath } from './session-navigation';

let sessionCheckInterval: NodeJS.Timeout | null = null;
let isCheckingSession = false;
let sessionGuardCleanup: (() => void) | null = null;
// Set to true before window.location.assign() for in-app hard navigations
// so the beforeunload logout beacon is skipped (only fires on actual browser close).
let inAppNavigating = false;

/**
 * Call this immediately before any window.location.assign() / window.location.href
 * assignment that is an in-app navigation (not a browser close).
 * Prevents the logout beacon from firing on hard in-app navigation.
 */
export function markInAppNavigation(): void {
  inAppNavigating = true;
  // Reset after a short delay in case the navigation is somehow cancelled
  setTimeout(() => { inAppNavigating = false; }, 3000);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const hasBrowserSession = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sentinel_browser_session') === 'active';
    const user = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('user') : null) ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null);
    return hasBrowserSession && !!user;
  } catch {
    return false;
  }
}

/**
 * Redirect to login page
 */
export async function redirectToLogin(reason: 'expired' | 'invalid' | 'network' | 'auth_required' | 'login' = 'expired') {
  if (typeof window === 'undefined') return;

  // End activity session before clearing data
  try {
    const sessionId = sessionStorage.getItem('activitySessionId');
    const token = sessionStorage.getItem('activityAccessToken') || localStorage.getItem('accessToken');
    
    if (sessionId && token) {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || '/api/control';
      await fetch(`${apiBase}/v1/activity/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: {
          'x-sentinel-session': token,
        },
        credentials: 'include',
      });
    }
  } catch (error) {
    console.error('[SessionGuard] Error ending activity session:', error);
  }
  
  // Clear all session data
  sessionStorage.clear();
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('sentinel_login_time');
  
  // Stop session checking
  teardownSessionGuard();
  
  // Redirect to login with reason
  const currentPath = window.location.pathname;
  if (currentPath !== '/login') {
    window.location.href = loginPath(reason, window.location);
  }
}

/**
 * Check session validity by making a lightweight API call
 */
async function checkSession() {
  if (isCheckingSession) return;
  if (!isAuthenticated()) return;
  
  isCheckingSession = true;
  
  try {
    const token = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-silent': 'true',
    };
    if (token) {
      headers['x-sentinel-session'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('/api/control/v1/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    
    if (response.status === 401 || response.status === 403) {
      // Current browser sessions are intentionally cookie-backed. The BFF
      // owns the refresh token, so refresh even when localStorage has none.
      if (await refreshCookieBackedSession()) return;

      console.warn('Session expired or invalid');
      redirectToLogin('expired');
    } else if (!response.ok) {
      console.error('Session check failed:', response.status);
      // Don't redirect on 500 errors - might be temporary
      if (response.status === 503 || response.status === 502) {
        console.warn('Server temporarily unavailable');
      }
    }
  } catch (error) {
    console.error('Session check network error:', error);
    // Don't redirect on network errors - might be temporary connection issues
  } finally {
    isCheckingSession = false;
  }
}

/**
 * Start periodic session checking
 */
export function startSessionCheck(intervalMs: number = 60000) {
  if (typeof window === 'undefined') return;
  if (sessionCheckInterval) return; // Already running
  
  // Initial check
  checkSession();
  
  // Set up periodic checks
  sessionCheckInterval = setInterval(() => {
    checkSession();
  }, intervalMs);
}

/**
 * Stop session checking
 */
export function stopSessionCheck() {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
}

/**
 * Setup session guard for the application
 * Call this in your root layout or app component
 */
export function setupSessionGuard() {
  if (typeof window === 'undefined') return;
  if (sessionGuardCleanup) {
    startSessionCheck(60000);
    return;
  }

  // Start session checking every minute
  startSessionCheck(60000);

  // Check session on page visibility change
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      checkSession();
    }
  };

  // Check session on page focus
  const onFocus = () => { checkSession(); };

  // On browser/tab close: immediately invalidate the backend session using
  // navigator.sendBeacon — the only API that survives page unload reliably.
  // Also clear localStorage tokens synchronously so no credentials linger.
  const onBeforeUnload = () => {
    stopSessionCheck();

    // Clear local credentials immediately — synchronous, always runs
    try {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('sentinel_login_time');
    } catch {}

    // Only send logout beacon on actual browser/tab close.
    // Skip when this unload was triggered by an in-app hard navigation
    // (e.g. window.location.assign from the Live Wall) — those navigations
    // call markInAppNavigation() before assigning the URL.
    if (inAppNavigating) return;

    // Fire logout to the server — sendBeacon survives tab/browser close.
    // sendBeacon automatically includes cookies, so the backend authenticates
    // the request normally via the sentinel_access / sentinel_session cookie.
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || '/api/control';

    // End activity session
    const activitySessionId = (() => {
      try { return sessionStorage.getItem('activitySessionId') || ''; } catch { return ''; }
    })();
    if (activitySessionId) {
      const activityBlob = new Blob(
        [JSON.stringify({ terminationReason: 'browser_close' })],
        { type: 'application/json' }
      );
      navigator.sendBeacon?.(
        `${apiBase}/v1/activity/sessions/${activitySessionId}/end`,
        activityBlob
      );
    }

    // Logout — invalidate the backend cookie/token session
    const logoutBlob = new Blob(
      [JSON.stringify({ reason: 'browser_close' })],
      { type: 'application/json' }
    );
    navigator.sendBeacon?.(`${apiBase}/v1/auth/logout`, logoutBlob);
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onFocus);
  window.addEventListener('beforeunload', onBeforeUnload);
  sessionGuardCleanup = () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('beforeunload', onBeforeUnload);
    sessionGuardCleanup = null;
  };
}

/** Remove session checks when the app enters a public route or signs out. */
export function teardownSessionGuard() {
  stopSessionCheck();
  sessionGuardCleanup?.();
}
