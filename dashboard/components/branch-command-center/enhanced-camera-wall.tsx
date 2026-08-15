/**
 * Enhanced Camera Wall
 * 
 * Grid of camera tiles with operational state badges:
 * - LIVE / ONLINE / NO RECORD / STREAM LOSS / OFFLINE
 * - Recording indicator
 * - Retention status
 * - Health score
 * - Visual quality indicators
 */

'use client';

import React, { useState, useEffect } from 'react';
import { CameraOperationalStatus } from '@/types/branch-operational-snapshot';
import {
  VideoCameraIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  SignalSlashIcon,
  XCircleIcon,
} from '@heroicons/react/24/solid';

interface EnhancedCameraWallProps {
  branchId: string;
  gridColumns: number;
  sortBy: 'number' | 'health' | 'recording' | 'retention' | 'alert';
  filter: string;
  streamProfile: 'main' | 'sub' | 'auto';
  onCameraClick: (cameraId: string) => void;
}

export function EnhancedCameraWall({
  branchId,
  gridColumns,
  sortBy,
  filter,
  streamProfile,
  onCameraClick,
}: EnhancedCameraWallProps) {
  const [cameras, setCameras] = useState<CameraOperationalStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCameras();
  }, [branchId, filter]);

  const fetchCameras = async () => {
    try {
      setLoading(true);
      const filterParam = filter !== 'all' ? `?filter=${filter}` : '';
      const response = await fetch(
        `/api/v1/branches/${branchId}/cameras${filterParam}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch cameras');
      }

      const result = await response.json();
      if (result.success) {
        setCameras(result.data.cameras || []);
      }
    } catch (err) {
      console.error('Error fetching cameras:', err);
      setError(err instanceof Error ? err.message : 'Failed to load cameras');
    } finally {
      setLoading(false);
    }
  };

  // Apply sorting
  const sortedCameras = React.useMemo(() => {
    const sorted = [...cameras];

    switch (sortBy) {
      case 'health':
        // Worst health first
        sorted.sort((a, b) => a.healthScore - b.healthScore);
        break;
      case 'recording':
        // Not recording first
        sorted.sort((a, b) => {
          if (a.recordingStatus !== 'recording' && b.recordingStatus === 'recording') return -1;
          if (a.recordingStatus === 'recording' && b.recordingStatus !== 'recording') return 1;
          return 0;
        });
        break;
      case 'retention':
        // Worst retention first
        sorted.sort((a, b) => {
          const aRetention = a.retentionDays ?? 999;
          const bRetention = b.retentionDays ?? 999;
          return aRetention - bRetention;
        });
        break;
      case 'alert':
        // Cameras with issues first
        sorted.sort((a, b) => {
          const aHasIssue = a.videoLoss || a.tamperingDetected || a.imageFrozen;
          const bHasIssue = b.videoLoss || b.tamperingDetected || b.imageFrozen;
          if (aHasIssue && !bHasIssue) return -1;
          if (!aHasIssue && bHasIssue) return 1;
          return 0;
        });
        break;
      default:
        // Camera number
        sorted.sort((a, b) => a.channelNumber.localeCompare(b.channelNumber));
    }

    return sorted;
  }, [cameras, sortBy]);

  const getGridClass = () => {
    const cols = {
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
      6: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6',
      8: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8',
    };
    return cols[gridColumns as keyof typeof cols] || cols[4];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading cameras...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <XCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (sortedCameras.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <VideoCameraIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No cameras match the current filter
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid ${getGridClass()} gap-4`}>
      {sortedCameras.map((camera) => (
        <CameraTile
          key={camera.id}
          camera={camera}
          onClick={() => onCameraClick(camera.id)}
        />
      ))}
    </div>
  );
}

interface CameraTileProps {
  camera: CameraOperationalStatus;
  onClick: () => void;
}

