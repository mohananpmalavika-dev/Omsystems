/**
 * Authentication Manager
 * Handles login/logout with activity tracking integration
 */

import { authApi } from './api-client';

/**
 * End activity tracking session
 */
async function endActivitySession(): Promise<void> {
  try {
    const sessionId = sessionStorage.getItem('activitySessionId');
    const token = sessionStorage.getItem('activityAccessToken') || localStorage.getItem('accessToken');
    
    if (!sessionId) return;
    
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || '/api/control';
    
    // End the activity session
    await fetch(`${apiBase}/v1/activity/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-sentinel-session': token } : {}),
      },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ terminationReason: 'user_logout' }),
    });
    
    console.log('[AuthManager] Activity session ended:', sessionId);
  } catch (error) {
    console.error('[AuthManager] Error ending activity session:', error);
  } finally {
    // Clean up activity tracking storage
    sessionStorage.removeItem('activitySessionId');
    sessionStorage.removeItem('activityAccessToken');
    sessionStorage.removeItem('currentPageVisitId');
  }
}

/**
 * Handle user logout
 */
export async function logout(): Promise<void> {
  try {
    // End activity tracking first
    await endActivitySession();
    
    // Then call logout API
    await authApi.logout();
    
    console.log('[AuthManager] User logged out successfully');
    
    // Redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = '/login?logout=true';
    }
  } catch (error) {
    console.error('[AuthManager] Logout error:', error);
    
    // Still clear local data even if API call fails
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login?logout=true';
    }
  }
}

/**
 * Handle logout all sessions
 */
export async function logoutAllSessions(): Promise<void> {
  try {
    // End activity tracking first
    await endActivitySession();
    
    // Then call logout all API
    await authApi.logoutAll();
    
    console.log('[AuthManager] All sessions logged out successfully');
    
    // Redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = '/login?logout=true';
    }
  } catch (error) {
    console.error('[AuthManager] Logout all error:', error);
    
    // Still clear local data even if API call fails
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login?logout=true';
    }
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  
  const user = localStorage.getItem('user');
  return !!user;
}

/**
 * Get current user
 */
export function getCurrentUser(): any | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      return JSON.parse(userStr);
    }
  } catch (e) {
    console.error('[AuthManager] Error parsing user:', e);
  }
  
  return null;
}
