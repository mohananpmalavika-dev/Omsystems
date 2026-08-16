/**
 * Camera Detail View
 * Detailed camera monitoring with quality charts, uptime history, and recovery controls
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
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
  
  const [healthHistory, setHealthHistory] = useState<any[]>([]);
  const [qualityHistory, setQualityHistory] = useState<any[]>([]);
  const [uptimeStats, setUptimeStats] = useState<any>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');

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

  if (!camera) {
    return (
      <AppLayout><main className="legacy-camera-detail-page min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="module-state bg-white rounded-lg shadow p-8 text-center">
            <Camera size={48} className="mx-auto text-gray-400 mb-4" />
            <h1 className="text-lg font-medium text-gray-900 mb-2">Loading camera details</h1>
            <span>Waiting for the selected camera to report its current health state.</span>
          </div>
        </div>
      </main></AppLayout>
    );
  }

  const statusColor =
    camera.status === 'online' ? 'text-green-600' :
    camera.status === 'offline' ? 'text-red-600' :
    camera.status === 'warning' ? 'text-yellow-600' :
    'text-orange-600';

  const statusBgColor =
    camera.status === 'online' ? 'bg-green-100' :
    camera.status === 'offline' ? 'bg-red-100' :
    camera.status === 'warning' ? 'bg-yellow-100' :
    'bg-orange-100';

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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{camera.name}</h1>
              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${statusBgColor}`}>
                  <span className={`${statusColor} font-medium capitalize`}>
                    {camera.status}
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
                    <span className="text-sm">Disconnected</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadReport}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Download size={18} />
                Download Report
              </button>
              
              <button
                onClick={handleHealthCheck}
                disabled={isRecovering}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw size={18} className={isRecovering ? 'animate-spin' : ''} />
                Health Check
              </button>
              
              {camera.status === 'offline' && (
                <button
                  onClick={() => handleRecovery(['retry', 'reboot'])}
                  disabled={isRecovering}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Power size={18} />
                  Recover
                </button>
              )}
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
                {camera.currentFps?.toFixed(1) || '--'}
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
                {camera.currentBitrate ? (camera.currentBitrate / 1000).toFixed(1) : '--'}
              </span>
            </div>
            <div className="text-sm text-gray-600">Bitrate (Mbps)</div>
          </div>

          {/* Packet Loss */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle size={20} className="text-yellow-600" />
              <span className="text-2xl font-bold">
                {camera.packetLoss?.toFixed(1) || '--'}%
              </span>
            </div>
            <div className="text-sm text-gray-600">Packet Loss</div>
          </div>

          {/* Latency */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <Clock size={20} className="text-purple-600" />
              <span className="text-2xl font-bold">
                {camera.latencyMs || '--'}
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
                  {uptimeStats.uptimePercentage.toFixed(2)}%
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    timeRange === range
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
