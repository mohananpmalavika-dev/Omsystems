/**
 * Session Guard
 * Monitors session validity and redirects to login when expired
 */

import { logout as authManagerLogout } from './auth-manager';
import { refreshCookieBackedSession, reportApiFailure } from './api-client';
import { loginPath } from './session-navigation';

let sessionCheckInterval: NodeJS.Timeout | null = null;
let isCheckingSession = false;
let sessionGuardCleanup: (() => void) | null = null;
/**
 * Kept for callers that perform hard navigation. Navigation no longer revokes
 * the employee session; only explicit sign-out or server expiry does that.
 */
export function markInAppNavigation(): void {
  // No-op for compatibility with existing navigation callers.
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
    
    if (response.status === 401) {
      // Current browser sessions are intentionally cookie-backed. The BFF
      // owns the refresh token, so refresh even when localStorage has none.
      if (await refreshCookieBackedSession()) return;

      console.warn('Session expired or invalid');
      void redirectToLogin('expired');
    } else if (response.status === 403) {
      const error = await response.json().catch(() => ({}));
      reportApiFailure(403, error, 'Session check was denied. Your workspace remains open.');
    } else if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      reportApiFailure(response.status, error, 'Session check failed; the server may be temporarily unavailable.');
    }
  } catch (error) {
    console.error('Session check network error:', error);
    reportApiFailure(
      (error as { statusCode?: number })?.statusCode ?? 0,
      { error: 'session_check_unavailable', message: error instanceof Error ? error.message : undefined },
      'Cannot verify your session right now. Your workspace remains open.',
    );
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

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onFocus);
  sessionGuardCleanup = () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', onFocus);
    sessionGuardCleanup = null;
  };
}

/** Remove session checks when the app enters a public route or signs out. */
export function teardownSessionGuard() {
  stopSessionCheck();
  sessionGuardCleanup?.();
}
