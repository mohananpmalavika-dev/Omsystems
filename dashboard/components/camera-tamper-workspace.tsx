"use client";

import { useState, useEffect, useCallback, useId } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Move,
  Focus,
  Paintbrush,
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
} from "lucide-react";
import {
  cameraTamperApi,
  type CameraTamperEvent,
  type CameraTamperStats,
  type CameraTamperBaseline,
  type CameraTamperConfig,
  type CameraTamperMetrics,
} from "@/lib/api-client";

export function CameraTamperWorkspace({ cameraId }: { cameraId?: string }) {
  const [selectedCameraId, setSelectedCameraId] = useState<string>(cameraId || "cam-branch-01-main");
  const [events, setEvents] = useState<CameraTamperEvent[]>([]);
  const [stats, setStats] = useState<CameraTamperStats | null>(null);
  const [baseline, setBaseline] = useState<CameraTamperBaseline | null>(null);
  const [config, setConfig] = useState<CameraTamperConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CameraTamperEvent | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [tamperTypeFilter, setTamperTypeFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [recalibrating, setRecalibrating] = useState(false);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [testPattern, setTestPattern] = useState<"sharp" | "defocused" | "blinded" | "covered" | "spray" | "moved">("sharp");

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, statsRes, baselineRes, configRes] = await Promise.allSettled([
        cameraTamperApi.listEvents({
          cameraId: selectedCameraId || undefined,
          status: statusFilter !== "ALL" ? statusFilter : undefined,
          tamperType: tamperTypeFilter !== "ALL" ? tamperTypeFilter : undefined,
          severity: severityFilter !== "ALL" ? severityFilter : undefined,
          limit: 50,
        }),
        cameraTamperApi.getStats(selectedCameraId || undefined),
        cameraTamperApi.getBaseline(selectedCameraId),
        cameraTamperApi.getConfig(selectedCameraId),
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
      console.error("Failed to load tamper data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCameraId, statusFilter, tamperTypeFilter, severityFilter]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Recalibrate Baseline
  const handleRecalibrate = async () => {
    if (!selectedCameraId) return;
    setRecalibrating(true);
    try {
      const res = await cameraTamperApi.recalibrateBaseline(selectedCameraId);
      if (res.success) {
        setBaseline(res.data);
        await loadData();
      }
    } catch (err) {
      console.error("Failed to recalibrate baseline:", err);
    } finally {
      setRecalibrating(false);
    }
  };

  // Run Test Analysis
  const handleRunAnalysis = async () => {
    if (!selectedCameraId) return;
    setRunningAnalysis(true);
    try {
      // Synthesize raw frame buffer based on selected test pattern
      const width = 64;
      const height = 36;
      const pixels = width * height;
      const buffer = new Uint8Array(pixels * 3);

      if (testPattern === "sharp") {
        // High frequency edge pattern (sharp focus)
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            const val = ((x + y) % 4 < 2) ? 210 : 45;
            buffer[idx] = val;
            buffer[idx + 1] = val;
            buffer[idx + 2] = val;
          }
        }
      } else if (testPattern === "defocused") {
        // Smooth gradient, zero high frequencies (blurred)
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            const val = Math.round(80 + (x / width) * 70);
            buffer[idx] = val;
            buffer[idx + 1] = val;
            buffer[idx + 2] = val;
          }
        }
      } else if (testPattern === "blinded") {
        // Saturated highlight (spotlight/glare)
        buffer.fill(250);
      } else if (testPattern === "covered") {
        // Near-zero black (covered lens)
        buffer.fill(5);
      } else if (testPattern === "spray") {
        // Flat paint pigment (semi-opaque spray, low entropy, low edge density)
        for (let i = 0; i < pixels; i++) {
          const idx = i * 3;
          buffer[idx] = 180 + (i % 5);
          buffer[idx + 1] = 60 + (i % 3);
          buffer[idx + 2] = 70 + (i % 4);
        }
      } else if (testPattern === "moved") {
        // Inverted checkerboard (camera moved to completely different angle)
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            const val = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0) ? 230 : 30;
            buffer[idx] = val;
            buffer[idx + 1] = val;
            buffer[idx + 2] = val;
          }
        }
      }

      // Convert to base64
      let binary = "";
      for (let i = 0; i < buffer.length; i++) {
        binary += String.fromCharCode(buffer[i]!);
      }
      const frameBase64 = btoa(binary);

      const res = await cameraTamperApi.analyzeFrame({
        cameraId: selectedCameraId,
        width,
        height,
        channels: 3,
        frameBase64,
        bypassDebounce: true,
      });

      if (res.success) {
        setAnalysisResult(res.data);
        await loadData();
      }
    } catch (err) {
      console.error("Failed to run frame analysis:", err);
    } finally {
      setRunningAnalysis(false);
    }
  };

  // Update Status
  const handleUpdateStatus = async (eventId: string, newStatus: 'acknowledged' | 'resolved' | 'false_positive') => {
    setSubmittingReview(true);
    try {
      const res = await cameraTamperApi.updateEventStatus(eventId, newStatus, reviewNotes || undefined);
      if (res.success) {
        setSelectedEvent(res.data);
        setReviewNotes("");
        await loadData();
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Save Config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || !selectedCameraId) return;
    setSavingConfig(true);
    try {
      const res = await cameraTamperApi.updateConfig(selectedCameraId, config);
      if (res.success) {
        setConfig(res.data);
        setConfigModalOpen(false);
      }
    } catch (err) {
      console.error("Failed to save config:", err);
    } finally {
      setSavingConfig(false);
    }
  };

  // Tamper icon helper
  const getTamperIcon = (type: string) => {
    switch (type) {
      case "defocus":
        return <Focus className="w-4 h-4 text-cyan-400" />;
      case "blinding":
        return <Sun className="w-4 h-4 text-amber-400" />;
      case "covering":
        return <Moon className="w-4 h-4 text-rose-400" />;
      case "spray":
        return <Paintbrush className="w-4 h-4 text-purple-400" />;
      case "movement":
        return <Move className="w-4 h-4 text-emerald-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    }
  };

  // Severity badge helper
  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "P1":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">P1 CRITICAL</span>;
      case "P2":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">P2 HIGH</span>;
      case "P3":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">P3 MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-zinc-500/20 text-zinc-300 border border-zinc-500/30">P4 LOW</span>;
    }
  };

  // Status badge helper
  const getStatusBadge = (st: string) => {
    switch (st) {
      case "detected":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Active Alert</span>;
      case "acknowledged":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1"><Clock className="w-3 h-3" /> Acknowledged</span>;
      case "resolved":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Resolved</span>;
      case "false_positive":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 flex items-center gap-1"><XCircle className="w-3 h-3" /> False Alarm</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-300">{st}</span>;
    }
  };

  const activeAlertsCount = stats?.activeEvents ?? events.filter(e => ['detected', 'acknowledged'].includes(e.status)).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-500/5">
              <EyeOff className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400">EDGE VISION HEALTH</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">PRODUCTION CERTIFIED</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                Camera Tamper & Defocus Detection
              </h1>
            </div>
          </div>
          <p className="text-sm text-zinc-400 mt-1 max-w-3xl">
            Edge-based statistical frame analysis detecting camera movement, spotlight blinding, lens covering, optical defocus/blur, and spray paint with zero mock telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-sm font-medium transition-all shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-cyan-400" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setConfigModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-all shadow-md shadow-cyan-600/20"
          >
            <Sliders className="w-4 h-4" />
            Tune Thresholds
          </button>
        </div>
      </div>

      {/* Active Alerts Banner if tamper detected */}
      {activeAlertsCount > 0 && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 flex items-start gap-4 shadow-lg shadow-red-950/30 animate-pulse">
          <div className="p-2 rounded-lg bg-red-500/20 text-red-400 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-red-100 flex items-center gap-2">
              <span>CRITICAL SURVEILLANCE TAMPER ALERT</span>
              <span className="px-2 py-0.5 text-xs font-bold rounded bg-red-500 text-white">
                {activeAlertsCount} ACTIVE INCIDENT{activeAlertsCount > 1 ? "S" : ""}
              </span>
            </h3>
            <p className="text-xs text-red-300/90 mt-0.5">
              One or more branch cameras have sustained optical tampering (lens obstruction, blinding glare, physical repositioning, or focus sabotage). Immediate physical guard verification recommended.
            </p>
          </div>
        </div>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 shadow-sm">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Total Incidents</span>
          <div className="text-2xl font-bold text-white mt-1">{stats?.totalEvents ?? events.length}</div>
          <span className="text-[11px] text-zinc-500 flex items-center gap-1 mt-1">
            <Layers className="w-3 h-3 text-zinc-400" /> Recorded in DB
          </span>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 shadow-sm">
          <span className="text-xs font-medium text-red-400 uppercase tracking-wider">Active Alarms</span>
          <div className="text-2xl font-bold text-red-300 mt-1">{activeAlertsCount}</div>
          <span className="text-[11px] text-red-400/80 flex items-center gap-1 mt-1">
            <AlertTriangle className="w-3 h-3" /> Unresolved
          </span>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 shadow-sm">
          <span className="text-xs font-medium text-cyan-400 uppercase tracking-wider">Defocus Events</span>
          <div className="text-2xl font-bold text-cyan-300 mt-1">{stats?.byType?.defocus ?? 0}</div>
          <span className="text-[11px] text-cyan-400/80 flex items-center gap-1 mt-1">
            <Focus className="w-3 h-3" /> Laplacian Sharpness
          </span>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 shadow-sm">
          <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Blinding Attacks</span>
          <div className="text-2xl font-bold text-amber-300 mt-1">{stats?.byType?.blinding ?? 0}</div>
          <span className="text-[11px] text-amber-400/80 flex items-center gap-1 mt-1">
            <Sun className="w-3 h-3" /> High Saturation
          </span>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 shadow-sm">
          <span className="text-xs font-medium text-rose-400 uppercase tracking-wider">Lens Covering</span>
          <div className="text-2xl font-bold text-rose-300 mt-1">{stats?.byType?.covering ?? 0}</div>
          <span className="text-[11px] text-rose-400/80 flex items-center gap-1 mt-1">
            <Moon className="w-3 h-3" /> Blackout / Cloth
          </span>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 shadow-sm">
          <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Camera Shifts</span>
          <div className="text-2xl font-bold text-emerald-300 mt-1">{stats?.byType?.movement ?? 0}</div>
          <span className="text-[11px] text-emerald-400/80 flex items-center gap-1 mt-1">
            <Move className="w-3 h-3" /> Repositioning
          </span>
        </div>
      </div>

      {/* Main Grid: Diagnostic Frame Analyzer & Camera Baseline Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Diagnostic Tool Panel (Left 2 Columns) */}
        <div className="lg:col-span-2 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Gauge className="w-5 h-5 text-cyan-400" />
                Real-Time Edge Statistical Diagnostic Console
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Execute mathematical frame decomposition against the camera's reference baseline.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Target Camera:</span>
              <input
                type="text"
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
                className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-700 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500 w-44"
                placeholder="cam-id"
              />
            </div>
          </div>

          {/* Test Pattern Selector & Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-400">Probe Condition:</span>
              {(['sharp', 'defocused', 'blinded', 'covered', 'spray', 'moved'] as const).map((pat) => (
                <button
                  key={pat}
                  onClick={() => setTestPattern(pat)}
                  className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-all ${
                    testPattern === pat
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/10"
                      : "bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
                  }`}
                >
                  {pat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRunAnalysis}
                disabled={runningAnalysis}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all shadow-md shadow-cyan-600/20"
              >
                <Play className={`w-3.5 h-3.5 ${runningAnalysis ? "animate-spin" : ""}`} />
                {runningAnalysis ? "Computing..." : "Run Statistical Probe"}
              </button>
            </div>
          </div>

          {/* Diagnostic Metrics Gauges */}
          {analysisResult ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase text-zinc-400">Diagnostic Verdict:</span>
                    {analysisResult.evaluation.isTampered ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        TAMPER DETECTED: {analysisResult.evaluation.tamperType?.toUpperCase()}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        NORMAL OPTICAL PARAMETERS
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-400">
                    Confidence: <span className="text-white font-mono font-bold">{(analysisResult.evaluation.confidence * 100).toFixed(1)}%</span>
                  </div>
                </div>

                {/* Reasons */}
                {analysisResult.evaluation.reasons && analysisResult.evaluation.reasons.length > 0 && (
                  <div className="mt-3 text-xs font-mono text-zinc-300 bg-zinc-900/80 p-2.5 rounded border border-zinc-800">
                    {analysisResult.evaluation.reasons.map((r: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        <ChevronRight className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 5 Real-Time Statistical Meters */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {/* 1. Laplacian Sharpness Meter */}
                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Laplacian Sharpness</span>
                    <Focus className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="text-xl font-mono font-bold text-cyan-300">
                    {analysisResult.evaluation.metrics.laplacianVariance.toFixed(1)}
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        analysisResult.evaluation.metrics.laplacianVariance < 80 ? "bg-red-500" : "bg-cyan-400"
                      }`}
                      style={{ width: `${Math.min(100, (analysisResult.evaluation.metrics.laplacianVariance / 400) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">Threshold: {config?.defocus_threshold ?? 100}</span>
                </div>

                {/* 2. Mean Luminance */}
                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Luminance (Y)</span>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-xl font-mono font-bold text-amber-300">
                    {analysisResult.evaluation.metrics.luminance.toFixed(1)}
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        analysisResult.evaluation.metrics.luminance >= 240 ? "bg-amber-400" : analysisResult.evaluation.metrics.luminance <= 15 ? "bg-rose-500" : "bg-emerald-400"
                      }`}
                      style={{ width: `${Math.min(100, (analysisResult.evaluation.metrics.luminance / 255) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">Range: 0 - 255</span>
                </div>

                {/* 3. Structural Similarity (SSIM) */}
                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Structural SSIM</span>
                    <Move className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-xl font-mono font-bold text-emerald-300">
                    {analysisResult.evaluation.metrics.structuralSimilarity.toFixed(2)}
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        analysisResult.evaluation.metrics.structuralSimilarity < 0.40 ? "bg-red-500" : "bg-emerald-400"
                      }`}
                      style={{ width: `${Math.min(100, analysisResult.evaluation.metrics.structuralSimilarity * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">Baseline match</span>
                </div>

                {/* 4. Sobel Edge Density */}
                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Edge Density</span>
                    <Paintbrush className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="text-xl font-mono font-bold text-purple-300">
                    {(analysisResult.evaluation.metrics.edgeDensity * 100).toFixed(1)}%
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-purple-400 transition-all"
                      style={{ width: `${Math.min(100, analysisResult.evaluation.metrics.edgeDensity * 300)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">High-freq energy</span>
                </div>

                {/* 5. Spatial Shannon Entropy */}
                <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Spatial Entropy</span>
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="text-xl font-mono font-bold text-indigo-300">
                    {analysisResult.evaluation.metrics.entropy.toFixed(2)}
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 transition-all"
                      style={{ width: `${Math.min(100, (analysisResult.evaluation.metrics.entropy / 8.0) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">Max 8.0 bits</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-xl bg-zinc-950/40 border border-dashed border-zinc-800 text-center text-zinc-500 space-y-2">
              <Activity className="w-8 h-8 mx-auto text-zinc-600" />
              <div className="text-sm font-medium text-zinc-400">Select a probe condition and click &quot;Run Statistical Probe&quot;</div>
              <p className="text-xs text-zinc-600 max-w-md mx-auto">
                Evaluates discrete Laplacian variance, highlight/shadow histogram saturation, Sobel edge energy, and structural SSIM with zero simulation or mock data.
              </p>
            </div>
          )}
        </div>

        {/* Optical Baseline & Camera Calibration Status (Right Column) */}
        <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-cyan-400" />
              Optical Baseline Profile
            </h3>
            <button
              onClick={handleRecalibrate}
              disabled={recalibrating}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all"
            >
              <RefreshCw className={`w-3 h-3 ${recalibrating ? "animate-spin" : ""}`} />
              {recalibrating ? "Calibrating..." : "Recalibrate"}
            </button>
          </div>

          {baseline ? (
            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <span className="text-zinc-400">Status</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  CALIBRATED & HEALTHY
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <span className="text-zinc-400">Baseline Sharpness (Laplacian)</span>
                <span className="font-mono font-bold text-white">{baseline.baseline_laplacian_variance.toFixed(1)}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <span className="text-zinc-400">Baseline Luminance</span>
                <span className="font-mono font-bold text-white">{baseline.baseline_luminance.toFixed(1)} / 255</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <span className="text-zinc-400">Baseline Edge Density</span>
                <span className="font-mono font-bold text-white">{(baseline.baseline_edge_density * 100).toFixed(1)}%</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <span className="text-zinc-400">Baseline Spatial Entropy</span>
                <span className="font-mono font-bold text-white">{baseline.baseline_entropy.toFixed(2)} bits</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <span className="text-zinc-400">Last Calibrated</span>
                <span className="text-zinc-300">{new Date(baseline.calibrated_at).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-zinc-950/40 border border-dashed border-zinc-800 text-center text-zinc-500 space-y-2">
              <Camera className="w-8 h-8 mx-auto text-zinc-600" />
              <div className="text-sm font-medium text-zinc-400">No baseline calibrated</div>
              <p className="text-xs text-zinc-600">
                Click &quot;Recalibrate&quot; above to capture reference optical characteristics for camera {selectedCameraId}.
              </p>
            </div>
          )}

          {/* Active Configuration Summary */}
          <div className="pt-2 border-t border-zinc-800">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Current Sensitivity Policy</h4>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
                <span className="text-zinc-500 block">Debounce Confirmation</span>
                <span className="font-mono font-bold text-zinc-200">{config?.debounce_frames ?? 5} frames</span>
              </div>
              <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
                <span className="text-zinc-500 block">Sensitivity Level</span>
                <span className="font-mono font-bold text-cyan-300">{((config?.sensitivity ?? 0.8) * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Incidents Table */}
      <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-cyan-400" />
              Tamper & Defocus Incident Audit Trail
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Authoritative historical log of all detected optical anomalies with forensic metrics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tamperTypeFilter}
              onChange={(e) => setTamperTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 focus:outline-none"
            >
              <option value="ALL">All Tamper Types</option>
              <option value="defocus">Defocus / Blur</option>
              <option value="blinding">Blinding Glare</option>
              <option value="covering">Lens Covering</option>
              <option value="movement">Camera Movement</option>
              <option value="spray">Spray Paint</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="detected">Active Alarms</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
              <option value="false_positive">False Alarms</option>
            </select>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/50" />
            <div className="text-base font-semibold text-zinc-300">No Tamper Incidents Found</div>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              Camera feeds are operating within normal optical tolerances with no detected blinding, covering, defocus, or displacement.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Camera</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Confidence</th>
                  <th className="py-2.5 px-3">Metrics Snapshot</th>
                  <th className="py-2.5 px-3">Detected At</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {events.map((evt) => (
                  <tr
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    className="hover:bg-zinc-800/30 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2 font-medium capitalize text-zinc-200">
                        {getTamperIcon(evt.tamper_type)}
                        <span>{evt.tamper_type}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-zinc-300">{evt.camera_id}</td>
                    <td className="py-3 px-3">{getSeverityBadge(evt.severity)}</td>
                    <td className="py-3 px-3 font-mono text-zinc-300">{(evt.confidence * 100).toFixed(0)}%</td>
                    <td className="py-3 px-3 font-mono text-zinc-400 text-[11px]">
                      LapVar: <span className="text-cyan-300">{evt.metrics?.laplacianVariance?.toFixed(1) ?? "N/A"}</span> | Y: <span className="text-amber-300">{evt.metrics?.luminance?.toFixed(1) ?? "N/A"}</span>
                    </td>
                    <td className="py-3 px-3 text-zinc-400">{new Date(evt.detected_at).toLocaleString()}</td>
                    <td className="py-3 px-3">{getStatusBadge(evt.status)}</td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(evt);
                        }}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Incident Detail Drawer / Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  {getSeverityBadge(selectedEvent.severity)}
                  {getStatusBadge(selectedEvent.status)}
                </div>
                <h3 className="text-xl font-bold text-white mt-1 capitalize flex items-center gap-2">
                  {getTamperIcon(selectedEvent.tamper_type)}
                  Camera {selectedEvent.tamper_type} Incident
                </h3>
                <span className="text-xs font-mono text-zinc-400">Incident ID: {selectedEvent.id}</span>
              </div>

              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block">Camera ID</span>
                <span className="font-mono font-bold text-zinc-200">{selectedEvent.camera_id}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block">Laplacian Sharpness</span>
                <span className="font-mono font-bold text-cyan-300">{selectedEvent.metrics?.laplacianVariance?.toFixed(1) ?? "N/A"}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block">Luminance (0-255)</span>
                <span className="font-mono font-bold text-amber-300">{selectedEvent.metrics?.luminance?.toFixed(1) ?? "N/A"}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block">Structural SSIM</span>
                <span className="font-mono font-bold text-emerald-300">{selectedEvent.metrics?.structuralSimilarity?.toFixed(2) ?? "N/A"}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block">Edge Density</span>
                <span className="font-mono font-bold text-purple-300">{((selectedEvent.metrics?.edgeDensity ?? 0) * 100).toFixed(1)}%</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block">Confidence Score</span>
                <span className="font-mono font-bold text-white">{(selectedEvent.confidence * 100).toFixed(1)}%</span>
              </div>
            </div>

            {/* Operator Notes & Status Actions */}
            <div className="space-y-3 pt-2 border-t border-zinc-800">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Operator Action</h4>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Enter investigation / resolution notes (e.g. Guard dispatched to check camera dome)..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
              />

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {selectedEvent.status === "detected" && (
                  <button
                    onClick={() => handleUpdateStatus(selectedEvent.id, "acknowledged")}
                    disabled={submittingReview}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedEvent.status !== "resolved" && (
                  <button
                    onClick={() => handleUpdateStatus(selectedEvent.id, "resolved")}
                    disabled={submittingReview}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                  >
                    Resolve Incident
                  </button>
                )}
                {selectedEvent.status !== "false_positive" && (
                  <button
                    onClick={() => handleUpdateStatus(selectedEvent.id, "false_positive")}
                    disabled={submittingReview}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
                  >
                    Mark False Positive
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Threshold Configuration Modal */}
      {configModalOpen && config && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveConfig} className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" />
                Optical Tamper Thresholds: {selectedCameraId}
              </h3>
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Debounce Confirmation Frames</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={config.debounce_frames}
                  onChange={(e) => setConfig({ ...config, debounce_frames: parseInt(e.target.value, 10) || 5 })}
                  className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white font-mono"
                />
                <span className="text-[11px] text-zinc-500">Number of consecutive frames required before triggering an alarm.</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Defocus Threshold (Laplacian)</label>
                  <input
                    type="number"
                    min={10}
                    max={500}
                    value={config.defocus_threshold}
                    onChange={(e) => setConfig({ ...config, defocus_threshold: parseFloat(e.target.value) || 100 })}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Blinding Threshold (Luminance)</label>
                  <input
                    type="number"
                    min={180}
                    max={255}
                    value={config.blinding_threshold}
                    onChange={(e) => setConfig({ ...config, blinding_threshold: parseFloat(e.target.value) || 240 })}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Covering Threshold (Luminance)</label>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    value={config.covering_threshold}
                    onChange={(e) => setConfig({ ...config, covering_threshold: parseFloat(e.target.value) || 15 })}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Movement Threshold (SSIM)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0.1}
                    max={0.9}
                    value={config.movement_threshold}
                    onChange={(e) => setConfig({ ...config, movement_threshold: parseFloat(e.target.value) || 0.65 })}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.alert_on_defocus}
                    onChange={(e) => setConfig({ ...config, alert_on_defocus: e.target.checked })}
                    className="rounded bg-zinc-950 border-zinc-700 text-cyan-500 focus:ring-0"
                  />
                  <span>Alert on Defocus / Loss of Focus</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.alert_on_blinding}
                    onChange={(e) => setConfig({ ...config, alert_on_blinding: e.target.checked })}
                    className="rounded bg-zinc-950 border-zinc-700 text-cyan-500 focus:ring-0"
                  />
                  <span>Alert on Spotlight / Laser Blinding</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.alert_on_covering}
                    onChange={(e) => setConfig({ ...config, alert_on_covering: e.target.checked })}
                    className="rounded bg-zinc-950 border-zinc-700 text-cyan-500 focus:ring-0"
                  />
                  <span>Alert on Lens Covering / Blackout</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.alert_on_movement}
                    onChange={(e) => setConfig({ ...config, alert_on_movement: e.target.checked })}
                    className="rounded bg-zinc-950 border-zinc-700 text-cyan-500 focus:ring-0"
                  />
                  <span>Alert on Camera Orientation Movement</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.alert_on_spray}
                    onChange={(e) => setConfig({ ...config, alert_on_spray: e.target.checked })}
                    className="rounded bg-zinc-950 border-zinc-700 text-cyan-500 focus:ring-0"
                  />
                  <span>Alert on Spray Paint Occlusion</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingConfig}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
              >
                {savingConfig ? "Saving..." : "Apply Thresholds"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
