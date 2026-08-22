/**
 * Session Provider
 * Wraps the application with session management
 */

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { setupSessionGuard } from '@/lib/session-guard';
import { requestLocalEdgeAutostart } from '@/lib/local-edge-autostart';

interface SessionProviderProps {
  children: React.ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const pathname = usePathname();

  useEffect(() => {
    // Don't setup session guard on auth pages
    const isAuthPage = pathname?.startsWith('/login') || 
                       pathname?.startsWith('/forgot-password') || 
                       pathname?.startsWith('/reset-password') ||
                       pathname?.startsWith('/support') ||
                       pathname?.startsWith('/privacy') ||
                       pathname?.startsWith('/terms');

    if (!isAuthPage) {
      setupSessionGuard();
      requestLocalEdgeAutostart();
    }
  }, [pathname]);

  return <>{children}</>;
}
