/**
 * Telemetry Metric Card Component
 * 
 * Displays a security telemetry metric with availability state,
 * quality indicators, and evidence for investigation.
 */

import React from 'react';
import { SecurityTelemetryMetric } from '../../types/security-posture';

interface TelemetryMetricCardProps {
  metric: SecurityTelemetryMetric;
  showEvidence?: boolean;
}

export const TelemetryMetricCard: React.FC<TelemetryMetricCardProps> = ({
  metric,
  showEvidence = false,
}) => {
  /**
   * Get availability badge color and text
   */
  const getAvailabilityBadge = () => {
    if (!metric.available) {
      return {
        color: 'bg-gray-500 text-white',
        text: metric.errorMessage?.includes('not yet implemented')
          ? 'Not Configured'
          : metric.errorMessage?.includes('unsupported')
          ? 'Unsupported'
          : 'Unavailable',
      };
    }
    
    switch (metric.freshness) {
      case 'current':
        return { color: 'bg-green-500 text-white', text: 'Current' };
      case 'stale':
        return { color: 'bg-yellow-500 text-black', text: 'Stale' };
      default:
        return { color: 'bg-gray-400 text-white', text: 'Unknown' };
    }
  };
  
  /**
   * Get confidence indicator
   */
  const getConfidenceColor = () => {
    if (metric.confidence >= 0.9) return 'text-green-600';
    if (metric.confidence >= 0.7) return 'text-yellow-600';
    if (metric.confidence >= 0.5) return 'text-orange-600';
    return 'text-red-600';
  };
  
  /**
   * Get value display color
   */
  const getValueColor = () => {
    if (!metric.available) return 'text-gray-400';
    
    // For percentage/score metrics, color by value
    if (metric.unit === 'percentage' || metric.unit === 'score') {
      if (metric.value >= 90) return 'text-green-600 font-bold';
      if (metric.value >= 70) return 'text-yellow-600 font-semibold';
      if (metric.value >= 50) return 'text-orange-600 font-semibold';
      return 'text-red-600 font-bold';
    }
    
    return 'text-gray-900 font-semibold';
  };
  
  const badge = getAvailabilityBadge();
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700">{metric.name}</h3>
        <span className={`px-2 py-1 rounded text-xs font-medium ${badge.color}`}>
          {badge.text}
        </span>
      </div>
      
      <div className="mb-3">
        {metric.available ? (
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl ${getValueColor()}`}>
              {metric.value}
            </span>
            <span className="text-sm text-gray-500">{metric.unit}</span>
          </div>
        ) : (
          <div className="text-sm text-gray-500 italic">
            {metric.errorMessage || 'No data available'}
          </div>
        )}
      </div>
      
      {metric.available && (
        <div className="flex items-center gap-4 text-xs text-gray-600 mb-2">
          <div className="flex items-center gap-1">
            <span className="font-medium">Confidence:</span>
            <span className={getConfidenceColor()}>
              {Math.round(metric.confidence * 100)}%
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <span className="font-medium">Source:</span>
            <span className="text-gray-500 font-mono text-xs">
              {metric.source}
            </span>
          </div>
        </div>
      )}
      
      <div className="text-xs text-gray-500">
        {metric.timestamp && (
          <span>
            Updated: {new Date(metric.timestamp).toLocaleString()}
          </span>
        )}
      </div>
      
      {showEvidence && metric.metadata && Object.keys(metric.metadata).length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium">
            View Evidence
          </summary>
          <pre className="mt-2 p-2 bg-gray-50 rounded overflow-x-auto text-xs">
            {JSON.stringify(metric.metadata, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
};
