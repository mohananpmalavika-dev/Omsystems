'use client';

import { useState, useEffect } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { PageHero } from '@/components/page-hero';

interface HealthSummary {
  totalCameras: number;
  onlineCameras: number;
  recordingCameras: number;
  healthyCameras: number;
  warningCameras: number;
  degradedCameras: number;
  criticalCameras: number;
  offlineCameras: number;
  avgHealthScore: number;
}

interface CameraHealth {
  id: string;
  cameraId: string;
  cameraName: string;
  cameraLocation: string;
  branchName: string;
  checkTimestamp: string;
  isOnline: boolean;
  isRecording: boolean;
  overallStatus: string;
  healthScore: number;
  issuesDetected: string[];
  currentFps: number;
  currentBitrateKbps: number;
  latencyMs: number;
}

export default function CameraHealthPage() {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [cameras, setCameras] = useState<CameraHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({
    status: '',
    branchNodeId: '',
  });

  useEffect(() => {
    fetchHealthData();
  }, [filter]);

  const fetchHealthData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch summary
      const summaryParams = new URLSearchParams({ summary: 'true' });
      if (filter.branchNodeId) summaryParams.append('branchNodeId', filter.branchNodeId);
      
      const summaryResponse = await fetch(`/api/audit/health?${summaryParams}`);
      const summaryData = await summaryResponse.json();
      if (!summaryResponse.ok) throw new Error(summaryData.error || 'Health summary is unavailable');
      const summaryPayload = summaryData?.data ?? summaryData;
      setSummary(summaryPayload && typeof summaryPayload === 'object' && 'totalCameras' in summaryPayload ? summaryPayload as HealthSummary : null);

      // Fetch camera list
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.branchNodeId) params.append('branchNodeId', filter.branchNodeId);

      const response = await fetch(`/api/audit/health?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Camera health records are unavailable');
      const cameraPayload = data?.data ?? data;
      setCameras(Array.isArray(cameraPayload) ? cameraPayload : []);
    } catch (error) {
      console.error('Failed to fetch health data:', error);
      setSummary(null);
      setCameras([]);
      setError(error instanceof Error ? error.message : 'Camera health data is unavailable');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'degraded':
        return 'bg-orange-500';
      case 'critical':
        return 'bg-red-500';
      case 'offline':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <main className="audit-health-page">
      {/* Header */}
      <PageHero
        eyebrow="Operational assurance"
        title="Camera health audit"
        description="Review current camera availability, recording state, performance signals, and detected health issues."
        icon={Camera}
        actions={<button type="button" onClick={() => void fetchHealthData()} className="btn-secondary"><RefreshCw size={16} /> Refresh audit</button>}
      />

      {error && <div className="page-alert error">{error}. Showing the available audit workspace without live records.</div>}

      {/* Summary Statistics */}
      {summary && (
        <div className="audit-health-summary-grid grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Total</div>
            <div className="text-2xl font-bold text-gray-900">{summary.totalCameras}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Online</div>
            <div className="text-2xl font-bold text-blue-600">{summary.onlineCameras}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Recording</div>
            <div className="text-2xl font-bold text-purple-600">{summary.recordingCameras}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Healthy</div>
            <div className="text-2xl font-bold text-green-600">{summary.healthyCameras}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Warning</div>
            <div className="text-2xl font-bold text-yellow-600">{summary.warningCameras}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Degraded</div>
            <div className="text-2xl font-bold text-orange-600">{summary.degradedCameras}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Critical</div>
            <div className="text-2xl font-bold text-red-600">{summary.criticalCameras}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Offline</div>
            <div className="text-2xl font-bold text-gray-600">{summary.offlineCameras}</div>
          </div>
        </div>
      )}

      {/* Overall Health Score */}
      {summary && (
        <div className="audit-overall-score bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 mb-6 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Overall Health Score</h2>
              <p className="text-sm text-gray-600">Average health score across all cameras</p>
            </div>
            <div className="text-right">
              <div className={`text-5xl font-bold ${getHealthScoreColor(summary.avgHealthScore)}`}>
                {summary.avgHealthScore.toFixed(1)}
              </div>
              <div className="text-sm text-gray-600 mt-1">out of 100</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="audit-health-filters bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="healthy">Healthy</option>
              <option value="warning">Warning</option>
              <option value="degraded">Degraded</option>
              <option value="critical">Critical</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>
      </div>

      {/* Camera Health Grid */}
      <div className="audit-health-camera-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cameras.map((camera) => (
          <div key={camera.id} className="audit-health-camera-card bg-white rounded-lg shadow hover:shadow-md transition-shadow p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(camera.overallStatus)}`}></div>
                  <h3 className="font-semibold text-gray-900">{camera.cameraName}</h3>
                </div>
                <div className="text-sm text-gray-600">{camera.cameraLocation}</div>
                <div className="text-xs text-gray-500">{camera.branchName}</div>
              </div>
              <div className={`text-2xl font-bold ${getHealthScoreColor(camera.healthScore)}`}>
                {camera.healthScore}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium capitalize">{camera.overallStatus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Online:</span>
                <span className={camera.isOnline ? 'text-green-600' : 'text-red-600'}>
                  {camera.isOnline ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Recording:</span>
                <span className={camera.isRecording ? 'text-green-600' : 'text-red-600'}>
                  {camera.isRecording ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">FPS:</span>
                <span className="font-medium">{camera.currentFps?.toFixed(1) || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Bitrate:</span>
                <span className="font-medium">{camera.currentBitrateKbps || 'N/A'} kbps</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Latency:</span>
                <span className="font-medium">{camera.latencyMs || 'N/A'} ms</span>
              </div>
            </div>

            {camera.issuesDetected && camera.issuesDetected.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="text-xs font-medium text-red-600 mb-1">Issues Detected:</div>
                <ul className="text-xs text-red-600 space-y-1">
                  {camera.issuesDetected.map((issue, idx) => (
                    <li key={idx}>• {issue}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 text-xs text-gray-500">
              Last checked: {new Date(camera.checkTimestamp).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {cameras.length === 0 && (
        <div className="audit-health-empty bg-white rounded-lg shadow p-12 text-center">
          <Camera size={34} />
          <strong>No camera health records</strong>
          <span>Run or refresh the audit when control-plane data becomes available.</span>
        </div>
      )}
    </main>
  );
}
