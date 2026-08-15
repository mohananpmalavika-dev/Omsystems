/**
 * Operational Summary KPIs Component
 * 
 * Interactive summary cards showing enterprise-wide operational health metrics.
 * Cards are clickable to filter the branch mosaic.
 */

'use client';

import React from 'react';
import { OperationalDashboardSummary, BranchHealthFilter, HealthState } from '../../../types/operational-health.types';

interface OperationalSummaryKPIsProps {
  summary: OperationalDashboardSummary;
  onFilterClick?: (filter: BranchHealthFilter) => void;
}

export function OperationalSummaryKPIs({ summary, onFilterClick }: OperationalSummaryKPIsProps) {
  const branchStatCards = [
    {
      label: 'Total Branches',
      value: summary.branches.total,
      color: 'blue',
      filter: undefined,
    },
    {
      label: 'Healthy',
      value: summary.branches.healthy,
      color: 'green',
      filter: { states: ['HEALTHY' as HealthState] },
    },
    {
      label: 'Warning',
      value: summary.branches.warning,
      color: 'yellow',
      filter: { states: ['WARNING' as HealthState] },
    },
    {
      label: 'Critical',
      value: summary.branches.critical,
      color: 'red',
      filter: { states: ['CRITICAL' as HealthState] },
    },
    {
      label: 'Unknown',
      value: summary.branches.unknown,
      color: 'gray',
      filter: { states: ['UNKNOWN' as HealthState] },
    },
  ];

  const operationalCards = [
    {
      label: 'Cameras',
      value: `${summary.cameras.online} / ${summary.cameras.total}`,
      sublabel: 'Online',
      color: summary.cameras.offline > 0 ? 'yellow' : 'green',
      filter: summary.cameras.offline > 0 ? { cameraOffline: true } : undefined,
    },
    {
      label: 'Recording',
      value: `${summary.cameras.recording} / ${summary.cameras.total}`,
      sublabel: 'Recording',
      color: summary.cameras.notRecording > 0 ? 'red' : 'green',
      filter: summary.cameras.notRecording > 0 ? { recordingProblem: true } : undefined,
    },
    {
      label: 'Recorders',
      value: `${summary.recorders.online} / ${summary.recorders.total}`,
      sublabel: 'Online',
      color: summary.recorders.offline > 0 ? 'red' : 'green',
      filter: undefined,
    },
    {
      label: 'Retention',
      value: summary.retention.violatingBranches,
      sublabel: 'Violations',
      color: summary.retention.violatingBranches > 0 ? 'red' : 'green',
      filter: summary.retention.violatingBranches > 0 ? { retentionViolation: true } : undefined,
    },
    {
      label: 'Internet',
      value: summary.network.offline,
      sublabel: 'Offline',
      color: summary.network.offline > 0 ? 'red' : 'green',
      filter: summary.network.offline > 0 ? { internetStates: ['OFFLINE'] } : undefined,
    },
    {
      label: 'P1 Alerts',
      value: summary.alerts.p1,
      sublabel: 'Active',
      color: summary.alerts.p1 > 0 ? 'red' : 'green',
      filter: summary.alerts.p1 > 0 ? { p1Only: true } : undefined,
    },
  ];

  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900',
    green: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900',
    yellow: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900',
    red: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900',
    gray: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800',
  };

  const textColorClasses = {
    blue: 'text-blue-700 dark:text-blue-300',
    green: 'text-green-700 dark:text-green-300',
    yellow: 'text-yellow-700 dark:text-yellow-300',
    red: 'text-red-700 dark:text-red-300',
    gray: 'text-gray-700 dark:text-gray-300',
  };

  return (
    <div className="space-y-6">
      {/* Branch Status Summary */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Branch Status
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {branchStatCards.map((card) => (
            <button
              key={card.label}
              onClick={() => card.filter && onFilterClick?.(card.filter)}
              disabled={!card.filter}
              className={`
                p-4 rounded-lg border-2 transition-all
                ${colorClasses[card.color as keyof typeof colorClasses]}
                ${card.filter ? 'cursor-pointer hover:scale-105' : 'cursor-default'}
                disabled:opacity-70
              `}
            >
              <div className="text-center">
                <div className={`text-3xl font-bold ${textColorClasses[card.color as keyof typeof textColorClasses]}`}>
                  {card.value}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {card.label}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Operational Metrics */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Surveillance Health
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {operationalCards.map((card) => (
            <button
              key={card.label}
              onClick={() => card.filter && onFilterClick?.(card.filter)}
              disabled={!card.filter}
              className={`
                p-4 rounded-lg border-2 transition-all
                ${colorClasses[card.color as keyof typeof colorClasses]}
                ${card.filter ? 'cursor-pointer hover:scale-105' : 'cursor-default'}
                disabled:opacity-70
              `}
            >
              <div className="text-center">
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                  {card.label}
                </div>
                <div className={`text-2xl font-bold ${textColorClasses[card.color as keyof typeof textColorClasses]}`}>
                  {card.value}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {card.sublabel}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
