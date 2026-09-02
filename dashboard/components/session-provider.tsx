/**
 * Session Provider
 * Wraps the application with session management
 */

'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { authApi } from '@/lib/api-client';
import { setupSessionGuard, teardownSessionGuard } from '@/lib/session-guard';

interface SessionProviderProps {
  children: React.ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const pathname = usePathname();
  const [hasValidatedSession, setHasValidatedSession] = useState(false);

  const isPublicRoute = pathname?.startsWith('/login') ||
    pathname?.startsWith('/forgot-password') ||
    pathname?.startsWith('/reset-password') ||
    pathname?.startsWith('/support') ||
    pathname?.startsWith('/privacy') ||
    pathname?.startsWith('/terms');

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    if (isPublicRoute) {
      teardownSessionGuard();
      setHasValidatedSession(false);
      return () => {
        cancelled = true;
        if (retryTimer) clearTimeout(retryTimer);
      };
    }

    setHasValidatedSession(false);
    const validateSession = async () => {
      try {
        await authApi.getCurrentUser();
        if (cancelled) return;
        setupSessionGuard();
        setHasValidatedSession(true);
      } catch {
        if (cancelled) return;
        // api-client has already attempted the HttpOnly refresh and redirects
        // only for a real authentication failure. A transport/server outage is
        // recoverable, so keep the app protected and retry without erasing the
        // successful login.
        setHasValidatedSession(false);
        retryTimer = setTimeout(() => { void validateSession(); }, 3_000);
      }
    };
    void validateSession();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [isPublicRoute]);

  // This check is deliberately synchronous. When Login routes to a protected
  // page, the old public-route state must not mount dashboard children for one
  // render before the verification effect has a chance to run.
  if (!isPublicRoute && !hasValidatedSession) {
    return <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">Restoring your secure session…</div>;
  }

  return <>{children}</>;
}
