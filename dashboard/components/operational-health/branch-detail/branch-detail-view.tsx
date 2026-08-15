/**
 * Branch Detail Control-Room View
 * 
 * Complete operational health view for a single branch.
 * Shows all health metrics, component status, and live camera wall.
 */

'use client';

import React from 'react';
import { BranchOperationalHealth, HealthState } from '../../../types/operational-health.types';
import { BranchCameraWall } from './branch-camera-wall';

interface BranchDetailViewProps {
  health: BranchOperationalHealth;
  onClose?: () => void;
  onRefresh?: () => void;
}

export function BranchDetailView({ health, onClose, onRefresh }: BranchDetailViewProps) {
  const stateColors: Record<HealthState, string> = {
    HEALTHY: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    WARNING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    UNKNOWN: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  };

  const StatCard = ({ label, value, status, details }: any) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</span>
        <span className={`px-2 py-1 text-xs font-medium rounded ${stateColors[status]}`}>
          {status}
        </span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{value}</div>
      {details && <div className="text-xs text-gray-600 dark:text-gray-400">{details}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {health.branchName}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {health.branchCode}
                  {health.regionName && ` • ${health.regionName}`}
                </p>
              </div>
              <span className={`px-3 py-1 text-sm font-medium rounded ${stateColors[health.overallState]}`}>
                {health.overallState}
              </span>
              <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                Score: {health.healthScore}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Updated: {new Date(health.updatedAt).toLocaleTimeString()}
              </div>
              <button
                onClick={onRefresh}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1920px] mx-auto px-6 py-6 space-y-6">
        {/* Health Issues */}
        {health.reasons.length > 0 && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-3">
              Active Issues ({health.reasons.length})
            </h2>
            <div className="space-y-2">
              {health.reasons.map((reason, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${stateColors[reason.severity]}`}>
                    {reason.severity}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {reason.message}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {reason.domain} • {reason.code}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Component Health Grid */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Component Health
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <StatCard
              label="CAMERAS"
              value={`${health.cameras.online} / ${health.cameras.total}`}
              status={health.cameras.state}
              details={`${health.cameras.offline} offline`}
            />
            <StatCard
              label="RECORDING"
              value={`${health.cameras.recording} / ${health.cameras.total}`}
              status={health.cameras.recording === health.cameras.total ? 'HEALTHY' : 'WARNING'}
              details={`${health.cameras.notRecording} not recording`}
            />
            <StatCard
              label="RECORDERS"
              value={`${health.recorders.online} / ${health.recorders.total}`}
              status={health.recorders.state}
              details={health.recorders.type || 'Unknown type'}
            />
            <StatCard
              label="STORAGE"
              value={health.storage.disks.healthy + '/' + health.storage.disks.total}
              status={health.storage.state}
              details={
                health.storage.capacity
                  ? `${health.storage.capacity.usagePercent.toFixed(1)}% used`
                  : 'No capacity data'
              }
            />
            <StatCard
              label="RETENTION"
              value={health.retention.actualDays != null ? `${health.retention.actualDays}d` : 'Unknown'}
              status={
                health.retention.state === 'COMPLIANT' ? 'HEALTHY' :
                health.retention.state === 'BELOW_POLICY' ? 'CRITICAL' : 'UNKNOWN'
              }
              details={`Required: ${health.retention.requiredDays} days`}
            />
            <StatCard
              label="INTERNET"
              value={health.network.internetState}
              status={
                health.network.internetState === 'ONLINE' ? 'HEALTHY' :
                health.network.internetState === 'OFFLINE' ? 'CRITICAL' : 'WARNING'
              }
              details={health.network.edgeAgentConnected ? 'Edge Agent Connected' : 'Edge Agent Disconnected'}
            />
            <StatCard
              label="UPS"
              value={health.ups.online ? 'ONLINE' : 'OFFLINE'}
              status={health.ups.state}
              details={
                health.ups.batteryPercent != null
                  ? `${health.ups.batteryPercent}% battery${health.ups.onBattery ? ' (on battery)' : ''}`
                  : 'No battery data'
              }
            />
            <StatCard
              label="ALERTS"
              value={health.alerts.p1Count}
              status={health.alerts.p1Count > 0 ? 'CRITICAL' : 'HEALTHY'}
              details={`${health.alerts.p2Count} P2, ${health.alerts.p3Count} P3`}
            />
          </div>
        </div>

        {/* Detailed Component Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Storage Detail */}
          {health.storage.capacity && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Storage Detail
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Total Capacity</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {health.storage.capacity.totalGB.toFixed(0)} GB
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Used</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {health.storage.capacity.usedGB.toFixed(0)} GB
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Available</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {health.storage.capacity.availableGB.toFixed(0)} GB
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      health.storage.capacity.usagePercent > 95 ? 'bg-red-600' :
                      health.storage.capacity.usagePercent > 85 ? 'bg-yellow-600' : 'bg-green-600'
                    }`}
                    style={{ width: `${health.storage.capacity.usagePercent}%` }}
                  />
                </div>
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Disks</div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div className="text-center">
                      <div className="text-green-600 dark:text-green-400 font-semibold">
                        {health.storage.disks.healthy}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">Healthy</div>
                    </div>
                    <div className="text-center">
                      <div className="text-yellow-600 dark:text-yellow-400 font-semibold">
                        {health.storage.disks.warning}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">Warning</div>
                    </div>
                    <div className="text-center">
                      <div className="text-red-600 dark:text-red-400 font-semibold">
                        {health.storage.disks.failed}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">Failed</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Retention Detail */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Retention Compliance
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Required</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {health.retention.requiredDays} days
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Actual</span>
                <span className={`font-medium ${
                  health.retention.state === 'COMPLIANT' ? 'text-green-600 dark:text-green-400' :
                  health.retention.state === 'BELOW_POLICY' ? 'text-red-600 dark:text-red-400' :
                  'text-gray-600 dark:text-gray-400'
                }`}>
                  {health.retention.actualDays != null ? `${health.retention.actualDays} days` : 'Unknown'}
                </span>
              </div>
              {health.retention.gapDays != null && health.retention.gapDays < 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Gap</span>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {Math.abs(health.retention.gapDays)} days below policy
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Confidence</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {(health.retention.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className={`mt-4 p-3 rounded-lg ${
                health.retention.state === 'COMPLIANT' ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800' :
                health.retention.state === 'BELOW_POLICY' ? 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800' :
                'bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800'
              }`}>
                <div className={`text-sm font-medium ${
                  health.retention.state === 'COMPLIANT' ? 'text-green-900 dark:text-green-100' :
                  health.retention.state === 'BELOW_POLICY' ? 'text-red-900 dark:text-red-100' :
                  'text-gray-900 dark:text-gray-100'
                }`}>
                  {health.retention.state === 'COMPLIANT' ? '✓ Compliant with retention policy' :
                   health.retention.state === 'BELOW_POLICY' ? '✕ Below retention policy' :
                   '? Retention status unknown'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Camera Wall */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Live Camera Wall
          </h2>
          <BranchCameraWall branchId={health.branchId} />
        </div>
      </div>
    </div>
  );
}
