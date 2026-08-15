/**
 * Enhanced Camera Wall
 * 
 * Grid of camera tiles with operational state badges:
 * - LIVE / ONLINE / NO RECORD / STREAM LOSS / OFFLINE
 * - Recording indicator
 * - Retention status
 * - Health score
 * - Live video session management with renewal & visibility lifecycle
 */

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CameraOperationalStatus } from '@/types/branch-operational-snapshot';
import {
  VideoCameraIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  SignalSlashIcon,
  XCircleIcon,
  ArrowsPointingOutIcon,
  ArrowPathIcon,
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
        sorted.sort((a, b) => a.healthScore - b.healthScore);
        break;
      case 'recording':
        sorted.sort((a, b) => {
          if (a.recordingStatus !== 'recording' && b.recordingStatus === 'recording') return -1;
          if (a.recordingStatus === 'recording' && b.recordingStatus !== 'recording') return 1;
          return 0;
        });
        break;
      case 'retention':
        sorted.sort((a, b) => {
          const aRetention = a.retentionDays ?? 999;
          const bRetention = b.retentionDays ?? 999;
          return aRetention - bRetention;
        });
        break;
      case 'alert':
        sorted.sort((a, b) => {
          const aHasIssue = a.videoLoss || a.tamperingDetected || a.imageFrozen;
          const bHasIssue = b.videoLoss || b.tamperingDetected || b.imageFrozen;
          if (aHasIssue && !bHasIssue) return -1;
          if (!aHasIssue && bHasIssue) return 1;
          return 0;
        });
        break;
      default:
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
          streamProfile={streamProfile}
          onClick={() => onCameraClick(camera.id)}
        />
      ))}
    </div>
  );
}

interface CameraTileProps {
  camera: CameraOperationalStatus;
  streamProfile: 'main' | 'sub' | 'auto';
  onClick: () => void;
}

function CameraTile({ camera, streamProfile, onClick }: CameraTileProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const renewTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (camera.onlineStatus === 'online' && camera.state !== 'OFFLINE') {
      startSession();
    }
    return () => {
      terminateSession();
    };
  }, [camera.id, streamProfile]);

  const startSession = async () => {
    try {
      const res = await fetch('/api/v1/media/live-sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cameraId: camera.id,
          quality: streamProfile === 'main' ? 'MAIN' : 'SUB',
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const sid = json.data?.sessionId || json.sessionId;
        if (sid) {
          setSessionId(sid);
          setStreaming(true);
          // Schedule renewal every 240 seconds
          renewTimerRef.current = setInterval(() => {
            fetch(`/api/v1/media/live-sessions/${encodeURIComponent(sid)}/renew`, {
              method: 'POST',
            }).catch(() => undefined);
          }, 240_000);
        }
      }
    } catch {
      // Stream fallback to static preview
      setStreaming(false);
    }
  };

  const terminateSession = () => {
    if (renewTimerRef.current) {
      clearInterval(renewTimerRef.current);
      renewTimerRef.current = null;
    }
    if (sessionId) {
      fetch(`/api/v1/media/live-sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      }).catch(() => undefined);
      setSessionId(null);
    }
  };

  const getStateColor = () => {
    switch (camera.state) {
      case 'LIVE':
        return 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20';
      case 'ONLINE':
        return 'border-blue-500 bg-blue-50 dark:bg-blue-950/20';
      case 'NO_RECORD':
        return 'border-rose-500 bg-rose-50 dark:bg-rose-950/20';
      case 'STREAM_LOSS':
        return 'border-amber-500 bg-amber-50 dark:bg-amber-950/20';
      case 'OFFLINE':
        return 'border-slate-400 bg-slate-100 dark:bg-slate-800';
      default:
        return 'border-slate-300 bg-slate-50 dark:bg-slate-800';
    }
  };

  return (
    <div
      onClick={onClick}
      onDoubleClick={onClick}
      className={`relative aspect-video rounded-xl border-2 ${getStateColor()} overflow-hidden transition-all hover:shadow-xl hover:scale-[1.02] cursor-pointer group select-none`}
    >
      {/* Video Viewport / Backdrop */}
      <div className="absolute inset-0 bg-slate-950 flex items-center justify-center">
        {camera.state === 'OFFLINE' ? (
          <div className="text-center p-4">
            <XCircleIcon className="h-8 w-8 text-slate-500 mx-auto mb-1" />
            <p className="text-xs text-slate-400 font-semibold">Camera Offline</p>
          </div>
        ) : camera.state === 'STREAM_LOSS' ? (
          <div className="text-center p-4">
            <SignalSlashIcon className="h-8 w-8 text-amber-500 mx-auto mb-1" />
            <p className="text-xs text-amber-400 font-semibold">Stream Signal Loss</p>
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center bg-slate-900">
            {/* Live stream animation canvas background */}
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]"></div>
            <VideoCameraIcon className="h-8 w-8 text-slate-600 group-hover:text-blue-400 transition" />
            <span className="absolute bottom-2 right-2 text-[10px] text-slate-500 font-mono">
              {streamProfile === 'main' ? '1080p 25fps' : '360p 15fps'}
            </span>
          </div>
        )}
      </div>

      {/* Top Badges */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 items-end z-10">
        {/* Recording Badge */}
        {camera.recordingStatus === 'recording' && (
          <div className="flex items-center gap-1.5 bg-rose-600 text-white px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider shadow-sm">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
            REC
          </div>
        )}

        {/* No Record Alert */}
        {camera.recordingStatus === 'stopped' && camera.state !== 'OFFLINE' && (
          <div className="flex items-center gap-1 bg-rose-700 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm">
            NO RECORD
          </div>
        )}

        {/* Video Loss / Tamper */}
        {camera.videoLoss && (
          <div className="flex items-center gap-1 bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">
            <ExclamationTriangleIcon className="h-3 w-3" />
            VIDEO LOSS
          </div>
        )}

        {camera.tamperingDetected && (
          <div className="flex items-center gap-1 bg-amber-600 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">
            <ExclamationTriangleIcon className="h-3 w-3" />
            TAMPER
          </div>
        )}

        {/* Retention Warning Badge */}
        {camera.retentionState === 'VIOLATION' && (
          <div className="flex items-center gap-1 bg-amber-600 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm">
            <ClockIcon className="h-3 w-3" />
            {camera.retentionDays}d / 90d
          </div>
        )}
      </div>

      {/* Top Left Health Score & Channel Number */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10">
        <span className="px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[10px] font-mono font-bold text-white border border-white/10">
          {camera.channelNumber}
        </span>
        <div
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm ${
            camera.healthScore >= 80
              ? 'bg-emerald-600 text-white'
              : camera.healthScore >= 50
              ? 'bg-amber-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {camera.healthScore.toFixed(0)}
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-3 pt-6 z-10">
        <div className="flex items-center justify-between text-white">
          <div className="truncate pr-2">
            <div className="text-xs font-bold truncate group-hover:text-blue-300 transition">
              {camera.name}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-300">
              <span className="font-semibold">{camera.state}</span>
              {camera.latencyMs ? <span>· {camera.latencyMs}ms</span> : null}
              {camera.ptzSupported ? <span className="text-blue-300 font-semibold">PTZ</span> : null}
            </div>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-white/20 rounded hover:bg-white/40 text-white">
            <ArrowsPointingOutIcon className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
