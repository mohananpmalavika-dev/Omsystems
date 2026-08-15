"use client";

import React, { useState, useEffect, useCallback } from "react";
import { BranchHealthHeader } from "./branch-health-header";
import { BranchHealthSummary } from "./branch-health-summary";
import { BranchCameraWall } from "./branch-camera-wall";
import { RecorderHealthPanel } from "./recorder-health-panel";
import { RetentionSummary } from "./retention-summary";
import { BranchAlertPanel } from "./branch-alert-panel";
import { Loader2, ArrowLeft, RefreshCw } from "lucide-react";
import type {
  BranchAlert,
  BranchCameraOperationalState,
  BranchOperationalState,
  CameraFilter,
} from "./types";

export interface BranchCommandCenterProps {
  branchId: string;
  initialState?: BranchOperationalState;
  onBackToHo?: () => void;
}

export function BranchCommandCenter({
  branchId,
  initialState,
  onBackToHo,
}: BranchCommandCenterProps) {
  const [state, setState] = useState<BranchOperationalState | null>(initialState ?? null);
  const [cameras, setCameras] = useState<BranchCameraOperationalState[]>([]);
  const [alerts, setAlerts] = useState<BranchAlert[]>([]);
  const [activeFilter, setActiveFilter] = useState<CameraFilter>("ALL");
  const [loading, setLoading] = useState(!initialState);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch authoritative branch operational state and cameras
  const loadBranchData = useCallback(async () => {
    try {
      if (typeof fetch !== "undefined") {
        const [stateRes, camRes] = await Promise.all([
          fetch(`/api/v1/branches/${encodeURIComponent(branchId)}/operational-state`),
          fetch(`/api/v1/branches/${encodeURIComponent(branchId)}/cameras`),
        ]);

        if (stateRes.ok) {
          const stateData: BranchOperationalState = await stateRes.json();
          setState(stateData);
        }

        if (camRes.ok) {
          const camData: BranchCameraOperationalState[] = await camRes.json();
          setCameras(camData);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch branch operational data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId]);

  useEffect(() => {
    // Initial fetch
    loadBranchData();

    // Fallback seed data if running in demo/offline mode
    if (!state) {
      const fallbackState: BranchOperationalState = {
        branchId,
        branchCode: branchId.replace("branch-", ""),
        branchName: "Aluva",
        overallStatus: "CRITICAL",
        internet: {
          status: "ONLINE",
          latencyMs: 21,
          packetLossPercent: 0.4,
          lastSeenAt: new Date().toISOString(),
        },
        gateway: {
          status: "ONLINE",
          lastHeartbeatAt: new Date().toISOString(),
          version: "1.4.2",
        },
        recorder: {
          total: 1,
          online: 1,
          offline: 0,
          status: "ONLINE",
        },
        cameras: {
          total: 16,
          online: 15,
          offline: 1,
          recording: 14,
          notRecording: 2,
          unknown: 0,
        },
        storage: {
          status: "WARNING",
          disksHealthy: 1,
          disksWarning: 1,
          disksFailed: 0,
        },
        retention: {
          requiredDays: 90,
          actualDays: 61,
          status: "VIOLATION",
          oldestRecordingAt: "16-Jun-2026 03:12",
          newestRecordingAt: "16-Aug-2026 04:22",
          coveragePercent: 67.8,
          missingIntervals: 2,
        },
        lastHealthPollAt: new Date().toISOString(),
      };

      const fallbackCameras: BranchCameraOperationalState[] = Array.from({ length: 16 }, (_, i) => {
        const num = i + 1;
        const isOffline = num === 4;
        const isNoRecord = num === 7 || num === 14;
        const isAlert = num === 12;

        return {
          cameraId: `cam-${branchId}-${String(num).padStart(2, "0")}`,
          name: `CAM${String(num).padStart(2, "0")}`,
          channelNumber: num,
          health: {
            connectivity: isOffline ? "OFFLINE" : "ONLINE",
            recording: isNoRecord ? "NOT_RECORDING" : "RECORDING",
            stream: isOffline ? "UNAVAILABLE" : "AVAILABLE",
            videoLoss: isOffline ? "DETECTED" : "NORMAL",
            tamper: "NORMAL",
          },
          ptzSupported: num === 1,
          alertActive: isAlert,
          alertSeverity: isAlert ? "CRITICAL" : undefined,
        };
      });

      setState(fallbackState);
      setCameras(fallbackCameras);
      setAlerts([
        {
          id: "alt-01",
          cameraId: `cam-${branchId}-12`,
          cameraName: "CAM12 (Vault)",
          severity: "P1",
          title: "After-Hours Motion Detected",
          message: "Unscheduled person detection in cash vault area",
          detectedAt: "3 mins ago",
          acknowledged: false,
        },
        {
          id: "alt-02",
          cameraId: `cam-${branchId}-07`,
          cameraName: "CAM07 (Lobby)",
          severity: "P2",
          title: "Continuous Recording Stopped",
          message: "Channel streaming is live but disk writing halted 49 mins ago",
          detectedAt: "49 mins ago",
          acknowledged: false,
        },
      ]);
    }
  }, [branchId, loadBranchData, state]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBranchData();
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  if (loading || !state) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
        <span className="text-sm font-mono">Loading Branch {branchId} Command Center...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 md:p-6 text-slate-100">
      {/* Back Navigation & Refresh Action */}
      <div className="flex items-center justify-between">
        {onBackToHo && (
          <button
            onClick={onBackToHo}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold font-mono text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-sky-400" />
            <span>BACK TO 400-BRANCH HO DASHBOARD</span>
          </button>
        )}

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 transition-colors ml-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${refreshing ? "animate-spin" : ""}`} />
          <span>REFRESH HEALTH POLL</span>
        </button>
      </div>

      {/* 1. Branch Health Header */}
      <BranchHealthHeader state={state} onRefresh={handleRefresh} />

      {/* 2. Quick Filter Summary Chips */}
      <BranchHealthSummary
        state={state}
        activeFilter={activeFilter}
        alertingCount={alerts.length}
        onFilterChange={setActiveFilter}
      />

      {/* 3. Branch Camera Wall with Dynamic Capacity Scheduling */}
      <BranchCameraWall
        branchId={branchId}
        cameras={cameras}
        activeFilter={activeFilter}
      />

      {/* 4. Infrastructure Panels (Recorder Health, Retention Compliance, Active Alerts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecorderHealthPanel state={state} />
        <RetentionSummary state={state} />
      </div>

      {/* 5. Active Alerts Panel */}
      <BranchAlertPanel
        alerts={alerts}
        onAcknowledge={handleAcknowledgeAlert}
      />
    </div>
  );
}
