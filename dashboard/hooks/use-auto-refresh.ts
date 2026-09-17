/**
 * Auto-Refresh Hook
 * 
 * Provides auto-refresh functionality for reports
 */

import { useEffect, useState, useCallback } from 'react';

export interface AutoRefreshOptions {
  /** Initial enabled state */
  enabled?: boolean;
  
  /** Refresh interval in milliseconds (default: 60000 = 1 minute) */
  interval?: number;
  
  /** Callback to execute on refresh */
  onRefresh: () => void | Promise<void>;
  
  /** Optional: Pause refresh when tab is not visible */
  pauseWhenHidden?: boolean;
}

export function useAutoRefresh({
  enabled: initialEnabled = false,
  interval = 60000,
  onRefresh,
  pauseWhenHidden = true,
}: AutoRefreshOptions) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isVisible, setIsVisible] = useState(true);
  
  // Track visibility
  useEffect(() => {
    if (!pauseWhenHidden) return;
    
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pauseWhenHidden]);
  
  // Auto-refresh logic
  useEffect(() => {
    if (!enabled || (pauseWhenHidden && !isVisible)) return;
    
    const intervalId = setInterval(() => {
      onRefresh();
    }, interval);
    
    return () => clearInterval(intervalId);
  }, [enabled, interval, onRefresh, isVisible, pauseWhenHidden]);
  
  const toggle = useCallback(() => {
    setEnabled(prev => !prev);
  }, []);
  
  return {
    enabled,
    setEnabled,
    toggle,
  };
}
