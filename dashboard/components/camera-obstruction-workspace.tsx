"use client";

import { useState, useEffect, useCallback, useId } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Maximize2,
  Minimize2,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  Sliders,
  Camera,
  Activity,
  ChevronRight,
  Play,
  FileSearch,
  Sparkles,
  Gauge,
  Layers,
  ArrowUpRight,
  Grid,
} from "lucide-react";
import {
  cameraObstructionApi,
  type CameraObstructionEvent,
  type CameraObstructionStats,
  type CameraObstructionBaseline,
  type CameraObstructionConfig,
  type CameraObstructionMetrics,
  type CameraObstructionTileMetric,
} from "@/lib/api-client";

export function CameraObstructionWorkspace({ cameraId }: { cameraId?: string }) {
  const [selectedCameraId, setSelectedCameraId] = useState<string>(cameraId || "cam-branch-01-main");
  const [events, setEvents] = useState<CameraObstructionEvent[]>([]);
  const [stats, setStats] = useState<CameraObstructionStats | null>(null);
  const [baseline, setBaseline] = useState<CameraObstructionBaseline | null>(null);
  const [config, setConfig] = useState<CameraObstructionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CameraObstructionEvent | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [obstructionTypeFilter, setObstructionTypeFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [recalibrating, setRecalibrating] = useState(false);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [testPattern, setTestPattern] = useState<"sharp" | "dark" | "covering" | "partial" | "flatline" | "ir_night">("sharp");
  const [selectedTile, setSelectedTile] = useState<CameraObstructionTileMetric | null>(null);

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, statsRes, baselineRes, configRes] = await Promise.allSettled([
        cameraObstructionApi.listEvents({
          cameraId: selectedCameraId || undefined,
          status: statusFilter !== "ALL" ? statusFilter : undefined,
          obstructionType: obstructionTypeFilter !== "ALL" ? obstructionTypeFilter : undefined,
          severity: severityFilter !== "ALL" ? severityFilter : undefined,
          limit: 50,
        }),
        cameraObstructionApi.getStats(selectedCameraId || undefined),
        cameraObstructionApi.getBaseline(selectedCameraId),
        cameraObstructionApi.getConfig(selectedCameraId),
      ]);

      if (eventsRes.status === "fulfilled" && eventsRes.value.success) {
        setEvents(eventsRes.value.data);
      }
      if (statsRes.status === "fulfilled" && statsRes.value.success) {
        setStats(statsRes.value.data);
      }
      if (baselineRes.status === "fulfilled" && baselineRes.value.success) {
        setBaseline(baselineRes.value.data);
      } else {
        setBaseline(null);
      }
      if (configRes.status === "fulfilled" && configRes.value.success) {
        setConfig(configRes.value.data);
      }
    } catch (err) {
      console.error("Failed to load obstruction data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCameraId, statusFilter, obstructionTypeFilter, severityFilter]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Recalibrate Baseline
  const handleRecalibrate = async () => {
    setRecalibrating(true);
    try {
      const res = await cameraObstructionApi.recalibrateBaseline(selectedCameraId);
      if (res.success) {
        setBaseline(res.data);
      }
    } catch (err) {
      console.error("Failed to recalibrate baseline:", err);
    } finally {
      setRecalibrating(false);
    }
  };

  // Generate Synthetic Test Frames
  const generateFrame = (pattern: "sharp" | "dark" | "covering" | "partial" | "flatline" | "ir_night") => {
    const width = 64;
    const height = 36;
    const pixels = width * height;
    const buf = new Uint8Array(pixels * 3);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        let r = 0, g = 0, b = 0;

        if (pattern === "sharp") {
          // Healthy normal scene with texture and contrast
          const v = ((x % 8 < 4 ? 160 : 60) + (y % 6 < 3 ? 40 : 0));
          r = Math.min(255, v + 10);
          g = Math.min(255, v);
          b = Math.min(255, v - 10);
        } else if (pattern === "dark") {
          // Total optical blackout (dark frame)
          r = 2; g = 3; b = 2;
        } else if (pattern === "covering") {
          // Lens completely covered by cloth/tape
          const val = 12 + ((x + y) % 3);
          r = val; g = val; b = val;
        } else if (pattern === "partial") {
          // Partial tape covering top-left quadrant
          if (x < width / 2 && y < height / 2) {
            r = 10; g = 10; b = 10;
          } else {
            const v = (x % 6 < 3 ? 150 : 70);
            r = v; g = v; b = v;
          }
        } else if (pattern === "flatline") {
          // Dead sensor / frozen flat grey test frame
          r = 128; g = 128; b = 128;
        } else if (pattern === "ir_night") {
          // Night scene with active IR illumination (edges exist!)
          const v = (x % 10 < 5 ? 35 : 12);
          r = v; g = v; b = v;
        }

        buf[idx] = r;
        buf[idx + 1] = g;
        buf[idx + 2] = b;
      }
    }

    let binary = "";
    const len = buf.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buf[i]!);
    }
    return btoa(binary);
  };

  // Run Simulated Frame Analysis
  const handleAnalyzeFrame = async () => {
    setRunningAnalysis(true);
    try {
      const base64 = generateFrame(testPattern);
      const res = await cameraObstructionApi.analyzeFrame({
        cameraId: selectedCameraId,
        frameBase64: base64,
        width: 64,
        height: 36,
        channels: 3,
        bypassDebounce: true,
      });

      if (res.success) {
        setAnalysisResult(res.data);
        if (res.data.evaluation?.metrics?.tileAnalysis?.tiles?.length > 0) {
          setSelectedTile(res.data.evaluation.metrics.tileAnalysis.tiles[0]);
        }
        await loadData();
      }
    } catch (err) {
      console.error("Frame analysis failed:", err);
    } finally {
      setRunningAnalysis(false);
    }
  };

  // Update Event Status
  const handleUpdateStatus = async (
    eventId: string,
    newStatus: "acknowledged" | "resolved" | "false_positive"
  ) => {
    setSubmittingReview(true);
    try {
      const res = await cameraObstructionApi.updateEventStatus(eventId, newStatus, reviewNotes || undefined);
      if (res.success) {
        setSelectedEvent(null);
        setReviewNotes("");
        await loadData();
      }
    } catch (err) {
      console.error("Failed to update event status:", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Save Configuration
  const handleSaveConfig = async () => {
    if (!config) return;
    setSavingConfig(true);
    try {
      const res = await cameraObstructionApi.updateConfig(selectedCameraId, config);
      if (res.success) {
        setConfig(res.data);
        setConfigModalOpen(false);
      }
    } catch (err) {
      console.error("Failed to update config:", err);
    } finally {
      setSavingConfig(false);
    }
  };

  // Format Helper
  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "P1":
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-rose-950/80 text-rose-300 border border-rose-800/80">P1 CRITICAL</span>;
      case "P2":
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-950/80 text-amber-300 border border-amber-800/80">P2 HIGH</span>;
      case "P3":
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-950/80 text-yellow-300 border border-yellow-800/80">P3 MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-zinc-800 text-zinc-300">P4 LOW</span>;
    }
  };

  const getObstructionTypeBadge = (type: string) => {
    switch (type) {
      case "dark_frame":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-purple-950/60 text-purple-300 border border-purple-800/60"><Moon className="w-3 h-3 text-purple-400" /> Dark Blackout</span>;
      case "lens_covering":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-rose-950/60 text-rose-300 border border-rose-800/60"><EyeOff className="w-3 h-3 text-rose-400" /> Lens Covered</span>;
      case "variance_loss":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-orange-950/60 text-orange-300 border border-orange-800/60"><Activity className="w-3 h-3 text-orange-400" /> Variance Loss</span>;
      case "partial_obstruction":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-amber-950/60 text-amber-300 border border-amber-800/60"><Grid className="w-3 h-3 text-amber-400" /> Partial Block</span>;
      case "glare_whiteout":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-yellow-950/60 text-yellow-300 border border-yellow-800/60"><Sun className="w-3 h-3 text-yellow-400" /> Optical Glare</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-medium rounded-md bg-zinc-800 text-zinc-400">{type}</span>;
    }
  };

  // Active tiles from current analysis or selected event
  const activeTiles: CameraObstructionTileMetric[] =
    analysisResult?.evaluation?.metrics?.tileAnalysis?.tiles ||
    selectedEvent?.tile_analysis?.tiles ||
    [];

  return (
    <div className="space-y-6">
      {/* Top Banner & Camera Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl border border-zinc-800 bg-zinc-950/70 backdrop-blur-md shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
              Camera Obstruction & Dark Frame Detection
            </h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              PRODUCTION
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            Heuristic detection of lens covering, darkness/blackout, and loss of visual variance with multi-tile grid analysis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800">
            <Camera className="w-4 h-4 text-zinc-400" />
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="bg-transparent text-sm text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="cam-branch-01-main">cam-branch-01-main (Banking Hall)</option>
              <option value="cam-branch-01-vault">cam-branch-01-vault (Gold Vault)</option>
              <option value="cam-branch-01-atm">cam-branch-01-atm (ATM Lobby)</option>
              <option value="cam-branch-01-entry">cam-branch-01-entry (Main Entrance)</option>
            </select>
          </div>

          <button
            onClick={handleRecalibrate}
            disabled={recalibrating}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-750 transition-all disabled:opacity-50"
            title="Recalibrate optical baseline"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${recalibrating ? "animate-spin" : ""}`} />
            {recalibrating ? "Recalibrating..." : "Recalibrate Baseline"}
          </button>

          <button
            onClick={() => setConfigModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-750 transition-all"
          >
            <Sliders className="w-3.5 h-3.5 text-zinc-400" />
            Sensitivity Config
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-zinc-200" : ""}`} />
          </button>
        </div>
      </div>

      {/* Fleet KPI Metric Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Total Events</span>
            <Layers className="w-3.5 h-3.5 text-zinc-500" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">{stats?.totalEvents ?? 0}</div>
          <div className="text-[11px] text-zinc-500 mt-1">All historical anomalies</div>
        </div>

        <div className="p-4 rounded-xl border border-rose-900/40 bg-rose-950/10 backdrop-blur">
          <div className="flex items-center justify-between text-xs text-rose-400/90 mb-1">
            <span>Active Obstructions</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-300">{stats?.activeEvents ?? 0}</div>
          <div className="text-[11px] text-rose-400/70 mt-1">{stats?.p1Count ?? 0} P1 Critical incidents</div>
        </div>

        <div className="p-4 rounded-xl border border-purple-900/40 bg-purple-950/10 backdrop-blur">
          <div className="flex items-center justify-between text-xs text-purple-400/90 mb-1">
            <span>Dark Frames</span>
            <Moon className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-300">{stats?.darkFrameCount ?? 0}</div>
          <div className="text-[11px] text-purple-400/70 mt-1">Optical blackouts</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Lens Coverings</span>
            <EyeOff className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">{stats?.lensCoveringCount ?? 0}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Cloth / tape occlusions</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Variance Loss</span>
            <Activity className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">{stats?.varianceLossCount ?? 0}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Dead sensor flatlines</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Optical Fleet Health</span>
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {stats && stats.camerasMonitored > 0
              ? `${Math.max(0, Math.round(((stats.camerasMonitored - stats.camerasAtRisk) / stats.camerasMonitored) * 100))}%`
              : "100%"}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">{stats?.camerasAtRisk ?? 0} cameras at risk</div>
        </div>
      </div>

      {/* Main Diagnostic Grid: Spatial Tile Heatmap & Interactive Heuristic Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Multi-Tile Spatial Heatmap Visualizer (7 cols) */}
        <div className="lg:col-span-7 rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-rose-400" />
              <h2 className="text-sm font-semibold text-zinc-200">
                Spatial 4×4 Grid Tile Heatmap
              </h2>
            </div>
            <span className="text-xs text-zinc-400">
              {activeTiles.length > 0 ? "Live frame decomposition (16 tiles)" : "Select an event or run diagnostic"}
            </span>
          </div>

          {/* 4x4 Grid Heatmap Rendering */}
          <div className="relative aspect-video w-full rounded-lg bg-zinc-900/80 border border-zinc-800 overflow-hidden flex flex-col justify-center p-3">
            {activeTiles.length === 16 ? (
              <div className="grid grid-cols-4 grid-rows-4 gap-1.5 w-full h-full">
                {activeTiles.map((tile) => (
                  <button
                    key={`${tile.row}-${tile.col}`}
                    onClick={() => setSelectedTile(tile)}
                    className={`relative rounded border p-2 flex flex-col justify-between text-left transition-all ${
                      tile.isObstructed
                        ? "bg-rose-950/60 border-rose-600/80 text-rose-200 shadow-[0_0_12px_rgba(225,29,72,0.25)]"
                        : tile.variance < 18
                        ? "bg-amber-950/40 border-amber-600/60 text-amber-200"
                        : "bg-emerald-950/20 border-emerald-700/40 text-emerald-200 hover:bg-emerald-950/40"
                    } ${selectedTile?.row === tile.row && selectedTile?.col === tile.col ? "ring-2 ring-white" : ""}`}
                  >
                    <div className="flex items-center justify-between text-[10px] opacity-80">
                      <span>[{tile.row},{tile.col}]</span>
                      {tile.isObstructed && <EyeOff className="w-3 h-3 text-rose-400" />}
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs font-mono font-bold">
                        Var: {tile.variance.toFixed(0)}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        Lum: {tile.luminance.toFixed(0)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2">
                <Grid className="w-8 h-8 text-zinc-600" />
                <p className="text-xs">No active tile metrics loaded.</p>
                <p className="text-[11px] text-zinc-600">Run the interactive frame simulator or click an incident from the audit log below.</p>
              </div>
            )}
          </div>

          {/* Selected Tile Inspector */}
          {selectedTile && (
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-zinc-200">
                  Tile [{selectedTile.row}, {selectedTile.col}]
                </span>
                <span className="text-zinc-400">
                  Mean Lum: <span className="text-zinc-200 font-mono">{selectedTile.luminance}</span>
                </span>
                <span className="text-zinc-400">
                  Variance: <span className="text-zinc-200 font-mono">{selectedTile.variance}</span>
                </span>
                <span className="text-zinc-400">
                  Edge Score: <span className="text-zinc-200 font-mono">{selectedTile.edgeScore}</span>
                </span>
              </div>
              <div>
                {selectedTile.isObstructed ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                    OBSTRUCTED ({selectedTile.obstructionReason || "variance_loss"})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
                    NORMAL
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Interactive Heuristic Frame Simulator & Live Verdict (5 cols) */}
        <div className="lg:col-span-5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-zinc-200">
                  Interactive Frame Simulator
                </h2>
              </div>
              <span className="text-[11px] text-zinc-400">Edge & Backend Test Tool</span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Inject synthetic video frames directly into the heuristic analyzer to verify mathematical response and false-alarm suppression under real camera conditions.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">Select Test Frame Signature:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTestPattern("sharp")}
                  className={`p-2 rounded-lg border text-left text-xs transition-all ${
                    testPattern === "sharp"
                      ? "bg-emerald-950/50 border-emerald-500 text-emerald-200"
                      : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850"
                  }`}
                >
                  <div className="font-semibold">Sharp Office Scene</div>
                  <div className="text-[10px] text-zinc-400">Normal healthy video</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTestPattern("dark")}
                  className={`p-2 rounded-lg border text-left text-xs transition-all ${
                    testPattern === "dark"
                      ? "bg-purple-950/50 border-purple-500 text-purple-200"
                      : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850"
                  }`}
                >
                  <div className="font-semibold">Dark Frame Blackout</div>
                  <div className="text-[10px] text-zinc-400">Luma ~3, power cutoff</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTestPattern("covering")}
                  className={`p-2 rounded-lg border text-left text-xs transition-all ${
                    testPattern === "covering"
                      ? "bg-rose-950/50 border-rose-500 text-rose-200"
                      : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850"
                  }`}
                >
                  <div className="font-semibold">Full Lens Covering</div>
                  <div className="text-[10px] text-zinc-400">Cloth / tape / hand</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTestPattern("partial")}
                  className={`p-2 rounded-lg border text-left text-xs transition-all ${
                    testPattern === "partial"
                      ? "bg-amber-950/50 border-amber-500 text-amber-200"
                      : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850"
                  }`}
                >
                  <div className="font-semibold">Partial Obstruction</div>
                  <div className="text-[10px] text-zinc-400">Corner tape block</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTestPattern("flatline")}
                  className={`p-2 rounded-lg border text-left text-xs transition-all ${
                    testPattern === "flatline"
                      ? "bg-orange-950/50 border-orange-500 text-orange-200"
                      : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850"
                  }`}
                >
                  <div className="font-semibold">Dead Sensor Flatline</div>
                  <div className="text-[10px] text-zinc-400">Zero variance gray screen</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTestPattern("ir_night")}
                  className={`p-2 rounded-lg border text-left text-xs transition-all ${
                    testPattern === "ir_night"
                      ? "bg-cyan-950/50 border-cyan-500 text-cyan-200"
                      : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850"
                  }`}
                >
                  <div className="font-semibold">IR Night Scene</div>
                  <div className="text-[10px] text-zinc-400">Low luma, high edge contrast</div>
                </button>
              </div>
            </div>

            <button
              onClick={handleAnalyzeFrame}
              disabled={runningAnalysis}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-lg shadow-rose-950/50 disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${runningAnalysis ? "animate-spin" : ""}`} />
              {runningAnalysis ? "Analyzing Mathematical Frame..." : "Execute Real-Time Analysis"}
            </button>
          </div>

          {/* Analysis Result Output Card */}
          {analysisResult && (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Diagnostic Verdict:</span>
                {analysisResult.evaluation?.isObstructed ? (
                  getObstructionTypeBadge(analysisResult.evaluation.obstructionType)
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Healthy Normal Frame
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 border-t border-zinc-800">
                <div className="text-zinc-400">
                  Luminance: <span className="text-zinc-200 font-bold">{analysisResult.evaluation?.metrics?.luminance}</span>
                </div>
                <div className="text-zinc-400">
                  Variance: <span className="text-zinc-200 font-bold">{analysisResult.evaluation?.metrics?.variance}</span>
                </div>
                <div className="text-zinc-400">
                  Obstruction %: <span className="text-zinc-200 font-bold">{analysisResult.evaluation?.metrics?.obstructionPercent}%</span>
                </div>
                <div className="text-zinc-400">
                  Confidence: <span className="text-zinc-200 font-bold">{Math.round((analysisResult.evaluation?.confidence ?? 0) * 100)}%</span>
                </div>
              </div>

              {analysisResult.evaluation?.reasons?.length > 0 && (
                <div className="text-[11px] text-zinc-400 italic bg-zinc-950/60 p-2 rounded border border-zinc-800/80">
                  {analysisResult.evaluation.reasons[0]}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Historical Incidents & Audit Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-200">
              Camera Obstruction Security Incident Log
            </h2>
            <span className="text-xs text-zinc-500">({events.length} records)</span>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800 text-xs">
              <Filter className="w-3 h-3 text-zinc-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-zinc-300 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="detected">Active (Detected)</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
                <option value="false_positive">False Positive</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800 text-xs">
              <select
                value={obstructionTypeFilter}
                onChange={(e) => setObstructionTypeFilter(e.target.value)}
                className="bg-transparent text-zinc-300 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Types</option>
                <option value="dark_frame">Dark Blackout</option>
                <option value="lens_covering">Lens Covered</option>
                <option value="variance_loss">Variance Loss</option>
                <option value="partial_obstruction">Partial Block</option>
                <option value="glare_whiteout">Optical Glare</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800 text-xs">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-transparent text-zinc-300 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Severities</option>
                <option value="P1">P1 Critical</option>
                <option value="P2">P2 High</option>
                <option value="P3">P3 Medium</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[11px] text-zinc-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Detected At</th>
                <th className="py-2.5 px-3">Camera</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Obstruction %</th>
                <th className="py-2.5 px-3">Confidence</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850 text-xs text-zinc-300">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500">
                    No camera obstruction events found matching the filters.
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr
                    key={evt.id}
                    className="hover:bg-zinc-900/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedEvent(evt);
                      if (evt.tile_analysis?.tiles?.length > 0) {
                        setSelectedTile(evt.tile_analysis.tiles[0]);
                      }
                    }}
                  >
                    <td className="py-3 px-3 text-zinc-400 font-mono text-[11px]">
                      {new Date(evt.detected_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-semibold text-zinc-200">
                      {evt.camera_id}
                    </td>
                    <td className="py-3 px-3">
                      {getObstructionTypeBadge(evt.obstruction_type)}
                    </td>
                    <td className="py-3 px-3">
                      {getSeverityBadge(evt.severity)}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      {evt.obstruction_percent.toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 font-mono">
                      {Math.round(evt.confidence * 100)}%
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                        evt.status === "detected"
                          ? "bg-rose-950 text-rose-300 border border-rose-800"
                          : evt.status === "acknowledged"
                          ? "bg-amber-950 text-amber-300 border border-amber-800"
                          : evt.status === "resolved"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : "bg-zinc-800 text-zinc-400"
                      }`}>
                        {evt.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(evt);
                        }}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="max-w-lg w-full rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                <h3 className="font-bold text-zinc-100">Review Optical Incident</h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-zinc-300">
              <div className="flex justify-between">
                <span className="text-zinc-400">Incident ID:</span>
                <span className="font-mono text-zinc-300">{selectedEvent.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Camera:</span>
                <span className="font-semibold text-zinc-200">{selectedEvent.camera_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Type:</span>
                <span>{getObstructionTypeBadge(selectedEvent.obstruction_type)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Severity:</span>
                <span>{getSeverityBadge(selectedEvent.severity)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Confidence:</span>
                <span className="font-mono">{Math.round(selectedEvent.confidence * 100)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Obstruction Coverage:</span>
                <span className="font-mono">{selectedEvent.obstruction_percent.toFixed(1)}% of FOV</span>
              </div>
              {selectedEvent.notes && (
                <div className="mt-2 p-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 italic">
                  {selectedEvent.notes}
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-medium text-zinc-300">Resolution / Audit Notes:</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Enter physical guard inspection notes or resolution details..."
                className="w-full h-20 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => handleUpdateStatus(selectedEvent.id, "acknowledged")}
                disabled={submittingReview}
                className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-600/40 text-xs font-semibold"
              >
                Acknowledge
              </button>
              <button
                onClick={() => handleUpdateStatus(selectedEvent.id, "false_positive")}
                disabled={submittingReview}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                False Positive
              </button>
              <button
                onClick={() => handleUpdateStatus(selectedEvent.id, "resolved")}
                disabled={submittingReview}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow"
              >
                Resolve Incident
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sensitivity Config Modal */}
      {configModalOpen && config && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="max-w-md w-full rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-zinc-100">Camera Sensitivity Configuration</h3>
              </div>
              <button
                onClick={() => setConfigModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Darkness Threshold (0 - 30):</span>
                  <span className="font-mono text-rose-400">{config.darkness_threshold}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={30}
                  step={1}
                  value={config.darkness_threshold}
                  onChange={(e) => setConfig({ ...config, darkness_threshold: parseFloat(e.target.value) })}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Variance Floor (0 - 40):</span>
                  <span className="font-mono text-rose-400">{config.variance_floor}</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={40}
                  step={1}
                  value={config.variance_floor}
                  onChange={(e) => setConfig({ ...config, variance_floor: parseFloat(e.target.value) })}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Full Covering Threshold (50% - 90%):</span>
                  <span className="font-mono text-rose-400">{config.obstruction_percent_threshold}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={90}
                  step={5}
                  value={config.obstruction_percent_threshold}
                  onChange={(e) => setConfig({ ...config, obstruction_percent_threshold: parseFloat(e.target.value) })}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Debounce Frames (1 - 10):</span>
                  <span className="font-mono text-rose-400">{config.debounce_frames} frames</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={config.debounce_frames}
                  onChange={(e) => setConfig({ ...config, debounce_frames: parseInt(e.target.value, 10) })}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.alert_on_dark_frame}
                    onChange={(e) => setConfig({ ...config, alert_on_dark_frame: e.target.checked })}
                    className="rounded accent-rose-500"
                  />
                  <span>Alert on Dark Frame / Optical Blackout</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.alert_on_covering}
                    onChange={(e) => setConfig({ ...config, alert_on_covering: e.target.checked })}
                    className="rounded accent-rose-500"
                  />
                  <span>Alert on Lens Covering (Cloth / Tape)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.alert_on_variance_loss}
                    onChange={(e) => setConfig({ ...config, alert_on_variance_loss: e.target.checked })}
                    className="rounded accent-rose-500"
                  />
                  <span>Alert on Visual Variance Loss (Dead Sensor)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.alert_on_partial}
                    onChange={(e) => setConfig({ ...config, alert_on_partial: e.target.checked })}
                    className="rounded accent-rose-500"
                  />
                  <span>Alert on Partial Field of View Obstruction</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setConfigModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow"
              >
                {savingConfig ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
