/**
 * Collector Health Panel Component
 * 
 * Displays the health status of all security posture collectors
 * with circuit breaker states and performance metrics.
 */

import React, { useEffect, useState } from 'react';

interface CollectorHealth {
  collectorId: string;
  status: 'healthy' | 'degraded' | 'failed';
  lastRunAt?: string;
  lastSuccessAt?: string;
  failures24h: number;
  averageDurationMs?: number;
  error?: string;
}

interface CollectorHealthSummary {
  overall: 'healthy' | 'degraded' | 'failed';
  timestamp: string;
  healthyCount: number;
  degradedCount: number;
  failedCount: number;
  totalCount: number;
  collectors: CollectorHealth[];
}

export const CollectorHealthPanel: React.FC = () => {
  const [health, setHealth] = useState<CollectorHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    fetchHealth();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);
  
  const fetchHealth = async () => {
    try {
      const response = await fetch('/api/security-posture/health');
      if (!response.ok) throw new Error('Failed to fetch collector health');
      
      const data = await response.json();
      setHealth(data.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const resetCollectorHealth = async (collectorId: string) => {
    try {
      const response = await fetch(`/api/security-posture/health/${collectorId}/reset`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to reset collector health');
      
      // Refresh health data
      await fetchHealth();
    } catch (err) {
      console.error('Failed to reset collector:', err);
    }
  };
  
  const getStatusColor = (status: 'healthy' | 'degraded' | 'failed') => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
    }
  };
  
  const getStatusIcon = (status: 'healthy' | 'degraded' | 'failed') => {
    switch (status) {
      case 'healthy':
        return '✓';
      case 'degraded':
        return '⚠';
      case 'failed':
        return '✗';
    }
  };
  
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <div className="text-red-600">
          <h3 className="font-semibold mb-2">Error Loading Collector Health</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }
  
  if (!health) return null;
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Collector Health Monitor
        </h2>
        <div className={`px-3 py-1 rounded-full border ${getStatusColor(health.overall)}`}>
          <span className="font-medium">
            {getStatusIcon(health.overall)} {health.overall.toUpperCase()}
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="text-center p-3 bg-gray-50 rounded">
          <div className="text-2xl font-bold text-gray-900">{health.totalCount}</div>
          <div className="text-sm text-gray-600">Total Collectors</div>
        </div>
        <div className="text-center p-3 bg-green-50 rounded">
          <div className="text-2xl font-bold text-green-600">{health.healthyCount}</div>
          <div className="text-sm text-gray-600">Healthy</div>
        </div>
        <div className="text-center p-3 bg-yellow-50 rounded">
          <div className="text-2xl font-bold text-yellow-600">{health.degradedCount}</div>
          <div className="text-sm text-gray-600">Degraded</div>
        </div>
        <div className="text-center p-3 bg-red-50 rounded">
          <div className="text-2xl font-bold text-red-600">{health.failedCount}</div>
          <div className="text-sm text-gray-600">Failed</div>
        </div>
      </div>
      
      <div className="space-y-3">
        {health.collectors.map((collector) => (
          <div
            key={collector.collectorId}
            className={`border rounded-lg p-4 ${getStatusColor(collector.status)}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg font-medium">
                    {getStatusIcon(collector.status)}
                  </span>
                  <h3 className="font-semibold">{collector.collectorId}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    collector.status === 'healthy'
                      ? 'bg-green-200 text-green-800'
                      : collector.status === 'degraded'
                      ? 'bg-yellow-200 text-yellow-800'
                      : 'bg-red-200 text-red-800'
                  }`}>
                    {collector.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Last Run:</span>{' '}
                    <span className="text-gray-700">
                      {collector.lastRunAt
                        ? new Date(collector.lastRunAt).toLocaleString()
                        : 'Never'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Last Success:</span>{' '}
                    <span className="text-gray-700">
                      {collector.lastSuccessAt
                        ? new Date(collector.lastSuccessAt).toLocaleString()
                        : 'Never'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Failures (24h):</span>{' '}
                    <span className={collector.failures24h > 0 ? 'text-red-700 font-semibold' : 'text-gray-700'}>
                      {collector.failures24h}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Avg Duration:</span>{' '}
                    <span className="text-gray-700">
                      {collector.averageDurationMs
                        ? `${Math.round(collector.averageDurationMs)}ms`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
                
                {collector.error && (
                  <div className="mt-2 text-sm">
                    <span className="font-medium">Error:</span>{' '}
                    <span className="text-red-700">{collector.error}</span>
                  </div>
                )}
              </div>
              
              {collector.status !== 'healthy' && (
                <button
                  onClick={() => resetCollectorHealth(collector.collectorId)}
                  className="ml-4 px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 text-xs text-gray-500 text-center">
        Last updated: {new Date(health.timestamp).toLocaleString()}
      </div>
    </div>
  );
};
