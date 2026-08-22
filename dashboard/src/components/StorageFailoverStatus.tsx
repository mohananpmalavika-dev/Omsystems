/**
 * Storage Failover Status Component
 * 
 * Real-time dashboard showing storage health and failover status
 */

import React, { useEffect, useState } from 'react';

interface StorageTierStatus {
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  priority: number;
  usedPercent: number;
  usedBytes: number;
  capacityBytes: number;
  consecutiveFailures: number;
  lastHealthCheck: string;
}

interface FailoverEvent {
  timestamp: string;
  reason: string;
  fromTier: string;
  toTier: string;
  cameraId?: string;
  details: string;
}

interface RetryQueueItem {
  id: string;
  recordingId: string;
  cameraId: string;
  targetTier: string;
  attempts: number;
  maxAttempts: number;
  nextRetry: string;
  sizeBytes: number;
}

interface StorageFailoverData {
  status: 'NORMAL' | 'FAILOVER_ACTIVE' | 'RECOVERY_IN_PROGRESS' | 'DEGRADED';
  activeFailovers: FailoverEvent[];
  retryQueueSize: number;
  tiers: StorageTierStatus[];
  retryQueue: RetryQueueItem[];
}

export const StorageFailoverStatus: React.FC = () => {
  const [data, setData] = useState<StorageFailoverData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch initial data
    fetchFailoverStatus();

    // Poll every 5 seconds
    const interval = setInterval(fetchFailoverStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchFailoverStatus = async () => {
    try {
      const response = await fetch('/api/storage/failover-status');
      const data = await response.json();
      setData(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch failover status:', error);
    }
  };

  if (loading || !data) {
    return <div className="p-6">Loading storage status...</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NORMAL':
        return 'text-green-600 bg-green-50';
      case 'FAILOVER_ACTIVE':
        return 'text-yellow-600 bg-yellow-50';
      case 'RECOVERY_IN_PROGRESS':
        return 'text-blue-600 bg-blue-50';
      case 'DEGRADED':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getTierStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'critical':
        return '🔴';
      case 'offline':
        return '❌';
      default:
        return '❓';
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return 'Unlimited';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Overall Status Banner */}
      <div className={`rounded-lg p-6 ${getStatusColor(data.status)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Storage Status</h2>
            <p className="mt-1 text-lg">{data.status.replace('_', ' ')}</p>
          </div>
          <div className="text-right">
            {data.activeFailovers.length > 0 && (
              <div className="text-sm">
                <span className="font-semibold">{data.activeFailovers.length}</span> active failover(s)
              </div>
            )}
            {data.retryQueueSize > 0 && (
              <div className="text-sm">
                <span className="font-semibold">{data.retryQueueSize}</span> items in retry queue
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Failovers */}
      {data.activeFailovers.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-yellow-800 mb-4">
            ⚠️ Active Failovers
          </h3>
          <div className="space-y-3">
            {data.activeFailovers.map((failover, i) => (
              <div key={i} className="bg-white rounded p-4 border border-yellow-200">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-900">
                      {failover.fromTier} → {failover.toTier}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {failover.details}
                    </div>
                    {failover.cameraId && (
                      <div className="text-sm text-gray-500 mt-1">
                        Camera: {failover.cameraId}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatTimestamp(failover.timestamp)}
                  </div>
                </div>
                <div className="mt-2 text-sm">
                  <span className="inline-block bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                    {failover.reason.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Storage Tiers */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Storage Tiers</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {data.tiers.map((tier) => (
            <div key={tier.name} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getTierStatusIcon(tier.status)}</span>
                  <div>
                    <div className="font-medium text-gray-900">
                      {tier.name}
                      {tier.priority === 1 && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          PRIMARY
                        </span>
                      )}
                      {tier.priority === 2 && (
                        <span className="ml-2 text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                          SECONDARY
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Last check: {formatTimestamp(tier.lastHealthCheck)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {formatBytes(tier.usedBytes)} / {formatBytes(tier.capacityBytes)}
                  </div>
                  {tier.capacityBytes > 0 && (
                    <div className="text-sm text-gray-500">
                      {tier.usedPercent.toFixed(1)}% used
                    </div>
                  )}
                  {tier.consecutiveFailures > 0 && (
                    <div className="text-sm text-red-600 mt-1">
                      {tier.consecutiveFailures} consecutive failures
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {tier.capacityBytes > 0 && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        tier.usedPercent >= 95
                          ? 'bg-red-500'
                          : tier.usedPercent >= 90
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(tier.usedPercent, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Retry Queue */}
      {data.retryQueue.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-4">
            🔄 Upload Retry Queue ({data.retryQueue.length})
          </h3>
          <div className="space-y-2">
            {data.retryQueue.slice(0, 5).map((item) => (
              <div key={item.id} className="bg-white rounded p-3 border border-blue-200 text-sm">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{item.recordingId}</span>
                    <span className="text-gray-500 ml-2">→ {item.targetTier}</span>
                  </div>
                  <div className="text-gray-500">
                    Attempt {item.attempts}/{item.maxAttempts}
                  </div>
                </div>
                <div className="text-gray-500 mt-1">
                  Next retry: {formatTimestamp(item.nextRetry)}
                  <span className="ml-2">({formatBytes(item.sizeBytes)})</span>
                </div>
              </div>
            ))}
            {data.retryQueue.length > 5 && (
              <div className="text-center text-sm text-gray-500 pt-2">
                ... and {data.retryQueue.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Indicators */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Active Failovers</div>
          <div className="text-2xl font-bold mt-1">{data.activeFailovers.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Retry Queue</div>
          <div className="text-2xl font-bold mt-1">{data.retryQueueSize}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Healthy Tiers</div>
          <div className="text-2xl font-bold mt-1">
            {data.tiers.filter(t => t.status === 'healthy').length}/{data.tiers.length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">System Status</div>
          <div className="text-lg font-bold mt-1">
            {data.status === 'NORMAL' ? '✅' : data.status === 'DEGRADED' ? '❌' : '⚠️'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StorageFailoverStatus;
