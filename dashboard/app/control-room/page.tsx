"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Clock,
  Grid3X3,
  HardDrive,
  Play,
  Users,
  Activity,
  Bell,
} from "lucide-react";
import { EnhancedCameraGrid, type GridLayout } from "@/components/enhanced-camera-grid";
import { ShiftHandoverPanel } from "@/components/shift-handover";
import type { Camera as CameraType } from "@/lib/types";
import { endControlRoomActivity, startControlRoomActivity, trackControlRoomCameraSwitch } from "@/lib/control-room-tracker";

interface ControlRoomStats {
  totalCameras: number;
  onlineCameras: number;
  offlineCameras: number;
  activeStreams: number;
  openIncidents: number;
  unacknowledgedAlerts: number;
  recordingCameras: number;
  storageUsagePercent: number;
  storageSummary: {
    totalCount: number;
    warningCount: number;
    smartIssueCount: number;
    raidIssueCount: number;
    writeProbeFailureCount: number;
  };
}


export const getMaxConcurrentStreams = (userTier: "basic" | "standard" | "premium" | "enterprise" = "standard") => {
  const limits = {
    basic: 16,     // 16 streams @ 2 Mbps each = 32 Mbps
    standard: 32,  // 32 streams = 64 Mbps
    premium: 64,   // 64 streams = 128 Mbps
    enterprise: 144, // 144 streams (12×12 grid) = 288 Mbps
  };
  return limits[userTier];
};

export const CONTROL_ROOM_MAX_CONCURRENT_STREAMS = getMaxConcurrentStreams(
  (process.env.NEXT_PUBLIC_USER_TIER as any) || "standard"
);

const DEFAULT_EMPTY_STATS: ControlRoomStats = {
  totalCameras: 0,
  onlineCameras: 0,
  offlineCameras: 0,
  activeStreams: 0,
  openIncidents: 0,
  unacknowledgedAlerts: 0,
  recordingCameras: 0,
  storageUsagePercent: 0,
  storageSummary: {
    totalCount: 0,
    warningCount: 0,
    smartIssueCount: 0,
    raidIssueCount: 0,
    writeProbeFailureCount: 0,
  },
};

const getFallbackLayout = (allCameras: CameraType[]): GridLayout => ({
  name: "Substream overview",
  gridSize: "4x4",
  positions: allCameras.slice(0, 16).map((camera, position) => ({
    position,
    cameraId: camera.id,
    stream: "sub" as const,
  })),
});

