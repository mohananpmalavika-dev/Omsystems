/**
 * Branch Camera Wall Component
 * 
 * Live camera grid showing all cameras for a branch.
 * Displays live streams with status indicators.
 */

'use client';

import React, { useState, useEffect } from 'react';

interface Camera {
  id: string;
  name: string;
  onlineStatus: 'online' | 'offline';
  recordingStatus: 'recording' | 'stopped' | 'error';
  rtspUrl?: string;
  thumbnailUrl?: string;
}

interface BranchCameraWallProps {
  branchId: string;
}

export function BranchCameraWall({ branchId }: BranchCameraWallProps) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch cameras for this branch
    const fetchCameras = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/v1/branches/${branchId}/cameras`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const result = await response.json();
          setCameras(result.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch cameras:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCameras();
  }, [branchId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <div className="text-gray-600 dark:text-gray-400">Loading cameras...</div>
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <div className="text-gray-600 dark:text-gray-400">No cameras configured for this branch</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {cameras.map((camera) => (
        <div
          key={camera.id}
          className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden border-2 border-gray-700"
        >
          {/* Camera Stream/Thumbnail */}
          <div className="absolute inset-0 flex items-center justify-center">
            {camera.thumbnailUrl ? (
              <img
                src={camera.thumbnailUrl}
                alt={camera.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-gray-500 text-sm">No preview available</div>
            )}
          </div>

          {/* Status Overlay */}
          <div className="absolute top-2 right-2 flex gap-2">
            {/* Online Status */}
            <div
              className={`w-3 h-3 rounded-full ${
                camera.onlineStatus === 'online' ? 'bg-green-500' : 'bg-red-500'
              }`}
              title={camera.onlineStatus === 'online' ? 'Online' : 'Offline'}
            />
            {/* Recording Status */}
            {camera.recordingStatus === 'recording' && (
              <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse" title="Recording" />
            )}
          </div>

          {/* Camera Info */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
            <div className="text-white text-sm font-medium truncate">{camera.name}</div>
            <div className="text-gray-300 text-xs">
              {camera.onlineStatus === 'online' ? 'LIVE' : 'OFFLINE'}
              {camera.recordingStatus === 'recording' && ' • REC'}
            </div>
          </div>

          {/* Offline Overlay */}
          {camera.onlineStatus === 'offline' && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="text-white text-sm font-medium">Camera Offline</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
