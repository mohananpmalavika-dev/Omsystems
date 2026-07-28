"use client";

import { useCallback, useEffect, useState } from "react";
import { 
  Activity, 
  AlertTriangle, 
  Camera, 
  HardDrive, 
  Server, 
  Wifi, 
  Battery, 
  Box,
  RefreshCw,
  Download
} from "lucide-react";
import { 
  HealthSummary, 
  OperationalAlert,
  getHealthStatusIcon,
  getTimeAgo
} from "@/lib/types/operational-health";
import { BranchHealthMosaic, HddFleetWidget, InternetFleetWidget, RecorderFleetWidget, RetentionFleetWidget } from "@/components/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";

export default function OperationalHealthDashboard() {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [criticalAlerts, setCriticalAlerts] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealthData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch health summary
      const summaryRes = await fetch('/api/control/v1/operations/health/summary');
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data.data);
      }
      
      // Fetch critical alerts
      const alertsRes = await fetch('/api/control/v1/operations/alerts?severity=critical&status=active&limit=10');
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setCriticalAlerts(data.data.alerts || []);
      }
      
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch health data:', error);
    } finally {
      setLoading(false);
    }
  }, []);
  useOperationalHealthStream(useCallback(() => { void fetchHealthData(); }, [fetchHealthData]));

  useEffect(() => {
    fetchHealthData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchHealthData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchHealthData]);

  const getBranchHealthStatus = () => {
    if (!summary) return 'unknown';
    if (summary.criticalBranches > 0) return 'critical';
    if (summary.warningBranches > 0) return 'warning';
    return 'healthy';
  };

  const getCameraHealthStatus = () => {
    if (!summary) return 'unknown';
    const offlinePercent = (summary.camerasOffline / summary.totalCameras) * 100;
    if (offlinePercent > 10) return 'critical';
    if (offlinePercent > 5) return 'warning';
    return 'healthy';
  };

  const getRecordingHealthStatus = () => {
    if (!summary) return 'unknown';
    const failurePercent = (summary.recordingFailures / summary.totalCameras) * 100;
    if (failurePercent > 10) return 'critical';
    if (failurePercent > 5) return 'warning';
    return 'healthy';
  };

  if (loading && !summary) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="animate-spin mx-auto mb-4 text-gray-400" size={32} />
            <p className="text-gray-500">Loading operational health data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header with actions */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-1">System Status</h2>
          <p className="text-xs text-gray-400">
            Last updated: {getTimeAgo(lastRefresh.toISOString())}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchHealthData}
            disabled={loading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button className="btn-secondary flex items-center gap-2">
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Branches</span>
            <Box size={18} className="text-gray-400" />
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold">{summary?.totalBranches || 0}</span>
            <span className="text-sm text-gray-500">branches</span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span>🟢</span> {summary?.healthyBranches || 0}
            </span>
            <span className="flex items-center gap-1">
              <span>🟡</span> {summary?.warningBranches || 0}
            </span>
            <span className="flex items-center gap-1">
              <span>🔴</span> {summary?.criticalBranches || 0}
            </span>
            <span className="flex items-center gap-1">
              <span>⚫</span> {summary?.unknownBranches || 0}
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Cameras</span>
            <Camera size={18} className="text-gray-400" />
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold">{summary?.totalCameras || 0}</span>
            <span className="text-sm text-gray-500">total</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-600">
              {summary?.camerasOnline || 0} online
            </span>
            <span className="text-red-600">
              {summary?.camerasOffline || 0} offline
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Recording</span>
            <Activity size={18} className="text-gray-400" />
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold">{summary?.camerasRecording || 0}</span>
            <span className="text-sm text-gray-500">active</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-red-600">
              {summary?.recordingFailures || 0} failures
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Critical Alerts</span>
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold text-red-600">
              {summary?.activeCriticalAlerts || 0}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            Require immediate attention
          </div>
        </div>
        <div className="stat-card hidden lg:block">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Edge Agents</span>
            <Server size={18} className="text-gray-400" />
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold">{summary?.totalEdgeAgents || 0}</span>
            <span className="text-sm text-gray-500">total</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-green-600">{summary?.edgeAgentsOnline || 0} online</span>
            <span className="text-red-600">{summary?.edgeAgentsOffline || 0} offline</span>
            <span className="text-amber-600">{summary?.edgeAgentsWarning || 0} warning</span>
          </div>
        </div>
      </div>

      <BranchHealthMosaic />

      {/* Critical Alerts Section */}
      {criticalAlerts.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle size={20} className="text-red-500" />
              Critical Alerts
            </h3>
            <a href="/operations/alerts" className="text-sm text-blue-600 hover:text-blue-700">
              View all →
            </a>
          </div>
          <div className="space-y-3">
            {criticalAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg"
              >
                <AlertTriangle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-medium text-gray-900">{alert.title}</h4>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {getTimeAgo(alert.detectedAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{alert.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {alert.branchName && (
                      <span className="flex items-center gap-1">
                        <Box size={12} />
                        {alert.branchName}
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded">
                      {alert.componentType}
                    </span>
                  </div>
                </div>
                <button className="btn-sm btn-primary whitespace-nowrap">
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Component Health Grid */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Camera Health */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Camera size={18} />
              Camera Health
            </h3>
            <span className="text-2xl">
              {getHealthStatusIcon(getCameraHealthStatus())}
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total cameras</span>
              <span className="font-medium">{summary?.totalCameras || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Online</span>
              <span className="font-medium text-green-600">{summary?.camerasOnline || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Offline</span>
              <span className="font-medium text-red-600">{summary?.camerasOffline || 0}</span>
            </div>
          </div>
          <a href="/operations/cameras" className="btn-secondary w-full mt-4">
            View Details
          </a>
        </div>

        {/* Recording Health */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Activity size={18} />
              Recording Health
            </h3>
            <span className="text-2xl">
              {getHealthStatusIcon(getRecordingHealthStatus())}
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Recording</span>
              <span className="font-medium text-green-600">{summary?.camerasRecording || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Failures</span>
              <span className="font-medium text-red-600">{summary?.recordingFailures || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Success rate</span>
              <span className="font-medium">
                {summary?.totalCameras ? 
                  ((summary.camerasRecording / summary.totalCameras) * 100).toFixed(1) 
                  : 0}%
              </span>
            </div>
          </div>
          <a href="/operations/recording" className="btn-secondary w-full mt-4">
            View Details
          </a>
        </div>

        {/* Edge Agents */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Server size={18} />
              Edge Agents
            </h3>
            <span className="text-2xl">
              {summary?.edgeAgentsOffline === 0 ? '🟢' : '🔴'}
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total agents</span>
              <span className="font-medium">{summary?.totalEdgeAgents || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Offline</span>
              <span className="font-medium text-red-600">{summary?.edgeAgentsOffline || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Online</span>
              <span className="font-medium text-green-600">
                {summary?.edgeAgentsOnline || 0}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Warning</span>
              <span className="font-medium text-amber-600">{summary?.edgeAgentsWarning || 0}</span>
            </div>
          </div>
          <a href="/operations/edge-agents" className="btn-secondary w-full mt-4">
            View Details
          </a>
        </div>
      </div>

      <RetentionFleetWidget />
      <RecorderFleetWidget />
      <InternetFleetWidget />
      <HddFleetWidget />

      {/* Additional Component Cards */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Storage Health */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <HardDrive size={18} />
              Storage Health
            </h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Monitor storage capacity, retention, and disk health
          </p>
          <a href="/operations/storage" className="btn-secondary w-full">
            View Details
          </a>
        </div>

        {/* Network Health */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Wifi size={18} />
              Network Health
            </h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Monitor latency, packet loss, and connectivity
          </p>
          <a href="/operations/network" className="btn-secondary w-full">
            View Details
          </a>
        </div>

        {/* UPS Health */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Battery size={18} />
              UPS Health
            </h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Monitor power status, battery, and runtime
          </p>
          <a href="/operations/ups" className="btn-secondary w-full">
            View Details
          </a>
        </div>
      </div>
    </div>
  );
}
