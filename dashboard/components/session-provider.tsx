/** Validate the server-owned session; browser storage is only a UI cache. */
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { authApi } from '@/lib/api-client';
import { setupSessionGuard, teardownSessionGuard, redirectToLogin } from '@/lib/session-guard';
import { isPublicDashboardRoute } from '@/lib/session-navigation';

// Broadcast channel to sync session between open tabs in the same browser instance
let syncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  try {
    syncChannel = new BroadcastChannel('sentinel_session_sync');
    syncChannel.onmessage = (event) => {
      if (event.data?.type === 'SESSION_ACTIVE_QUERY') {
        if (sessionStorage.getItem('sentinel_browser_session') === 'active') {
          const userStr = sessionStorage.getItem('user');
          syncChannel?.postMessage({
            type: 'SESSION_ACTIVE_RESPONSE',
            user: userStr ? JSON.parse(userStr) : null,
          });
        }
      }
    };
  } catch {}
}

async function syncSessionFromOpenTabs(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (sessionStorage.getItem('sentinel_browser_session') === 'active') {
    return true;
  }
  if (typeof BroadcastChannel === 'undefined') return false;

  return new Promise((resolve) => {
    try {
      const channel = new BroadcastChannel('sentinel_session_sync');
      let timer: ReturnType<typeof setTimeout> | undefined;

      channel.onmessage = (event) => {
        if (event.data?.type === 'SESSION_ACTIVE_RESPONSE') {
          if (timer) clearTimeout(timer);
          try {
            sessionStorage.setItem('sentinel_browser_session', 'active');
            if (event.data.user) {
              sessionStorage.setItem('user', JSON.stringify(event.data.user));
            }
          } catch {}
          channel.close();
          resolve(true);
        }
      };

      channel.postMessage({ type: 'SESSION_ACTIVE_QUERY' });
      timer = setTimeout(() => {
        channel.close();
        resolve(false);
      }, 100);
    } catch {
      resolve(false);
    }
  });
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = isPublicDashboardRoute(pathname);
  const [connectionError, setConnectionError] = useState(false);
  const [retry, setRetry] = useState(0);
  // sessionReady prevents child components from firing authenticated API requests
  // before the session check has completed on protected routes.
  const [sessionReady, setSessionReady] = useState(isPublicRoute);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // Track consecutive failures so a single transient blip doesn't show the banner.
    let consecutiveFailures = 0;

    if (isPublicRoute) {
      teardownSessionGuard();
      setConnectionError(false);
      setSessionReady(true);
      return;
    }

    // Reset on route changes so a navigated-to protected page also validates.
    setSessionReady(false);

    const validateSession = async () => {
      try {
        // Attempt to sync active session from open tabs if present
        const hasActiveBrowserSession = await syncSessionFromOpenTabs();
        if (cancelled) return;

        if (!hasActiveBrowserSession) {
          // No active browser session in this tab or other tabs (browser was closed or fresh launch).
          // Terminate any leftover backend session cookies and redirect immediately to login.
          setConnectionError(false);
          try {
            await authApi.logout();
          } catch {}
          redirectToLogin('auth_required');
          return;
        }

        // Authoritatively validate the session with the server.
        const user = await authApi.getCurrentUser();
        if (cancelled) return;
        try {
          sessionStorage.setItem('sentinel_browser_session', 'active');
          if (user?.id) {
            sessionStorage.setItem('user', JSON.stringify(user));
            localStorage.setItem('user', JSON.stringify(user));
          }
        } catch { /* Restricted browser storage does not invalidate a session. */ }
        // Reset failure tracking on success
        consecutiveFailures = 0;
        setConnectionError(false);
        setSessionReady(true);
        setupSessionGuard();
      } catch (error) {
        if (cancelled) return;
        // The API client handles confirmed invalid sessions and preserves the
        // destination. An unavailable auth service must not cause a login loop.
        const status = (error as { statusCode?: number })?.statusCode;
        if (status === 400 || status === 401 || status === 403) {
          setConnectionError(false);
          redirectToLogin('expired');
          return;
        }
        consecutiveFailures += 1;
        // Only show the banner after 2+ consecutive failures to avoid
        // flashing the message on brief/transient network blips.
        if (consecutiveFailures >= 2) {
          setConnectionError(true);
        }
        // Exponential backoff: 8s → 16s → 32s → max 60s.
        // Avoids hammering the server when it is slow or briefly unavailable.
        const backoffMs = Math.min(8000 * Math.pow(2, consecutiveFailures - 1), 60000);
        retryTimer = setTimeout(() => void validateSession(), backoffMs);
      }
    };

    void validateSession();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      teardownSessionGuard();
    };
  }, [isPublicRoute, retry]);

  return <>
    {!isPublicRoute && connectionError && (
      <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Connection interrupted. Your workspace is preserved while we reconnect.
        <button type="button" className="ml-3 font-semibold underline underline-offset-2" onClick={() => setRetry((value) => value + 1)}>Retry now</button>
      </div>
    )}
    {!isPublicRoute && !sessionReady ? (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500" role="status" aria-label="Verifying session" />
      </div>
    ) : children}
  </>;
}
