/**
 * Branch Operational Summary
 * 
 * Grid of operational health cards showing:
 * Internet, Gateway, Recorder, Storage, Cameras, Recording, Retention, Alerts
 */

'use client';

import React from 'react';
import { BranchOperationalSnapshot } from '@/types/branch-operational-snapshot';
import {
  GlobeAltIcon,
  ServerIcon,
  CircleStackIcon,
  VideoCameraIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  SignalIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';

interface BranchOperationalSummaryProps {
  snapshot: BranchOperationalSnapshot;
  onStorageClick: () => void;
  onNetworkClick: () => void;
  onRetentionClick: () => void;
}

export function BranchOperationalSummary({
  snapshot,
  onStorageClick,
  onNetworkClick,
  onRetentionClick,
}: BranchOperationalSummaryProps) {
  const getStateColor = (state: string) => {
    switch (state) {
      case 'HEALTHY':
      case 'ONLINE':
      case 'COMPLIANT':
        return 'text-green-600 bg-green-50 dark:bg-green-900/20';
      case 'WARNING':
      case 'DEGRADED':
      case 'FAILOVER':
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
      case 'CRITICAL':
      case 'OFFLINE':
      case 'VIOLATION':
        return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-800';
    }
  };

  const getStateLabel = (state: string) => {
    return state.replace('_', ' ');
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Internet */}
      <button
        onClick={onNetworkClick}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow text-left"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GlobeAltIcon className="h-5 w-5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Internet
            </h3>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getStateColor(
              snapshot.network.state
            )}`}
          >
            {getStateLabel(snapshot.network.state)}
          </span>
        </div>
        
        {snapshot.network.edgeAgent && (
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Edge Agent: {snapshot.network.edgeAgent.connected ? 'Connected' : 'Disconnected'}
          </div>
        )}
        
        {snapshot.network.latencyMs !== undefined && (
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Latency: {snapshot.network.latencyMs}ms
          </div>
        )}
      </button>

      {/* Gateway */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <SignalIcon className="h-5 w-5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Gateway
            </h3>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
              snapshot.network.gateway?.reachable
                ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                : 'text-red-600 bg-red-50 dark:bg-red-900/20'
            }`}
          >
            {snapshot.network.gateway?.reachable ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        
        {snapshot.network.gateway?.ipAddress && (
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {snapshot.network.gateway.ipAddress}
          </div>
        )}
      </div>

      {/* Recorder */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CpuChipIcon className="h-5 w-5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Recorder
            </h3>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getStateColor(
              snapshot.recorders.state
            )}`}
          >
            {getStateLabel(snapshot.recorders.state)}
          </span>
        </div>
        
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {snapshot.recorders.online} / {snapshot.recorders.total} online
        </div>
      </div>

      {/* Storage */}
      <button
        onClick={onStorageClick}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow text-left"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CircleStackIcon className="h-5 w-5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Storage
            </h3>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getStateColor(
              snapshot.storage.state
            )}`}
          >
            {getStateLabel(snapshot.storage.state)}
          </span>
        </div>
        
        {snapshot.storage.capacity && (
          <div className="space-y-1">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {snapshot.storage.capacity.usedGB.toFixed(1)} / {snapshot.storage.capacity.totalGB.toFixed(1)} GB used
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${
                  snapshot.storage.capacity.usagePercent > 90
                    ? 'bg-red-600'
                    : snapshot.storage.capacity.usagePercent > 75
                    ? 'bg-yellow-600'
                    : 'bg-green-600'
                }`}
                style={{ width: `${Math.min(100, snapshot.storage.capacity.usagePercent)}%` }}
              />
            </div>
          </div>
        )}
        
        {snapshot.storage.disks.failed > 0 && (
          <div className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">
            {snapshot.storage.disks.failed} disk(s) failed
          </div>
        )}
      </button>

      {/* Cameras */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <VideoCameraIcon className="h-5 w-5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Cameras
            </h3>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getStateColor(
              snapshot.cameras.state
            )}`}
          >
            {snapshot.cameras.online} / {snapshot.cameras.total}
          </span>
        </div>
        
        <div className="text-xs text-gray-600 dark:text-gray-400">
          ONLINE
        </div>
        
        {snapshot.cameras.offline > 0 && (
          <div className="mt-1 text-xs text-red-600 dark:text-red-400">
            {snapshot.cameras.offline} offline
          </div>
        )}
      </div>

      {/* Recording */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ServerIcon className="h-5 w-5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Recording
            </h3>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
              snapshot.cameras.recording === snapshot.cameras.total
                ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                : snapshot.cameras.notRecording > snapshot.cameras.total * 0.5
                ? 'text-red-600 bg-red-50 dark:bg-red-900/20'
                : 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20'
            }`}
          >
            {snapshot.cameras.recording} / {snapshot.cameras.total}
          </span>
        </div>
        
        <div className="text-xs text-gray-600 dark:text-gray-400">
          ACTIVE
        </div>
        
        {snapshot.cameras.notRecording > 0 && (
          <div className="mt-1 text-xs text-red-600 dark:text-red-400">
            {snapshot.cameras.notRecording} not recording
          </div>
        )}
      </div>

      {/* Retention */}
      <button
        onClick={onRetentionClick}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow text-left"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Retention
            </h3>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getStateColor(
              snapshot.retention.state
            )}`}
          >
            {getStateLabel(snapshot.retention.state)}
          </span>
        </div>
        
        <div className="text-xs text-gray-600 dark:text-gray-400">
          Minimum: {snapshot.retention.minimumVerifiedDays || 0} / {snapshot.retention.requiredDays} days
        </div>
        
        {snapshot.retention.violatingChannels > 0 && (
          <div className="mt-1 text-xs text-red-600 dark:text-red-400">
            {snapshot.retention.violatingChannels} violation(s)
          </div>
        )}
      </button>

      {/* Alerts */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Alerts
            </h3>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
              snapshot.alerts.p1Count > 0
                ? 'text-red-600 bg-red-50 dark:bg-red-900/20'
                : snapshot.alerts.p2Count > 0
                ? 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20'
                : 'text-green-600 bg-green-50 dark:bg-green-900/20'
            }`}
          >
            {snapshot.alerts.activeCount}
          </span>
        </div>
        
        <div className="space-y-1 text-xs">
          {snapshot.alerts.p1Count > 0 && (
            <div className="text-red-600 dark:text-red-400">
              {snapshot.alerts.p1Count} critical
            </div>
          )}
          {snapshot.alerts.p2Count > 0 && (
            <div className="text-yellow-600 dark:text-yellow-400">
              {snapshot.alerts.p2Count} warning
            </div>
          )}
          {snapshot.alerts.p1Count === 0 && snapshot.alerts.p2Count === 0 && (
            <div className="text-gray-600 dark:text-gray-400">
              No active alerts
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
