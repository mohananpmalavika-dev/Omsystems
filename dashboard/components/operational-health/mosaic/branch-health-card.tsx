/**
 * Branch Health Card Component
 * 
 * Individual card in the branch mosaic showing operational health at a glance.
 * Designed for quick visual scanning across 400+ branches.
 */

'use client';

import React from 'react';
import { BranchMosaicItem, HealthState, ConnectivityState } from '../../../types/operational-health.types';

interface BranchHealthCardProps {
  branch: BranchMosaicItem;
  onClick?: (branchId: string) => void;
}

export function BranchHealthCard({ branch, onClick }: BranchHealthCardProps) {
  const stateColors: Record<HealthState, string> = {
    HEALTHY: 'border-l-green-500 bg-green-50 dark:bg-green-950',
    WARNING: 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950',
    CRITICAL: 'border-l-red-500 bg-red-50 dark:bg-red-950',
    UNKNOWN: 'border-l-gray-500 bg-gray-50 dark:bg-gray-900',
  };

  const stateBadgeColors: Record<HealthState, string> = {
    HEALTHY: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    WARNING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    UNKNOWN: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  };

  const internetIcons: Record<ConnectivityState, string> = {
    ONLINE: '✓',
    DEGRADED: '⚠',
    FAILOVER: '↻',
    OFFLINE: '✕',
  };

  const freshnessColor = {
    CURRENT: 'text-green-600 dark:text-green-400',
    STALE: 'text-yellow-600 dark:text-yellow-400',
    OFFLINE: 'text-gray-500 dark:text-gray-400',
  };

  const hasIssues = branch.reasonCodes.length > 0;

  return (
    <div
      className={`
        relative border-l-4 rounded-lg shadow-sm p-4 cursor-pointer
        transition-all duration-200 hover:shadow-md hover:scale-[1.02]
        ${stateColors[branch.state]}
        ${onClick ? 'hover:ring-2 hover:ring-blue-400' : ''}
      `}
      onClick={() => onClick?.(branch.branchId)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {branch.branchName}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {branch.branchCode}
            {branch.regionName && ` • ${branch.regionName}`}
          </p>
        </div>
        <span className={`px-2 py-1 text-xs font-medium rounded ${stateBadgeColors[branch.state]}`}>
          {branch.state}
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="space-y-2 text-sm">
        {/* Cameras */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">CAM</span>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {branch.camerasOnline} / {branch.camerasTotal}
            </span>
            {branch.camerasOnline < branch.camerasTotal && (
              <span className="text-red-600 dark:text-red-400">!</span>
            )}
          </div>
        </div>

        {/* Recording */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">REC</span>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {branch.camerasRecording} / {branch.camerasTotal}
            </span>
            {branch.camerasRecording < branch.camerasTotal && (
              <span className="text-red-600 dark:text-red-400">!</span>
            )}
          </div>
        </div>

        {/* Recorder */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">DVR</span>
          <div className="flex items-center gap-2">
            <span className={`font-medium ${
              branch.recorderState === 'HEALTHY' ? 'text-green-600 dark:text-green-400' :
              branch.recorderState === 'WARNING' ? 'text-yellow-600 dark:text-yellow-400' :
              branch.recorderState === 'CRITICAL' ? 'text-red-600 dark:text-red-400' :
              'text-gray-600 dark:text-gray-400'
            }`}>
              {branch.recorderState === 'HEALTHY' ? '✓' :
               branch.recorderState === 'CRITICAL' ? '✕' : '⚠'}
            </span>
          </div>
        </div>

        {/* Storage */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">HDD</span>
          <div className="flex items-center gap-2">
            <span className={`font-medium ${
              branch.storageState === 'HEALTHY' ? 'text-green-600 dark:text-green-400' :
              branch.storageState === 'WARNING' ? 'text-yellow-600 dark:text-yellow-400' :
              branch.storageState === 'CRITICAL' ? 'text-red-600 dark:text-red-400' :
              'text-gray-600 dark:text-gray-400'
            }`}>
              {branch.storageState === 'HEALTHY' ? '✓' :
               branch.storageState === 'CRITICAL' ? '✕' : '⚠'}
            </span>
            {branch.storageState !== 'HEALTHY' && (
              <span className="text-red-600 dark:text-red-400">!</span>
            )}
          </div>
        </div>

        {/* Retention */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">RET</span>
          <div className="flex items-center gap-2">
            <span className={`font-medium ${
              branch.retentionState === 'COMPLIANT' ? 'text-green-600 dark:text-green-400' :
              branch.retentionState === 'BELOW_POLICY' ? 'text-red-600 dark:text-red-400' :
              'text-gray-600 dark:text-gray-400'
            }`}>
              {branch.retentionDays != null ? `${branch.retentionDays}d` : '?'}
              {branch.retentionRequiredDays && ` / ${branch.retentionRequiredDays}d`}
            </span>
            {branch.retentionState === 'BELOW_POLICY' && (
              <span className="text-red-600 dark:text-red-400">!</span>
            )}
          </div>
        </div>

        {/* Internet */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">NET</span>
          <div className="flex items-center gap-2">
            <span className={`font-medium ${
              branch.internetState === 'ONLINE' ? 'text-green-600 dark:text-green-400' :
              branch.internetState === 'DEGRADED' ? 'text-yellow-600 dark:text-yellow-400' :
              branch.internetState === 'FAILOVER' ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {internetIcons[branch.internetState]}
            </span>
          </div>
        </div>
      </div>

      {/* Issues Summary */}
      {hasIssues && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-1">
            <span className="text-red-600 dark:text-red-400 text-lg leading-none">●</span>
            <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
              {branch.primaryReason || `${branch.reasonCodes.length} issue(s)`}
            </p>
          </div>
        </div>
      )}

      {/* P1 Alerts Badge */}
      {branch.p1Alerts > 0 && (
        <div className="absolute top-2 right-2">
          <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-600 rounded-full">
            {branch.p1Alerts}
          </span>
        </div>
      )}

      {/* Telemetry Freshness Indicator */}
      <div className="absolute bottom-2 right-2">
        <div className={`w-2 h-2 rounded-full ${
          branch.telemetryFreshness === 'CURRENT' ? 'bg-green-500' :
          branch.telemetryFreshness === 'STALE' ? 'bg-yellow-500' :
          'bg-gray-400'
        }`} title={`Telemetry: ${branch.telemetryFreshness}`} />
      </div>

      {/* Health Score */}
      <div className="absolute bottom-2 left-2">
        <span className={`text-xs font-medium ${freshnessColor[branch.telemetryFreshness]}`}>
          {branch.score}
        </span>
      </div>
    </div>
  );
}
