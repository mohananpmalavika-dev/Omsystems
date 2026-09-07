/** Validate the server-owned session; browser storage is only a UI cache. */
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { authApi } from '@/lib/api-client';
import { setupSessionGuard, teardownSessionGuard } from '@/lib/session-guard';
import { isPublicDashboardRoute } from '@/lib/session-navigation';
import { redirectToLogin } from '@/lib/session-guard';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = isPublicDashboardRoute(pathname);
  const [connectionError, setConnectionError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    if (isPublicRoute) {
      teardownSessionGuard();
      setConnectionError(false);
      return;
    }

    const validateSession = async () => {
      try {
        const user = await authApi.getCurrentUser();
        if (cancelled) return;
        // A new tab can have a valid HttpOnly cookie without sessionStorage.
        // Let the server validate it before restoring the optional UI cache.
        try {
          sessionStorage.setItem('sentinel_browser_session', 'active');
          if (user?.id) localStorage.setItem('user', JSON.stringify(user));
        } catch { /* Restricted browser storage does not invalidate a session. */ }
        setConnectionError(false);
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
        setConnectionError(true);
        retryTimer = setTimeout(() => void validateSession(), 5000);
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
    {children}
  </>;
}
