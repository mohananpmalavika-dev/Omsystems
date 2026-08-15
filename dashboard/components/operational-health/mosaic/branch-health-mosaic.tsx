/**
 * Branch Health Mosaic Component
 * 
 * Grid display of branch health cards optimized for 400+ branches.
 * Includes filtering, search, and virtual scrolling for performance.
 */

'use client';

import React, { useState, useMemo } from 'react';
import { BranchHealthCard } from './branch-health-card';
import { BranchMosaicItem, BranchHealthFilter, HealthState } from '../../../types/operational-health.types';

interface BranchHealthMosaicProps {
  branches: BranchMosaicItem[];
  filter?: BranchHealthFilter;
  onFilterChange?: (filter: BranchHealthFilter) => void;
  onBranchClick?: (branchId: string) => void;
  loading?: boolean;
}

export function BranchHealthMosaic({
  branches,
  filter = {},
  onFilterChange,
  onBranchClick,
  loading = false,
}: BranchHealthMosaicProps) {
  const [searchTerm, setSearchTerm] = useState(filter.search || '');
  const [viewMode, setViewMode] = useState<'all' | 'attention'>('attention');

  // Filter branches for "needs attention" mode
  const displayBranches = useMemo(() => {
    if (viewMode === 'all') {
      return branches;
    }
    // Needs attention = not healthy
    return branches.filter(b => b.state !== 'HEALTHY');
  }, [branches, viewMode]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    onFilterChange?.({ ...filter, search: value || undefined });
  };

  const handleStateFilter = (states: HealthState[]) => {
    onFilterChange?.({ ...filter, states: states.length > 0 ? states : undefined });
  };

  const clearFilters = () => {
    setSearchTerm('');
    onFilterChange?.({});
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filter.states && filter.states.length > 0) count++;
    if (filter.retentionViolation) count++;
    if (filter.recordingProblem) count++;
    if (filter.cameraOffline) count++;
    if (filter.internetStates && filter.internetStates.length > 0) count++;
    if (filter.p1Only) count++;
    return count;
  }, [filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading branch health...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Search */}
        <div className="flex-1 min-w-[300px]">
          <input
            type="text"
            placeholder="Search branches..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg 
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('attention')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'attention'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Needs Attention ({branches.filter(b => b.state !== 'HEALTHY').length})
          </button>
          <button
            onClick={() => setViewMode('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            All Branches ({branches.length})
          </button>
        </div>

        {/* Clear Filters */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-sm text-red-600 dark:text-red-400 
                     hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
          >
            Clear Filters ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        Showing {displayBranches.length} branch{displayBranches.length !== 1 ? 'es' : ''}
        {viewMode === 'attention' && ' requiring attention'}
      </div>

      {/* Mosaic Grid */}
      {displayBranches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            {viewMode === 'attention' 
              ? '🎉 All branches are healthy!'
              : 'No branches found matching your filters'
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {displayBranches.map((branch) => (
            <BranchHealthCard
              key={branch.branchId}
              branch={branch}
              onClick={onBranchClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
