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
    if (isPublicRoute) {
      teardownSessionGuard();
      setHasValidatedSession(false);
      return () => { cancelled = true; };
    }

    setHasValidatedSession(false);
    void authApi.getCurrentUser()
      .then(() => {
        if (cancelled) return;
        setupSessionGuard();
        setHasValidatedSession(true);
      })
      .catch(() => {
        // api-client has already attempted the HttpOnly refresh and redirects
        // only when it cannot restore the session. Keep app content unmounted
        // while that redirect is in flight so child fetches cannot spam 401s.
        if (!cancelled) setHasValidatedSession(false);
      });

    return () => { cancelled = true; };
  }, [isPublicRoute]);

  // This check is deliberately synchronous. When Login routes to a protected
  // page, the old public-route state must not mount dashboard children for one
  // render before the verification effect has a chance to run.
  if (!isPublicRoute && !hasValidatedSession) {
    return <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">Restoring your secure session…</div>;
  }

  return <>{children}</>;
}
