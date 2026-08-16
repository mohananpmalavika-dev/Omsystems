"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  HardDrive,
  Server,
  TrendingUp,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";

interface DVRNVRDevice {
  id: string;
  deviceType: "dvr" | "nvr";
  manufacturer: string;
  model: string;
  ipAddress: string;
  status: "online" | "offline" | "degraded" | "unknown";
  lastHeartbeat?: string;
  lastPolled?: string;
  consecutiveFailures: number;
  pollingInterval: number;
  enabled: boolean;
}

interface MonitoringStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  degradedDevices: number;
  lastUpdateTime: string;
  avgLatencyMs: number;
}

interface DeviceHealth {
  timestamp: string;
  status: string;
  latencyMs?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  hddStatus?: Array<{
    disk: number;
    capacity: number;
    used: number;
    status: "normal" | "warning" | "error";
  }>;
  recordingStatus?: string;
  connectedCameras?: number;
  totalCameras?: number;
  firmwareVersion?: string;
  uptime?: number;
  temperature?: number;
  errorMessage?: string;
}

export function DVRNVRMonitorDashboard() {
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [devices, setDevices] = useState<DVRNVRDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DVRNVRDevice | null>(null);
  const [deviceHealth, setDeviceHealth] = useState<DeviceHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadStats();
    loadDevices();

    if (autoRefresh) {
      const interval = setInterval(() => {
        loadStats();
        loadDevices();
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  useEffect(() => {
    if (selectedDevice) {
      loadDeviceHealth(selectedDevice.id);
    }
  }, [selectedDevice]);

  const loadStats = async () => {
    try {
      const response = await fetch("/api/control/v1/dvr-nvr/monitor/stats", {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        setStats(result.data);
      }
    } catch (error) {
      console.error("Failed to load monitoring stats:", error);
    }
  };

  const loadDevices = async () => {
    try {
      const response = await fetch("/api/control/v1/dvr-nvr/monitor/devices", {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        setDevices(result.data);
      }
    } catch (error) {
      console.error("Failed to load devices:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDeviceHealth = async (deviceId: string) => {
    try {
      const response = await fetch(`/api/control/v1/dvr-nvr/monitor/devices/${encodeURIComponent(deviceId)}`, {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        setDeviceHealth(result.data.health);
      }
    } catch (error) {
      console.error("Failed to load device health:", error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online":
        return <CheckCircle size={20} className="text-green-600" />;
      case "offline":
        return <XCircle size={20} className="text-red-600" />;
      case "degraded":
        return <AlertCircle size={20} className="text-yellow-600" />;
      default:
        return <AlertCircle size={20} className="text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-100 text-green-800 border-green-300";
      case "offline":
        return "bg-red-100 text-red-800 border-red-300";
      case "degraded":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return "N/A";

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <h1 className="sr-only">DVR/NVR monitoring</h1>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="dvr-nvr-monitor-dashboard">
      <div className="dashboard-header">
        <div>
          <h1>DVR/NVR Monitoring</h1>
          <p>Real-time device health and status monitoring</p>
        </div>
        <div className="header-actions">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh (30s)</span>
          </label>
        </div>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon bg-blue-100">
              <Server size={24} className="text-blue-600" />
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.totalDevices}</div>
              <div className="stat-label">Total Devices</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon bg-green-100">
              <Wifi size={24} className="text-green-600" />
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.onlineDevices}</div>
              <div className="stat-label">Online</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon bg-red-100">
              <WifiOff size={24} className="text-red-600" />
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.offlineDevices}</div>
              <div className="stat-label">Offline</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon bg-yellow-100">
              <AlertCircle size={24} className="text-yellow-600" />
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.degradedDevices}</div>
              <div className="stat-label">Degraded</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon bg-purple-100">
              <Activity size={24} className="text-purple-600" />
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.avgLatencyMs}ms</div>
              <div className="stat-label">Avg Latency</div>
            </div>
          </div>
        </div>
      )}

      <div className="content-grid">
        <div className="devices-list">
          <h3>Monitored Devices</h3>
          <div className="device-cards">
            {devices.map((device) => (
              <div
                key={device.id}
                className={`device-card ${selectedDevice?.id === device.id ? "selected" : ""}`}
                onClick={() => setSelectedDevice(device)}
              >
                <div className="device-header">
                  <div className="device-info">
                    {getStatusIcon(device.status)}
                    <div>
                      <strong>{device.manufacturer} {device.model}</strong>
                      <span className="device-type">{device.deviceType.toUpperCase()}</span>
                    </div>
                  </div>
                  <span className={`status-badge ${getStatusColor(device.status)}`}>
                    {device.status}
                  </span>
                </div>
                <div className="device-details">
                  <div className="detail-row">
                    <span>IP Address:</span>
                    <strong>{device.ipAddress}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Last Poll:</span>
                    <strong>
                      {device.lastPolled
                        ? new Date(device.lastPolled).toLocaleTimeString()
                        : "Never"}
                    </strong>
                  </div>
                  {device.consecutiveFailures > 0 && (
                    <div className="detail-row text-red-600">
                      <span>Failures:</span>
                      <strong>{device.consecutiveFailures}</strong>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="device-details-panel">
          {selectedDevice && deviceHealth ? (
            <>
              <div className="panel-header">
                <h3>Device Details</h3>
                <span className={`status-badge ${getStatusColor(selectedDevice.status)}`}>
                  {selectedDevice.status}
                </span>
              </div>

              <div className="health-metrics">
                {deviceHealth.latencyMs !== undefined && (
                  <div className="metric-card">
                    <Clock size={20} />
                    <div>
                      <div className="metric-label">Latency</div>
                      <div className="metric-value">{deviceHealth.latencyMs}ms</div>
                    </div>
                  </div>
                )}

                {deviceHealth.uptime !== undefined && (
                  <div className="metric-card">
                    <TrendingUp size={20} />
                    <div>
                      <div className="metric-label">Uptime</div>
                      <div className="metric-value">{formatUptime(deviceHealth.uptime)}</div>
                    </div>
                  </div>
                )}

                {deviceHealth.recordingStatus && (
                  <div className="metric-card">
                    <Activity size={20} />
                    <div>
                      <div className="metric-label">Recording</div>
                      <div className="metric-value">{deviceHealth.recordingStatus}</div>
                    </div>
                  </div>
                )}

                {deviceHealth.connectedCameras !== undefined && (
                  <div className="metric-card">
                    <Server size={20} />
                    <div>
                      <div className="metric-label">Cameras</div>
                      <div className="metric-value">
                        {deviceHealth.connectedCameras}/{deviceHealth.totalCameras || 0}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {deviceHealth.hddStatus && deviceHealth.hddStatus.length > 0 && (
                <div className="hdd-status">
                  <h4>
                    <HardDrive size={18} />
                    Storage Status
                  </h4>
                  {deviceHealth.hddStatus.map((hdd, index) => {
                    const usagePercent = (hdd.used / hdd.capacity) * 100;
                    return (
                      <div key={index} className="hdd-card">
                        <div className="hdd-header">
                          <span>Disk {hdd.disk}</span>
                          <span className={`hdd-status-badge ${hdd.status}`}>
                            {hdd.status}
                          </span>
                        </div>
                        <div className="hdd-progress">
                          <div
                            className={`hdd-progress-bar ${usagePercent > 90 ? "critical" : usagePercent > 75 ? "warning" : "normal"}`}
                            style={{ width: `${usagePercent}%` }}
                          />
                        </div>
                        <div className="hdd-info">
                          <span>{usagePercent.toFixed(1)}% used</span>
                          <span>
                            {(hdd.used / 1024).toFixed(1)} GB / {(hdd.capacity / 1024).toFixed(1)} GB
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {deviceHealth.firmwareVersion && (
                <div className="info-section">
                  <strong>Firmware Version:</strong>
                  <span>{deviceHealth.firmwareVersion}</span>
                </div>
              )}

              {deviceHealth.errorMessage && (
                <div className="error-message">
                  <AlertCircle size={18} />
                  <span>{deviceHealth.errorMessage}</span>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <Server size={64} className="empty-icon" />
              <p>Select a device to view detailed health information</p>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .dvr-nvr-monitor-dashboard {
          padding: 24px;
          background: #f9fafb;
          min-height: 100vh;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .dashboard-header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
        }

        .dashboard-header p {
          margin: 4px 0 0 0;
          font-size: 14px;
          color: #6b7280;
        }

        .auto-refresh-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .auto-refresh-toggle input[type="checkbox"] {
          width: 18px;
          height: 18px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: white;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-content {
          flex: 1;
        }

        .stat-value {
          font-size: 28px;
          font-weight: 700;
          color: #111827;
        }

        .stat-label {
          font-size: 13px;
          color: #6b7280;
          margin-top: 4px;
        }

        .content-grid {
          display: grid;
          grid-template-columns: 400px 1fr;
          gap: 24px;
        }

        .devices-list,
        .device-details-panel {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .devices-list h3,
        .panel-header h3 {
          margin: 0 0 16px 0;
          font-size: 18px;
          font-weight: 600;
        }

        .device-cards {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 700px;
          overflow-y: auto;
        }

        .device-card {
          padding: 16px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .device-card:hover {
          border-color: #3b82f6;
          background: #f9fafb;
        }

        .device-card.selected {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .device-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .device-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .device-info strong {
          font-size: 14px;
          display: block;
        }

        .device-type {
          font-size: 11px;
          color: #6b7280;
          font-weight: 600;
        }

        .status-badge {
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid;
        }

        .device-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }

        .detail-row span {
          color: #6b7280;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .health-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .metric-card {
          padding: 16px;
          background: #f9fafb;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .metric-label {
          font-size: 12px;
          color: #6b7280;
        }

        .metric-value {
          font-size: 20px;
          font-weight: 700;
          color: #111827;
        }

        .hdd-status {
          margin-bottom: 24px;
        }

        .hdd-status h4 {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .hdd-card {
          padding: 16px;
          background: #f9fafb;
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .hdd-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .hdd-status-badge {
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
        }

        .hdd-status-badge.normal {
          background: #d1fae5;
          color: #065f46;
        }

        .hdd-status-badge.warning {
          background: #fef3c7;
          color: #92400e;
        }

        .hdd-status-badge.error {
          background: #fee2e2;
          color: #991b1b;
        }

        .hdd-progress {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .hdd-progress-bar {
          height: 100%;
          transition: width 0.3s;
        }

        .hdd-progress-bar.normal {
          background: #10b981;
        }

        .hdd-progress-bar.warning {
          background: #f59e0b;
        }

        .hdd-progress-bar.critical {
          background: #ef4444;
        }

        .hdd-info {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: #6b7280;
        }

        .info-section {
          display: flex;
          justify-content: space-between;
          padding: 12px;
          background: #f9fafb;
          border-radius: 6px;
          margin-bottom: 12px;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #fee2e2;
          border: 1px solid #ef4444;
          border-radius: 6px;
          color: #991b1b;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 400px;
          gap: 16px;
        }

        .empty-icon {
          color: #d1d5db;
        }

        .empty-state p {
          color: #6b7280;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
