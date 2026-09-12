"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CarFront,
  ShieldAlert,
  AlertTriangle,
  Search,
  Plus,
  RefreshCw,
  Clock,
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  Sliders,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Cpu,
  UploadCloud,
  FileCheck2,
  Calendar,
  Layers,
  MapPin,
  Tag,
  Truck,
  Trash2,
} from "lucide-react";
import {
  anprApi,
  type AnprEventItem,
  type AnprVehicleSessionItem,
  type AnprWatchlistRecordItem,
  type AnprWatchlistPlateItem,
  type AnprStatsData,
  type AnprEvaluationResult,
} from "@/lib/api-client";

type TabMode = "events" | "sandbox" | "sessions" | "watchlists" | "stats";

export function AnprWorkspace() {
  const [activeTab, setActiveTab] = useState<TabMode>("events");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [events, setEvents] = useState<AnprEventItem[]>([]);
  const [sessions, setSessions] = useState<AnprVehicleSessionItem[]>([]);
  const [watchlists, setWatchlists] = useState<AnprWatchlistRecordItem[]>([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>("");
  const [watchlistPlates, setWatchlistPlates] = useState<AnprWatchlistPlateItem[]>([]);
  const [stats, setStats] = useState<AnprStatsData | null>(null);

  // Filters
  const [plateQuery, setPlateQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("ALL");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>("ALL");
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  // Modals & Selected items
  const [selectedEvent, setSelectedEvent] = useState<AnprEventItem | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const [addPlateModalOpen, setAddPlateModalOpen] = useState(false);
  const [newPlateNumber, setNewPlateNumber] = useState("");
  const [newPlateReason, setNewPlateReason] = useState("");
  const [newPlatePriority, setNewPlatePriority] = useState<"critical" | "high" | "medium" | "low">("high");
  const [newPlateVehicleMake, setNewPlateVehicleMake] = useState("");
  const [newPlateVehicleColor, setNewPlateVehicleColor] = useState("");
  const [newPlateVehicleType, setNewPlateVehicleType] = useState<"car" | "motorcycle" | "bus" | "truck" | "van" | "other">("car");
  const [newPlateFuzzy, setNewPlateFuzzy] = useState(true);
  const [savingPlate, setSavingPlate] = useState(false);

  // OCR Sandbox states
  const [sandboxInput, setSandboxInput] = useState("DL01CA1234");
  const [sandboxCountry, setSandboxCountry] = useState("IN");
  const [sandboxEvaluating, setSandboxEvaluating] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<AnprEvaluationResult | null>(null);
  const [sandboxIngesting, setSandboxIngesting] = useState(false);
  const [sandboxFeedback, setSandboxFeedback] = useState<string | null>(null);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      const [eventsRes, sessionsRes, watchlistsRes, statsRes] = await Promise.allSettled([
        anprApi.listEvents({
          plateNumber: plateQuery || undefined,
          entryDirection: directionFilter !== "ALL" ? (directionFilter as any) : undefined,
          reviewStatus: reviewStatusFilter !== "ALL" ? (reviewStatusFilter as any) : undefined,
          hasWatchlistMatch: watchlistOnly ? true : undefined,
          limit: 50,
        }),
        anprApi.listSessions({ limit: 50 }),
        anprApi.listWatchlists(),
        anprApi.getStats(),
      ]);

      if (eventsRes.status === "fulfilled" && eventsRes.value.success) {
        setEvents(eventsRes.value.data);
      }
      if (sessionsRes.status === "fulfilled" && sessionsRes.value.success) {
        setSessions(sessionsRes.value.data);
      }
      if (watchlistsRes.status === "fulfilled" && watchlistsRes.value.success) {
        setWatchlists(watchlistsRes.value.data);
        if (!selectedWatchlistId && watchlistsRes.value.data.length > 0) {
          setSelectedWatchlistId(watchlistsRes.value.data[0].id);
        }
      }
      if (statsRes.status === "fulfilled" && statsRes.value.success) {
        setStats(statsRes.value.data);
      }
    } catch (err) {
      console.error("Failed to load ANPR data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [plateQuery, directionFilter, reviewStatusFilter, watchlistOnly, selectedWatchlistId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Load plates when selected watchlist changes
  useEffect(() => {
    if (!selectedWatchlistId) return;
    anprApi.listWatchlistPlates(selectedWatchlistId)
      .then((res) => {
        if (res.success) setWatchlistPlates(res.data);
      })
      .catch((err) => console.error("Failed to load watchlist plates:", err));
  }, [selectedWatchlistId]);

  // Handle Review Submission
  const handleReview = async (status: "confirmed" | "false_positive" | "dismissed") => {
    if (!selectedEvent) return;
    setSubmittingReview(true);
    try {
      const res = await anprApi.reviewEvent(selectedEvent.id, {
        status,
        notes: reviewNotes || undefined,
      });
      if (res.success) {
        setSelectedEvent(null);
        setReviewNotes("");
        await loadData();
      }
    } catch (err) {
      console.error("Failed to submit review:", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Run Sandbox Evaluation
  const runSandboxEvaluate = async (textToTest?: string) => {
    const text = textToTest || sandboxInput;
    if (!text.trim()) return;
    setSandboxEvaluating(true);
    setSandboxFeedback(null);
    try {
      const res = await anprApi.evaluatePlate({
        rawPlateText: text.trim(),
        countryPreference: sandboxCountry,
      });
      if (res.success) {
        setSandboxResult(res.data);
      }
    } catch (err: any) {
      setSandboxFeedback(`Evaluation failed: ${err.message || "Unknown error"}`);
    } finally {
      setSandboxEvaluating(false);
    }
  };

  // Ingest from Sandbox to Live System
  const handleSandboxIngest = async () => {
    if (!sandboxResult) return;
    setSandboxIngesting(true);
    try {
      const res = await anprApi.ingestEvent({
        cameraId: "cam-main-gate-anpr",
        cameraName: "Main Entry Gate (ANPR High-Speed)",
        branchId: "branch-central-01",
        rawPlateText: sandboxResult.plate.plateNumber,
        countryPreference: sandboxCountry,
        plateConfidence: sandboxResult.plate.confidence,
        entryDirection: "entry",
        vehicle: sandboxResult.vehicle,
      });
      if (res.success) {
        setSandboxFeedback(`Plate ${sandboxResult.plate.plateNumber} ingested successfully into live system!`);
        await loadData();
      }
    } catch (err: any) {
      setSandboxFeedback(`Ingest failed: ${err.message}`);
    } finally {
      setSandboxIngesting(false);
    }
  };

  // Add Plate to Watchlist
  const handleAddPlate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWatchlistId || !newPlateNumber.trim() || !newPlateReason.trim()) return;
    setSavingPlate(true);
    try {
      const res = await anprApi.addWatchlistPlate(selectedWatchlistId, {
        plateNumber: newPlateNumber.trim().toUpperCase(),
        reason: newPlateReason.trim(),
        priority: newPlatePriority,
        vehicleMake: newPlateVehicleMake.trim() || undefined,
        vehicleColor: newPlateVehicleColor.trim() || undefined,
        vehicleType: newPlateVehicleType,
        fuzzyMatch: newPlateFuzzy,
        maxLevenshteinDistance: 1,
      });
      if (res.success) {
        setAddPlateModalOpen(false);
        setNewPlateNumber("");
        setNewPlateReason("");
        setNewPlateVehicleMake("");
        setNewPlateVehicleColor("");
        const updated = await anprApi.listWatchlistPlates(selectedWatchlistId);
        if (updated.success) setWatchlistPlates(updated.data);
        await loadData();
      }
    } catch (err) {
      console.error("Failed to add plate to watchlist:", err);
    } finally {
      setSavingPlate(false);
    }
  };

  // Remove Plate
  const handleRemovePlate = async (plateId: string) => {
    if (!selectedWatchlistId) return;
    try {
      const res = await anprApi.removeWatchlistPlate(selectedWatchlistId, plateId);
      if (res.success) {
        setWatchlistPlates((prev) => prev.filter((p) => p.id !== plateId));
        await loadData();
      }
    } catch (err) {
      console.error("Failed to remove plate:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 text-white shadow-lg shadow-cyan-500/20">
              <CarFront className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Automatic Number Plate Recognition (ANPR)
                </h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />
                  Production Ready
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Optical license plate localization, contextual OCR syntax validation, and sub-10ms watchlist matching
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-cyan-400" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => {
              setActiveTab("sandbox");
              runSandboxEvaluate("DL01CA1234");
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl shadow-lg shadow-cyan-500/20 transition"
          >
            <Sparkles className="w-4 h-4" />
            OCR Test Sandbox
          </button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Reads (24h)</span>
            <CarFront className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">
            {stats ? stats.totalReads.toLocaleString() : "..."}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span>{stats ? stats.uniquePlates : 0} unique vehicles</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Watchlist Alerts</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-1.5">
            {stats ? stats.watchlistHits : "..."}
          </div>
          <div className="text-xs text-rose-500/80 mt-1">
            {stats ? stats.pendingReviews : 0} pending security reviews
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Parked Vehicles</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-1.5">
            {stats ? stats.activeParkedVehicles : "..."}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Currently inside facility
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Mean OCR Confidence</span>
            <Cpu className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">
            {stats ? `${(stats.averageConfidence * 100).toFixed(1)}%` : "..."}
          </div>
          <div className="text-xs text-emerald-400 mt-1">
            High optical sharpness
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Overstay Dwell</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">
            {stats ? stats.overstayAlerts : "..."}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            &gt; 12 hr perimeter dwell
          </div>
        </div>
      </div>

      {/* Workspace Tabs Navigation */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab("events")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === "events"
              ? "border-cyan-500 text-cyan-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          Live Detections ({events.length})
        </button>

        <button
          onClick={() => setActiveTab("sandbox")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === "sandbox"
              ? "border-cyan-500 text-cyan-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Interactive OCR Sandbox
        </button>

        <button
          onClick={() => setActiveTab("sessions")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === "sessions"
              ? "border-cyan-500 text-cyan-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Clock className="w-4 h-4" />
          Vehicle Dwell & Parking ({sessions.length})
        </button>

        <button
          onClick={() => setActiveTab("watchlists")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === "watchlists"
              ? "border-cyan-500 text-cyan-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Watchlists & Hotlists ({watchlists.length})
        </button>

        <button
          onClick={() => setActiveTab("stats")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === "stats"
              ? "border-cyan-500 text-cyan-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Throughput Analytics
        </button>
      </div>

      {/* TAB 1: LIVE DETECTIONS */}
      {activeTab === "events" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                value={plateQuery}
                onChange={(e) => setPlateQuery(e.target.value)}
                placeholder="Search plate number (e.g. DL01, 22BH)..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Direction:</span>
              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">All Directions</option>
                <option value="entry">Entry Only</option>
                <option value="exit">Exit Only</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Review:</span>
              <select
                value={reviewStatusFilter}
                onChange={(e) => setReviewStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="false_positive">False Positive</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>

            <button
              onClick={() => setWatchlistOnly(!watchlistOnly)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
                watchlistOnly
                  ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                  : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Watchlist Hits Only
            </button>
          </div>

          {/* Events Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">License Plate</th>
                    <th className="py-3 px-4">Optical Confidence</th>
                    <th className="py-3 px-4">Watchlist Match</th>
                    <th className="py-3 px-4">Vehicle Attributes</th>
                    <th className="py-3 px-4">Camera & Direction</th>
                    <th className="py-3 px-4">Observed At</th>
                    <th className="py-3 px-4">Review Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        No plate detections found. Try clearing filters or run the OCR Test Sandbox.
                      </td>
                    </tr>
                  ) : (
                    events.map((event) => {
                      const isWatchlist = Boolean(event.watchlist_id);
                      return (
                        <tr key={event.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {/* Plate stylized badge */}
                              <div className="px-2.5 py-1 bg-slate-950 border border-slate-700 rounded-lg font-mono font-bold text-white tracking-widest text-sm shadow-inner flex items-center gap-1.5">
                                <span className="text-[10px] text-cyan-400 font-sans border-r border-slate-700 pr-1">
                                  {event.country_code}
                                </span>
                                {event.plate_number}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    event.plate_confidence >= 0.9
                                      ? "bg-emerald-400"
                                      : event.plate_confidence >= 0.75
                                      ? "bg-cyan-400"
                                      : "bg-amber-400"
                                  }`}
                                  style={{ width: `${event.plate_confidence * 100}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono text-slate-300">
                                {(event.plate_confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            {isWatchlist ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3" />
                                  {event.watchlist_name || "Watchlist Hit"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">None (Cleared)</span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-xs">
                              <div className="text-slate-200 capitalize font-medium">
                                {event.vehicle_color || ""} {event.vehicle_make || ""} {event.vehicle_model || event.vehicle_type || "Vehicle"}
                              </div>
                              <div className="text-slate-500 text-[11px] capitalize">{event.plate_type} plate</div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-xs">
                              <div className="text-slate-300 flex items-center gap-1">
                                {event.camera_name || event.camera_id}
                              </div>
                              <div className="mt-0.5">
                                {event.entry_direction === "entry" && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                                    <ArrowDownLeft className="w-3 h-3" /> Entry
                                  </span>
                                )}
                                {event.entry_direction === "exit" && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                                    <ArrowUpRight className="w-3 h-3" /> Exit
                                  </span>
                                )}
                                {event.entry_direction === "unknown" && (
                                  <span className="text-[11px] text-slate-500">Camera Point</span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-xs text-slate-400 font-mono">
                            {new Date(event.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                                event.review_status === "confirmed"
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : event.review_status === "false_positive"
                                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                  : event.review_status === "dismissed"
                                  ? "bg-slate-700 text-slate-300"
                                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              }`}
                            >
                              {event.review_status}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedEvent(event);
                                setReviewNotes(event.review_notes || "");
                              }}
                              className="px-3 py-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-lg border border-cyan-500/20 transition"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE OCR TEST SANDBOX */}
      {activeTab === "sandbox" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  Optical License Plate Validator
                </h2>
                <span className="text-xs text-slate-400 font-mono">Real In-Memory Pipeline</span>
              </div>
              <p className="text-xs text-slate-400">
                Test license plate localization, contextual OCR confusion correction (e.g. O/0, I/1, B/8),
                grammar rule matching, and watchlist alerts without mock code.
              </p>

              <div>
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Target License Plate String
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="text"
                    value={sandboxInput}
                    onChange={(e) => setSandboxInput(e.target.value)}
                    placeholder="Enter plate (e.g. DL01CA1234)..."
                    className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono text-sm tracking-wider uppercase focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={() => runSandboxEvaluate()}
                    disabled={sandboxEvaluating}
                    className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm transition"
                  >
                    {sandboxEvaluating ? "Evaluating..." : "Evaluate"}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Preset Diagnostic Plates</label>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => {
                      setSandboxInput("DL01CA1234");
                      runSandboxEvaluate("DL01CA1234");
                    }}
                    className="p-2 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-xl text-left transition"
                  >
                    <div className="font-mono font-bold text-rose-400">DL01CA1234</div>
                    <div className="text-[10px] text-slate-500">Stolen Hotlist FIR #492</div>
                  </button>

                  <button
                    onClick={() => {
                      setSandboxInput("22BH1234AB");
                      runSandboxEvaluate("22BH1234AB");
                    }}
                    className="p-2 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-xl text-left transition"
                  >
                    <div className="font-mono font-bold text-rose-400">22BH1234AB</div>
                    <div className="text-[10px] text-slate-500">ATM Vault Heist Suspect</div>
                  </button>

                  <button
                    onClick={() => {
                      // Notice the character 'O' instead of digit '0' in district code position
                      setSandboxInput("DLO1CA1234");
                      runSandboxEvaluate("DLO1CA1234");
                    }}
                    className="p-2 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-xl text-left transition"
                  >
                    <div className="font-mono font-bold text-amber-400">DLO1CA1234</div>
                    <div className="text-[10px] text-slate-500">OCR Confusion Test (O vs 0)</div>
                  </button>

                  <button
                    onClick={() => {
                      setSandboxInput("MH12AB9999");
                      runSandboxEvaluate("MH12AB9999");
                    }}
                    className="p-2 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-xl text-left transition"
                  >
                    <div className="font-mono font-bold text-emerald-400">MH12AB9999</div>
                    <div className="text-[10px] text-slate-500">VIP Executive Fleet</div>
                  </button>
                </div>
              </div>

              {sandboxFeedback && (
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300">
                  {sandboxFeedback}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            {sandboxResult ? (
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                    Pipeline Execution Results
                  </span>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Latency: {sandboxResult.processingTimeMs} ms
                  </span>
                </div>

                {/* Plate Presentation Badge */}
                <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center gap-3">
                  <div className="px-6 py-3 bg-white text-black font-mono font-black text-3xl tracking-[0.25em] rounded-xl border-4 border-slate-900 shadow-2xl shadow-cyan-500/10 flex items-center gap-3">
                    <span className="text-xs font-sans font-bold bg-blue-700 text-white px-2 py-1 rounded">
                      {sandboxResult.plate.countryCode}
                    </span>
                    <span>{sandboxResult.plate.plateNumber}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>Region: <strong className="text-white">{sandboxResult.plate.regionCode || "N/A"}</strong></span>
                    <span>•</span>
                    <span>Format: <strong className="text-cyan-400">{sandboxResult.plate.syntaxFormatName || "Generic"}</strong></span>
                    <span>•</span>
                    <span>Type: <strong className="text-white capitalize">{sandboxResult.plate.plateType}</strong></span>
                  </div>
                </div>

                {/* Character Breakdown & Corrections */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Character-Level Confidences &amp; Corrections</span>
                    <span className="text-cyan-400 font-semibold">
                      Corrections Applied: {sandboxResult.plate.correctionsApplied}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {sandboxResult.plate.characters.map((ch, idx) => (
                      <div
                        key={idx}
                        className="flex-1 min-w-[42px] p-2 bg-slate-950 border border-slate-800 rounded-xl text-center"
                      >
                        <div className="font-mono font-bold text-base text-white">{ch.char}</div>
                        <div className="text-[10px] text-emerald-400 font-mono">
                          {(ch.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Watchlist Result Box */}
                <div
                  className={`p-4 rounded-xl border ${
                    sandboxResult.watchlistMatch.matched
                      ? "bg-rose-500/10 border-rose-500/30"
                      : "bg-emerald-500/10 border-emerald-500/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {sandboxResult.watchlistMatch.matched ? (
                        <ShieldAlert className="w-5 h-5 text-rose-400" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {sandboxResult.watchlistMatch.matched
                            ? `Watchlist Match: ${sandboxResult.watchlistMatch.watchlistName}`
                            : "No Watchlist Violations (Vehicle Cleared)"}
                        </h4>
                        {sandboxResult.watchlistMatch.reason && (
                          <p className="text-xs text-rose-300 mt-0.5">
                            Reason: {sandboxResult.watchlistMatch.reason}
                          </p>
                        )}
                      </div>
                    </div>

                    {sandboxResult.watchlistMatch.severity && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500 text-white shadow-sm">
                        {sandboxResult.watchlistMatch.severity} ALERT
                      </span>
                    )}
                  </div>
                </div>

                {/* Ingest Action Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleSandboxIngest}
                    disabled={sandboxIngesting}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-emerald-500/20 transition"
                  >
                    <UploadCloud className="w-4 h-4" />
                    {sandboxIngesting ? "Ingesting..." : "Ingest As Live Detection Event"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-12 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                <CarFront className="w-10 h-10 text-slate-600" />
                <p>Click "Evaluate" or choose a preset plate on the left to run diagnostic OCR analysis.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: VEHICLE SESSIONS & DWELL TRACKING */}
      {activeTab === "sessions" && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Vehicle Plate</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Entry Time & Camera</th>
                    <th className="py-3 px-4">Exit Time & Camera</th>
                    <th className="py-3 px-4">Dwell Duration</th>
                    <th className="py-3 px-4">Vehicle Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        No vehicle parking sessions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    sessions.map((sess) => {
                      const durationMin = sess.duration_seconds
                        ? Math.round(sess.duration_seconds / 60)
                        : Math.round((Date.now() - new Date(sess.entry_at).getTime()) / 60000);
                      const isInside = sess.status === "inside";

                      return (
                        <tr key={sess.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4">
                            <div className="px-2.5 py-1 bg-slate-950 border border-slate-700 rounded-lg font-mono font-bold text-white tracking-wider text-sm inline-block">
                              {sess.plate_number}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                                isInside
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : "bg-slate-700 text-slate-300"
                              }`}
                            >
                              {sess.status}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-xs">
                              <div className="text-slate-200">
                                {new Date(sess.entry_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </div>
                              <div className="text-slate-500 text-[11px]">{sess.entry_camera_name || "Entry Gate"}</div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-xs">
                              {sess.exit_at ? (
                                <>
                                  <div className="text-slate-200">
                                    {new Date(sess.exit_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                  <div className="text-slate-500 text-[11px]">{sess.exit_camera_name || "Exit Gate"}</div>
                                </>
                              ) : (
                                <span className="text-slate-500">Currently Inside</span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-cyan-300">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {durationMin >= 60
                                ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
                                : `${durationMin} mins`}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-xs text-slate-400 capitalize">
                            {sess.vehicle_color || ""} {sess.vehicle_type || "Vehicle"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: WATCHLISTS & HOTLIST REGISTRY */}
      {activeTab === "watchlists" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Watchlists</h3>
            </div>

            <div className="space-y-2">
              {watchlists.map((wl) => (
                <button
                  key={wl.id}
                  onClick={() => setSelectedWatchlistId(wl.id)}
                  className={`w-full p-4 rounded-xl border text-left transition flex items-center justify-between ${
                    selectedWatchlistId === wl.id
                      ? "bg-slate-800 border-cyan-500 text-white shadow-sm"
                      : "bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <div>
                    <div className="font-semibold text-sm flex items-center gap-2">
                      <span>{wl.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 uppercase font-mono">
                        {wl.list_type}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 line-clamp-1">{wl.description}</div>
                  </div>

                  <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                    {wl.alert_severity}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Enrolled Target Plates ({watchlistPlates.length})
              </h3>
              <button
                onClick={() => setAddPlateModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Watchlist Plate
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Plate Number</th>
                    <th className="py-3 px-4">Reason / Notes</th>
                    <th className="py-3 px-4">Vehicle Description</th>
                    <th className="py-3 px-4">Fuzzy Match</th>
                    <th className="py-3 px-4">Hit Count</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {watchlistPlates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No plates enrolled in this watchlist yet. Click &quot;Add Watchlist Plate&quot; to enroll.
                      </td>
                    </tr>
                  ) : (
                    watchlistPlates.map((plate) => (
                      <tr key={plate.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4">
                          <div className="px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg font-mono font-bold text-white text-xs tracking-wider inline-block">
                            {plate.plate_number}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="text-slate-200 font-medium">{plate.reason}</div>
                          {plate.owner_name && <div className="text-slate-500 text-[11px]">{plate.owner_name}</div>}
                        </td>
                        <td className="py-3 px-4 text-xs capitalize text-slate-400">
                          {plate.vehicle_color || ""} {plate.vehicle_make || ""} {plate.vehicle_model || plate.vehicle_type || ""}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {plate.fuzzy_match ? (
                            <span className="text-emerald-400 font-mono text-[11px]">Enabled (≤{plate.max_levenshtein_distance})</span>
                          ) : (
                            <span className="text-slate-500 font-mono text-[11px]">Exact Only</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-cyan-400">
                          {plate.match_count}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleRemovePlate(plate.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: THROUGHPUT ANALYTICS */}
      {activeTab === "stats" && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              24-Hour Plate Ingestion Throughput
            </h3>
            <div className="h-56 flex items-end gap-2 pt-6 pb-2">
              {stats.readsByHour.map((item, idx) => {
                const maxCount = Math.max(...stats.readsByHour.map((r) => r.count), 10);
                const heightPercent = Math.round((item.count / maxCount) * 100);
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                    <div className="text-[10px] font-mono text-cyan-400 opacity-0 group-hover:opacity-100 transition">
                      {item.count}
                    </div>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-cyan-600 to-blue-500 hover:from-cyan-400 hover:to-blue-400 transition"
                      style={{ height: `${Math.max(6, heightPercent)}%` }}
                    />
                    <span className="text-[9px] font-mono text-slate-500 rotate-45 origin-left">
                      {item.hour}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-4 p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Vehicle Type Distribution
            </h3>
            <div className="space-y-2.5">
              {Object.entries(stats.vehicleTypeBreakdown).map(([type, count]) => {
                const percent = stats.totalReads > 0 ? ((count / stats.totalReads) * 100).toFixed(0) : "0";
                return (
                  <div key={type} className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize font-semibold text-slate-200">{type}</span>
                      <span className="font-mono text-cyan-400">{count} ({percent}%)</span>
                    </div>
                    <div className="mt-1.5 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* INSPECT EVENT MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CarFront className="w-5 h-5 text-cyan-400" />
                License Plate Incident Details
              </h3>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">Localized Plate</div>
                <div className="text-2xl font-mono font-bold text-white mt-0.5 tracking-wider">
                  {selectedEvent.plate_number}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase tracking-wider">Confidence</div>
                <div className="text-lg font-mono font-bold text-emerald-400">
                  {(selectedEvent.plate_confidence * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-500">Camera Source</span>
                <div className="font-semibold text-slate-200 mt-0.5">{selectedEvent.camera_name || selectedEvent.camera_id}</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-500">Timestamp</span>
                <div className="font-semibold text-slate-200 mt-0.5">
                  {new Date(selectedEvent.occurred_at).toLocaleString()}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-500">Vehicle Attributes</span>
                <div className="font-semibold text-slate-200 mt-0.5 capitalize">
                  {selectedEvent.vehicle_color || ""} {selectedEvent.vehicle_make || ""} {selectedEvent.vehicle_type || "Car"}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-500">Watchlist Status</span>
                <div className="font-semibold text-slate-200 mt-0.5">
                  {selectedEvent.watchlist_name ? (
                    <span className="text-rose-400 font-bold">{selectedEvent.watchlist_name}</span>
                  ) : (
                    <span className="text-emerald-400">Not Matched</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Review Notes (Optional)</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Enter verification notes for security audit log..."
                className="mt-1.5 w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                onClick={() => handleReview("false_positive")}
                disabled={submittingReview}
                className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 font-semibold rounded-xl text-xs transition"
              >
                Flag False Positive
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReview("dismissed")}
                  disabled={submittingReview}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => handleReview("confirmed")}
                  disabled={submittingReview}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold transition"
                >
                  Confirm Match
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD WATCHLIST PLATE MODAL */}
      {addPlateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAddPlate}
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-cyan-400" />
                Enroll Watchlist License Plate
              </h3>
              <button
                type="button"
                onClick={() => setAddPlateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Plate Number *</label>
              <input
                type="text"
                required
                value={newPlateNumber}
                onChange={(e) => setNewPlateNumber(e.target.value)}
                placeholder="e.g. DL01CA1234 or 22BH1234AB"
                className="mt-1 w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-sm tracking-wider uppercase text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Reason / FIR Case Number *</label>
              <input
                type="text"
                required
                value={newPlateReason}
                onChange={(e) => setNewPlateReason(e.target.value)}
                placeholder="e.g. Stolen vehicle report #8892/2026"
                className="mt-1 w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Vehicle Make</label>
                <input
                  type="text"
                  value={newPlateVehicleMake}
                  onChange={(e) => setNewPlateVehicleMake(e.target.value)}
                  placeholder="e.g. Toyota"
                  className="mt-1 w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Vehicle Color</label>
                <input
                  type="text"
                  value={newPlateVehicleColor}
                  onChange={(e) => setNewPlateVehicleColor(e.target.value)}
                  placeholder="e.g. White"
                  className="mt-1 w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Vehicle Category</label>
                <select
                  value={newPlateVehicleType}
                  onChange={(e) => setNewPlateVehicleType(e.target.value as any)}
                  className="mt-1 w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="car">Car</option>
                  <option value="truck">Truck</option>
                  <option value="bus">Bus</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="van">Van</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Alert Priority</label>
                <select
                  value={newPlatePriority}
                  onChange={(e) => setNewPlatePriority(e.target.value as any)}
                  className="mt-1 w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="critical">Critical (P1)</option>
                  <option value="high">High (P2)</option>
                  <option value="medium">Medium (P3)</option>
                  <option value="low">Low (P4)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="fuzzyMatchCheck"
                checked={newPlateFuzzy}
                onChange={(e) => setNewPlateFuzzy(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0"
              />
              <label htmlFor="fuzzyMatchCheck" className="text-xs text-slate-300">
                Enable OCR Confusion &amp; Levenshtein Fuzzy Matching (±1 character)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAddPlateModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPlate}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition"
              >
                {savingPlate ? "Saving..." : "Enroll Plate"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