function CameraTile({ camera, onClick }: CameraTileProps) {
  const getStateColor = () => {
    switch (camera.state) {
      case 'LIVE':
        return 'border-green-500 bg-green-50 dark:bg-green-900/20';
      case 'ONLINE':
        return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
      case 'NO_RECORD':
        return 'border-red-500 bg-red-50 dark:bg-red-900/20';
      case 'STREAM_LOSS':
        return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
      case 'OFFLINE':
        return 'border-gray-500 bg-gray-50 dark:bg-gray-800';
      default:
        return 'border-gray-300 bg-gray-100 dark:bg-gray-800';
    }
  };

  const getStateLabel = () => {
    switch (camera.state) {
      case 'LIVE':
        return { text: 'LIVE', color: 'text-green-600 dark:text-green-400' };
      case 'ONLINE':
        return { text: 'ONLINE', color: 'text-blue-600 dark:text-blue-400' };
      case 'NO_RECORD':
        return { text: 'NO RECORD', color: 'text-red-600 dark:text-red-400' };
      case 'STREAM_LOSS':
        return { text: 'STREAM LOSS', color: 'text-yellow-600 dark:text-yellow-400' };
      case 'OFFLINE':
        return { text: 'OFFLINE', color: 'text-gray-600 dark:text-gray-400' };
      default:
        return { text: 'UNKNOWN', color: 'text-gray-600 dark:text-gray-400' };
    }
  };

  const stateLabel = getStateLabel();

  return (
    <button
      onClick={onClick}
      className={`relative aspect-video rounded-lg border-2 ${getStateColor()} overflow-hidden transition-all hover:shadow-lg hover:scale-105 group`}
    >
      {/* Video Preview Placeholder */}
      <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
        {camera.state === 'OFFLINE' ? (
          <div className="text-center">
            <XCircleIcon className="h-8 w-8 text-gray-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">Camera Offline</p>
          </div>
        ) : camera.state === 'STREAM_LOSS' ? (
          <div className="text-center">
            <SignalSlashIcon className="h-8 w-8 text-gray-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">No Stream</p>
          </div>
        ) : (
          <VideoCameraIcon className="h-8 w-8 text-gray-600" />
        )}
      </div>

      {/* Status Badges - Top Right */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
        {/* Recording Indicator */}
        {camera.recordingStatus === 'recording' && (
          <div className="flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded text-xs font-semibold">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            REC
          </div>
        )}

        {/* Health Issues */}
        {camera.videoLoss && (
          <div className="flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded text-xs font-semibold">
            <ExclamationTriangleIcon className="h-3 w-3" />
            VIDEO LOSS
          </div>
        )}

        {camera.tamperingDetected && (
          <div className="flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded text-xs font-semibold">
            <ExclamationTriangleIcon className="h-3 w-3" />
            TAMPER
          </div>
        )}

        {camera.imageFrozen && (
          <div className="flex items-center gap-1 bg-yellow-600 text-white px-2 py-0.5 rounded text-xs font-semibold">
            <ExclamationTriangleIcon className="h-3 w-3" />
            FROZEN
          </div>
        )}

        {/* Retention Warning */}
        {camera.retentionState === 'VIOLATION' && (
          <div className="flex items-center gap-1 bg-orange-600 text-white px-2 py-0.5 rounded text-xs font-semibold">
            <ClockIcon className="h-3 w-3" />
            {camera.retentionDays}d
          </div>
        )}
      </div>

      {/* Health Score Badge - Top Left */}
      <div className="absolute top-2 left-2">
        <div
          className={`px-2 py-0.5 rounded text-xs font-semibold ${
            camera.healthScore >= 80
              ? 'bg-green-600 text-white'
              : camera.healthScore >= 50
              ? 'bg-yellow-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {camera.healthScore.toFixed(0)}
        </div>
      </div>

      {/* Camera Info - Bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-3">
        <div className="text-white">
          <div className="text-sm font-bold truncate">{camera.name}</div>
          <div className="flex items-center gap-2 text-xs">
            <span className={`font-semibold ${stateLabel.color}`}>
              {stateLabel.text}
            </span>
            {camera.recordingStatus === 'recording' && (
              <>
                <span className="text-gray-400">•</span>
                <span className="text-gray-300">REC</span>
              </>
            )}
          </div>

          {/* Additional Info on Hover */}
          <div className="mt-1 text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
            {camera.currentFps && (
              <div>FPS: {camera.currentFps.toFixed(1)}</div>
            )}
            {camera.latencyMs !== undefined && (
              <div>Latency: {camera.latencyMs}ms</div>
            )}
          </div>
        </div>
      </div>

      {/* Click to expand indicator */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
        <div className="bg-white dark:bg-gray-800 rounded-full px-4 py-2 text-sm font-medium text-gray-900 dark:text-white shadow-lg">
          Click to view details
        </div>
      </div>
    </button>
  );
}
