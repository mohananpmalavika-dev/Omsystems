"use client";

import { useEffect, useState } from "react";
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
import { CameraGrid } from "@/components/camera-grid";
import { ShiftHandoverPanel } from "@/components/shift-handover";
import type { Camera as CameraType } from "@/lib/types";

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

export default function ControlRoomPage() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [stats, setStats] = useState<ControlRoomStats>({
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
  });
  const [activeView, setActiveView] = useState<"grid" | "handover">("grid");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      await Promise.all([loadCameras(), loadStats()]);
    } catch (error) {
      console.error("Failed to load control room data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCameras = async () => {
    try {
      const response = await fetch("/api/branches", {
        credentials: "include",
      });

      if (response.ok) {
        const branches = await response.json();
        const allCameras: CameraType[] = [];

        for (const branch of branches) {
          const cameraResponse = await fetch(`/api/branches/${branch.id}/cameras`, {
            credentials: "include",
          });

          if (cameraResponse.ok) {
            const branchCameras = await cameraResponse.json();
            allCameras.push(...branchCameras);
          }
        }

        setCameras(allCameras);
      }
    } catch (error) {
      console.error("Failed to load cameras:", error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch("/api/control/v1/dashboard/stats", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
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
              <span>{stats.storageSummary.warningCount} warnings</span>
              <span>{stats.storageSummary.smartIssueCount} SMART</span>
              <span>{stats.storageSummary.raidIssueCount} RAID</span>
              <span>{stats.storageSummary.writeProbeFailureCount} probe fail</span>
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
          <CameraGrid
            cameras={cameras}
            onLayoutChange={(layout) => {
              console.log("Layout saved:", layout);
            }}
          />
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
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 3px 8px;
          margin-top: 6px;
          font-size: 11px;
          color: #374151;
        }

        .storage-health-card {
          background: linear-gradient(135deg, #f5f3ff, #e0e7ff);
          border-color: #c7d2fe;
          min-height: 110px;
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
