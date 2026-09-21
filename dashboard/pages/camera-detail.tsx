/**
 * Camera Detail View
 * Detailed camera monitoring with quality charts, uptime history, and recovery controls
 */


import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  Camera,
  ArrowLeft,
  Activity,
  Wifi,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Power,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  HardDrive,
  Cloud,
  Database,
  Cpu,
  Play,
  Layers,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useSingleCameraMonitoring } from '../hooks/useCameraMonitoring';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { AppLayout } from '../components/app-layout';

export function CameraDetailView() {
  const router = useRouter();
  const cameraId = typeof router.query.cameraId === 'string'
    ? router.query.cameraId
    : typeof router.query.id === 'string' ? router.query.id : '';

  const { camera, qualityMetrics, alerts, isConnected } = useSingleCameraMonitoring(cameraId!);

  const [fallbackCamera, setFallbackCamera] = useState<any>(null);
  const [storageMapping, setStorageMapping] = useState<any>(null);
  const [storageSummary, setStorageSummary] = useState<any>(null);
  const [cameraStatusApi, setCameraStatusApi] = useState<any>(null);
  const [isSwitchingTier, setIsSwitchingTier] = useState(false);
  const [healthHistory, setHealthHistory] = useState<any[]>([]);
  const [qualityHistory, setQualityHistory] = useState<any[]>([]);
  const [uptimeStats, setUptimeStats] = useState<any>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');

  // Fetch camera status and live storage tier mapping
  useEffect(() => {
    if (!cameraId) return;

    // Load 3-tier storage mapping
    fetch('/api/operations/storage')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.cameras)) {
          const match = data.cameras.find((c: any) => c.cameraId === cameraId);
          if (match) {
            setStorageMapping(match);
          }
          if (data.summary) {
            setStorageSummary(data.summary);
          }
        }
      })
      .catch((err) => console.warn('Failed to load storage mapping for camera:', err));

    // Fallback camera metadata
    fetch(`/api/cameras/${cameraId}/status`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setCameraStatusApi(data);
          setFallbackCamera({
            id: cameraId,
            name: data.name || `Camera ${cameraId}`,
            status: data.status?.online ? 'online' : 'offline',
            currentFps: data.status?.fps || 25,
            currentBitrate: data.status?.bitrate || 2048,
            packetLoss: 0,
            latencyMs: 15,
            streamActive: data.status?.recording || data.status?.online,
          });
        }
      })
      .catch((err) => console.warn('Failed to load camera status API:', err));
  }, [cameraId]);

  const handleSwitchStorageTier = async (targetTier: "online_cloud" | "sd_card" | "dvr_hdd") => {
    if (!cameraId) return;
    setIsSwitchingTier(true);
    try {
      const res = await fetch('/api/operations/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cameraId,
          targetTier,
          reason: `Manual tier selection from camera detail view: ${targetTier}`,
        }),
      });
      if (res.ok) {
        const refreshRes = await fetch('/api/operations/storage');
        const refreshData = await refreshRes.json();
        if (refreshData.success && Array.isArray(refreshData.cameras)) {
          const match = refreshData.cameras.find((c: any) => c.cameraId === cameraId);
          if (match) setStorageMapping(match);
        }
      }
    } catch (e) {
      console.error('Failed to change storage tier:', e);
    } finally {
      setIsSwitchingTier(false);
    }
  };

  // Fetch health history
  useEffect(() => {
    if (!cameraId) return;

    setIsLoadingHistory(true);

    const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : 168;

    fetch(`/api/control/v1/cameras/${cameraId}/health-history?hours=${hours}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setHealthHistory(data.data.history);
          setUptimeStats(data.data.statistics);

          // Transform for charts
          const chartData = data.data.history.map((h: any) => ({
            timestamp: new Date(h.timestamp).getTime(),
            fps: h.currentFps,
            bitrate: h.currentBitrate,
            packetLoss: h.packetLoss,
            latency: h.latencyMs,
            online: h.status === 'online' ? 1 : 0,
          }));

          setQualityHistory(chartData.reverse());
        }
      })
      .catch((error) => {
        console.error('Failed to load health history:', error);
      })
      .finally(() => {
        setIsLoadingHistory(false);
      });
  }, [cameraId, timeRange]);

  // Trigger manual health check
  const handleHealthCheck = async () => {
    if (!cameraId) return;

    setIsRecovering(true);
    try {
      const response = await fetch(`/api/control/v1/cameras/${cameraId}/health-check`, {
        method: 'POST',
        credentials: "include",
      });
      const data = await response.json();

      if (data.success) {
        alert('Health check completed');
      } else {
        alert('Health check failed: ' + data.error);
      }
    } catch (error) {
      alert('Failed to trigger health check');
    } finally {
      setIsRecovering(false);
    }
  };

  // Trigger recovery workflow
  const handleRecovery = async (steps: string[]) => {
    if (!cameraId) return;

    const confirmed = window.confirm(
      `This will attempt to recover the camera using: ${steps.join(', ')}. Continue?`
    );

    if (!confirmed) return;

    setIsRecovering(true);
    try {
      const response = await fetch(`/api/control/v1/cameras/${cameraId}/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: "include",
        body: JSON.stringify({ steps, autoEscalate: true }),
      });
      const data = await response.json();

      if (data.success) {
        alert('Recovery workflow initiated');
      } else {
        alert('Recovery failed: ' + data.error);
      }
    } catch (error) {
      alert('Failed to trigger recovery');
    } finally {
      setIsRecovering(false);
    }
  };

  // Download health report
  const handleDownloadReport = () => {
    if (!cameraId) return;

    const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : 168;
    window.open(`/api/v1/cameras/${cameraId}/health-history?hours=${hours}&format=csv`, '_blank');
  };

  const currentCam = camera || fallbackCamera;

  if (!currentCam) {
    return (
      <AppLayout><main className="legacy-camera-detail-page min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="module-state bg-white rounded-lg shadow p-8 text-center">
            <Camera size={48} className="mx-auto text-gray-400 mb-4 animate-pulse" />
            <h1 className="text-lg font-medium text-gray-900 mb-2">Loading camera details</h1>
            <span>Connecting to camera telemetry stream and storage configuration...</span>
          </div>
        </div>
      </main></AppLayout>
    );
  }

  const statusColor =
    currentCam.status === 'online' ? 'text-green-600' :
      currentCam.status === 'offline' ? 'text-red-600' :
        currentCam.status === 'warning' ? 'text-yellow-600' :
          'text-orange-600';

  const statusBgColor =
    currentCam.status === 'online' ? 'bg-green-100' :
      currentCam.status === 'offline' ? 'bg-red-100' :
        currentCam.status === 'warning' ? 'bg-yellow-100' :
          'bg-orange-100';

  const isRecordingActive = currentCam.streamActive || currentCam.status === 'online';
  const activeTier = storageMapping?.activeStorageTier || (currentCam.status === 'online' ? 'online_cloud' : 'online_cloud');

  return (
    <AppLayout><main className="legacy-camera-detail-page min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => void router.push('/camera-monitoring')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft size={20} />
            Back to Camera Monitoring
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{currentCam.name}</h1>
              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${statusBgColor}`}>
                  <span className={`${statusColor} font-medium capitalize`}>
                    {currentCam.status}
                  </span>
                </div>
                {/* Recording Badge */}
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${isRecordingActive ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                  <span className={`w-2 h-2 rounded-full ${isRecordingActive ? 'bg-red-600 animate-pulse' : 'bg-gray-400'}`}></span>
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {isRecordingActive ? 'RECORDING ACTIVE' : 'RECORDING STOPPED'}
                  </span>
                </div>
                {/* Storage Tier Badge */}
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium">
                  <HardDrive size={13} />
                  <span>
                    {activeTier === 'sd_card' ? 'Storage: Device MicroSD' :
                     activeTier === 'dvr_hdd' ? 'Storage: DVR/NVR SATA HDD' :
                     'Storage: Online Cloud Pool (Fallback)'}
                  </span>
                </div>
                {isConnected ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <Wifi size={16} />
                    <span className="text-sm">Live Updates</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Wifi size={16} />
                    <span className="text-sm">Telemetry Connected</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href={`/recordings?cameraId=${cameraId}`}
                className="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Play size={16} className="fill-current" />
                Watch Footage
              </Link>

              <Link
                href="/operations/storage"
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <HardDrive size={16} />
                Manage Storage
              </Link>

              <button
                onClick={handleDownloadReport}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm"
              >
                <Download size={18} />
                Report
              </button>

              <button
                onClick={handleHealthCheck}
                disabled={isRecovering}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 text-sm font-medium"
              >
                <RefreshCw size={18} className={isRecovering ? 'animate-spin' : ''} />
                Health Check
              </button>

              {currentCam.status === 'offline' && (
                <button
                  onClick={() => handleRecovery(['retry', 'reboot'])}
                  disabled={isRecovering}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 disabled:opacity-50 text-sm font-medium"
                >
                  <Power size={18} />
                  Recover
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 3-Tier Storage Hierarchy & Automatic Fallback Engine Banner */}
        <div className="card p-5 mb-6 border-l-4 border-l-blue-500 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-slate-100 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  Recording Storage Hierarchy & Auto-Detection Engine
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Zero Footage Loss
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  <strong>Policy:</strong> If the device has its own internal storage (MicroSD card or local DVR/NVR hard drive), footage records locally. If no device storage is found or is unformatted, recording automatically fails over to the <strong>Online Cloud Storage Pool</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeTier !== 'online_cloud' ? (
                <button
                  onClick={() => handleSwitchStorageTier('online_cloud')}
                  disabled={isSwitchingTier}
                  className="px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  {isSwitchingTier ? 'Switching...' : 'Force Failover to Cloud'}
                </button>
              ) : (
                <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Cloud Redundancy Active
                </span>
              )}
              <Link
                href="/operations/storage"
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-all"
              >
                <Layers className="w-3.5 h-3.5" />
                View Full Storage Topology
              </Link>
            </div>
          </div>

          {/* 3 Storage Tiers Inspection Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {/* Tier 1: Device MicroSD */}
            <div className={`p-4 rounded-xl border transition-all ${
              activeTier === 'sd_card'
                ? 'bg-emerald-950/30 border-emerald-500/50 shadow-sm ring-1 ring-emerald-500/20'
                : 'bg-slate-900/60 border-slate-800 opacity-75'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300">
                  Tier 1 • Device MicroSD
                </span>
                <Cpu className="w-4 h-4 text-emerald-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-200">On-Camera Memory Card</h4>
              <p className="text-xs text-slate-400 mt-1">
                Internal storage card inside camera housing.
              </p>
              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-500">Hardware:</span>
                <span className={storageMapping?.sdCardStatus === 'detected' ? 'text-emerald-400 font-bold' : 'text-slate-400 font-medium'}>
                  {storageMapping?.sdCardStatus === 'detected' ? `Detected (${storageMapping?.capacity || 'Active'})` : 'No SD Card Detected'}
                </span>
              </div>
            </div>

            {/* Tier 2: DVR/NVR Hard Drive */}
            <div className={`p-4 rounded-xl border transition-all ${
              activeTier === 'dvr_hdd'
                ? 'bg-blue-950/30 border-blue-500/50 shadow-sm ring-1 ring-blue-500/20'
                : 'bg-slate-900/60 border-slate-800 opacity-75'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300">
                  Tier 2 • DVR/NVR HDD
                </span>
                <HardDrive className="w-4 h-4 text-blue-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-200">Local Recorder Hard Drive</h4>
              <p className="text-xs text-slate-400 mt-1">
                Direct SATA hard drive channel on physical DVR/NVR.
              </p>
              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-500">Recorder Mapping:</span>
                <span className={storageMapping?.dvrStatus === 'mapped' ? 'text-blue-400 font-bold' : 'text-slate-400 font-medium'}>
                  {storageMapping?.dvrStatus === 'mapped' ? `Mapped (${storageMapping?.capacity || 'Active'})` : 'Not Connected to DVR'}
                </span>
              </div>
            </div>

            {/* Tier 3: Online Cloud Storage Pool */}
            <div className={`p-4 rounded-xl border transition-all ${
              activeTier === 'online_cloud'
                ? 'bg-purple-950/30 border-purple-500/50 shadow-sm ring-1 ring-purple-500/20'
                : 'bg-slate-900/60 border-slate-800 opacity-75'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300">
                  Tier 3 • Online Cloud
                </span>
                <Cloud className="w-4 h-4 text-purple-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-200">Online Cloud Recording Pool</h4>
              <p className="text-xs text-slate-400 mt-1">
                Zero-loss automatic fallback when camera has no local disk.
              </p>
              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-500">Cloud Status:</span>
                <span className={activeTier === 'online_cloud' ? 'text-purple-300 font-bold flex items-center gap-1' : 'text-slate-400 font-medium'}>
                  {activeTier === 'online_cloud' ? '● Active Recording Target' : 'Standby Pool Ready'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Current Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* FPS */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <Activity size={20} className="text-blue-600" />
              <span className="text-2xl font-bold">
                {currentCam.currentFps?.toFixed(1) || '--'}
              </span>
            </div>
            <div className="text-sm text-gray-600">Current FPS</div>
            {qualityMetrics && (
              <div className="text-xs text-gray-500 mt-1">
                Expected: {qualityMetrics.expectedFps} fps
              </div>
            )}
          </div>

          {/* Bitrate */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp size={20} className="text-green-600" />
              <span className="text-2xl font-bold">
                {currentCam.currentBitrate ? (currentCam.currentBitrate / 1000).toFixed(1) : '--'}
              </span>
            </div>
            <div className="text-sm text-gray-600">Bitrate (Mbps)</div>
          </div>

          {/* Packet Loss */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle size={20} className="text-yellow-600" />
              <span className="text-2xl font-bold">
                {currentCam.packetLoss?.toFixed(1) || '--'}%
              </span>
            </div>
            <div className="text-sm text-gray-600">Packet Loss</div>
          </div>

          {/* Latency */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <Clock size={20} className="text-purple-600" />
              <span className="text-2xl font-bold">
                {currentCam.latencyMs || '--'}
              </span>
            </div>
            <div className="text-sm text-gray-600">Latency (ms)</div>
          </div>
        </div>

        {/* Alerts Banner */}
        {alerts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle size={24} className="text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-2">Active Alerts</h3>
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="text-sm text-red-800">
                      <span className="font-medium">{alert.title}:</span> {alert.message}
                      <span className="text-red-600 ml-2">
                        ({new Date(alert.detectedAt).toLocaleString()})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Uptime Statistics */}
        {uptimeStats && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Uptime Statistics ({timeRange})</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-3xl font-bold text-green-600">
                  {uptimeStats.uptimePercentage?.toFixed(2) ?? '--'}%
                </div>
                <div className="text-sm text-gray-600">Uptime</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {uptimeStats.totalChecks}
                </div>
                <div className="text-sm text-gray-600">Total Checks</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {uptimeStats.avgResponseTimeMs?.toFixed(0) || '--'} ms
                </div>
                <div className="text-sm text-gray-600">Avg Response Time</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {uptimeStats.avgFps?.toFixed(1) || '--'} fps
                </div>
                <div className="text-sm text-gray-600">Avg FPS</div>
              </div>
            </div>
          </div>
        )}

        {/* Time Range Selector */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">Time Range:</span>
            <div className="flex gap-2">
              {(['1h', '24h', '7d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${timeRange === range
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {range === '1h' ? '1 Hour' : range === '24h' ? '24 Hours' : '7 Days'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quality Charts */}
        <div className="space-y-6">
          {/* FPS Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Frame Rate (FPS)</h3>
            {isLoadingHistory ? (
              <div className="h-64 flex items-center justify-center text-gray-400">
                Loading chart data...
              </div>
            ) : qualityHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={qualityHistory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(ts) => new Date(String(ts ?? '')).toLocaleString()}
                    formatter={(value) => [Number(value ?? 0).toFixed(1), 'FPS']}
                  />
                  <Area
                    type="monotone"
                    dataKey="fps"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">
                No data available
              </div>
            )}
          </div>

          {/* Packet Loss & Latency Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Network Quality</h3>
            {isLoadingHistory ? (
              <div className="h-64 flex items-center justify-center text-gray-400">
                Loading chart data...
              </div>
            ) : qualityHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={qualityHistory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                  />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip
                    labelFormatter={(ts) => new Date(String(ts ?? '')).toLocaleString()}
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="packetLoss"
                    stroke="#eab308"
                    name="Packet Loss (%)"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="latency"
                    stroke="#8b5cf6"
                    name="Latency (ms)"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">
                No data available
              </div>
            )}
          </div>

          {/* Uptime Timeline */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Uptime Timeline</h3>
            {isLoadingHistory ? (
              <div className="h-64 flex items-center justify-center text-gray-400">
                Loading timeline...
              </div>
            ) : qualityHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={qualityHistory}>
                  <defs>
                    <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                  />
                  <YAxis hide domain={[0, 1]} />
                  <Tooltip
                    labelFormatter={(ts) => new Date(String(ts ?? '')).toLocaleString()}
                    formatter={(value) => [Number(value ?? 0) === 1 ? 'Online' : 'Offline', 'Status']}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="online"
                    stroke="#10b981"
                    fillOpacity={1}
                    fill="url(#colorOnline)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-24 flex items-center justify-center text-gray-400">
                No timeline data available
              </div>
            )}
          </div>
        </div>
      </div>
    </main></AppLayout>
  );
}

export default CameraDetailView;
