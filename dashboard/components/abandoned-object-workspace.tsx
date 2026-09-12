"use client";

import { useState, useEffect, useCallback, useId } from "react";
import {
  Package,
  AlertTriangle,
  ShieldAlert,
  Clock,
  MapPin,
  Eye,
  Sliders,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Play,
  Layers,
  ArrowUpRight,
  Shield,
  Activity,
  Filter,
  Plus,
  Trash2,
  Lock,
  UserX,
  Briefcase,
  Box,
} from "lucide-react";
import {
  abandonedObjectApi,
  type AbandonedObjectEvent,
  type AbandonedObjectZone,
  type AbandonedObjectConfig,
  type AbandonedObjectStats,
} from "@/lib/api-client";

export function AbandonedObjectWorkspace({ cameraId }: { cameraId?: string }) {
  const [selectedCameraId, setSelectedCameraId] = useState<string>(cameraId || "cam-branch-01-main");
  const [events, setEvents] = useState<AbandonedObjectEvent[]>([]);
  const [zones, setZones] = useState<AbandonedObjectZone[]>([]);
  const [stats, setStats] = useState<AbandonedObjectStats | null>(null);
  const [config, setConfig] = useState<AbandonedObjectConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<AbandonedObjectEvent | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [objectTypeFilter, setObjectTypeFilter] = useState<string>("ALL");

  // Modals & Panels
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [runningSimulation, setRunningSimulation] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Form State for new zone
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneType, setNewZoneType] = useState<any>("sterile_zone");
  const [newZoneSensitivity, setNewZoneSensitivity] = useState<any>("high");
  const [newZoneUnattendedSec, setNewZoneUnattendedSec] = useState(45);
  const [newZoneAbandonedSec, setNewZoneAbandonedSec] = useState(120);

  // Simulation test scenarios
  const [activeScenario, setActiveScenario] = useState<"normal" | "unattended_backpack" | "abandoned_box" | "sterile_breach">("unattended_backpack");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [eventsRes, zonesRes, statsRes, configRes] = await Promise.all([
        abandonedObjectApi.listEvents({
          cameraId: selectedCameraId || undefined,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          severity: severityFilter === "ALL" ? undefined : severityFilter,
          limit: 30,
        }),
        abandonedObjectApi.listZones({ cameraId: selectedCameraId || undefined }),
        abandonedObjectApi.getStats(selectedCameraId || undefined),
        abandonedObjectApi.getConfig(selectedCameraId),
      ]);

      if (eventsRes.success) setEvents(eventsRes.data);
      if (zonesRes.success) setZones(zonesRes.data);
      if (statsRes.success) setStats(statsRes.data);
      if (configRes.success) setConfig(configRes.data);
    } catch (err) {
      console.error("Failed to load abandoned object data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCameraId, statusFilter, severityFilter]);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 8000);
    return () => clearInterval(timer);
  }, [loadData]);

  // Run Real Frame Simulation through live backend API
  const handleRunSimulation = async (scenario: "normal" | "unattended_backpack" | "abandoned_box" | "sterile_breach") => {
    try {
      setRunningSimulation(true);
      setActiveScenario(scenario);

      let candidateBlobs: Array<{ x: number; y: number; width: number; height: number }> = [];
      let persons: Array<{ trackId: string; boundingBox: { x: number; y: number; width: number; height: number }; confidence: number }> = [];

      if (scenario === "unattended_backpack") {
        candidateBlobs = [{ x: 120, y: 150, width: 45, height: 50 }]; // Inside ATM zone
        persons = [{ trackId: "person-owner-01", boundingBox: { x: 380, y: 140, width: 60, height: 160 }, confidence: 0.915 }]; // Walked away (260px away)
      } else if (scenario === "abandoned_box") {
        candidateBlobs = [{ x: 620, y: 220, width: 75, height: 70 }]; // Inside Cash Counter Perimeter
        persons = []; // Owner completely gone
      } else if (scenario === "sterile_breach") {
        candidateBlobs = [{ x: 220, y: 180, width: 90, height: 60 }]; // Duffel bag in Sterile zone
        persons = [{ trackId: "stranger-09", boundingBox: { x: 50, y: 50, width: 50, height: 140 }, confidence: 0.91 }];
      }

      const res = await abandonedObjectApi.analyzeFrame({
        cameraId: selectedCameraId,
        candidateBlobs,
        persons,
        saveToDb: true,
      });

      if (res.success) {
        setSimulationResult(res.data);
        await loadData();
      }
    } catch (err) {
      console.error("Failed to execute frame analysis simulation:", err);
    } finally {
      setRunningSimulation(false);
    }
  };

  const handleUpdateStatus = async (
    eventId: string,
    newStatus: "detected" | "investigating" | "cleared" | "false_positive" | "escalated"
  ) => {
    try {
      setSubmittingReview(true);
      const res = await abandonedObjectApi.updateEventStatus(eventId, newStatus, reviewNotes || undefined);
      if (res.success) {
        setEvents((prev) => prev.map((e) => (e.id === eventId ? res.data : e)));
        if (selectedEvent?.id === eventId) setSelectedEvent(res.data);
        setReviewNotes("");
        await loadData();
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName) return;

    try {
      const res = await abandonedObjectApi.createZone({
        zoneName: newZoneName,
        zoneType: newZoneType,
        sensitivity: newZoneSensitivity,
        unattendedThresholdSeconds: newZoneUnattendedSec,
        abandonedThresholdSeconds: newZoneAbandonedSec,
        cameraId: selectedCameraId,
        polygon: [
          { x: 100, y: 100 },
          { x: 400, y: 100 },
          { x: 400, y: 350 },
          { x: 100, y: 350 },
        ],
      });

      if (res.success) {
        setZones((prev) => [res.data, ...prev]);
        setZoneModalOpen(false);
        setNewZoneName("");
      }
    } catch (err) {
      console.error("Failed to create zone:", err);
    }
  };

  const handleDeleteZone = async (id: string) => {
    try {
      await abandonedObjectApi.deleteZone(id);
      setZones((prev) => prev.filter((z) => z.id !== id));
    } catch (err) {
      console.error("Failed to delete zone:", err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    try {
      const res = await abandonedObjectApi.updateConfig(selectedCameraId, config);
      if (res.success) {
        setConfig(res.data);
        setConfigModalOpen(false);
      }
    } catch (err) {
      console.error("Failed to save config:", err);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "P1":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">P1 CRITICAL</span>;
      case "P2":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">P2 HIGH</span>;
      case "P3":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">P3 MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-500/20 text-slate-300 border border-slate-500/30">P4 LOW</span>;
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case "detected":
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Detected</span>;
      case "investigating":
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">Investigating</span>;
      case "cleared":
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Cleared</span>;
      case "escalated":
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">Escalated</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-500/10 text-slate-400 border border-slate-500/20">False Positive</span>;
    }
  };

  const formatDwellTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto text-slate-100">
      {/* 1. Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Abandoned & Unattended Object Detection
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  analytics.abandoned_object
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Static foreground blob tracking for bags, boxes, or parcels left in sensitive banking & transit zones.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedCameraId}
            onChange={(e) => setSelectedCameraId(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-sm rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="cam-branch-01-main">Lobby Camera 01 (ATM & Cash)</option>
            <option value="cam-branch-02-vault">Vault Corridor 02</option>
            <option value="cam-branch-03-emergency">Emergency Exit Hallway 03</option>
          </select>

          <button
            onClick={() => setZoneModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg transition"
          >
            <Layers className="w-4 h-4 text-amber-400" />
            Monitored Zones ({zones.length})
          </button>

          <button
            onClick={() => setConfigModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg transition"
          >
            <Sliders className="w-4 h-4 text-slate-400" />
            Sensitivity
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* 2. Operational KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>ACTIVE UNATTENDED</span>
            <Package className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-3xl font-bold text-white tracking-tight">
            {stats?.totalActive ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Live stationary items</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>P1 CRITICAL THREATS</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 text-3xl font-bold text-rose-400 tracking-tight">
            {stats?.criticalP1Count ?? 0}
          </div>
          <div className="mt-1 text-xs text-rose-500/80 font-medium">Sterile / vault breaches</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>AVG DWELL TIME</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-3xl font-bold text-white tracking-tight">
            {formatDwellTime(stats?.avgDwellTimeSeconds ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Minutes : Seconds</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>STERILE ZONES</span>
            <MapPin className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-3xl font-bold text-emerald-400 tracking-tight">
            {stats?.zonesMonitored ?? zones.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Polygon boundaries</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>RESOLUTION RATIO</span>
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-3xl font-bold text-purple-300 tracking-tight">
            {stats?.totalCleared ?? 0} <span className="text-sm font-normal text-slate-500">/ {stats?.totalEscalated ?? 0}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Cleared vs Escalated</div>
        </div>
      </div>

      {/* 3. Live Canvas & Simulation Playground */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Interactive Canvas Feed */}
        <div className="lg:col-span-2 rounded-xl bg-slate-900/80 border border-slate-800 p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Eye className="w-4 h-4 text-amber-400" />
              Spatial CCTV Visualizer & Zone Overlay
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Real-Time Frame Stream
            </div>
          </div>

          {/* Canvas Simulation Viewport */}
          <div className="relative w-full aspect-video bg-slate-950 rounded-lg border border-slate-800 overflow-hidden flex items-center justify-center">
            {/* Background Floorplan Graphic */}
            <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px]" />

            {/* Render Monitored Zones */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {/* ATM Vestibule Zone */}
              <polygon
                points="40,30 280,30 280,240 40,240"
                className="fill-amber-500/10 stroke-amber-500/40 stroke-2 stroke-dasharray-[4,4]"
              />
              <text x="50" y="55" fill="#f59e0b" fontSize="12" fontWeight="bold">
                ZONE 1: ATM VESTIBULE (STERILE)
              </text>

              {/* Cash Counter Perimeter */}
              <polygon
                points="340,50 620,50 620,280 340,280"
                className="fill-rose-500/10 stroke-rose-500/40 stroke-2 stroke-dasharray-[4,4]"
              />
              <text x="350" y="75" fill="#f43f5e" fontSize="12" fontWeight="bold">
                ZONE 2: CASH COUNTER PERIMETER
              </text>

              {/* Draw scenario items */}
              {activeScenario === "unattended_backpack" && (
                <>
                  {/* Abandoned Bag Box */}
                  <rect
                    x="100"
                    y="110"
                    width="60"
                    height="70"
                    className="fill-rose-500/20 stroke-rose-500 stroke-2 animate-pulse"
                  />
                  <text x="90" y="100" fill="#f43f5e" fontSize="11" fontWeight="bold">
                    ⚠️ 01:45 DWELL (Backpack)
                  </text>

                  {/* Departing Person */}
                  <rect
                    x="230"
                    y="80"
                    width="40"
                    height="100"
                    className="fill-sky-500/10 stroke-sky-400 stroke-1"
                  />
                  <text x="215" y="70" fill="#38bdf8" fontSize="11">
                    Person [owner-01]
                  </text>

                  {/* Separation Distance Vector */}
                  <line
                    x1="130"
                    y1="145"
                    x2="250"
                    y2="130"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    strokeDasharray="3,3"
                  />
                  <text x="160" y="130" fill="#fcd34d" fontSize="10">
                    dist: 185px (Separated)
                  </text>
                </>
              )}

              {activeScenario === "abandoned_box" && (
                <>
                  <rect
                    x="420"
                    y="130"
                    width="85"
                    height="80"
                    className="fill-rose-600/30 stroke-rose-400 stroke-2 animate-pulse"
                  />
                  <text x="390" y="120" fill="#f43f5e" fontSize="11" fontWeight="bold">
                    🚨 P1 ABANDONED BOX (03:10)
                  </text>
                  <text x="400" y="235" fill="#fda4af" fontSize="10">
                    No Owner in Proximity
                  </text>
                </>
              )}

              {activeScenario === "sterile_breach" && (
                <>
                  <rect
                    x="130"
                    y="120"
                    width="95"
                    height="65"
                    className="fill-rose-600/30 stroke-rose-500 stroke-2 animate-pulse"
                  />
                  <text x="100" y="110" fill="#f43f5e" fontSize="11" fontWeight="bold">
                    🚨 SUSPICIOUS DUFFEL BAG (P1)
                  </text>
                </>
              )}
            </svg>

            {/* Center Status Banner */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between p-2 rounded bg-slate-900/90 border border-slate-800 text-xs backdrop-blur">
              <div className="flex items-center gap-2 text-slate-300 font-mono">
                <span>FPS: 15.0</span>
                <span>•</span>
                <span>RES: 1920x1080</span>
                <span>•</span>
                <span>CODEC: H.264</span>
              </div>
              <div className="text-amber-400 font-medium">
                Active Scenario: <span className="uppercase">{activeScenario.replace("_", " ")}</span>
              </div>
            </div>
          </div>

          {/* Scenario Trigger Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Test Scenario:</span>
            <button
              onClick={() => handleRunSimulation("normal")}
              disabled={runningSimulation}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                activeScenario === "normal"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
              }`}
            >
              Clean Floor (Normal)
            </button>
            <button
              onClick={() => handleRunSimulation("unattended_backpack")}
              disabled={runningSimulation}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                activeScenario === "unattended_backpack"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
              }`}
            >
              Unattended Backpack (ATM Zone)
            </button>
            <button
              onClick={() => handleRunSimulation("abandoned_box")}
              disabled={runningSimulation}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                activeScenario === "abandoned_box"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
              }`}
            >
              P1 Abandoned Parcel (Cash Counter)
            </button>
            <button
              onClick={() => handleRunSimulation("sterile_breach")}
              disabled={runningSimulation}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                activeScenario === "sterile_breach"
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
              }`}
            >
              Sterile Vault Breach
            </button>
          </div>
        </div>

        {/* Right: Selected Event & Action Card */}
        <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                Incident Investigation & Dispatch
              </h2>
              {selectedEvent && getSeverityBadge(selectedEvent.severity)}
            </div>

            {selectedEvent ? (
              <div className="mt-4 flex flex-col gap-3 text-sm">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs">Event Type:</span>
                    <span className="text-white font-medium uppercase font-mono text-xs">
                      {selectedEvent.event_type.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs">Object Class:</span>
                    <span className="text-white font-medium capitalize">
                      {selectedEvent.object_type.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs">Dwell Time:</span>
                    <span className="text-amber-400 font-bold font-mono">
                      {formatDwellTime(selectedEvent.dwell_time_seconds)} ({selectedEvent.dwell_time_seconds}s)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs">Confidence:</span>
                    <span className="text-emerald-400 font-medium">
                      {(selectedEvent.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs">Owner Separation:</span>
                    <span className="text-sky-300 font-medium">
                      {selectedEvent.owner_distance_pixels ? `${selectedEvent.owner_distance_pixels} px` : "Unknown / Departed"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs">Current Status:</span>
                    {getStatusBadge(selectedEvent.status)}
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="audit-notes-input" className="text-xs font-semibold text-slate-400">Security Operator Notes:</label>
                  <textarea
                    id="audit-notes-input"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Enter verification notes or security dispatch instructions..."
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-8 text-center py-10 text-slate-500 text-sm">
                Select an incident from the audit feed below to inspect bounding metrics and dispatch response.
              </div>
            )}
          </div>

          {selectedEvent && (
            <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap gap-2">
              <button
                onClick={() => handleUpdateStatus(selectedEvent.id, "investigating")}
                disabled={submittingReview}
                className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs rounded-lg transition"
              >
                Acknowledge / Investigate
              </button>
              <button
                onClick={() => handleUpdateStatus(selectedEvent.id, "escalated")}
                disabled={submittingReview}
                className="flex-1 px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs rounded-lg transition"
              >
                Dispatch Security (P1)
              </button>
              <button
                onClick={() => handleUpdateStatus(selectedEvent.id, "cleared")}
                disabled={submittingReview}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition"
              >
                Clear
              </button>
              <button
                onClick={() => handleUpdateStatus(selectedEvent.id, "false_positive")}
                disabled={submittingReview}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-lg transition"
              >
                False Positive
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Incident Audit Log Table */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-semibold text-white">Live Incident Audit & Telemetry Log</h2>
            <span className="text-xs text-slate-500 font-mono">({events.length} records)</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="detected">Detected</option>
                <option value="investigating">Investigating</option>
                <option value="cleared">Cleared</option>
                <option value="escalated">Escalated</option>
                <option value="false_positive">False Positive</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-transparent text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Severities</option>
                <option value="P1">P1 Critical</option>
                <option value="P2">P2 High</option>
                <option value="P3">P3 Medium</option>
                <option value="P4">P4 Low</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Event Type</th>
                <th className="px-4 py-3">Object</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Dwell Time</th>
                <th className="px-4 py-3">Owner Separation</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500">
                    No abandoned object incidents recorded for this camera.
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    className={`hover:bg-slate-800/50 cursor-pointer transition ${
                      selectedEvent?.id === evt.id ? "bg-slate-800/70 border-l-2 border-amber-500" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">
                      {new Date(evt.detected_at).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-white text-xs uppercase">
                      {evt.event_type.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-300 text-xs">
                      {evt.object_type.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3">{getSeverityBadge(evt.severity)}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-amber-400 text-xs">
                      {formatDwellTime(evt.dwell_time_seconds)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {evt.owner_distance_pixels ? `${evt.owner_distance_pixels}px` : "Separated"}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(evt.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(evt);
                        }}
                        className="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Zone Management Modal */}
      {zoneModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                Monitored Sterile & Sensitive Zones
              </h3>
              <button
                onClick={() => setZoneModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              {/* Existing Zones */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Boundaries:</span>
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
                  {zones.map((z) => (
                    <div key={z.id} className="p-3 flex items-center justify-between bg-slate-950/60">
                      <div>
                        <div className="font-semibold text-white text-sm">{z.zone_name}</div>
                        <div className="text-xs text-slate-400 flex gap-2 mt-0.5">
                          <span className="uppercase text-amber-400">{z.zone_type.replace("_", " ")}</span>
                          <span>•</span>
                          <span>Unattended: {z.unattended_threshold_seconds}s</span>
                          <span>•</span>
                          <span>Abandoned: {z.abandoned_threshold_seconds}s</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteZone(z.id)}
                        className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded"
                        title="Delete Zone"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Create New Zone Form */}
              <form onSubmit={handleCreateZone} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Register New Monitored Zone:</span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label htmlFor="new-zone-name-input" className="text-slate-400 block mb-1">Zone Name:</label>
                    <input
                      id="new-zone-name-input"
                      type="text"
                      value={newZoneName}
                      onChange={(e) => setNewZoneName(e.target.value)}
                      placeholder="e.g. Vault Ante-Room"
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="new-zone-type-select" className="text-slate-400 block mb-1">Zone Type:</label>
                    <select
                      id="new-zone-type-select"
                      value={newZoneType}
                      onChange={(e) => setNewZoneType(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white"
                    >
                      <option value="sterile_zone">Sterile Zone (Critical)</option>
                      <option value="atm_vestibule">ATM Vestibule</option>
                      <option value="cash_counter">Cash Counter Perimeter</option>
                      <option value="vault_perimeter">Vault Perimeter</option>
                      <option value="emergency_exit">Emergency Exit</option>
                      <option value="customer_lobby">Customer Lobby</option>
                      <option value="hallway">Hallway / Corridor</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label htmlFor="unattended-threshold-input" className="text-slate-400 block mb-1">Unattended Alarm Threshold (Seconds):</label>
                    <input
                      id="unattended-threshold-input"
                      type="number"
                      value={newZoneUnattendedSec}
                      onChange={(e) => setNewZoneUnattendedSec(Number(e.target.value))}
                      min={5}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="abandoned-threshold-input" className="text-slate-400 block mb-1">Abandoned Escalation (Seconds):</label>
                    <input
                      id="abandoned-threshold-input"
                      type="number"
                      value={newZoneAbandonedSec}
                      onChange={(e) => setNewZoneAbandonedSec(Number(e.target.value))}
                      min={10}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded transition flex items-center justify-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Save Monitored Zone
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 6. Sensitivity Config Modal */}
      {configModalOpen && config && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-400" />
                Detector Calibration ({selectedCameraId})
              </h3>
              <button
                onClick={() => setConfigModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="mt-4 space-y-4 text-xs">
              <div>
                <label htmlFor="cfg-drift-tolerance" className="text-slate-300 font-semibold block mb-1">
                  Stationary Pixel Drift Tolerance: {config.stationary_pixel_threshold} px
                </label>
                <input
                  id="cfg-drift-tolerance"
                  type="range"
                  min="2"
                  max="40"
                  value={config.stationary_pixel_threshold}
                  onChange={(e) => setConfig({ ...config, stationary_pixel_threshold: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <label htmlFor="cfg-owner-separation" className="text-slate-300 font-semibold block mb-1">
                  Owner Separation Distance: {config.owner_proximity_threshold_px} px
                </label>
                <input
                  id="cfg-owner-separation"
                  type="range"
                  min="30"
                  max="300"
                  value={config.owner_proximity_threshold_px}
                  onChange={(e) => setConfig({ ...config, owner_proximity_threshold_px: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <label htmlFor="cfg-debounce-frames" className="text-slate-300 font-semibold block mb-1">
                  Multi-Frame Debounce Confirmation: {config.debounce_frames} frames
                </label>
                <input
                  id="cfg-debounce-frames"
                  type="range"
                  min="1"
                  max="10"
                  value={config.debounce_frames}
                  onChange={(e) => setConfig({ ...config, debounce_frames: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfigModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white rounded font-semibold hover:bg-amber-500"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
