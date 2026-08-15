/**
 * Branch Command Center Component
 * 
 * Main operational console for a branch showing complete health status,
 * live camera wall, and operational controls.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BranchOperationalSnapshot } from '@/types/branch-operational-snapshot';
import { BranchHeader } from './branch-header';
import { BranchOperationalSummary } from './branch-operational-summary';
import { BranchCriticalReasons } from './branch-critical-reasons';
import { CameraWallToolbar } from './camera-wall-toolbar';
import { EnhancedCameraWall } from './enhanced-camera-wall';
import { BranchOperationalTimeline } from './branch-operational-timeline';
import { CameraFocusMode } from './camera-focus-mode';
import { StorageDrillDown } from './storage-drill-down';
import { NetworkDrillDown } from './network-drill-down';
import { RetentionDrillDown } from './retention-drill-down';

interface BranchCommandCenterProps {
  snapshot: BranchOperationalSnapshot;
  onRefresh: () => void;
  focusedCamera?: string;
  initialFilter?: string;
  initialTab?: string;
}

export function BranchCommandCenter({
  snapshot,
  onRefresh,
  focusedCamera,
  initialFilter,
  initialTab,
}: BranchCommandCenterProps) {
  const router = useRouter();

  // Camera wall state
  const [gridColumns, setGridColumns] = useState(4);
  const [sortBy, setSortBy] = useState<'number' | 'health' | 'recording' | 'retention' | 'alert'>('number');
  const [filter, setFilter] = useState<string>(initialFilter || 'all');
  const [streamProfile, setStreamProfile] = useState<'main' | 'sub' | 'auto'>('sub');

  // Focus mode
  const [focusCamera, setFocusCamera] = useState<string | null>(focusedCamera || null);

  // Drill-down modals
  const [showStorageDrillDown, setShowStorageDrillDown] = useState(false);
  const [showNetworkDrillDown, setShowNetworkDrillDown] = useState(false);
  const [showRetentionDrillDown, setShowRetentionDrillDown] = useState(false);

  // Update URL when focus camera changes
  useEffect(() => {
    if (focusCamera) {
      const url = new URL(window.location.href);
      url.searchParams.set('camera', focusCamera);
      router.replace(url.pathname + url.search, { scroll: false });
    } else if (focusedCamera) {
      const url = new URL(window.location.href);
      url.searchParams.delete('camera');
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [focusCamera]);

  const handleCameraClick = (cameraId: string) => {
    setFocusCamera(cameraId);
  };

  const handleCloseFocus = () => {
    setFocusCamera(null);
  };

  const handleStorageClick = () => {
    setShowStorageDrillDown(true);
  };

  const handleNetworkClick = () => {
    setShowNetworkDrillDown(true);
  };

  const handleRetentionClick = () => {
    setShowRetentionDrillDown(true);
  };

  // If in focus mode, show only the focused camera
  if (focusCamera) {
    return (
      <CameraFocusMode
        branchId={snapshot.branchId}
        cameraId={focusCamera}
        onClose={handleCloseFocus}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header with breadcrumb and refresh */}
      <BranchHeader
        snapshot={snapshot}
        onRefresh={onRefresh}
      />

      <div className="max-w-[1920px] mx-auto px-4 py-6 space-y-6">
        {/* Critical Reasons - Why this branch has this status */}
        {snapshot.overallState !== 'HEALTHY' && snapshot.reasons.length > 0 && (
          <BranchCriticalReasons
            overallState={snapshot.overallState}
            reasons={snapshot.reasons}
            primaryReason={snapshot.primaryReason}
          />
        )}

        {/* Operational Summary Cards */}
        <BranchOperationalSummary
          snapshot={snapshot}
          onStorageClick={handleStorageClick}
          onNetworkClick={handleNetworkClick}
          onRetentionClick={handleRetentionClick}
        />

        {/* Camera Wall Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Toolbar */}
          <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <CameraWallToolbar
              totalCameras={snapshot.cameras.total}
              gridColumns={gridColumns}
              sortBy={sortBy}
              filter={filter}
              streamProfile={streamProfile}
              onGridColumnsChange={setGridColumns}
              onSortByChange={setSortBy}
              onFilterChange={setFilter}
              onStreamProfileChange={setStreamProfile}
              cameraSummary={snapshot.cameras}
            />
          </div>

          {/* Camera Grid */}
          <div className="p-6">
            <EnhancedCameraWall
              branchId={snapshot.branchId}
              gridColumns={gridColumns}
              sortBy={sortBy}
              filter={filter}
              streamProfile={streamProfile}
              onCameraClick={handleCameraClick}
            />
          </div>
        </div>

        {/* Operational Timeline */}
        <BranchOperationalTimeline
          branchId={snapshot.branchId}
        />
      </div>

      {/* Drill-down Modals */}
      {showStorageDrillDown && (
        <StorageDrillDown
          branchId={snapshot.branchId}
          storage={snapshot.storage}
          onClose={() => setShowStorageDrillDown(false)}
        />
      )}

      {showNetworkDrillDown && (
        <NetworkDrillDown
          branchId={snapshot.branchId}
          network={snapshot.network}
          onClose={() => setShowNetworkDrillDown(false)}
        />
      )}

      {showRetentionDrillDown && (
        <RetentionDrillDown
          branchId={snapshot.branchId}
          retention={snapshot.retention}
          onClose={() => setShowRetentionDrillDown(false)}
        />
      )}
    </div>
  );
}
