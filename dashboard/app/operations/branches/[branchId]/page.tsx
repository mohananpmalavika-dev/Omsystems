"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Activity, 
  HardDrive, 
  Wifi, 
  Battery, 
  Server,
  RefreshCw,
  AlertTriangle,
  Download
} from "lucide-react";
import { 
  BranchHealthDetail,
  CameraHealth,
  OperationalAlert,
  getTimeAgo
} from "@/lib/types/operational-health";
import { 
  fetchBranchHealthDetail,
  fetchAllCamerasHealth,
  fetchOperationalAlerts
} from "@/lib/api/operational-health";
import { cameraInventoryApi } from "@/lib/api-client";
import { 
  HealthStatusBadge, 
  HealthScoreRing
} from "@/components/operational-health";
import { BranchCameraWall } from "@/components/operational-health/branch-camera-wall";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";

export default function BranchHealthDetailPage() {
  const params = useParams();
  const router = useRouter();
  const branchId = typeof params?.branchId === 'string' ? params.branchId : '';

  const [branch, setBranch] = useState<BranchHealthDetail | null>(null);
  const [cameras, setCameras] = useState<CameraHealth[]>([]);
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingPackage, setDownloadingPackage] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [branchData, camerasData, alertsData] = await Promise.all([
        fetchBranchHealthDetail(branchId),
        fetchAllCamerasHealth({ branchId }),
        fetchOperationalAlerts({ branchId, status: 'active', limit: 20 })
      ]);
      
      setBranch(branchData);
      setCameras(camerasData.cameras || []);
      setAlerts(alertsData.alerts || []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch branch health:', error);
    } finally {
      setLoading(false);
    }
  }, [branchId]);
  useOperationalHealthStream(useCallback((event) => {
    if (!event.branchId || event.branchId === branchId) void fetchData();
  }, [branchId, fetchData]));

  useEffect(() => {
    void fetchData();
    const timer = setInterval(fetchData, 30_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  if (loading && !branch) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="animate-spin mx-auto mb-4 text-gray-400" size={32} />
            <p className="text-gray-500">Loading branch health data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="page-container">
        <div className="text-center py-12">
          <p className="text-gray-500">Branch not found</p>
          <button onClick={() => router.push('/operations')} className="btn-primary mt-4">
            Back to Operations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/operations')}
            className="btn-secondary p-2"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">{branch.name}</h1>
              <HealthStatusBadge status={branch.healthStatus} showLabel />
            </div>
            <p className="text-sm text-gray-500">
              {branch.code} • {branch.region} • Last updated: {getTimeAgo(branch.lastHealthCheck)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button className="btn-secondary flex items-center gap-2">
            <Download size={16} />
            Export Report
          </button>
        </div>
      </div>

      {/* Overall Health Score */}
      <div className="card mb-6">
        <div className="flex items-center gap-6">
          <HealthScoreRing score={branch.healthScore ?? 0} size={120} strokeWidth={10} />
          
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-4">Branch Health Score</h2>
            <p className="text-sm text-gray-600 mb-4">
              Overall health calculated from camera availability (25%), recording quality (30%), 
              storage capacity (15%), network performance (10%), power backup (10%), and edge agent status (10%).
            </p>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Camera Health</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${branch.components.camera.score}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{branch.components.camera.score}%</span>
                </div>
              </div>
              
              <div>
                <p className="text-xs text-gray-500 mb-1">Recording Health</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${branch.components.recording.score}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{branch.components.recording.score}%</span>
                </div>
              </div>
              
              <div>
                <p className="text-xs text-gray-500 mb-1">Storage Health</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${branch.components.storage.score}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{branch.components.storage.score}%</span>
                </div>
              </div>
              
              <div>
                <p className="text-xs text-gray-500 mb-1">Network Health</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${branch.components.network.score}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{branch.components.network.score}%</span>
                </div>
              </div>
              
              <div>
                <p className="text-xs text-gray-500 mb-1">UPS Health</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${branch.components.ups.score}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{branch.components.ups.score}%</span>
                </div>
              </div>
              
              <div>
                <p className="text-xs text-gray-500 mb-1">Edge Agent Health</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${branch.components.edgeAgent.score}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{branch.components.edgeAgent.score}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-600" />
              Active Alerts ({alerts.length})
            </h3>
          </div>
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border ${
                  alert.severity === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : alert.severity === 'warning'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="font-medium text-gray-900">{alert.title}</h4>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {getTimeAgo(alert.detectedAt)}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{alert.description}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    alert.severity === 'critical'
                      ? 'bg-red-100 text-red-700'
                      : alert.severity === 'warning'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {alert.severity}
                  </span>
                  <span className="text-xs text-gray-500">{alert.componentType}</span>
                </div>
              </div>
            ))}
          </div>
          {alerts.length > 5 && (
            <button className="btn-secondary w-full mt-3">
              View all {alerts.length} alerts →
            </button>
          )}
        </div>
      )}

      {/* Edge Agent Status */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Server size={20} />
          Edge Agent Status
        </h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600 mb-1">Status</p>
            <p className={`text-lg font-semibold ${
              branch.edgeAgent.status === 'online' ? 'text-green-600' : 'text-red-600'
            }`}>
              {branch.edgeAgent.status}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Version</p>
            <p className="text-lg font-semibold">{branch.edgeAgent.version}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">CPU Usage</p>
            <p className="text-lg font-semibold">{branch.edgeAgent.cpuUsage === null ? '--' : `${branch.edgeAgent.cpuUsage.toFixed(1)}%`}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Memory Usage</p>
            <p className="text-lg font-semibold">{branch.edgeAgent.memoryUsage === null ? '--' : `${branch.edgeAgent.memoryUsage.toFixed(1)}%`}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Disk Usage</p>
            <p className="text-lg font-semibold">{branch.edgeAgent.diskUsage === null ? '--' : `${branch.edgeAgent.diskUsage.toFixed(1)}%`}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Last Heartbeat</p>
            <p className="text-sm font-medium">{getTimeAgo(branch.edgeAgent.lastHeartbeat)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Uptime</p>
            <p className="text-sm font-medium">
              {branch.edgeAgent.uptimeSeconds === null ? '--' : `${Math.floor(branch.edgeAgent.uptimeSeconds / 86400)}d ${Math.floor((branch.edgeAgent.uptimeSeconds % 86400) / 3600)}h`}
            </p>
          </div>
          <div className="space-y-3">
            <a href={`/operations/edge-agents/${branch.edgeAgent.id}`} className="btn-secondary w-full">
              View Details →
            </a>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!branch.edgeAgent.id) return;
                  setDownloadingPackage(true);
                  try {
                    const blob = await cameraInventoryApi.downloadPackage(branchId, branch.edgeAgent.id, "windows");
                    const fileName = `${branch.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-edge-agent-setup.exe`;
                    const url = window.URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = fileName;
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                    window.URL.revokeObjectURL(url);
                  } catch (error) {
                    console.error(error);
                    const message = error instanceof Error ? error.message : "Unable to download the package.";
                    window.alert(`Unable to download the Windows edge agent package. ${message}`);
                  } finally {
                    setDownloadingPackage(false);
                  }
                }}
                disabled={downloadingPackage}
                className="btn-primary w-full"
              >
                <Download size={16} />
                {downloadingPackage ? 'Downloading…' : 'Download one-click Windows installer'}
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (!branch.edgeAgent.id) return;
                  setDownloadingPackage(true);
                  try {
                    const blob = await cameraInventoryApi.downloadPackage(branchId, branch.edgeAgent.id, "linux");
                    const fileName = `${branch.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-edge-agent-linux.zip`;
                    const url = window.URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = fileName;
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                    window.URL.revokeObjectURL(url);
                  } catch (error) {
                    console.error(error);
                    const message = error instanceof Error ? error.message : "Unable to download the package.";
                    window.alert(`Unable to download the Linux edge agent package. ${message}`);
                  } finally {
                    setDownloadingPackage(false);
                  }
                }}
                disabled={downloadingPackage}
                className="btn-secondary w-full"
              >
                <Download size={16} />
                {downloadingPackage ? 'Downloading…' : 'Download Linux branch install zip'}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Download a zip, copy it to the branch machine, and run the included installer script there.
            </p>
          </div>
        </div>
      </div>

      {/* Authorized live camera wall */}
      <div className="mb-6">
        <BranchCameraWall branchId={branchId} cameras={cameras} />
      </div>

      {/* Component Links */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <a href={`/operations/recording?branchId=${branchId}`} className="card hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <Activity size={20} className="text-blue-600" />
            <h4 className="font-semibold">Recording Health</h4>
          </div>
          <p className="text-sm text-gray-600">View recording status and gaps</p>
        </a>
        
        <a href={`/operations/storage?branchId=${branchId}`} className="card hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <HardDrive size={20} className="text-purple-600" />
            <h4 className="font-semibold">Storage Health</h4>
          </div>
          <p className="text-sm text-gray-600">View storage and disk health</p>
        </a>
        
        <a href={`/operations/network?branchId=${branchId}`} className="card hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <Wifi size={20} className="text-green-600" />
            <h4 className="font-semibold">Network Health</h4>
          </div>
          <p className="text-sm text-gray-600">View network performance</p>
        </a>
        
        <a href={`/operations/ups?branchId=${branchId}`} className="card hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <Battery size={20} className="text-amber-600" />
            <h4 className="font-semibold">UPS Health</h4>
          </div>
          <p className="text-sm text-gray-600">View power and battery status</p>
        </a>
      </div>
    </div>
  );
}
