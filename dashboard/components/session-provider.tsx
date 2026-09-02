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
  const [hasValidatedSession, setHasValidatedSession] = useState(true);

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
      } catch {
        if (cancelled) return;
        // If there's no stored session at all, redirect to login
        if (typeof window !== "undefined" && !localStorage.getItem("user") && !localStorage.getItem("accessToken") && !localStorage.getItem("sentinel_login_time")) {
          window.location.href = "/login?expired=true";
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

  return <>{children}</>;
}
