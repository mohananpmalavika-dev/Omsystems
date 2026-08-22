/**
 * Main Operational Health Dashboard
 * 
 * Production-ready HO control room showing 400-branch surveillance operations.
 * Integrates summary KPIs, branch mosaic, filtering, and branch detail views.
 */

'use client';

import React, { useState } from 'react';
import { OperationalSummaryKPIs } from './summary/operational-summary-kpis';
import { BranchHealthMosaic } from './mosaic/branch-health-mosaic';
import { BranchDetailView } from './branch-detail/branch-detail-view';
import { useDashboardSummary, useBranchMosaic, useBranchHealth } from '../../hooks/useOperationalHealth';
import { BranchHealthFilter } from '../../types/operational-health.types';

export function OperationalDashboard() {
  const [filter, setFilter] = useState<BranchHealthFilter>({});
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Auto-refresh every 30 seconds
  const { summary, loading: summaryLoading, error: summaryError, refresh: refreshSummary } = useDashboardSummary(30000);
  const { branches, loading: branchesLoading, error: branchesError, refresh: refreshBranches } = useBranchMosaic(filter, 30000);
  const { health: selectedBranchHealth, loading: healthLoading, forceRefresh: refreshBranchHealth } = useBranchHealth(selectedBranchId);

  const handleFilterChange = (newFilter: BranchHealthFilter) => {
    setFilter(newFilter);
  };

  const handleBranchClick = (branchId: string) => {
    setSelectedBranchId(branchId);
  };

  const handleCloseBranchDetail = () => {
    setSelectedBranchId(null);
  };

  const handleRefreshBranchDetail = async () => {
    await refreshBranchHealth();
  };

  const handleRefreshAll = async () => {
    await Promise.all([refreshSummary(), refreshBranches()]);
  };

  // Show branch detail view when selected
  if (selectedBranchId && selectedBranchHealth) {
    return (
      <BranchDetailView
        health={selectedBranchHealth}
        onClose={handleCloseBranchDetail}
        onRefresh={handleRefreshBranchDetail}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                SURVEILLANCE OPERATIONS
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Enterprise Branch Operational Health
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Auto-refresh: 30s
              </div>
              <button
                onClick={handleRefreshAll}
                disabled={summaryLoading || branchesLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                         transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {summaryLoading || branchesLoading ? 'Refreshing...' : 'Refresh Now'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1920px] mx-auto px-6 py-6 space-y-8">
        {/* Error States */}
        {summaryError && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="text-red-900 dark:text-red-100 font-medium">Failed to load dashboard summary</div>
            <div className="text-red-700 dark:text-red-300 text-sm mt-1">{summaryError}</div>
          </div>
        )}

        {branchesError && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="text-red-900 dark:text-red-100 font-medium">Failed to load branch health</div>
            <div className="text-red-700 dark:text-red-300 text-sm mt-1">{branchesError}</div>
          </div>
        )}

        {/* Summary KPIs */}
        {summary && (
          <OperationalSummaryKPIs
            summary={summary}
            onFilterClick={handleFilterChange}
          />
        )}

        {/* Branch Mosaic */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Branch Mosaic
          </h2>
          <BranchHealthMosaic
            branches={branches}
            filter={filter}
            onFilterChange={handleFilterChange}
            onBranchClick={handleBranchClick}
            loading={branchesLoading}
          />
        </div>
      </div>
    </div>
  );
}
