/**
 * Auto-Refresh Toggle Component
 * 
 * Reusable toggle button for auto-refresh functionality
 */

'use client';

import { RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';

interface AutoRefreshToggleProps {
  enabled: boolean;
  onToggle: () => void;
  interval?: number; // in milliseconds
  lastRefreshed?: Date;
}

export function AutoRefreshToggle({
  enabled,
  onToggle,
  interval = 60000,
  lastRefreshed,
}: AutoRefreshToggleProps) {
  const [countdown, setCountdown] = useState<number>(interval / 1000);
  
  useEffect(() => {
    if (!enabled || !lastRefreshed) return;
    
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - lastRefreshed.getTime();
      const remaining = Math.max(0, Math.ceil((interval - elapsed) / 1000));
      setCountdown(remaining);
    }, 1000);
    
    return () => clearInterval(intervalId);
  }, [enabled, lastRefreshed, interval]);
  
  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
        enabled
          ? 'bg-green-600 hover:bg-green-700 ring-2 ring-green-400'
          : 'bg-gray-600 hover:bg-gray-700'
      } text-white`}
      title={enabled ? `Auto-refresh ON (${countdown}s)` : 'Auto-refresh OFF'}
    >
      <RefreshCw size={16} className={enabled ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">
        {enabled ? `Auto-refresh (${countdown}s)` : 'Auto-refresh OFF'}
      </span>
      <span className="sm:hidden">
        {enabled ? `${countdown}s` : 'OFF'}
      </span>
    </button>
  );
}
