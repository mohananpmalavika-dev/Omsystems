'use client';

import { useEffect } from 'react';
import { initializePerformanceMonitoring } from '@/lib/performance-monitor';

/**
 * Provider component that initializes client-side performance monitoring
 * Starts collecting Core Web Vitals and page metrics automatically
 */
export function PerformanceMonitorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Initialize performance monitoring on client-side only
    const monitor = initializePerformanceMonitoring();
    
    // Flush metrics before page unload
    const handleBeforeUnload = () => {
      if (monitor) {
        monitor.flush();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return <>{children}</>;
}
