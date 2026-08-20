"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Grid,
  Maximize2,
  Minimize2,
  Activity,
  Layers,
  RefreshCw,
  Volume2,
  VolumeX,
  Gauge,
  Camera,
  AlertTriangle,
  Building2,
  Search,
  Filter,
  Radio,
} from "lucide-react";
import type { Camera as CameraType, LiveSessionResponse } from "@/lib/types";
import { HlsPlayer } from "./hls-player";
import { startLiveFromBrowser } from "@/lib/live-client";

type GridMode = 1 | 4 | 9 | 16 | 64 | 144;

interface LiveCameraState {
  camera: CameraType;
  session?: LiveSessionResponse;
  tier: "MAINSTREAM" | "MEDIUM" | "SUBSTREAM" | "LOW_SUBSTREAM" | "ULTRA_LOW_THUMBNAIL";
  resolution: string;
  fps: number;
  bitrateKbps: number;
  isAlarm: boolean;
}

export function AdaptiveVideoWall() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [priorityCameraIds, setPriorityCameraIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [gridMode, setGridMode] = useState<GridMode>(16);
  const [maximizedCameraId, setMaximizedCameraId] = useState<string | null>(null);
  const [hoveredCameraId, setHoveredCameraId] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sessions, setSessions] = useState<Map<string, LiveSessionResponse>>(new Map());

  const getAuthHeaders = (): HeadersInit => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["x-sentinel-session"] = token;
    }
    return headers;
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [camerasRes, alertsRes] = await Promise.allSettled([
        fetch("/api/control/v1/cameras?limit=500&action=live%3Aview", {
          headers: getAuthHeaders(),
          credentials: "include",
        }),
        fetch("/api/control/v1/alerts/alert-center?limit=200", {
          headers: getAuthHeaders(),
          credentials: "include",
        }),
      ]);

      if (camerasRes.status === "fulfilled" && camerasRes.value.ok) {
        const body = await camerasRes.value.json();
        setCameras(body.data ?? []);
      } else {
        setCameras([]);
      }

      if (alertsRes.status === "fulfilled" && alertsRes.value.ok) {
        const body = await alertsRes.value.json();
        const alerts = Array.isArray(body.data) ? body.data : body.data?.alerts ?? [];
        const livePriorityIds = Array.from(
          new Set<string>(
            alerts
              .filter(
                (alert: any) =>
                  ["critical", "high", "p1", "p2"].includes(String(alert.severity).toLowerCase()) &&
                  alert.status !== "resolved",
              )
              .map((alert: any) => alert.cameraId)
              .filter((id: unknown): id is string => typeof id === "string"),
          ),
        );
        setPriorityCameraIds(livePriorityIds);
      } else {
        setPriorityCameraIds([]);
      }
    } catch (err) {
      console.error("Failed to load video wall data:", err);
      setCameras([]);
      setPriorityCameraIds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Unique branches for filtering
  const branchList = useMemo(() => {
    const branches = new Set<string>();
    for (const cam of cameras) {
      if (cam.branchName) branches.add(cam.branchName);
      else if (cam.branchId) branches.add(cam.branchId);
    }
    return Array.from(branches).sort();
  }, [cameras]);

  // Filtered cameras based on branch and search query
  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      const matchesBranch =
        selectedBranch === "ALL" ||
        cam.branchName === selectedBranch ||
        cam.branchId === selectedBranch;
      const matchesSearch =
        !searchQuery.trim() ||
        cam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (cam.vendor && cam.vendor.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (cam.model && cam.model.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (cam.ipAddress && cam.ipAddress.includes(searchQuery));
      return matchesBranch && matchesSearch;
    });
  }, [cameras, selectedBranch, searchQuery]);

  // Compute adaptive stream metrics for real cameras
  const visibleCameras: LiveCameraState[] = useMemo(() => {
    const subset = filteredCameras.slice(0, gridMode);

    return subset.map((cam) => {
      const isMaximized = maximizedCameraId === cam.id;
      const isHovered = hoveredCameraId === cam.id;
      const isAlarm = priorityCameraIds.includes(cam.id);

      let tier: LiveCameraState["tier"] = "SUBSTREAM";
      let resolution = "640x360";
      let fps = 15;
      let bitrateKbps = 450;

      if (isMaximized) {
        tier = "MAINSTREAM";
        resolution = "1920x1080 (1080p)";
        fps = 30;
        bitrateKbps = 3500;
      } else if (isAlarm) {
        tier = "MAINSTREAM";
        resolution = "1920x1080 (Alarm)";
        fps = 25;
        bitrateKbps = 2800;
      } else if (isHovered) {
        tier = gridMode <= 16 ? "MEDIUM" : "SUBSTREAM";
        resolution = gridMode <= 16 ? "1280x720 (720p)" : "640x360 (360p)";
        fps = 20;
        bitrateKbps = 1200;
      } else if (gridMode === 1) {
        tier = "MAINSTREAM";
        resolution = "1920x1080 (1080p)";
        fps = 30;
        bitrateKbps = 3000;
      } else if (gridMode === 4) {
        tier = "MEDIUM";
        resolution = "1280x720 (720p)";
        fps = 20;
        bitrateKbps = 1200;
      } else if (gridMode === 9 || gridMode === 16) {
        tier = "SUBSTREAM";
        resolution = "640x360 (360p)";
        fps = 15;
        bitrateKbps = 450;
      } else if (gridMode === 64) {
        tier = "LOW_SUBSTREAM";
        resolution = "426x240 (240p)";
        fps = 10;
        bitrateKbps = 200;
      } else if (gridMode === 144) {
        tier = "ULTRA_LOW_THUMBNAIL";
        resolution = "320x180 (180p)";
        fps = 5;
        bitrateKbps = 80;
      }

      return {
        camera: cam,
        session: sessions.get(cam.id),
        tier,
        resolution,
        fps,
        bitrateKbps,
        isAlarm,
      };
    });
  }, [filteredCameras, gridMode, maximizedCameraId, hoveredCameraId, priorityCameraIds, sessions]);

  // Aggregate Bandwidth & Savings
  const totalBitrateKbps = visibleCameras.reduce((acc, c) => acc + c.bitrateKbps, 0);
  const totalBitrateMbps = (totalBitrateKbps / 1000).toFixed(2);
  const unoptimizedBitrateMbps = ((visibleCameras.length * 3000) / 1000).toFixed(1);
  const bandwidthSavedPct =
    Number(unoptimizedBitrateMbps) > 0
      ? Math.max(0, Math.round(((Number(unoptimizedBitrateMbps) - Number(totalBitrateMbps)) / Number(unoptimizedBitrateMbps)) * 100))
      : 0;

  const hwDecodersUsed = Math.min(
    16,
    visibleCameras.filter((c) => c.tier === "MAINSTREAM" || c.tier === "MEDIUM" || c.tier === "SUBSTREAM").length,
  );

  const startLiveStream = useCallback(async (cameraId: string, stream: "main" | "sub" = "sub") => {
    try {
      const session = await startLiveFromBrowser(cameraId, stream);
      setSessions((prev) => new Map(prev).set(cameraId, session));
    } catch (err) {
      console.warn("Could not start stream for camera:", cameraId, err);
    }
  }, []);

  useEffect(() => {
    if (maximizedCameraId) {
      void startLiveStream(maximizedCameraId, "main");
    }
  }, [maximizedCameraId, startLiveStream]);

  if (loading && cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm font-medium">Connecting to live video wall infrastructure...</p>
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center max-w-xl mx-auto my-8 space-y-5">
        <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
          <Camera size={32} />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-100">No Cameras Connected Yet</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            The database is clean and ready. Once you onboard a branch and discover your network cameras, they will automatically appear here in the real-time adaptive video wall.
          </p>
        </div>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/admin/branch-onboarding"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/30 transition-all flex items-center"
          >
            + Onboard Branch & Cameras
          </Link>
          <Link
            href="/admin/database"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-all"
          >
            Database Explorer
          </Link>
        </div>
      </div>
    );
  }

  const maximizedCamera = cameras.find((c) => c.id === maximizedCameraId);

  return (
    <div className="space-y-4">
      {/* Header Controls, Branch Filters & Grid Layout Switcher */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Grid Layout Switcher */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Grid:</span>
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {([1, 4, 9, 16, 64, 144] as GridMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setGridMode(mode);
                    setMaximizedCameraId(null);
                  }}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
                    gridMode === mode && !maximizedCameraId
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  {mode === 1 ? "1" : mode === 4 ? "4 (2x2)" : mode === 9 ? "9 (3x3)" : mode === 16 ? "16 (4x4)" : mode === 64 ? "64 (8x8)" : "144"}
                </button>
              ))}
            </div>
          </div>

          {/* Branch Filter */}
          {branchList.length > 0 && (
            <div className="flex items-center space-x-2">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Branches ({cameras.length})</option>
                {branchList.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search camera or IP..."
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 w-44 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Global Wall Actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => loadData()}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-all"
            title="Refresh Cameras & Feeds"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setAudioMuted((p) => !p)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-all"
            title={audioMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Real-time Bandwidth & Hardware Governor Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
            <span>Adaptive Bandwidth</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold text-slate-100 font-mono">{totalBitrateMbps} Mbps</div>
            {bandwidthSavedPct > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-950 border border-emerald-500/40 text-emerald-300">
                {bandwidthSavedPct}% Saved
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">vs {unoptimizedBitrateMbps} Mbps (1080p mainstream)</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
            <span>HW Decoder Usage</span>
            <Gauge className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold text-slate-100 font-mono">{hwDecodersUsed} / 16</div>
            <span className="text-xs text-cyan-400 font-medium">Active Hardware Slots</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Adaptive substream auto-governance</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
            <span>Active Cameras</span>
            <Camera className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold text-slate-100 font-mono">
              {visibleCameras.length} / {cameras.length}
            </div>
            <span className="text-xs text-indigo-400 font-medium">Displaying on Wall</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{priorityCameraIds.length} prioritized with active alarms</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
            <span>Quality Distribution</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-xs space-y-1 font-mono">
            {maximizedCameraId && <div className="text-emerald-400 font-semibold">1x 1080p (Solo Focused)</div>}
            <div className="text-slate-300">
              {visibleCameras.length - (maximizedCameraId ? 1 : 0)}x{" "}
              {gridMode === 144 ? "180p Keyframes" : gridMode === 64 ? "240p Substream" : gridMode >= 9 ? "360p Substream" : "720p Medium"}
            </div>
          </div>
        </div>
      </div>

      {/* Maximized Solo Inspection Modal/Overlay */}
      {maximizedCameraId && maximizedCamera && (
        <div className="bg-slate-900/95 border-2 border-indigo-500/80 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-3">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <h3 className="font-bold text-slate-100 text-base flex items-center">
                  {maximizedCamera.name}
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-mono">
                    1080p Mainstream • Live
                  </span>
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {maximizedCamera.branchName || "Branch"} • {maximizedCamera.vendor} {maximizedCamera.model} ({maximizedCamera.ipAddress})
                </p>
              </div>
            </div>
            <button
              onClick={() => setMaximizedCameraId(null)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center transition-all"
            >
              <Minimize2 className="w-4 h-4 mr-1.5" />
              Restore to {gridMode} Grid
            </button>
          </div>

          {/* Maximized Video Player */}
          <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
            {sessions.get(maximizedCamera.id)?.hls ? (
              <HlsPlayer
                url={sessions.get(maximizedCamera.id)!.hls.url}
                bearerToken={sessions.get(maximizedCamera.id)!.hls.bearerToken ?? ""}
                cameraName={maximizedCamera.name}
                cameraId={maximizedCamera.id}
                muted={audioMuted}
              />
            ) : (
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-300">
                  <Camera className="w-7 h-7" />
                </div>
                <div className="text-slate-100 font-bold">{maximizedCamera.name}</div>
                <div className="text-xs text-slate-400 font-mono">
                  {maximizedCamera.vendor} • IP: {maximizedCamera.ipAddress || "Connected"} • Channel {maximizedCamera.channel}
                </div>
              </div>
            )}

            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur px-2.5 py-1 rounded text-[11px] font-mono text-emerald-400 border border-emerald-500/30 flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
              LIVE • 1080P MAINSTREAM
            </div>
          </div>
        </div>
      )}

      {/* Main Adaptive Video Grid */}
      {!maximizedCameraId && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>
              Rendering <span className="text-slate-100 font-bold">{visibleCameras.length}</span> Active Cameras
            </span>
            <span>💡 Click any camera tile to maximize to 1080p Mainstream</span>
          </div>

          <div
            className="grid gap-2 transition-all"
            style={{
              gridTemplateColumns:
                gridMode === 1
                  ? "repeat(1, minmax(0, 1fr))"
                  : gridMode === 4
                  ? "repeat(2, minmax(0, 1fr))"
                  : gridMode === 9
                  ? "repeat(3, minmax(0, 1fr))"
                  : gridMode === 16
                  ? "repeat(4, minmax(0, 1fr))"
                  : gridMode === 64
                  ? "repeat(8, minmax(0, 1fr))"
                  : "repeat(12, minmax(0, 1fr))",
            }}
          >
            {visibleCameras.map(({ camera, session, tier, resolution, fps, bitrateKbps, isAlarm }) => {
              const isHovered = hoveredCameraId === camera.id;

              return (
                <div
                  key={camera.id}
                  onClick={() => setMaximizedCameraId(camera.id)}
                  onMouseEnter={() => setHoveredCameraId(camera.id)}
                  onMouseLeave={() => setHoveredCameraId(null)}
                  className={`group relative aspect-video rounded-lg overflow-hidden border cursor-pointer transition-all bg-slate-950 ${
                    isAlarm
                      ? "border-rose-500 shadow-rose-900/50 shadow-md ring-2 ring-rose-500 animate-pulse"
                      : isHovered
                      ? "border-indigo-400 ring-1 ring-indigo-400 scale-[1.02] z-20"
                      : "border-slate-800 hover:border-slate-600"
                  }`}
                >
                  {session?.hls ? (
                    <HlsPlayer
                      url={session.hls.url}
                      bearerToken={session.hls.bearerToken ?? ""}
                      cameraName={camera.name}
                      cameraId={camera.id}
                      muted={audioMuted}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-2 text-center">
                      <Camera className="w-6 h-6 text-slate-500 mb-1" />
                      <span className="text-[11px] font-bold text-slate-200 truncate max-w-[90%]">{camera.name}</span>
                      <span className="text-[9px] text-slate-400 font-mono truncate max-w-[90%]">
                        {camera.ipAddress || camera.model || "Connected"}
                      </span>
                    </div>
                  )}

                  {/* Tile Header Overlay */}
                  <div className="absolute top-1 left-1.5 right-1.5 flex items-center justify-between text-[10px] font-mono text-slate-200 z-10 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded">
                    <div className="flex items-center space-x-1 truncate max-w-[75%]">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          camera.status === "offline" ? "bg-slate-500" : isAlarm ? "bg-rose-400 animate-ping" : "bg-emerald-400"
                        }`}
                      />
                      <span className="font-bold truncate">{camera.name}</span>
                    </div>

                    {gridMode <= 16 && (
                      <span className="text-[9px] text-slate-300 opacity-90">{fps}fps</span>
                    )}
                  </div>

                  {/* Tile Footer Badge */}
                  <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between text-[9px] font-mono z-10">
                    <span
                      className={`px-1 rounded text-[8px] font-medium ${
                        isAlarm
                          ? "bg-rose-950 text-rose-300 border border-rose-500/40 font-bold"
                          : tier === "MAINSTREAM"
                          ? "bg-emerald-950 text-emerald-300"
                          : tier === "MEDIUM"
                          ? "bg-cyan-950 text-cyan-300"
                          : tier === "SUBSTREAM"
                          ? "bg-slate-900 text-slate-300"
                          : "bg-slate-950/80 text-slate-400"
                      }`}
                    >
                      {gridMode >= 64 ? `${fps}fps` : resolution.split(" ")[0]}
                    </span>

                    {gridMode <= 16 && (
                      <span className="text-slate-400 bg-black/60 px-1 rounded text-[8px]">{bitrateKbps}kbps</span>
                    )}
                  </div>

                  {/* Hover Maximize Overlay Icon */}
                  <div className="absolute inset-0 bg-indigo-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-20">
                    <Maximize2 className="w-5 h-5 text-white drop-shadow-md" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
