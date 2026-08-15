/**
 * Branch Command Center Header
 * 
 * Shows branch identity, overall status, and control actions
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { BranchOperationalSnapshot } from '@/types/branch-operational-snapshot';
import { 
  ChevronRightIcon, 
  ArrowPathIcon,
  HomeIcon 
} from '@heroicons/react/24/outline';

interface BranchHeaderProps {
  snapshot: BranchOperationalSnapshot;
  onRefresh: () => void;
}

export function BranchHeader({ snapshot, onRefresh }: BranchHeaderProps) {
  const getStateColor = (state: string) => {
    switch (state) {
      case 'HEALTHY':
        return 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800';
      case 'WARNING':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800';
      case 'CRITICAL':
        return 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700';
    }
  };

  const getStateLabel = (state: string) => {
    switch (state) {
      case 'HEALTHY':
        return 'HEALTHY';
      case 'WARNING':
        return 'WARNING';
      case 'CRITICAL':
        return 'CRITICAL';
      default:
        return 'UNKNOWN';
    }
  };

  const formatLastSeen = (date: Date | undefined) => {
    if (!date) return 'Unknown';
    
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const seconds = Math.floor(diff / 1000);

    if (seconds < 60) return `${seconds} sec ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-[1920px] mx-auto px-4 py-4">
        {/* Breadcrumb */}
        <nav className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-4">
          <Link
            href="/operations"
            className="flex items-center hover:text-gray-700 dark:hover:text-gray-300"
          >
            <HomeIcon className="h-4 w-4 mr-1" />
            Operations
          </Link>
          <ChevronRightIcon className="h-4 w-4 mx-2" />
          <Link
            href="/operations/branches"
            className="hover:text-gray-700 dark:hover:text-gray-300"
          >
            Branches
          </Link>
          <ChevronRightIcon className="h-4 w-4 mx-2" />
          <span className="text-gray-900 dark:text-white font-medium">
            {snapshot.branchCode}
          </span>
        </nav>

        {/* Header Content */}
        <div className="flex items-start justify-between">
          {/* Left: Branch Info */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Branch {snapshot.branchCode} — {snapshot.branchName}
              </h1>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${getStateColor(
                  snapshot.overallState
                )}`}
              >
                {getStateLabel(snapshot.overallState)}
              </span>
            </div>

            {/* Region and Last Update */}
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              {snapshot.regionName && (
                <span>
                  Region: <span className="font-medium">{snapshot.regionName}</span>
                </span>
              )}
              <span>•</span>
              <span>
                Health Score:{' '}
                <span className={`font-semibold ${
                  snapshot.healthScore >= 80 ? 'text-green-600' :
                  snapshot.healthScore >= 50 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {snapshot.healthScore.toFixed(0)}/100
                </span>
              </span>
              <span>•</span>
              <span>
                Last Health Poll: <span className="font-medium">{formatLastSeen(snapshot.lastTelemetryAt)}</span>
              </span>
            </div>

            {/* Telemetry Freshness Warning */}
            {(snapshot.telemetryFreshness === 'STALE' || snapshot.telemetryFreshness === 'OUTDATED') && (
              <div className="mt-2 inline-flex items-center px-3 py-1 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-700 dark:text-yellow-400">
                <svg className="h-4 w-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {snapshot.telemetryFreshness === 'STALE'
                  ? 'Telemetry data is stale (2-10 min old)'
                  : 'Telemetry data is outdated (>10 min old)'}
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors"
            >
              <ArrowPathIcon className="h-5 w-5" />
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
