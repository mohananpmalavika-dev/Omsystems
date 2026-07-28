/**
 * Camera Monitoring Dashboard
 * Real-time camera status, quality monitoring, and health overview
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Camera,
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Wifi,
  WifiOff,
  Filter,
  Search,
  RefreshCw,
} from 'lucide-react';
import { useCameraMonitoring } from '../hooks/useCameraMonitoring';
import { CameraHealthCard } from '../components/operational-health/camera-health-card';
import Link from 'next/link';

type StatusFilter = 'all' | 'online' | 'offline' | 'warning' | 'degraded' | 'quality-issues';

export function CameraMonitoringDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedBranch, setSelectedBranch] = useState<string | undefined>();

  const {
    cameras,
    qualityMetricsMap,
    recentAlerts,
    isConnected,
    lastUpdate,
    getSummary,
    getCamerasByStatus,
    getCamerasWithQualityIssues,
  } = useCameraMonitoring({
    branchId: selectedBranch,
    autoConnect: true,
  });

  const summary = getSummary();

  // Filter cameras based on search and status
  const filteredCameras = useMemo(() => {
    let filtered = cameras;

    // Apply status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'quality-issues') {
        filtered = getCamerasWithQualityIssues();
      } else {
        filtered = getCamerasByStatus(statusFilter);
      }
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((camera) =>
        camera.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [cameras, statusFilter, searchQuery, getCamerasByStatus, getCamerasWithQualityIssues]);

  // Sort cameras: offline first, then by quality issues, then alphabetically
  const sortedCameras = useMemo(() => {
    return [...filteredCameras].sort((a, b) => {
      // Offline first
      if (a.status === 'offline' && b.status !== 'offline') return -1;
      if (a.status !== 'offline' && b.status === 'offline') return 1;

      // Quality issues second
      const aHasIssues = a.videoLoss || a.imageFrozen || a.blackScreen;
      const bHasIssues = b.videoLoss || b.imageFrozen || b.blackScreen;
      if (aHasIssues && !bHasIssues) return -1;
      if (!aHasIssues && bHasIssues) return 1;

      // Alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [filteredCameras]);

  // Auto-refresh summary every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Trigger re-render to update timestamps
      setSearchQuery((q) => q);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Camera Monitoring</h1>
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <Wifi size={20} className="text-green-600" />
                  <span className="text-sm text-gray-600">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff size={20} className="text-red-600" />
                  <span className="text-sm text-gray-600">Disconnected</span>
                </>
              )}
            </div>
            
            {/* Last Update */}
            {lastUpdate && (
              <div className="text-sm text-gray-500">
                Last update: {new Date(lastUpdate).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
        <p className="text-gray-600">
          Real-time camera status, quality metrics, and health monitoring
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
        {/* Total Cameras */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <Camera size={24} className="text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">{summary.total}</span>
          </div>
          <div className="text-sm text-gray-600">Total Cameras</div>
        </div>

        {/* Online */}
        <div className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
             onClick={() => setStatusFilter('online')}>
          <div className="flex items-center justify-between mb-2">
            <CheckCircle size={24} className="text-green-600" />
            <span className="text-2xl font-bold text-green-600">{summary.online}</span>
          </div>
          <div className="text-sm text-gray-600">Online</div>
          <div className="text-xs text-gray-500 mt-1">
            {summary.uptimePercentage.toFixed(1)}% uptime
          </div>
        </div>

        {/* Offline */}
        <div className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
             onClick={() => setStatusFilter('offline')}>
          <div className="flex items-center justify-between mb-2">
            <XCircle size={24} className="text-red-600" />
            <span className="text-2xl font-bold text-red-600">{summary.offline}</span>
          </div>
          <div className="text-sm text-gray-600">Offline</div>
        </div>

        {/* Warning */}
        <div className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
             onClick={() => setStatusFilter('warning')}>
          <div className="flex items-center justify-between mb-2">
            <AlertCircle size={24} className="text-yellow-600" />
            <span className="text-2xl font-bold text-yellow-600">{summary.warning}</span>
          </div>
          <div className="text-sm text-gray-600">Warning</div>
        </div>

        {/* Degraded */}
        <div className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
             onClick={() => setStatusFilter('degraded')}>
          <div className="flex items-center justify-between mb-2">
            <TrendingDown size={24} className="text-orange-600" />
            <span className="text-2xl font-bold text-orange-600">{summary.degraded}</span>
          </div>
          <div className="text-sm text-gray-600">Degraded</div>
        </div>

        {/* Quality Issues */}
        <div className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
             onClick={() => setStatusFilter('quality-issues')}>
          <div className="flex items-center justify-between mb-2">
            <Activity size={24} className="text-purple-600" />
            <span className="text-2xl font-bold text-purple-600">{summary.qualityIssues}</span>
          </div>
          <div className="text-sm text-gray-600">Quality Issues</div>
        </div>
      </div>

      {/* Recent Alerts Banner */}
      {recentAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle size={24} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-2">Recent Quality Alerts</h3>
              <div className="space-y-2">
                {recentAlerts.slice(0, 3).map((alert) => (
                  <div key={alert.id} className="text-sm text-red-800">
                    <span className="font-medium">{alert.cameraName}:</span> {alert.message}
                    <span className="text-red-600 ml-2">
                      ({new Date(alert.detectedAt).toLocaleTimeString()})
                    </span>
                  </div>
                ))}
              </div>
              {recentAlerts.length > 3 && (
                <div className="text-sm text-red-700 mt-2">
                  + {recentAlerts.length - 3} more alerts
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search
                size={20}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search cameras..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="warning">Warning</option>
              <option value="degraded">Degraded</option>
              <option value="quality-issues">Quality Issues</option>
            </select>
          </div>

          {/* Clear Filters */}
          {(searchQuery || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Camera Grid */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Cameras ({filteredCameras.length})
          </h2>
        </div>

        {sortedCameras.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <Camera size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Cameras Found</h3>
            <p className="text-gray-600">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'No cameras are currently being monitored'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedCameras.map((camera) => {
              const metrics = qualityMetricsMap.get(camera.id);
              
              return (
                <Link
                  key={camera.id}
                  href={`/cameras/${camera.id}`}
                  className="block hover:scale-[1.02] transition-transform"
                >
                  <CameraHealthCard
                    camera={{
                      id: camera.id,
                      name: camera.name,
                      branchName: '', // Would come from branch data
                      onlineStatus: camera.status,
                      recordingStatus: camera.streamActive ? 'healthy' : 'stream_unavailable',
                      rtspUrl: '',
                      currentBitrate: camera.currentBitrate || 0,
                      packetLoss: camera.packetLoss || 0,
                      branchId: selectedBranch || '',
                      onvifAvailable: camera.status !== 'offline',
                      streamAvailable: camera.streamActive || false,
                      currentFps: camera.currentFps || 0,
                      expectedFps: metrics?.expectedFps || 25,
                      latencyMs: camera.latencyMs || 0,
                      videoLoss: camera.videoLoss || false,
                      tamperingDetected: false,
                      imageFrozen: camera.imageFrozen || false,
                      lastHeartbeat: (camera.lastSeen || new Date()).toISOString(),
                      healthScore: metrics?.qualityScore || 0,
                    }}
                    onViewDetails={(id) => {
                      // Navigation handled by Link
                    }}
                  />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default CameraMonitoringDashboard;
