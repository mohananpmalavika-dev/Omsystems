/**
 * Session Provider
 * Wraps the application with session management
 * Enforces session logout on browser close while allowing multi-tab sync and page refresh
 */

'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { authApi } from '@/lib/api-client';
import { setupSessionGuard, teardownSessionGuard } from '@/lib/session-guard';

interface SessionProviderProps {
  children: React.ReactNode;
}

function checkOtherOpenTabs(): Promise<boolean> {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    try {
      const channel = new BroadcastChannel('sentinel_session_sync');
      let responded = false;
      const timeout = setTimeout(() => {
        try { channel.close(); } catch {}
        resolve(responded);
      }, 100);

      channel.onmessage = (event) => {
        if (event.data?.type === 'SESSION_PONG') {
          responded = true;
          clearTimeout(timeout);
          try { channel.close(); } catch {}
          resolve(true);
        }
      };
      channel.postMessage({ type: 'SESSION_PING' });
    } catch {
      resolve(false);
    }
  });
}

// Global listener to answer session pings from sibling tabs
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    const channel = new BroadcastChannel('sentinel_session_sync');
    channel.onmessage = (event) => {
      if (
        event.data?.type === 'SESSION_PING' &&
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem('sentinel_browser_session') === 'active'
      ) {
        try {
          channel.postMessage({ type: 'SESSION_PONG' });
        } catch {}
      }
    };
  } catch {}
}

export function SessionProvider({ children }: SessionProviderProps) {
  const pathname = usePathname();

  const isPublicRoute =
    pathname?.startsWith('/login') ||
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
      if (typeof window !== 'undefined') {
        const hasSessionStorage = sessionStorage.getItem('sentinel_browser_session') === 'active';
        const hasStoredUser = Boolean(
          localStorage.getItem('user') || localStorage.getItem('accessToken'),
        );

        // If sessionStorage was wiped but localStorage still had leftovers:
        // this indicates the browser was completely closed and reopened.
        if (!hasSessionStorage && hasStoredUser) {
          const hasSiblingTab = await checkOtherOpenTabs();
          if (cancelled) return;
          if (hasSiblingTab) {
            sessionStorage.setItem('sentinel_browser_session', 'active');
          } else {
            // Browser was closed! Terminate session and redirect to login
            sessionStorage.clear();
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            localStorage.removeItem('sentinel_login_time');
            window.location.href = '/login?reason=expired';
            return;
          }
        }
      }

      try {
        await authApi.getCurrentUser();
        if (cancelled) return;
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('sentinel_browser_session', 'active');
        }
        setupSessionGuard();
      } catch {
        if (cancelled) return;
        if (typeof window !== 'undefined') {
          const hasSession =
            sessionStorage.getItem('sentinel_browser_session') === 'active' ||
            Boolean(localStorage.getItem('user'));
          if (!hasSession) {
            window.location.href = '/login?expired=true';
            return;
          }
        }
        retryTimer = setTimeout(() => {
          void validateSession();
        }, 5000);
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
