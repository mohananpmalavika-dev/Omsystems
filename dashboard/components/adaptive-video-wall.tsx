"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Grid,
  Maximize2,
  Minimize2,
  Activity,
  Cpu,
  Layers,
  Sparkles,
  RefreshCw,
  BellRing,
  Volume2,
  VolumeX,
  Gauge,
  Sliders,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

type GridMode = 1 | 4 | 16 | 64 | 144;

interface CameraTile {
  id: string;
  name: string;
  branch: string;
  tier: "MAINSTREAM" | "MEDIUM" | "SUBSTREAM" | "LOW_SUBSTREAM" | "ULTRA_LOW_THUMBNAIL";
  resolution: string;
  fps: number;
  bitrateKbps: number;
  isAlarm: boolean;
  colorHex: string;
}

export function AdaptiveVideoWall() {
  const [gridMode, setGridMode] = useState<GridMode>(16);
  const [maximizedCameraId, setMaximizedCameraId] = useState<string | null>(null);
  const [hoveredCameraId, setHoveredCameraId] = useState<string | null>(null);
  const [alarmCameraId, setAlarmCameraId] = useState<string | null>("CAM-042");
  const [audioMuted, setAudioMuted] = useState(true);
  const [clientCpuThrottling, setClientCpuThrottling] = useState(false);

  // Generate 144 camera dataset
  const allCameras = useMemo(() => {
    const branches = ["Mumbai Main", "Bandra West", "Andheri Hub", "BKC Corporate", "Bengaluru MG Rd", "Indiranagar", "Koramangala", "Chennai Central"];
    const hues = [210, 260, 280, 160, 330, 35, 190, 120];

    return Array.from({ length: 144 }, (_, i) => {
      const idNum = (i + 1).toString().padStart(3, "0");
      const branchIdx = i % branches.length;
      return {
        id: `CAM-${idNum}`,
        name: `Camera ${idNum} - Area ${(i % 6) + 1}`,
        branch: branches[branchIdx]!,
        colorHex: `hsl(${hues[branchIdx]}, 60%, 18%)`,
      };
    });
  }, []);

  // Compute adaptive tier for each camera based on user interaction & grid density
  const visibleCameras: CameraTile[] = useMemo(() => {
    const subset = allCameras.slice(0, gridMode);

    return subset.map((cam) => {
      const isMaximized = maximizedCameraId === cam.id;
      const isHovered = hoveredCameraId === cam.id;
      const isAlarm = alarmCameraId === cam.id;

      let tier: CameraTile["tier"] = "SUBSTREAM";
      let resolution = "640x360";
      let fps = 15;
      let bitrateKbps = 500;

      if (isMaximized) {
        tier = "MAINSTREAM";
        resolution = "1920x1080 (1080p)";
        fps = 30;
        bitrateKbps = 3500;
      } else if (isAlarm) {
        tier = "MAINSTREAM";
        resolution = "1920x1080 (P1 Alarm)";
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
      } else if (gridMode === 16) {
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
        resolution = "320x180 (180p Keyframes)";
        fps = 3;
        bitrateKbps = 70;
      }

      // Throttling applied
      if (clientCpuThrottling && !isMaximized && !isAlarm) {
        if (tier === "SUBSTREAM") {
          tier = "LOW_SUBSTREAM";
          resolution = "426x240 (Throttled)";
          fps = 10;
          bitrateKbps = 200;
        } else if (tier === "LOW_SUBSTREAM") {
          tier = "ULTRA_LOW_THUMBNAIL";
          resolution = "320x180 (Throttled)";
          fps = 2;
          bitrateKbps = 50;
        }
      }

      return {
        ...cam,
        tier,
        resolution,
        fps,
        bitrateKbps,
        isAlarm,
      };
    });
  }, [allCameras, gridMode, maximizedCameraId, hoveredCameraId, alarmCameraId, clientCpuThrottling]);

  // Aggregate Bandwidth & Savings
  const totalBitrateKbps = visibleCameras.reduce((acc, c) => acc + c.bitrateKbps, 0);
  const totalBitrateMbps = (totalBitrateKbps / 1000).toFixed(2);
  const unoptimizedBitrateMbps = ((gridMode * 3000) / 1000).toFixed(1);
  const bandwidthSavedPct = Math.round(
    ((Number(unoptimizedBitrateMbps) - Number(totalBitrateMbps)) / Number(unoptimizedBitrateMbps)) * 100,
  );

  const hwDecodersUsed = Math.min(
    16,
    visibleCameras.filter((c) => c.tier === "MAINSTREAM" || c.tier === "MEDIUM" || c.tier === "SUBSTREAM").length,
  );

  const toggleAlarm = () => {
    setAlarmCameraId((prev) => (prev ? null : "CAM-042"));
  };

  return (
    <div className="space-y-5">
      {/* Header Controls & Layout Switcher */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Grid Layout:</span>
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {([1, 4, 16, 64, 144] as GridMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setGridMode(mode);
                  setMaximizedCameraId(null);
                }}
                className={`px-3 py-1 text-xs font-mono font-medium rounded transition-all ${
                  gridMode === mode && !maximizedCameraId
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                {mode === 1 ? "1 (Solo)" : mode === 4 ? "4 (2x2)" : mode === 16 ? "16 (4x4)" : mode === 64 ? "64 (8x8)" : "144 (12x12)"}
              </button>
            ))}
          </div>
        </div>

        {/* Action Toggles */}
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleAlarm}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center transition-all ${
              alarmCameraId
                ? "bg-rose-950/80 border-rose-500/50 text-rose-300 shadow-rose-950/50 shadow"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            <BellRing className={`w-3.5 h-3.5 mr-1.5 ${alarmCameraId ? "text-rose-400 animate-bounce" : ""}`} />
            {alarmCameraId ? "P1 Alarm Active on CAM-042" : "Trigger P1 Alarm"}
          </button>

          <button
            onClick={() => setClientCpuThrottling((p) => !p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center transition-all ${
              clientCpuThrottling
                ? "bg-amber-950/80 border-amber-500/50 text-amber-300"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            {clientCpuThrottling ? "CPU Governor: Throttling (>80%)" : "Simulate High CPU"}
          </button>

          <button
            onClick={() => setAudioMuted((p) => !p)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300"
            title={audioMuted ? "Unmute Alarm Audio" : "Mute Alarm Audio"}
          >
            {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Real-time Bandwidth & Hardware Governor Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
            <span>Adaptive Bandwidth</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold text-slate-100 font-mono">{totalBitrateMbps} Mbps</div>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-950 border border-emerald-500/40 text-emerald-300">
              {bandwidthSavedPct}% Saved
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">vs {unoptimizedBitrateMbps} Mbps (1080p unoptimized)</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
            <span>HW Decoder Slots</span>
            <Gauge className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold text-slate-100 font-mono">{hwDecodersUsed} / 16</div>
            <span className="text-xs text-cyan-400 font-medium">Safe Hardware Limit</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Background tiles use animated keyframes</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
            <span>Client CPU Load</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold text-slate-100 font-mono">
              {clientCpuThrottling ? "84%" : gridMode === 144 ? "38%" : gridMode === 64 ? "29%" : "18%"}
            </div>
            <span className="text-xs text-indigo-400 font-medium">Smooth 60fps UI</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Zero browser freezing on 144 feeds</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
            <span>Active Quality Tiers</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-xs space-y-1 font-mono">
            {maximizedCameraId && <div className="text-emerald-400 font-semibold">1x 1080p Mainstream (Maximized)</div>}
            {alarmCameraId && !maximizedCameraId && <div className="text-rose-400 font-semibold">1x 1080p (P1 Alarm)</div>}
            <div className="text-slate-300">
              {visibleCameras.length - (maximizedCameraId ? 1 : 0) - (alarmCameraId && !maximizedCameraId ? 1 : 0)}x{" "}
              {gridMode === 144 ? "180p Keyframes" : gridMode === 64 ? "240p Substream" : gridMode === 16 ? "360p Substream" : "720p Medium"}
            </div>
          </div>
        </div>
      </div>

      {/* Maximized Solo Inspection Modal/Overlay */}
      {maximizedCameraId && (
        <div className="bg-slate-900/95 border-2 border-indigo-500/80 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-3">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
              <div>
                <h3 className="font-bold text-slate-100 text-base flex items-center">
                  {maximizedCameraId} — High-Bitrate Main Stream
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-mono">
                    1080p @ 30fps • 3.5 Mbps
                  </span>
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Promoted automatically from {gridMode === 144 ? "180p Keyframe" : "Substream"} upon operator maximize
                </p>
              </div>
            </div>
            <button
              onClick={() => setMaximizedCameraId(null)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center"
            >
              <Minimize2 className="w-4 h-4 mr-1.5" />
              Restore to {gridMode} Grid
            </button>
          </div>

          {/* Simulated 1080p Video Canvas */}
          <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-slate-950 to-slate-900" />
            <div className="text-center relative z-10 space-y-2">
              <div className="w-16 h-16 rounded-full bg-indigo-600/20 border border-indigo-500/50 flex items-center justify-center mx-auto text-indigo-400">
                <Sparkles className="w-8 h-8 animate-pulse" />
              </div>
              <div className="text-slate-100 font-bold text-lg">{maximizedCameraId} Live Ingest</div>
              <div className="text-xs text-slate-400 font-mono">H.264 WebRTC Stream • Latency 180ms • 1920x1080 Resolution</div>
            </div>

            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur px-2.5 py-1 rounded text-[11px] font-mono text-emerald-400 border border-emerald-500/30 flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
              LIVE • 30 FPS • 3500 KBPS
            </div>
          </div>
        </div>
      )}

      {/* Main Adaptive Video Grid (1 to 144 Tiles) */}
      {!maximizedCameraId && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>
              Rendering <span className="text-slate-100 font-bold">{visibleCameras.length}</span> Adaptive Stream Tiles
            </span>
            <span>💡 Click any camera tile to instant-maximize to 1080p Mainstream</span>
          </div>

          <div
            className="grid gap-1.5 transition-all"
            style={{
              gridTemplateColumns:
                gridMode === 1
                  ? "repeat(1, minmax(0, 1fr))"
                  : gridMode === 4
                  ? "repeat(2, minmax(0, 1fr))"
                  : gridMode === 16
                  ? "repeat(4, minmax(0, 1fr))"
                  : gridMode === 64
                  ? "repeat(8, minmax(0, 1fr))"
                  : "repeat(12, minmax(0, 1fr))",
            }}
          >
            {visibleCameras.map((cam) => {
              const isAlarm = cam.isAlarm;
              const isHovered = hoveredCameraId === cam.id;

              return (
                <div
                  key={cam.id}
                  onClick={() => setMaximizedCameraId(cam.id)}
                  onMouseEnter={() => setHoveredCameraId(cam.id)}
                  onMouseLeave={() => setHoveredCameraId(null)}
                  style={{ backgroundColor: cam.colorHex }}
                  className={`group relative aspect-video rounded-lg overflow-hidden border cursor-pointer transition-all ${
                    isAlarm
                      ? "border-rose-500 shadow-rose-900/50 shadow-md ring-2 ring-rose-500 animate-pulse"
                      : isHovered
                      ? "border-indigo-400 ring-1 ring-indigo-400 scale-[1.03] z-20"
                      : "border-slate-800 hover:border-slate-600"
                  }`}
                >
                  {/* Subtle video background overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50" />

                  {/* Tile Header */}
                  <div className="absolute top-1 left-1.5 right-1.5 flex items-center justify-between text-[10px] font-mono text-slate-200">
                    <div className="flex items-center space-x-1 truncate max-w-[80%]">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isAlarm ? "bg-rose-400 animate-ping" : "bg-emerald-400"
                        }`}
                      />
                      <span className="font-bold truncate">{cam.id}</span>
                    </div>

                    {gridMode <= 16 && (
                      <span className="text-[9px] text-slate-400 opacity-80">{cam.fps}fps</span>
                    )}
                  </div>

                  {/* Tile Center Label (for 144 dense grid) */}
                  {gridMode >= 64 && (
                    <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold font-mono text-slate-300/80 group-hover:text-white">
                      {cam.id}
                    </div>
                  )}

                  {/* Tile Footer Badge */}
                  <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between text-[9px] font-mono">
                    <span
                      className={`px-1 rounded text-[8px] font-medium ${
                        isAlarm
                          ? "bg-rose-950 text-rose-300 border border-rose-500/40 font-bold"
                          : cam.tier === "MAINSTREAM"
                          ? "bg-emerald-950 text-emerald-300"
                          : cam.tier === "MEDIUM"
                          ? "bg-cyan-950 text-cyan-300"
                          : cam.tier === "SUBSTREAM"
                          ? "bg-slate-900 text-slate-300"
                          : "bg-slate-950/80 text-slate-400"
                      }`}
                    >
                      {gridMode >= 64 ? `${cam.fps}fps` : cam.resolution.split(" ")[0]}
                    </span>

                    {gridMode <= 16 && (
                      <span className="text-slate-400 text-[8px]">{cam.bitrateKbps}kbps</span>
                    )}
                  </div>

                  {/* Hover Maximize Overlay Icon */}
                  <div className="absolute inset-0 bg-indigo-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Maximize2 className="w-4 h-4 text-white drop-shadow" />
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

async function fetchBranchCameras(branches: BranchSummary[], signal?: AbortSignal) {
  const results: CameraRecord[][] = [];
  let nextIndex = 0;
  let failedBranches = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      const branch = branches[index];
      if (!branch) return;
      try {
        const response = await fetch(`/api/branches/${encodeURIComponent(branch.id)}/cameras`, {
          headers: browserAuthHeaders(),
          credentials: "include",
          cache: "no-store",
          signal,
        });
        const body = await readJson(response);
        if (!response.ok) throw new Error(getErrorMessage(body, "Camera request failed"));
        results[index] = Array.isArray(body.data) ? body.data as CameraRecord[] : [];
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
        failedBranches += 1;
        results[index] = [];
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CAMERA_REQUEST_CONCURRENCY, branches.length) }, () => worker()));
  return { results, failedBranches };
}

async function readJson(response: Response): Promise<{ data?: unknown; error?: unknown; message?: unknown }> {
  return await response.json().catch(() => ({}));
}

function getErrorMessage(body: { error?: unknown; message?: unknown }, fallback: string) {
  return typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : fallback;
}

function browserAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("accessToken");
  return token
    ? { "x-sentinel-session": token, authorization: `Bearer ${token}` }
    : {};
}
