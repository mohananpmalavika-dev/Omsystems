"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { SyncedPlaybackView } from "@/components/synced-playback-view";
import { NotificationsProvider } from "@/components/notifications/NotificationsProvider";
import {
  MonitorPlay,
  Building2,
  Camera,
  Calendar,
  Clock,
  Search,
  Filter,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  Play,
  Layers,
  ChevronRight,
  Sparkles,
} from "lucide-react";

interface Branch {
  id: string;
  name: string;
  code?: string;
  region?: string;
  cameraCount?: number;
}

interface CameraItem {
  id: string;
  name: string;
  branchId?: string;
  ipAddress?: string;
  vendor?: string;
  model?: string;
  status?: string;
  location?: string;
}

export default function SyncedPlaybackPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [branchSearch, setBranchSearch] = useState<string>("");
  const [loadingBranches, setLoadingBranches] = useState<boolean>(true);

  const [allCameras, setAllCameras] = useState<CameraItem[]>([]);
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>([]);
  const [loadingCameras, setLoadingCameras] = useState<boolean>(false);

  // Time preset & custom time state
  const [timePreset, setTimePreset] = useState<"15m" | "1h" | "4h" | "24h" | "custom">("1h");
  const [fromTime, setFromTime] = useState<string>(() => {
    const d = new Date(Date.now() - 60 * 60 * 1000);
    return d.toISOString();
  });
  const [toTime, setToTime] = useState<string>(() => new Date().toISOString());

  // Master camera & playback layout
  const [masterCameraId, setMasterCameraId] = useState<string>("");
  const [isPlaybackActive, setIsPlaybackActive] = useState<boolean>(false);

  // 1. Fetch Branches on Mount
  useEffect(() => {
    async function loadBranches() {
      setLoadingBranches(true);
      try {
        const res = await fetch("/api/control/v1/operations/branches", { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          const list = json.data?.branches || json.branches || [];
          setBranches(list);
          if (list.length > 0) {
            setSelectedBranchId(list[0].id);
          }
        } else {
          // Fallback to /api/branches
          const fallbackRes = await fetch("/api/branches", { credentials: "include" });
          if (fallbackRes.ok) {
            const fJson = await fallbackRes.json();
            const fList = fJson.data || fJson.branches || [];
            setBranches(fList);
            if (fList.length > 0) setSelectedBranchId(fList[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load branches for synced playback:", err);
      } finally {
        setLoadingBranches(false);
      }
    }
    loadBranches();
  }, []);

  // 2. Fetch Cameras whenever selectedBranchId changes
  useEffect(() => {
    if (!selectedBranchId) {
      setAllCameras([]);
      setSelectedCameraIds([]);
      return;
    }

    async function loadCameras() {
      setLoadingCameras(true);
      try {
        const res = await fetch(`/api/control/v1/cameras?branchId=${encodeURIComponent(selectedBranchId)}`, {
          credentials: "include",
        });
        if (res.ok) {
          const json = await res.json();
          const cams = (json.cameras || json.data || []).map((c: any) => ({
            id: c.id,
            name: c.name || `Camera ${c.id.slice(0, 8)}`,
            branchId: c.branch_id || c.branchId,
            ipAddress: c.ip_address || c.ipAddress,
            vendor: c.vendor,
            model: c.model,
            status: c.status,
            location: c.location || c.zone,
          }));
          setAllCameras(cams);
          // Default select first 4 cameras
          const initialSelected = cams.slice(0, 4).map((c: CameraItem) => c.id);
          setSelectedCameraIds(initialSelected);
          if (initialSelected.length > 0) {
            setMasterCameraId(initialSelected[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load cameras for branch:", err);
      } finally {
        setLoadingCameras(false);
      }
    }

    loadCameras();
  }, [selectedBranchId]);

  // Handle Preset Change
  const handlePresetSelect = (preset: "15m" | "1h" | "4h" | "24h" | "custom") => {
    setTimePreset(preset);
    const now = new Date();
    setToTime(now.toISOString());

    if (preset === "15m") {
      setFromTime(new Date(now.getTime() - 15 * 60 * 1000).toISOString());
    } else if (preset === "1h") {
      setFromTime(new Date(now.getTime() - 60 * 60 * 1000).toISOString());
    } else if (preset === "4h") {
      setFromTime(new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString());
    } else if (preset === "24h") {
      setFromTime(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
    }
  };

  const toggleCameraSelection = (cameraId: string) => {
    setSelectedCameraIds((prev) => {
      if (prev.includes(cameraId)) {
        const next = prev.filter((id) => id !== cameraId);
        if (masterCameraId === cameraId && next.length > 0) {
          setMasterCameraId(next[0]);
        }
        return next;
      } else {
        if (prev.length >= 16) return prev; // max 16
        const next = [...prev, cameraId];
        if (!masterCameraId) setMasterCameraId(cameraId);
        return next;
      }
    });
  };

  const selectAllBranchCameras = () => {
    const ids = allCameras.slice(0, 16).map((c) => c.id);
    setSelectedCameraIds(ids);
    if (ids.length > 0 && !ids.includes(masterCameraId)) {
      setMasterCameraId(ids[0]);
    }
  };

  const deselectAllCameras = () => {
    setSelectedCameraIds([]);
    setMasterCameraId("");
  };

  const filteredBranches = useMemo(() => {
    if (!branchSearch.trim()) return branches;
    const q = branchSearch.toLowerCase();
    return branches.filter(
      (b) => b.name.toLowerCase().includes(q) || (b.code && b.code.toLowerCase().includes(q))
    );
  }, [branches, branchSearch]);

  const selectedBranch = useMemo(() => {
    return branches.find((b) => b.id === selectedBranchId);
  }, [branches, selectedBranchId]);

  return (
    <NotificationsProvider>
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6 text-slate-100 space-y-6">
        {/* Header Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono font-bold uppercase tracking-widest">
                <MonitorPlay className="w-4 h-4 text-indigo-400" />
                <span>Forensic Multi-Camera Synchronization Engine</span>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
                Multi-Camera Synchronized Timeline Playback
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Sub-Second Precision Barrier Seek • Authoritative Master Clock • Cross-Camera Timeline Alignment • Evidence-Grade Forensic Audit
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPlaybackActive(!isPlaybackActive)}
                disabled={selectedCameraIds.length === 0}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg flex items-center gap-2 transition-all ${
                  selectedCameraIds.length === 0
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-indigo-900/30"
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isPlaybackActive ? "Reload Synced Stream" : "Launch Synced Playback"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Control Bar: Branch Selection & Time Range */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Branch & Camera Selector Column */}
          <div className="lg:col-span-4 space-y-4">
            {/* Branch Card */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  <span>Select Fleet Branch</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">{branches.length} Branches</span>
              </div>

              {/* Branch Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search branch name or code..."
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Branch Select Dropdown */}
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                disabled={loadingBranches}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
              >
                {loadingBranches ? (
                  <option>Loading branches...</option>
                ) : filteredBranches.length === 0 ? (
                  <option>No matching branches found</option>
                ) : (
                  filteredBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.code ? `(${b.code})` : ""} {b.region ? `• ${b.region}` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Cameras for Selected Branch */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Camera className="w-4 h-4 text-cyan-400" />
                  <span>Branch Cameras ({selectedCameraIds.length}/{allCameras.length})</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    onClick={selectAllBranchCameras}
                    className="text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={deselectAllCameras}
                    className="text-slate-400 hover:text-slate-200 font-medium"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {loadingCameras ? (
                <div className="flex items-center justify-center py-6 text-xs text-slate-500">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  Loading camera channels...
                </div>
              ) : allCameras.length === 0 ? (
                <div className="p-4 rounded-lg bg-slate-950/60 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                  No cameras registered for this branch.
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                  {allCameras.map((cam) => {
                    const isSelected = selectedCameraIds.includes(cam.id);
                    const isMaster = masterCameraId === cam.id;
                    return (
                      <div
                        key={cam.id}
                        onClick={() => toggleCameraSelection(cam.id)}
                        className={`p-2 rounded-lg border cursor-pointer flex items-center justify-between transition-all ${
                          isSelected
                            ? "bg-indigo-950/40 border-indigo-500/40 text-slate-200"
                            : "bg-slate-950/40 border-slate-800/60 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                          />
                          <div className="truncate text-xs">
                            <span className="font-semibold text-slate-100">{cam.name}</span>
                            {cam.location && (
                              <span className="text-[10px] text-slate-500 ml-1.5 font-mono">
                                ({cam.location})
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMasterCameraId(cam.id);
                            }}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase transition-all ${
                              isMaster
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-slate-800 text-slate-400 hover:text-slate-200"
                            }`}
                            title="Set as authoritative master clock"
                          >
                            {isMaster ? "★ Master" : "Make Master"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Time Configuration & Preview Column */}
          <div className="lg:col-span-8 space-y-4">
            {/* Timeline Controls Card */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>Playback Time Interval & Synchronization Window</span>
                </div>

                {/* Preset Pills */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  {(["15m", "1h", "4h", "24h", "custom"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePresetSelect(p)}
                      className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded transition-all ${
                        timePreset === p
                          ? "bg-indigo-600 text-white shadow"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {p === "15m"
                        ? "Last 15m"
                        : p === "1h"
                        ? "Last 1h"
                        : p === "4h"
                        ? "Last 4h"
                        : p === "24h"
                        ? "Today (24h)"
                        : "Custom Range"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/60">
                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">
                    Timeline Start (From UTC/IST)
                  </label>
                  <input
                    type="datetime-local"
                    value={fromTime.slice(0, 16)}
                    onChange={(e) => {
                      setTimePreset("custom");
                      setFromTime(new Date(e.target.value).toISOString());
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">
                    Timeline End (To UTC/IST)
                  </label>
                  <input
                    type="datetime-local"
                    value={toTime.slice(0, 16)}
                    onChange={(e) => {
                      setTimePreset("custom");
                      setToTime(new Date(e.target.value).toISOString());
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Main Synchronized Playback View */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-1">
              {selectedCameraIds.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <Camera className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-sm font-medium text-slate-400">
                    No cameras selected for synchronized playback.
                  </p>
                  <p className="text-xs text-slate-500">
                    Select a branch and pick up to 16 camera channels to load multi-stream timeline synchronization.
                  </p>
                </div>
              ) : (
                <SyncedPlaybackView
                  streams={[]}
                  cameraIds={selectedCameraIds}
                  masterCameraId={masterCameraId}
                  fromTime={fromTime}
                  toTime={toTime}
                  autoLoad={true}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </NotificationsProvider>
  );
}
