/**
 * Branch Critical Reasons Component
 * 
 * Shows "WHY THIS BRANCH IS CRITICAL" with specific reasons
 * This answers the key question immediately without forcing operators to investigate
 */

'use client';

import React from 'react';
import { BranchHealthReason } from '@/types/branch-operational-snapshot';
import { 
  ExclamationTriangleIcon,
  XCircleIcon,
  InformationCircleIcon 
} from '@heroicons/react/24/solid';

interface BranchCriticalReasonsProps {
  overallState: string;
  reasons: BranchHealthReason[];
  primaryReason?: BranchHealthReason;
}

export function BranchCriticalReasons({
  overallState,
  reasons,
  primaryReason,
}: BranchCriticalReasonsProps) {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'WARNING':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <InformationCircleIcon className="h-5 w-5 text-blue-500" />;
    }
  };

  const getComponentColor = (component: string) => {
    const colors: Record<string, string> = {
      CAMERA: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      RECORDER: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      STORAGE: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      NETWORK: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      RETENTION: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
      UPS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      ALERT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    };
    return colors[component] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  };

  const getHeaderColor = () => {
    switch (overallState) {
      case 'CRITICAL':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'WARNING':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      default:
        return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    }
  };

  const getHeaderTitle = () => {
    switch (overallState) {
      case 'CRITICAL':
        return 'WHY THIS BRANCH IS CRITICAL';
      case 'WARNING':
        return 'BRANCH WARNING CONDITIONS';
      default:
        return 'BRANCH STATUS INFORMATION';
    }
  };

  // Show critical and warning reasons
  const displayReasons = reasons.filter(
    (r) => r.severity === 'CRITICAL' || r.severity === 'WARNING'
  );

  if (displayReasons.length === 0) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border ${getHeaderColor()} overflow-hidden`}
    >
      {/* Header */}
      <div className="px-6 py-3 border-b border-current/20">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white tracking-wide">
          {getHeaderTitle()}
        </h2>
      </div>

      {/* Reasons List */}
      <div className="p-6 space-y-3">
        {displayReasons.map((reason, index) => (
          <div
            key={reason.code}
            className="flex items-start gap-3 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
          >
            {/* Severity Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {getSeverityIcon(reason.severity)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {/* Component Badge */}
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getComponentColor(
                    reason.component
                  )}`}
                >
                  {reason.component}
                </span>

                {/* Severity Badge */}
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                    reason.severity === 'CRITICAL'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                  }`}
                >
                  {reason.severity}
                </span>
              </div>

              {/* Message */}
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                {reason.message}
              </p>

              {/* Impact Description */}
              {reason.impactDescription && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Impact: {reason.impactDescription}
                </p>
              )}

              {/* Affected Resources */}
              {reason.affectedCameras && reason.affectedCameras.length > 0 && (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Affected cameras: {reason.affectedCameras.length}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
