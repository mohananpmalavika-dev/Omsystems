'use client';

import { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { PageHero } from '@/components/page-hero';
import { useSearchParams } from 'next/navigation';

interface HealthSummary {
  totalCameras: number;
  assessedCameras: number;
  unassessedCameras: number;
  onlineCameras: number;
  recordingCameras: number;
  healthyCameras: number;
  warningCameras: number;
  degradedCameras: number;
  criticalCameras: number;
  offlineCameras: number;
  avgHealthScore: number | null;
}

interface CameraHealth {
  id: string;
  cameraId: string;
  cameraName: string;
  cameraLocation: string;
  branchName: string;
  checkTimestamp: string;
  isOnline: boolean;
  isRecording: boolean | null;
  overallStatus: string;
  healthScore: number | string | null;
  issuesDetected: string[];
  currentFps: number | string | null;
  currentBitrateKbps: number | string | null;
  latencyMs: number | string | null;
}

export default function CameraHealthPage() {
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [cameras, setCameras] = useState<CameraHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runningCameraId, setRunningCameraId] = useState<string | null>(null);
  const [filter, setFilter] = useState({
    status: '',
    branchNodeId: searchParams?.get('branchNodeId') ?? '',
  });
  const requestSequence = useRef(0);

  useEffect(() => {
    fetchHealthData();
  }, [filter]);

  const fetchHealthData = async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      // Fetch summary
      const summaryParams = new URLSearchParams({ summary: 'true' });
      if (filter.branchNodeId) summaryParams.append('branchNodeId', filter.branchNodeId);
      
      const summaryResponse = await fetch(`/api/audit/health?${summaryParams}`);
      const summaryData: unknown = await summaryResponse.json().catch(() => null);
      if (!summaryResponse.ok) throw new Error(apiErrorMessage(summaryData, 'Health summary is unavailable'));
      const summaryPayload = isRecord(summaryData) ? summaryData.data ?? summaryData : summaryData;
      const normalizedSummary = normalizeSummary(summaryPayload);
      if (!normalizedSummary) throw new Error('The health service returned an invalid summary');

      // Fetch camera list
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.branchNodeId) params.append('branchNodeId', filter.branchNodeId);

      const response = await fetch(`/api/audit/health?${params}`);
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(data, 'Camera health records are unavailable'));
      const cameraPayload = isRecord(data) ? data.data ?? data : data;
      if (requestId !== requestSequence.current) return;
      setSummary(normalizedSummary);
      setCameras(Array.isArray(cameraPayload) ? cameraPayload.map(normalizeCameraHealth).filter((camera): camera is CameraHealth => camera !== null) : []);
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      console.error('Failed to fetch health data:', error);
      setSummary(null);
      setCameras([]);
      setError(error instanceof Error ? error.message : 'Camera health data is unavailable');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  };

  const requestHealthCheck = async (cameraId: string) => {
    setRunningCameraId(cameraId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/audit/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraId }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(payload, 'Unable to request a camera health check'));
      setNotice(isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'Camera health check requested. Refresh after the Branch Gateway reports its result.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to request a camera health check');
    } finally {
      setRunningCameraId(null);
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

  const getHealthScoreColor = (score: number | string | null) => {
    const normalized = score === null ? Number.NaN : Number(score);
    if (!Number.isFinite(normalized)) return 'text-gray-500';
    if (normalized >= 90) return 'text-green-600';
    if (normalized >= 70) return 'text-yellow-600';
    if (normalized >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const formatMetric = (value: number | string | null, decimals = 0) => {
    if (value === null || value === '') return 'N/A';
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized.toFixed(decimals) : 'N/A';
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

      {error && <div className="page-alert error" role="alert">{error}</div>}
      {notice && <div className="page-alert success" role="status">{notice}</div>}

      {/* Summary Statistics */}
      {summary && (
        <div className="audit-health-summary-grid grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Total</div>
            <div className="text-2xl font-bold text-gray-900">{summary.totalCameras}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Assessed</div>
            <div className="text-2xl font-bold text-blue-700">{summary.assessedCameras}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Unassessed</div>
            <div className="text-2xl font-bold text-gray-600">{summary.unassessedCameras}</div>
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
              <p className="text-sm text-gray-600">Average of edge probes that reported an explicit score</p>
            </div>
            <div className="text-right">
              <div className={`text-5xl font-bold ${getHealthScoreColor(summary.avgHealthScore)}`}>
                {summary.avgHealthScore === null ? 'N/A' : summary.avgHealthScore.toFixed(1)}
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
                {formatMetric(camera.healthScore)}
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
                <span className={camera.isRecording === true ? 'text-green-600' : camera.isRecording === false ? 'text-red-600' : 'text-gray-500'}>
                  {camera.isRecording === true ? 'Yes' : camera.isRecording === false ? 'No' : 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">FPS:</span>
                <span className="font-medium">{formatMetric(camera.currentFps, 1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Bitrate:</span>
                <span className="font-medium">{formatMetric(camera.currentBitrateKbps)}{camera.currentBitrateKbps === null ? '' : ' kbps'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Latency:</span>
                <span className="font-medium">{formatMetric(camera.latencyMs)}{camera.latencyMs === null ? '' : ' ms'}</span>
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

            <div className="mt-3 pt-3 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => void requestHealthCheck(camera.cameraId)}
                disabled={runningCameraId === camera.cameraId}
                className="btn-secondary text-sm"
              >
                {runningCameraId === camera.cameraId ? 'Requesting…' : 'Run health check'}
              </button>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              Last checked: {formatTimestamp(camera.checkTimestamp)}
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

function normalizeSummary(value: unknown): HealthSummary | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return {
    totalCameras: nonNegativeNumber(row.totalCameras),
    assessedCameras: nonNegativeNumber(row.assessedCameras),
    unassessedCameras: nonNegativeNumber(row.unassessedCameras),
    onlineCameras: nonNegativeNumber(row.onlineCameras),
    recordingCameras: nonNegativeNumber(row.recordingCameras),
    healthyCameras: nonNegativeNumber(row.healthyCameras),
    warningCameras: nonNegativeNumber(row.warningCameras),
    degradedCameras: nonNegativeNumber(row.degradedCameras),
    criticalCameras: nonNegativeNumber(row.criticalCameras),
    offlineCameras: nonNegativeNumber(row.offlineCameras),
    avgHealthScore: finiteNumberOrNull(row.avgHealthScore),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function apiErrorMessage(value: unknown, fallback: string) {
  if (!isRecord(value)) return fallback;
  return typeof value.message === 'string' ? value.message : typeof value.error === 'string' ? value.error : fallback;
}

function normalizeCameraHealth(value: unknown): CameraHealth | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.cameraId !== 'string' || typeof row.checkTimestamp !== 'string') return null;
  const status = typeof row.overallStatus === 'string' ? row.overallStatus : 'unknown';
  return {
    id: row.id,
    cameraId: row.cameraId,
    cameraName: typeof row.cameraName === 'string' ? row.cameraName : 'Unnamed camera',
    cameraLocation: typeof row.cameraLocation === 'string' ? row.cameraLocation : 'Location unavailable',
    branchName: typeof row.branchName === 'string' ? row.branchName : 'Branch unavailable',
    checkTimestamp: row.checkTimestamp,
    isOnline: row.isOnline === true,
    isRecording: typeof row.isRecording === 'boolean' ? row.isRecording : null,
    overallStatus: status,
    healthScore: finiteNumberOrNull(row.healthScore),
    issuesDetected: Array.isArray(row.issuesDetected) ? row.issuesDetected.filter((issue): issue is string => typeof issue === 'string') : [],
    currentFps: finiteNumberOrNull(row.currentFps),
    currentBitrateKbps: finiteNumberOrNull(row.currentBitrateKbps),
    latencyMs: finiteNumberOrNull(row.latencyMs),
  };
}

function finiteNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value: unknown) {
  return Math.max(0, finiteNumberOrNull(value) ?? 0);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}
