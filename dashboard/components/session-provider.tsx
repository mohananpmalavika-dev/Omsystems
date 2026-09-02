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
  const [hasValidatedSession, setHasValidatedSession] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(localStorage.getItem("user") || localStorage.getItem("accessToken") || localStorage.getItem("sentinel_login_time"));
  });

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

    const validateSession = async () => {
      try {
        await authApi.getCurrentUser();
        if (cancelled) return;
        setupSessionGuard();
        setHasValidatedSession(true);
      } catch {
        if (cancelled) return;
        // If there's no stored session at all, clear validated session
        if (typeof window !== "undefined" && !localStorage.getItem("user") && !localStorage.getItem("accessToken")) {
          setHasValidatedSession(false);
        }
        retryTimer = setTimeout(() => { void validateSession(); }, 5_000);
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
