/**
 * Camera Wall Toolbar
 * 
 * Controls for filtering, sorting, grid layout, and stream quality
 */

'use client';

import React from 'react';
import { CameraHealthSummary } from '@/types/branch-operational-snapshot';
import {
  Squares2X2Icon,
  FunnelIcon,
  ArrowsUpDownIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';

interface CameraWallToolbarProps {
  totalCameras: number;
  gridColumns: number;
  sortBy: 'number' | 'health' | 'recording' | 'retention' | 'alert';
  filter: string;
  streamProfile: 'main' | 'sub' | 'auto';
  onGridColumnsChange: (columns: number) => void;
  onSortByChange: (sortBy: 'number' | 'health' | 'recording' | 'retention' | 'alert') => void;
  onFilterChange: (filter: string) => void;
  onStreamProfileChange: (profile: 'main' | 'sub' | 'auto') => void;
  cameraSummary: CameraHealthSummary;
}

export function CameraWallToolbar({
  totalCameras,
  gridColumns,
  sortBy,
  filter,
  streamProfile,
  onGridColumnsChange,
  onSortByChange,
  onFilterChange,
  onStreamProfileChange,
  cameraSummary,
}: CameraWallToolbarProps) {
  const gridOptions = [2, 3, 4, 6, 8];

  const filterOptions = [
    { value: 'all', label: 'All', count: cameraSummary.total },
    { value: 'live', label: 'Live', count: cameraSummary.recording },
    { value: 'offline', label: 'Offline', count: cameraSummary.offline },
    { value: 'no-record', label: 'Not Recording', count: cameraSummary.notRecording },
    { value: 'retention-violation', label: 'Retention Issue', count: 0 }, // Will be populated from API
    { value: 'active-alert', label: 'Active Alert', count: 0 },
  ];

  const sortOptions = [
    { value: 'number', label: 'Camera Number' },
    { value: 'health', label: 'Health Priority' },
    { value: 'recording', label: 'Recording Problem' },
    { value: 'retention', label: 'Retention Problem' },
    { value: 'alert', label: 'Active Alert' },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {/* Left: Title and Count */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Cameras
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {cameraSummary.online} of {totalCameras} online
          {cameraSummary.recording > 0 && ` • ${cameraSummary.recording} recording`}
        </p>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-3">
        {/* Filter */}
        <div className="flex items-center gap-2">
          <FunnelIcon className="h-4 w-4 text-gray-500" />
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} {option.count > 0 && `(${option.count})`}
              </option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <ArrowsUpDownIcon className="h-4 w-4 text-gray-500" />
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as any)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                Order: {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Grid Columns */}
        <div className="flex items-center gap-2">
          <Squares2X2Icon className="h-4 w-4 text-gray-500" />
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {gridOptions.map((cols) => (
              <button
                key={cols}
                onClick={() => onGridColumnsChange(cols)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  gridColumns === cols
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {cols}x
              </button>
            ))}
          </div>
        </div>

        {/* Stream Profile */}
        <div className="flex items-center gap-2">
          <SignalIcon className="h-4 w-4 text-gray-500" />
          <select
            value={streamProfile}
            onChange={(e) => onStreamProfileChange(e.target.value as any)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="sub">Substream</option>
            <option value="main">Mainstream</option>
            <option value="auto">Auto</option>
          </select>
        </div>
      </div>
    </div>
  );
}
