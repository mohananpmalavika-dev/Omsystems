/**
 * Performance Indicator Component
 * 
 * Displays load time and performance metrics
 */

'use client';

import { Zap, Clock } from 'lucide-react';
import { PerformanceMetrics } from '@/hooks/use-performance-monitor';

interface PerformanceIndicatorProps {
  metrics: PerformanceMetrics;
  showDetails?: boolean;
}

export function PerformanceIndicator({
  metrics,
  showDetails = false,
}: PerformanceIndicatorProps) {
  if (!metrics.completedAt) return null;
  
  const getPerformanceColor = (time: number): string => {
    if (time < 2000) return 'text-green-400';
    if (time < 5000) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };
  
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-1.5">
        <Zap size={14} className={getPerformanceColor(metrics.totalTime)} />
        <span className="text-gray-400">Load:</span>
        <span className={`font-medium ${getPerformanceColor(metrics.totalTime)}`}>
          {formatTime(metrics.totalTime)}
        </span>
      </div>
      
      {showDetails && (
        <>
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-blue-400" />
            <span className="text-gray-400">API:</span>
            <span className="font-medium text-blue-400">
              {formatTime(metrics.apiResponseTime)}
            </span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-purple-400" />
            <span className="text-gray-400">Render:</span>
            <span className="font-medium text-purple-400">
              {formatTime(metrics.renderTime)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
