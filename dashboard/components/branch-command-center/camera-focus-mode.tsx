/**
 * Camera Focus Mode
 * 
 * Full-screen view of a single camera with:
 * - Large live video (mainstream)
 * - Device details
 * - Recording status and retention
 * - Available actions (Playback, Timeline, Snapshot, Export, PTZ)
 */

'use client';

import React, { useState, useEffect } from 'react';
import { CameraOperationalStatus } from '@/types/branch-operational-snapshot';
import {
  XMarkIcon,
  PlayIcon,
  ClockIcon,
  CameraIcon,
  ArrowDownTrayIcon,
  ArrowsPointingOutIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';

interface CameraFocusModeProps {
  branchId: string;
  cameraId: string;
  onClose: () => void;
}

export function CameraFocusMode({ branchId, cameraId, onClose }: CameraFocusModeProps) {
  const [camera, setCamera] = useState<CameraOperationalStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCameraDetails();
  }, [cameraId]);

  const fetchCameraDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/v1/branches/${branchId}/cameras`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch camera details');
      }

      const result = await response.json();
      if (result.success) {
        const foundCamera = result.data.cameras.find((c: any) => c.id === cameraId);
        setCamera(foundCamera || null);
      }
    } catch (err) {
      console.error('Error fetching camera details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayback = () => {
    // Navigate to playback page
    window.location.href = `/recordings?branchId=${branchId}&cameraId=${cameraId}`;
  };

  const handleTimeline = () => {
    // Open timeline view
    console.log('Open timeline for camera:', cameraId);
  };

  const handleSnapshot = () => {
    // Capture snapshot
    console.log('Capture snapshot for camera:', cameraId);
  };

  const handleExport = () => {
    // Open export dialog
    console.log('Export video for camera:', cameraId);
  };

  const handlePTZ = () => {
    // Open PTZ controls
    console.log('Open PTZ controls for camera:', cameraId);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p>Loading camera...</p>
        </div>
      </div>
    );
  }

  if (!camera) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="text-white text-center">
          <p className="mb-4">Camera not found</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const getStateColor = () => {
    switch (camera.state) {
      case 'LIVE':
        return 'text-green-400';
      case 'ONLINE':
        return 'text-blue-400';
      case 'NO_RECORD':
        return 'text-red-400';
      case 'STREAM_LOSS':
        return 'text-yellow-400';
      case 'OFFLINE':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-6 z-10">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              {camera.name}
            </h1>
            <div className="flex items-center gap-3 text-sm">
              <span className={`font-semibold ${getStateColor()}`}>
                {camera.state}
              </span>
              {camera.recordingStatus === 'recording' && (
                <>
                  <span className="text-gray-400">•</span>
                  <span className="text-red-400 flex items-center gap-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    RECORDING
                  </span>
                </>
              )}
              <span className="text-gray-400">•</span>
              <span className="text-gray-300">
                Channel {camera.channelNumber}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-6 w-6 text-white" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="absolute inset-0 flex items-center justify-center p-20">
        {/* Large Video Preview */}
        <div className="w-full h-full bg-gray-900 rounded-lg flex items-center justify-center">
          {camera.state === 'OFFLINE' ? (
            <div className="text-center text-gray-400">
              <VideoCameraIcon className="h-24 w-24 mx-auto mb-4" />
              <p className="text-xl">Camera Offline</p>
            </div>
          ) : (
            <div className="text-center text-gray-400">
              <VideoCameraIcon className="h-24 w-24 mx-auto mb-4" />
              <p className="text-xl">Live Stream Preview</p>
              <p className="text-sm mt-2">Mainstream quality</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel - Details and Actions */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 z-10">
        <div className="grid grid-cols-2 gap-8 mb-6">
          {/* Left: Camera Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Camera Details
            </h3>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-gray-400">Recording Status</div>
                <div className={`font-medium ${
                  camera.recordingStatus === 'recording' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {camera.recordingStatus === 'recording' ? 'Recording' : 'Not Recording'}
                </div>
              </div>

              {camera.retentionDays !== undefined && (
                <div>
                  <div className="text-gray-400">Retention</div>
                  <div className={`font-medium ${
                    camera.retentionState === 'COMPLIANT' ? 'text-green-400' :
                    camera.retentionState === 'WARNING' ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {camera.retentionDays} days
                  </div>
                </div>
              )}

              {camera.currentFps && (
                <div>
                  <div className="text-gray-400">Frame Rate</div>
                  <div className="text-white font-medium">
                    {camera.currentFps.toFixed(1)} FPS
                  </div>
                </div>
              )}

              {camera.latencyMs !== undefined && (
                <div>
                  <div className="text-gray-400">Latency</div>
                  <div className="text-white font-medium">
                    {camera.latencyMs} ms
                  </div>
                </div>
              )}

              <div>
                <div className="text-gray-400">Health Score</div>
                <div className={`font-medium ${
                  camera.healthScore >= 80 ? 'text-green-400' :
                  camera.healthScore >= 50 ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {camera.healthScore.toFixed(0)}/100
                </div>
              </div>

              {camera.lastHeartbeat && (
                <div>
                  <div className="text-gray-400">Last Heartbeat</div>
                  <div className="text-white font-medium">
                    {new Date(camera.lastHeartbeat).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>

            {/* Analytics Status */}
            {(camera.videoLoss || camera.tamperingDetected || camera.imageFrozen) && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg">
                <div className="text-sm font-semibold text-red-400 mb-2">Active Issues</div>
                <div className="space-y-1 text-sm">
                  {camera.videoLoss && <div className="text-red-300">• Video Loss Detected</div>}
                  {camera.tamperingDetected && <div className="text-red-300">• Tampering Detected</div>}
                  {camera.imageFrozen && <div className="text-yellow-300">• Image Frozen</div>}
                </div>
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Actions
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePlayback}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <PlayIcon className="h-5 w-5" />
                Playback
              </button>

              <button
                onClick={handleTimeline}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <ClockIcon className="h-5 w-5" />
                Timeline
              </button>

              <button
                onClick={handleSnapshot}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <CameraIcon className="h-5 w-5" />
                Snapshot
              </button>

              <button
                onClick={handleExport}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
                Export
              </button>

              {camera.ptzSupported && (
                <button
                  onClick={handlePTZ}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors col-span-2"
                >
                  <ArrowsPointingOutIcon className="h-5 w-5" />
                  PTZ Control
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
