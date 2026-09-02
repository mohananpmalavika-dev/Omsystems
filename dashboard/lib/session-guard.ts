/**
 * Session Guard
 * Monitors session validity and redirects to login when expired
 */

import { logout as authManagerLogout } from './auth-manager';
import { refreshCookieBackedSession } from './api-client';

let sessionCheckInterval: NodeJS.Timeout | null = null;
let isCheckingSession = false;
let sessionGuardCleanup: (() => void) | null = null;

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  
  const user = localStorage.getItem('user');
  return !!user;
}

/**
 * Redirect to login page
 */
export async function redirectToLogin(reason: 'expired' | 'invalid' | 'network' = 'expired') {
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
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('sentinel_login_time');
  sessionStorage.removeItem('activitySessionId');
  sessionStorage.removeItem('activityAccessToken');
  sessionStorage.removeItem('currentPageVisitId');
  
  // Stop session checking
  teardownSessionGuard();
  
  // Redirect to login with reason
  const currentPath = window.location.pathname;
  if (currentPath !== '/login') {
    const params = new URLSearchParams({ reason });
    window.location.href = `/login?${params.toString()}`;
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
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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

  // Cleanup on page unload
  const onBeforeUnload = () => { stopSessionCheck(); };
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
