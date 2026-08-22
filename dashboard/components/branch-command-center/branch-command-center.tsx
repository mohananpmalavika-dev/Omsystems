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
  const [error, setError] = useState<string | null>(null);

  // Fetch authoritative branch operational state and cameras
  const loadBranchData = useCallback(async () => {
    try {
      setError(null);
      const [stateRes, camRes] = await Promise.all([
        fetch(`/api/v1/branches/${encodeURIComponent(branchId)}/operational-state`, { cache: "no-store" }),
        fetch(`/api/v1/branches/${encodeURIComponent(branchId)}/cameras`, { cache: "no-store" }),
      ]);
      if (!stateRes.ok || !camRes.ok) {
        throw new Error(`Branch telemetry request failed (${stateRes.status}/${camRes.status})`);
      }
      const [stateData, camData] = await Promise.all([
        stateRes.json() as Promise<BranchOperationalState>,
        camRes.json() as Promise<BranchCameraOperationalState[]>,
      ]);
      setState(stateData);
      setCameras(camData);
    } catch (err) {
      setState(null);
      setCameras([]);
      setAlerts([]);
      setError(err instanceof Error ? err.message : "Branch telemetry is unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadBranchData();
  }, [loadBranchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBranchData();
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
        <span className="text-sm font-mono">Loading Branch {branchId} Command Center...</span>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-3 p-6 text-center">
        <p className="text-sm font-semibold text-red-300">Live branch telemetry is unavailable.</p>
        <p className="text-xs">{error ?? "No authoritative branch state was returned."}</p>
        <button onClick={handleRefresh} className="rounded border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800">
          Retry
        </button>
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
