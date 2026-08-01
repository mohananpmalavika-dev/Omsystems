/**
 * Session Guard
 * Monitors session validity and redirects to login when expired
 */

let sessionCheckInterval: NodeJS.Timeout | null = null;
let isCheckingSession = false;

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
export function redirectToLogin(reason: 'expired' | 'invalid' | 'network' = 'expired') {
  if (typeof window === 'undefined') return;
  
  // Clear all session data
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  
  // Stop session checking
  stopSessionCheck();
  
  // Redirect to login with reason
  const currentPath = window.location.pathname;
  if (currentPath !== '/auth/login' && !currentPath.startsWith('/auth/')) {
    const params = new URLSearchParams({ reason });
    window.location.href = `/auth/login?${params.toString()}`;
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
    const response = await fetch('/api/control/v1/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.status === 401 || response.status === 403) {
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
  
  // Start session checking every minute
  startSessionCheck(60000);
  
  // Check session on page visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkSession();
    }
  });
  
  // Check session on page focus
  window.addEventListener('focus', () => {
    checkSession();
  });
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    stopSessionCheck();
  });
}
