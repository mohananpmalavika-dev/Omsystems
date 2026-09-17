/**
 * Performance Monitoring Hook
 * 
 * Tracks load times, render times, and API response times
 */

import { useEffect, useRef, useState } from 'react';

export interface PerformanceMetrics {
  /** Page load time in milliseconds */
  loadTime: number;
  
  /** API response time in milliseconds */
  apiResponseTime: number;
  
  /** Render time in milliseconds */
  renderTime: number;
  
  /** Total time from mount to data ready */
  totalTime: number;
  
  /** Timestamp when measurement started */
  startedAt: number;
  
  /** Timestamp when measurement completed */
  completedAt: number | null;
}

export function usePerformanceMonitor(reportName: string) {
  const startTimeRef = useRef<number>(Date.now());
  const apiStartRef = useRef<number | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    loadTime: 0,
    apiResponseTime: 0,
    renderTime: 0,
    totalTime: 0,
    startedAt: Date.now(),
    completedAt: null,
  });
  
  // Track API call start
  const trackAPIStart = () => {
    apiStartRef.current = Date.now();
  };
  
  // Track API call end
  const trackAPIEnd = () => {
    if (apiStartRef.current) {
      const responseTime = Date.now() - apiStartRef.current;
      setMetrics(prev => ({
        ...prev,
        apiResponseTime: responseTime,
      }));
    }
  };
  
  // Track render complete
  const trackRenderComplete = () => {
    const now = Date.now();
    const totalTime = now - startTimeRef.current;
    const renderTime = metrics.apiResponseTime > 0 
      ? totalTime - metrics.apiResponseTime 
      : totalTime;
    
    setMetrics(prev => ({
      ...prev,
      renderTime,
      totalTime,
      loadTime: totalTime,
      completedAt: now,
    }));
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${reportName}:`, {
        'API Response': `${metrics.apiResponseTime}ms`,
        'Render Time': `${renderTime}ms`,
        'Total Time': `${totalTime}ms`,
      });
    }
    
    // Send to analytics (if available)
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'timing_complete', {
        name: reportName,
        value: totalTime,
        event_category: 'Report Performance',
        event_label: reportName,
      });
    }
  };
  
  return {
    metrics,
    trackAPIStart,
    trackAPIEnd,
    trackRenderComplete,
  };
}