export default function ControlRoomPage() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [priorityCameraIds, setPriorityCameraIds] = useState<string[]>([]);
  const [stats, setStats] = useState<ControlRoomStats>(DEFAULT_EMPTY_STATS);
  const [liveDataMode, setLiveDataMode] = useState<"live" | "fallback">("live");
  const [activeView, setActiveView] = useState<"grid" | "handover">("grid");
  const [loading, setLoading] = useState(true);
  const [initialLayout, setInitialLayout] = useState<GridLayout | undefined>();
  const [monitoredCameraIds, setMonitoredCameraIds] = useState<string[]>([]);
  const monitoredCameraSignatureRef = useRef("");
  const monitoredCameraSet = new Set(monitoredCameraIds);
  const monitoredCameras = cameras.filter((camera) => monitoredCameraSet.has(camera.id));
  const monitoringSignature = monitoredCameras
    .map((camera) => `${camera.id}:${camera.branchId}:${camera.branchName ?? ""}`)
    .sort()
    .join("|");
  const handleActiveStreamsChange = useCallback((activeStreams: number) => {
    setStats((current) => current.activeStreams === activeStreams ? current : { ...current, activeStreams });
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);
  const handleMonitoredCamerasChange = useCallback((cameraIds: string[]) => {
    const signature = cameraIds.join('|');
    if (monitoredCameraSignatureRef.current && monitoredCameraSignatureRef.current !== signature) {
      trackControlRoomCameraSwitch();
    }
    monitoredCameraSignatureRef.current = signature;
    setMonitoredCameraIds((current) => current.join('|') === signature ? current : cameraIds);
  }, []);

  useEffect(() => {
    if (loading || !monitoringSignature) return;

    const branchMap = new Map<string, string>();
    for (const camera of monitoredCameras) {
      if (camera.branchId) branchMap.set(camera.branchId, camera.branchName || camera.branchId);
    }
    const branchIds = [...branchMap.keys()];
    const branchNames = [...branchMap.values()];
    
    void startControlRoomActivity(
      branchIds.length === 1 ? "single_branch" : "multi_branch",
      branchIds.length === 1 ? branchIds[0] : undefined,
      undefined,
      undefined,
      monitoredCameras.map((camera) => camera.id),
      branchIds,
      branchNames,
      "live",
    ).catch(() => null);

    return () => {
      void endControlRoomActivity().catch(() => null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, monitoringSignature]);

  const loadData = async () => {
    try {
      const [cameraResult, statsResult, priorityResult] = await Promise.allSettled([
        loadCameras(),
        loadStats(),
        loadPriorityAlerts(),
      ]);

      const hasLiveData = cameraResult.status === "fulfilled" && cameraResult.value
        || statsResult.status === "fulfilled" && statsResult.value
        || priorityResult.status === "fulfilled" && priorityResult.value;

      setLiveDataMode(hasLiveData ? "live" : "fallback");
    } catch (error) {
      console.error("Failed to load control room data:", error);
      setLiveDataMode("fallback");
    } finally {
      setLoading(false);
    }
  };

  const getAuthHeaders = (): HeadersInit => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["x-sentinel-session"] = token;
    }
    return headers;
  };

  const loadPriorityAlerts = async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/control/v1/alerts/alert-center?limit=200", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        setPriorityCameraIds([]);
        return false;
      }
      const body = await response.json();
      const alerts = Array.isArray(body.data) ? body.data : body.data?.alerts ?? body.alerts ?? [];
      const livePriorityIds = Array.from(new Set<string>(alerts
        .filter((alert: { severity?: string; status?: string }) =>
          ["critical", "high", "p1", "p2"].includes(String(alert.severity).toLowerCase()) && alert.status !== "resolved")
        .map((alert: { cameraId?: string }) => alert.cameraId)
        .filter((cameraId: unknown): cameraId is string => typeof cameraId === "string")));

      setPriorityCameraIds(livePriorityIds);
      return livePriorityIds.length > 0;
    } catch (error) {
      console.error("Failed to load priority alerts:", error);
      setPriorityCameraIds([]);
      return false;
    }
  };

  const loadCameras = async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/control/v1/cameras?limit=500&action=live%3Aview", {
        headers: getAuthHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        setCameras([]);
        setInitialLayout(undefined);
        return false;
      }

      const body = await response.json();
      const allCameras = (body.data ?? []) as CameraType[];
      setCameras(allCameras);
      if (allCameras.length > 0) {
        setInitialLayout((current) => current ?? getFallbackLayout(allCameras));
      } else {
        setInitialLayout(undefined);
      }
      return allCameras.length > 0;
    } catch (error) {
      console.error("Failed to load cameras:", error);
      setCameras([]);
      setInitialLayout(undefined);
      return false;
    }
  };

  const loadStats = async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/control/v1/operations/health/summary", {
        headers: getAuthHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        setStats(DEFAULT_EMPTY_STATS);
        return false;
      }

      const body = await response.json();
      const data = body.data ?? body;
      const nextStats: ControlRoomStats = {
        totalCameras: Number(data.totalCameras ?? data.total_cameras ?? 0),
        onlineCameras: Number(data.camerasOnline ?? data.cameras_online ?? 0),
        offlineCameras: Number(data.camerasOffline ?? data.cameras_offline ?? 0),
        activeStreams: Number(data.activeStreams ?? data.active_streams ?? 0),
        openIncidents: Number(data.openIncidents ?? data.open_incidents ?? 0),
        unacknowledgedAlerts: Number(data.unacknowledgedAlerts ?? data.unacknowledged_alerts ?? 0),
        recordingCameras: Number(data.camerasRecording ?? data.cameras_recording ?? 0),
        storageUsagePercent: Number(data.storageUsagePercent ?? data.storage_usage_percent ?? 0),
        storageSummary: {
          totalCount: Number(data.storageSummary?.totalCount ?? data.storage_summary?.total_count ?? 0),
          warningCount: Number(data.storageSummary?.warningCount ?? data.storage_summary?.warning_count ?? 0),
          smartIssueCount: Number(data.storageSummary?.smartIssueCount ?? data.storage_summary?.smart_issue_count ?? 0),
          raidIssueCount: Number(data.storageSummary?.raidIssueCount ?? data.storage_summary?.raid_issue_count ?? 0),
          writeProbeFailureCount: Number(data.storageSummary?.writeProbeFailureCount ?? data.storage_summary?.write_probe_failure_count ?? 0),
        },
      };

      setStats(nextStats);
      return nextStats.totalCameras > 0 || nextStats.onlineCameras > 0;
    } catch (error) {
      console.error("Failed to load stats:", error);
      setStats(DEFAULT_EMPTY_STATS);
      return false;
    }
  };

  if (loading) {
    return (
      <div className="control-room-loading">
        <div className="spinner" />
        <p>Loading Control Room...</p>
      </div>
    );
  }

  return (
    <div className="control-room">
      {liveDataMode === "fallback" ? (
        <div className="control-room-offline-banner" role="status">
          Live operations data is temporarily unavailable, so the control room is showing the latest offline snapshot for monitoring continuity.
        </div>
      ) : null}

      <header className="control-room-header">
        <div className="header-title">
          <Activity size={32} />
          <div>
            <h1>Control Room</h1>
            <p>24/7 Live Monitoring Operations</p>
          </div>
        </div>

        <div className="header-time">
          <Clock size={20} />
          <span>{new Date().toLocaleString()}</span>
        </div>
      </header>

      <div className="stats-bar">
        <div className="stat-card">
          <Camera size={24} className="stat-icon" />
          <div className="stat-content">
            <div className="stat-value">{stats.onlineCameras}/{stats.totalCameras}</div>
            <div className="stat-label">Cameras Online</div>
          </div>
        </div>

        <div className="stat-card">
          <Play size={24} className="stat-icon text-green" />
          <div className="stat-content">
            <div className="stat-value">{stats.activeStreams}</div>
            <div className="stat-label">Active Streams</div>
          </div>
        </div>

        <div className="stat-card">
          <AlertTriangle size={24} className="stat-icon text-red" />
          <div className="stat-content">
            <div className="stat-value">{stats.openIncidents}</div>
            <div className="stat-label">Open Incidents</div>
          </div>
        </div>

        <div className="stat-card">
          <Bell size={24} className="stat-icon text-yellow" />
          <div className="stat-content">
            <div className="stat-value">{stats.unacknowledgedAlerts}</div>
            <div className="stat-label">Unack. Alerts</div>
          </div>
        </div>

        <div className="stat-card">
          <HardDrive size={24} className="stat-icon text-blue" />
          <div className="stat-content">
            <div className="stat-value">{stats.storageUsagePercent}%</div>
            <div className="stat-label">Storage Used</div>
          </div>
        </div>

        <div className="stat-card storage-health-card">
          <HardDrive size={24} className="stat-icon text-purple" />
          <div className="stat-content">
            <div className="stat-value">{stats.storageSummary.totalCount}</div>
            <div className="stat-label">Storage Nodes</div>
            <div className="storage-health-details">
              <span className={`health-pill ${stats.storageSummary.warningCount ? "warning-pill" : "ok-pill"}`}>
                {stats.storageSummary.warningCount} warnings
              </span>
              <span className={`health-pill ${stats.storageSummary.smartIssueCount ? "critical-pill" : "ok-pill"}`}>
                {stats.storageSummary.smartIssueCount} SMART
              </span>
              <span className={`health-pill ${stats.storageSummary.raidIssueCount ? "critical-pill" : "ok-pill"}`}>
                {stats.storageSummary.raidIssueCount} RAID
              </span>
              <span className={`health-pill ${stats.storageSummary.writeProbeFailureCount ? "critical-pill" : "ok-pill"}`}>
                {stats.storageSummary.writeProbeFailureCount} probe fail
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="control-room-nav">
        <button
          className={`nav-button ${activeView === "grid" ? "active" : ""}`}
          onClick={() => setActiveView("grid")}
        >
          <Grid3X3 size={20} />
          Video Wall
        </button>
        <button
          className={`nav-button ${activeView === "handover" ? "active" : ""}`}
          onClick={() => setActiveView("handover")}
        >
          <Users size={20} />
          Shift Handover
        </button>
      </div>

      <div className="control-room-content">
        {activeView === "grid" ? (
          cameras.length === 0 ? (
            <div className="empty-control-room-card">
              <div className="empty-icon-wrap">
                <Camera size={44} className="empty-icon" />
              </div>
              <h3 className="empty-title">No Cameras Registered Yet</h3>
              <p className="empty-desc">
                There are currently no active cameras in the database. Onboard a new branch or discover devices to start monitoring live video streams.
              </p>
              <div className="empty-actions">
                <a href="/admin/branch-onboarding" className="btn-action-primary">
                  + Onboard Branch
                </a>
                <a href="/admin/database" className="btn-action-secondary">
                  Database & Device Manager
                </a>
              </div>
            </div>
          ) : (
            <EnhancedCameraGrid
              cameras={cameras}
              initialLayout={initialLayout}
              maxConcurrentStreams={CONTROL_ROOM_MAX_CONCURRENT_STREAMS}
              priorityCameraIds={priorityCameraIds}
              enableVirtualScrolling
              enableGPUAcceleration
              onActiveStreamsChange={handleActiveStreamsChange}
              onMonitoredCamerasChange={handleMonitoredCamerasChange}
              onLayoutChange={(layout) => {
                console.log("Layout saved:", layout);
              }}
            />
          )
        ) : (
          <ShiftHandoverPanel />
        )}
      </div>

      <style jsx>{`
        .control-room {
          min-height: 100vh;
          background: #f3f4f6;
          display: flex;
          flex-direction: column;
        }

        .empty-control-room-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 64px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          max-width: 560px;
          margin: 40px auto;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
        }

        .empty-icon-wrap {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #eff6ff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          color: #3b82f6;
        }

        .empty-title {
          font-size: 20px;
          font-weight: 700;
          color: #1e293b;
          margin: 0 0 8px 0;
        }

        .empty-desc {
          font-size: 14px;
          color: #64748b;
          margin: 0 0 24px 0;
          line-height: 1.5;
        }

        .empty-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .btn-action-primary {
          display: inline-flex;
          align-items: center;
          padding: 10px 20px;
          background: #2563eb;
          color: white;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          transition: background 0.2s;
        }

        .btn-action-primary:hover {
          background: #1d4ed8;
        }

        .btn-action-secondary {
          display: inline-flex;
          align-items: center;
          padding: 10px 20px;
          background: #f1f5f9;
          color: #334155;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          transition: background 0.2s;
        }

        .btn-action-secondary:hover {
          background: #e2e8f0;
        }

        .control-room-offline-banner {
          padding: 10px 16px;
          background: rgba(245, 158, 11, 0.12);
          border-bottom: 1px solid rgba(245, 158, 11, 0.2);
          color: #7c4b00;
          font-size: 12px;
          font-weight: 600;
          text-align: center;
        }

        .control-room-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          gap: 16px;
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

        .control-room-header {
          background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
          color: white;
          padding: 24px 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .header-title h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
        }

        .header-title p {
          margin: 4px 0 0 0;
          font-size: 14px;
          opacity: 0.9;
        }

        .header-time {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 500;
        }

        .stats-bar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          padding: 20px 28px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
        }

        .stat-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px;
          background: #f9fafb;
          border-radius: 12px;
          transition: all 0.2s;
        }

        .stat-card:hover {
          background: #f3f4f6;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .stat-icon {
          color: #6b7280;
        }

        .stat-icon.text-green {
          color: #10b981;
        }

        .stat-icon.text-red {
          color: #ef4444;
        }

        .stat-icon.text-yellow {
          color: #f59e0b;
        }

        .stat-icon.text-blue {
          color: #3b82f6;
        }

        .stat-content {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }

        .stat-value {
          font-size: 22px;
          font-weight: 700;
          color: #111827;
          line-height: 1.1;
        }

        .stat-label {
          font-size: 12px;
          color: #6b7280;
          font-weight: 500;
        }

        .storage-health-details {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .health-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          min-width: fit-content;
        }

        .health-pill.ok-pill {
          background: rgba(16, 185, 129, 0.12);
          color: #047857;
        }

        .health-pill.warning-pill {
          background: rgba(245, 158, 11, 0.14);
          color: #b45309;
        }

        .health-pill.critical-pill {
          background: rgba(239, 68, 68, 0.12);
          color: #991b1b;
        }

        .storage-health-card {
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          align-items: center;
        }

        .control-room-nav {
          display: flex;
          gap: 8px;
          padding: 16px 32px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
        }

        .nav-button {
          padding: 12px 24px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 600;
          color: #6b7280;
          transition: all 0.2s;
        }

        .nav-button:hover {
          background: #f9fafb;
          border-color: #3b82f6;
          color: #3b82f6;
        }

        .nav-button.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .control-room-content {
          flex: 1;
          padding: 24px 32px;
          overflow: auto;
        }
      `}</style>
    </div>
  );
}
