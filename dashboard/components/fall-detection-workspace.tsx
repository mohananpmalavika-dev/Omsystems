"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Activity,
  HeartPulse,
  Clock,
  Filter,
  RefreshCw,
  Sliders,
  Eye,
  CheckCircle2,
  XCircle,
  HardHat,
  Accessibility,
  ArrowDownRight,
  Sparkles,
  Zap,
  Info,
  ChevronRight,
  ShieldCheck,
  Flame,
  AlertOctagon,
} from "lucide-react";
import {
  fallApi,
  type FallEvent,
  type FallStats,
  type FallCameraConfig,
} from "@/lib/api-client";

export function FallDetectionWorkspace({
  cameraId,
  tenantId,
}: {
  cameraId?: string;
  tenantId?: string;
}) {
  const [events, setEvents] = useState<FallEvent[]>([]);
  const [stats, setStats] = useState<FallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<FallEvent | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Config modal
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [cameraConfig, setCameraConfig] = useState<FallCameraConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, statsRes] = await Promise.all([
        fallApi.listEvents({
          cameraId,
          personCategory:
            categoryFilter !== "ALL"
              ? (categoryFilter as "worker" | "elderly" | "general")
              : undefined,
          severity:
            severityFilter !== "ALL"
              ? (severityFilter as "P1" | "P2" | "P3")
              : undefined,
          reviewStatus:
            statusFilter !== "ALL" ? (statusFilter as any) : undefined,
          limit: 50,
        }),
        fallApi.getStats(),
      ]);

      if (eventsRes.success) setEvents(eventsRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch (err) {
      console.error("Failed to load fall detection data:", err);
    } finally {
      setLoading(false);
    }
  }, [cameraId, categoryFilter, severityFilter, statusFilter]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000); // 8-second auto refresh for live fall alerts
    return () => clearInterval(interval);
  }, [loadData]);

  const handleReview = async (
    reviewStatus: "confirmed" | "false_positive" | "escalated"
  ) => {
    if (!selectedEvent) return;
    setSubmittingReview(true);
    try {
      const res = await fallApi.reviewEvent(selectedEvent.id, {
        reviewStatus,
        reviewNotes: reviewNotes.trim() || undefined,
      });
      if (res.success) {
        setSelectedEvent(null);
        setReviewNotes("");
        await loadData();
      }
    } catch (err) {
      console.error("Failed to review fall event:", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const openConfigModal = async () => {
    if (!cameraId) return;
    try {
      const res = await fallApi.getCameraConfig(cameraId);
      if (res.success) setCameraConfig(res.data);
      setConfigModalOpen(true);
    } catch (err) {
      console.error("Failed to load camera fall config:", err);
    }
  };

  const saveCameraConfig = async () => {
    if (!cameraId || !cameraConfig) return;
    setSavingConfig(true);
    try {
      const res = await fallApi.updateCameraConfig(cameraId, cameraConfig);
      if (res.success) {
        setCameraConfig(res.data);
        setConfigModalOpen(false);
      }
    } catch (err) {
      console.error("Failed to update camera fall config:", err);
    } finally {
      setSavingConfig(false);
    }
  };

  // Find active unrecovered emergency falls
  const activeEmergencies = events.filter(
    (e) => !e.recovery_detected && e.severity === "P1" && e.review_status !== "false_positive"
  );

  return (
    <div className="space-y-6">
      {/* Critical Active Emergency Siren Banner */}
      {activeEmergencies.length > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-r from-red-950/90 via-rose-900/80 to-red-950/90 border border-red-500/50 rounded-2xl p-5 shadow-2xl shadow-red-950/50">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-36 h-36 bg-red-500/20 rounded-full blur-2xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500 text-white rounded-xl animate-bounce shadow-lg shadow-red-500/40">
                <AlertOctagon className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 text-xs font-black tracking-wider uppercase bg-red-500 text-white rounded-full animate-pulse">
                    Live Incident
                  </span>
                  <h3 className="text-lg font-bold text-white tracking-wide">
                    {activeEmergencies.length} Unresponsive Fall Incident(s) Detected
                  </h3>
                </div>
                <p className="text-sm text-red-200/90 mt-1">
                  Subject(s) remain motionless on the floor exceeding threshold. Immediate on-site medical assistance or safety warden verification recommended.
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedEvent(activeEmergencies[0]!)}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-red-700 font-bold text-sm rounded-xl shadow-lg transition-all flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              Inspect Emergency
            </button>
          </div>
        </div>
      )}

      {/* Header & KPI Summary Cards */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <Accessibility className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Worker & Elderly Fall Detection
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Production v2.0
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Biomechanical pose estimation kinematics and bounding box aspect ratio dynamics with motionless duration analytics.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {cameraId && (
            <button
              onClick={openConfigModal}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium border border-slate-700 transition flex items-center gap-2 cursor-pointer"
            >
              <Sliders className="w-4 h-4 text-indigo-400" />
              Thresholds
            </button>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Statistics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            Total Incidents
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {stats?.totalFalls ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Historical ledger</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            Unrecovered (P1)
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 mt-1">
            {stats?.unrecoveredEmergencyCount ?? 0}
          </div>
          <div className="text-[11px] text-rose-500/80 mt-0.5">Golden hour danger</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            Industrial / Worker
            <HardHat className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-300 mt-1">
            {stats?.workerFalls ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Scaffolds & slips</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            Elderly Care
            <HeartPulse className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black text-sky-300 mt-1">
            {stats?.elderlyFalls ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Assisted living / wards</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            Recovered
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {stats?.recoveredCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Regained upright stance</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            Avg Confidence
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-300 mt-1">
            {stats?.avgConfidence ? `${Math.round(stats.avgConfidence * 100)}%` : "0%"}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Multi-factor fusion</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            Category:
          </div>
          {(["ALL", "worker", "elderly", "general"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                categoryFilter === cat
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "bg-slate-800/70 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {cat === "ALL" ? "All Profiles" : cat === "worker" ? "👷 Worker" : cat === "elderly" ? "🩺 Elderly" : "General"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-400">
            Severity:
          </div>
          {(["ALL", "P1", "P2", "P3"] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                severityFilter === sev
                  ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                  : "bg-slate-800/70 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {sev}
            </button>
          ))}

          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-400 ml-2">
            Review:
          </div>
          {(["ALL", "pending", "confirmed", "false_positive", "escalated"] as const).map((rev) => (
            <button
              key={rev}
              onClick={() => setStatusFilter(rev)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                statusFilter === rev
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : "bg-slate-800/70 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {rev === "ALL" ? "All Status" : rev}
            </button>
          ))}
        </div>
      </div>

      {/* Main Events Feed & Selected Details Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Events Table / Card Feed */}
        <div className={`space-y-3 ${selectedEvent ? "lg:col-span-7" : "lg:col-span-12"}`}>
          {loading && events.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900/40 border border-slate-800 rounded-2xl">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-indigo-500 mb-3" />
              Loading real-time fall detection incidents...
            </div>
          ) : events.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900/40 border border-slate-800 rounded-2xl">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/60 mb-3" />
              <div className="font-semibold text-white">Zero Fall Events</div>
              <p className="text-xs text-slate-500 mt-1">
                No active fall anomalies or posture disruptions match the current filters.
              </p>
            </div>
          ) : (
            events.map((ev) => {
              const isSelected = selectedEvent?.id === ev.id;
              const isP1 = ev.severity === "P1";
              const isElderly = ev.person_category === "elderly";
              const isWorker = ev.person_category === "worker";

              return (
                <div
                  key={ev.id}
                  onClick={() => setSelectedEvent(ev)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-slate-800/90 border-indigo-500 shadow-lg shadow-indigo-950/40"
                      : isP1 && !ev.recovery_detected
                      ? "bg-red-950/20 border-red-500/40 hover:border-red-400"
                      : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2.5 rounded-xl text-xs font-black uppercase shrink-0 ${
                          isP1
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : ev.severity === "P2"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {ev.severity}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-white text-base">
                            {ev.fall_type.replace("_", " ").toUpperCase()} FALL
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isWorker
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : isElderly
                                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                : "bg-slate-700 text-slate-300"
                            }`}
                          >
                            {ev.person_category}
                          </span>
                          {ev.recovery_detected ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Recovered ({ev.recovery_time_seconds ?? 0}s)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 animate-pulse">
                              <AlertTriangle className="w-3 h-3" />
                              Unresponsive ({ev.motionless_duration_seconds}s down)
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            {new Date(ev.occurred_at).toLocaleTimeString()}
                          </span>
                          <span>
                            Peak AR:{" "}
                            <strong className="text-slate-200">
                              {ev.aspect_ratio_peak}
                            </strong>
                          </span>
                          <span>
                            Torso Angle:{" "}
                            <strong className="text-slate-200">
                              {ev.torso_angle_degrees !== null
                                ? `${ev.torso_angle_degrees}°`
                                : "N/A"}
                            </strong>
                          </span>
                          <span>
                            Confidence:{" "}
                            <strong className="text-slate-200">
                              {Math.round(ev.confidence * 100)}%
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <span
                        className={`text-[11px] px-2.5 py-1 rounded-md font-medium capitalize border ${
                          ev.review_status === "confirmed"
                            ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/50"
                            : ev.review_status === "false_positive"
                            ? "bg-slate-800 text-slate-400 border-slate-700"
                            : ev.review_status === "escalated"
                            ? "bg-red-950/50 text-red-300 border-red-700"
                            : "bg-amber-950/30 text-amber-300 border-amber-800/40"
                        }`}
                      >
                        {ev.review_status.replace("_", " ")}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Event Details Panel */}
        {selectedEvent && (
          <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur-md space-y-6 sticky top-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Incident Forensics
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    ID: {selectedEvent.id.slice(0, 8)}...
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-slate-400 hover:text-white text-sm font-semibold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Visual Pose Kinematics Diagram */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4">
              <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                <span>Pose Orientation & Floor Plane Alignment</span>
                <span className="text-[11px] text-indigo-400 font-mono">
                  {selectedEvent.torso_angle_degrees !== null
                    ? `${selectedEvent.torso_angle_degrees}° from floor`
                    : "Aspect Ratio Only"}
                </span>
              </div>

              <div className="relative h-44 w-full bg-slate-900/90 rounded-lg flex items-center justify-center overflow-hidden border border-slate-800">
                {/* Floor Line */}
                <div className="absolute bottom-6 left-0 right-0 h-0.5 bg-slate-600 border-b border-dashed border-slate-500" />
                <div className="absolute bottom-1 right-3 text-[10px] font-mono text-slate-500">
                  FLOOR PLANE (0°)
                </div>

                {/* Human Skeleton Vector Approximation */}
                <svg className="w-full h-full" viewBox="0 0 300 160">
                  {/* Ground floor reference */}
                  <line x1="10" y1="130" x2="290" y2="130" stroke="#475569" strokeWidth="2" strokeDasharray="4 4" />
                  
                  {/* Angle arc */}
                  {selectedEvent.torso_angle_degrees !== null && (
                    <path
                      d="M 120 130 A 30 30 0 0 1 145 110"
                      fill="none"
                      stroke="#818cf8"
                      strokeWidth="2"
                    />
                  )}

                  {/* Fall Skeleton Model */}
                  {selectedEvent.torso_angle_degrees !== null && selectedEvent.torso_angle_degrees < 45 ? (
                    // Recumbent horizontal pose
                    <g>
                      {/* Head */}
                      <circle cx="80" cy="115" r="9" fill="#f43f5e" stroke="#fff" strokeWidth="1.5" />
                      {/* Spine / Torso */}
                      <line x1="89" y1="117" x2="160" y2="124" stroke="#fb7185" strokeWidth="4" strokeLinecap="round" />
                      {/* Shoulders to Arms */}
                      <line x1="105" y1="119" x2="115" y2="132" stroke="#fda4af" strokeWidth="3" strokeLinecap="round" />
                      {/* Pelvis to Legs */}
                      <line x1="160" y1="124" x2="215" y2="128" stroke="#f43f5e" strokeWidth="3.5" strokeLinecap="round" />
                      <line x1="215" y1="128" x2="250" y2="130" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" />
                      {/* Keypoint Dots */}
                      <circle cx="105" cy="119" r="3.5" fill="#38bdf8" />
                      <circle cx="160" cy="124" r="4" fill="#38bdf8" />
                      <circle cx="215" cy="128" r="3" fill="#38bdf8" />
                      <circle cx="250" cy="130" r="3" fill="#38bdf8" />
                    </g>
                  ) : (
                    // Upright / Stumbling pose
                    <g>
                      {/* Head */}
                      <circle cx="150" cy="45" r="9" fill="#818cf8" stroke="#fff" strokeWidth="1.5" />
                      {/* Spine */}
                      <line x1="150" y1="54" x2="150" y2="95" stroke="#a5b4fc" strokeWidth="4" strokeLinecap="round" />
                      {/* Arms */}
                      <line x1="150" y1="65" x2="125" y2="85" stroke="#c7d2fe" strokeWidth="3" strokeLinecap="round" />
                      <line x1="150" y1="65" x2="175" y2="85" stroke="#c7d2fe" strokeWidth="3" strokeLinecap="round" />
                      {/* Legs */}
                      <line x1="150" y1="95" x2="135" y2="130" stroke="#818cf8" strokeWidth="3.5" strokeLinecap="round" />
                      <line x1="150" y1="95" x2="165" y2="130" stroke="#818cf8" strokeWidth="3.5" strokeLinecap="round" />
                      {/* Keypoints */}
                      <circle cx="150" cy="65" r="3.5" fill="#38bdf8" />
                      <circle cx="150" cy="95" r="4" fill="#38bdf8" />
                    </g>
                  )}
                </svg>
              </div>
            </div>

            {/* Kinematic Measurements Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-500 font-semibold uppercase">
                  Peak Aspect Ratio
                </span>
                <div className="text-lg font-bold text-white mt-0.5">
                  {selectedEvent.aspect_ratio_peak}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Threshold: 1.20 (width/height)
                </div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-500 font-semibold uppercase">
                  Vertical Descent Speed
                </span>
                <div className="text-lg font-bold text-white mt-0.5">
                  {selectedEvent.impact_speed} px/s
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Terminal descent velocity
                </div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-500 font-semibold uppercase">
                  Motionless Duration
                </span>
                <div className="text-lg font-bold text-rose-400 mt-0.5">
                  {selectedEvent.motionless_duration_seconds}s
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Time recumbent on floor
                </div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-500 font-semibold uppercase">
                  Recovery Status
                </span>
                <div className="text-lg font-bold text-white mt-0.5 flex items-center gap-1.5">
                  {selectedEvent.recovery_detected ? (
                    <span className="text-emerald-400">Yes ({selectedEvent.recovery_time_seconds}s)</span>
                  ) : (
                    <span className="text-rose-400">Not Recovered</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Upright posture restoration
                </div>
              </div>
            </div>

            {/* Operator Review Controls */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                Operator Review & Verification
              </div>

              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Enter verification rationale or dispatch notes..."
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />

              <div className="grid grid-cols-3 gap-2">
                <button
                  disabled={submittingReview}
                  onClick={() => handleReview("confirmed")}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirm
                </button>
                <button
                  disabled={submittingReview}
                  onClick={() => handleReview("false_positive")}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  False Pos
                </button>
                <button
                  disabled={submittingReview}
                  onClick={() => handleReview("escalated")}
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Escalate EMS
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Threshold Configuration Modal */}
      {configModalOpen && cameraConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  Camera Fall Detection Settings
                </h3>
              </div>
              <button
                onClick={() => setConfigModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1.5">
                  Operational Profile Preset
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["worker", "elderly", "general"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setCameraConfig({ ...cameraConfig, profile: p })}
                      className={`py-2 rounded-lg font-bold capitalize transition border ${
                        cameraConfig.profile === p
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      {p === "worker" ? "👷 Worker" : p === "elderly" ? "🩺 Elderly" : "General"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-semibold mb-1">
                  <span>Sensitivity Multiplier</span>
                  <span className="text-indigo-400">{cameraConfig.sensitivity}</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={cameraConfig.sensitivity}
                  onChange={(e) =>
                    setCameraConfig({
                      ...cameraConfig,
                      sensitivity: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-semibold mb-1">
                  <span>Aspect Ratio Threshold (Width/Height)</span>
                  <span className="text-indigo-400">{cameraConfig.aspect_ratio_threshold}</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="2.0"
                  step="0.05"
                  value={cameraConfig.aspect_ratio_threshold}
                  onChange={(e) =>
                    setCameraConfig({
                      ...cameraConfig,
                      aspect_ratio_threshold: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-semibold mb-1">
                  <span>Motionless Delay Before P1 Alert (Seconds)</span>
                  <span className="text-rose-400">{cameraConfig.motionless_delay_seconds}s</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="20.0"
                  step="0.5"
                  value={cameraConfig.motionless_delay_seconds}
                  onChange={(e) =>
                    setCameraConfig({
                      ...cameraConfig,
                      motionless_delay_seconds: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-rose-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setConfigModalOpen(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={savingConfig}
                onClick={saveCameraConfig}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-500 disabled:opacity-50"
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
