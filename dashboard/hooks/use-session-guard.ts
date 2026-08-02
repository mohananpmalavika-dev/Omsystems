/**
 * useSessionGuard Hook
 * React hook for automatic session management
 */

'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { setupSessionGuard, isAuthenticated, redirectToLogin } from '@/lib/session-guard';

/**
 * Hook to protect routes and manage session
 */
export function useSessionGuard(options?: {
  requireAuth?: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const requireAuth = options?.requireAuth ?? true;
  const redirectTo = options?.redirectTo ?? '/login';

  useEffect(() => {
    // Setup session monitoring
    setupSessionGuard();

    // Check authentication on mount
    if (requireAuth && !isAuthenticated()) {
      const isLoginPage = pathname === '/login';
      
      if (!isLoginPage) {
        redirectToLogin('invalid');
      }
    }
  }, [requireAuth, pathname, redirectTo, router]);

  return {
    isAuthenticated: isAuthenticated(),
    redirectToLogin,
  };
}

/**
 * Hook for public pages that don't require authentication
 */
export function usePublicPage() {
  return useSessionGuard({ requireAuth: false });
}
