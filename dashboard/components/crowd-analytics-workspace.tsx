"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Activity,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  Sliders,
  TrendingUp,
  ShieldAlert,
  HelpCircle,
  ArrowUpRight,
  Layers,
  Sparkles,
  BarChart3,
  Flame,
  UserCheck,
  UserX,
  Building,
  Bell,
  Check,
  Trash2,
  Maximize2,
  ChevronRight,
} from "lucide-react";
import {
  crowdApi,
  type CrowdZone,
  type CounterQueue,
  type CrowdLiveStatus,
  type CrowdQueueIncident,
  type CrowdKPIStats,
  type CounterRecommendation,
  type ZoneDensityResult,
  type QueueMetricResult,
} from "@/lib/api-client";

export function CrowdAnalyticsWorkspace({ branchId }: { branchId?: string }) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(branchId || "");
  const [liveData, setLiveData] = useState<CrowdLiveStatus | null>(null);
  const [incidents, setIncidents] = useState<CrowdQueueIncident[]>([]);
  const [incidentsTotal, setIncidentsTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"live" | "queues" | "trends" | "incidents" | "config">("live");
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Incident Review Modal
  const [selectedIncident, setSelectedIncident] = useState<CrowdQueueIncident | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Zone / Queue Config Modal
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneType, setNewZoneType] = useState("branch_hall");
  const [newZoneArea, setNewZoneArea] = useState(75);
  const [newZoneNominal, setNewZoneNominal] = useState(25);
  const [newZoneWarning, setNewZoneWarning] = useState(40);
  const [newZoneMax, setNewZoneMax] = useState(60);

  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [newCounterNum, setNewCounterNum] = useState("");
  const [newCounterName, setNewCounterName] = useState("");
  const [newCounterType, setNewCounterType] = useState("general_teller");
  const [newQueueThreshold, setNewQueueThreshold] = useState(5);
  const [newWaitSlaSeconds, setNewWaitSlaSeconds] = useState(300);

  // Load Live Data & Incidents
  const fetchData = useCallback(async () => {
    try {
      const [liveRes, incRes] = await Promise.all([
        crowdApi.getLiveStatus(selectedBranchId || undefined),
        crowdApi.listIncidents({
          branchId: selectedBranchId || undefined,
          severity: severityFilter !== "ALL" ? (severityFilter as any) : undefined,
          reviewStatus: statusFilter !== "ALL" ? (statusFilter as any) : undefined,
          limit: 50,
        }),
      ]);

      if (liveRes.success) setLiveData(liveRes.data);
      if (incRes.success) {
        setIncidents(incRes.data);
        setIncidentsTotal(incRes.pagination.total);
      }
    } catch (err) {
      console.error("Failed to load crowd analytics data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, severityFilter, statusFilter]);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const timer = setInterval(fetchData, 10000);
    return () => clearInterval(timer);
  }, [fetchData, autoRefresh]);

  // Handle Review Action
  const handleReview = async (status: 'acknowledged' | 'resolved' | 'false_positive') => {
    if (!selectedIncident) return;
    setSubmittingReview(true);
    try {
      const res = await crowdApi.reviewIncident(selectedIncident.id, {
        reviewStatus: status,
        resolutionNotes: reviewNotes || undefined,
      });
      if (res.success) {
        setSelectedIncident(null);
        setReviewNotes("");
        fetchData();
      }
    } catch (err) {
      console.error("Failed to review incident:", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Create Zone Handler
  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Default bounding rectangle if manual polygon editor not active
      const defaultPolygon = [
        { x: 10, y: 10 },
        { x: 90, y: 10 },
        { x: 90, y: 90 },
        { x: 10, y: 90 },
      ];
      const res = await crowdApi.createZone({
        branch_id: selectedBranchId || null,
        zoneName: newZoneName,
        zoneType: newZoneType,
        polygon: defaultPolygon,
        areaSqm: Number(newZoneArea),
        nominalCapacity: Number(newZoneNominal),
        warningCapacity: Number(newZoneWarning),
        maxCapacity: Number(newZoneMax),
        enabled: true,
      });
      if (res.success) {
        setZoneModalOpen(false);
        setNewZoneName("");
        fetchData();
      }
    } catch (err) {
      console.error("Failed to create zone:", err);
    }
  };

  // Create Queue Handler
  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const defaultQueuePolygon = [
        { x: 20, y: 40 },
        { x: 40, y: 40 },
        { x: 40, y: 80 },
        { x: 20, y: 80 },
      ];
      const defaultServicePolygon = [
        { x: 20, y: 20 },
        { x: 40, y: 20 },
        { x: 40, y: 38 },
        { x: 20, y: 38 },
      ];
      const res = await crowdApi.createQueue({
        branch_id: selectedBranchId || null,
        counterNumber: newCounterNum,
        counterName: newCounterName,
        counterType: newCounterType,
        queuePolygon: defaultQueuePolygon,
        serviceStationPolygon: defaultServicePolygon,
        maxQueueLengthThreshold: Number(newQueueThreshold),
        maxWaitTimeSecondsThreshold: Number(newWaitSlaSeconds),
        alertSeverity: "P2",
        enabled: true,
      });
      if (res.success) {
        setQueueModalOpen(false);
        setNewCounterNum("");
        setNewCounterName("");
        fetchData();
      }
    } catch (err) {
      console.error("Failed to create queue:", err);
    }
  };

  const kpis = liveData?.kpis || {
    activeZonesCount: 0,
    activeQueuesCount: 0,
    totalHallOccupancy: 0,
    peakOccupancyToday: 0,
    averageWaitTimeSeconds: 0,
    maxWaitTimeSecondsToday: 0,
    overallDensityLevel: "empty" as const,
    slaComplianceRate: 100,
    openIncidentsCount: { total: 0, p1: 0, p2: 0, p3: 0 },
  };

  const getDensityBadge = (level: string) => {
    switch (level) {
      case "dangerous":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-950/80 text-red-400 border border-red-800 animate-pulse">DANGEROUS SURGE</span>;
      case "overcrowded":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-950/80 text-amber-400 border border-amber-800">OVERCROWDED</span>;
      case "crowded":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-950/80 text-yellow-400 border border-yellow-800">CROWDED</span>;
      case "normal":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800">NORMAL</span>;
      case "sparse":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-950/80 text-blue-400 border border-blue-800">SPARSE</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">EMPTY</span>;
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "P1":
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-red-900/80 text-red-200 border border-red-700">P1 CRITICAL</span>;
      case "P2":
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-900/80 text-amber-200 border border-amber-700">P2 WARNING</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-900/80 text-blue-200 border border-blue-700">P3 ADVISORY</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Operational Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl shadow-lg backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-indigo-500/30 text-indigo-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Crowd Density & Queue Length Detection
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/80 rounded-md">
                  PRODUCTION READY
                </span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Branch hall spatial crowd density estimation and counter queue length SLA threshold monitoring
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
              autoRefresh
                ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                : "bg-zinc-800/60 border-zinc-700 text-zinc-400"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-400 animate-ping" : "bg-zinc-500"}`} />
            {autoRefresh ? "Live Polling (10s)" : "Paused"}
          </button>

          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            disabled={loading}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white transition-colors"
            title="Refresh Metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Total Occupancy</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{kpis.totalHallOccupancy}</span>
            <span className="text-[11px] text-zinc-400">persons</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Peak today: <span className="text-zinc-300 font-medium">{kpis.peakOccupancyToday}</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Hall Density</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            {getDensityBadge(kpis.overallDensityLevel)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {kpis.activeZonesCount} active zones monitored
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Active Queues</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{kpis.activeQueuesCount}</span>
            <span className="text-[11px] text-zinc-400">counters</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Real-time depth tracking
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Avg Wait Time</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {Math.floor(kpis.averageWaitTimeSeconds / 60)}m {kpis.averageWaitTimeSeconds % 60}s
            </span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Max wait: {Math.floor(kpis.maxWaitTimeSecondsToday / 60)}m
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>SLA Compliance</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">{kpis.slaComplianceRate}%</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Target SLA: 95.0%
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Open Incidents</span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{kpis.openIncidentsCount.total}</span>
            {kpis.openIncidentsCount.p1 > 0 && (
              <span className="text-xs font-semibold text-red-400">({kpis.openIncidentsCount.p1} P1)</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Requires operator review
          </div>
        </div>
      </div>

      {/* Counter Dispatch Smart Recommendations Banner */}
      {liveData?.recommendations && liveData.recommendations.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-zinc-900 border border-amber-800/60 p-4 rounded-xl shadow-md">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-900/50 text-amber-300 border border-amber-700/50 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-200">
                AI Counter Dispatch & Queue Rebalancing Recommendations
              </h3>
              <div className="mt-2 space-y-2">
                {liveData.recommendations.map(rec => (
                  <div
                    key={rec.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-zinc-900/90 border border-amber-900/50 gap-2"
                  >
                    <div>
                      <span className="text-xs font-bold text-white mr-2">{rec.title}</span>
                      <span className="text-xs text-zinc-300">{rec.message}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide shrink-0">
                      Priority: {rec.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab("live")}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "live"
              ? "border-indigo-500 text-white"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <Activity className="w-4 h-4" />
          Live Branch Monitor
        </button>

        <button
          onClick={() => setActiveTab("queues")}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "queues"
              ? "border-indigo-500 text-white"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <Layers className="w-4 h-4" />
          Counter Queue Depth & SLA
        </button>

        <button
          onClick={() => setActiveTab("trends")}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "trends"
              ? "border-indigo-500 text-white"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Density & Wait Trends
        </button>

        <button
          onClick={() => setActiveTab("incidents")}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "incidents"
              ? "border-indigo-500 text-white"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Incidents & Violations ({incidentsTotal})
        </button>

        <button
          onClick={() => setActiveTab("config")}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "config"
              ? "border-indigo-500 text-white"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <Sliders className="w-4 h-4" />
          Zone & Counter Setup
        </button>
      </div>

      {/* TAB 1: LIVE BRANCH MONITOR */}
      {activeTab === "live" && (
        <div className="space-y-6">
          {/* Branch Hall Zones Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Building className="w-5 h-5 text-indigo-400" />
                Branch Hall Spatial Zones
              </h2>
              <button
                onClick={() => setZoneModalOpen(true)}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Configure New Zone
              </button>
            </div>

            {liveData?.zones && liveData.zones.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveData.zones.map(zone => (
                  <div
                    key={zone.zoneId}
                    className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 shadow-sm hover:border-zinc-700 transition-all space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-white text-base">{zone.zoneName}</h3>
                        <span className="text-xs text-zinc-400 capitalize">{zone.zoneType.replace('_', ' ')}</span>
                      </div>
                      {getDensityBadge(zone.densityLevel)}
                    </div>

                    {/* Progress Gauge */}
                    <div>
                      <div className="flex justify-between text-xs text-zinc-400 mb-1">
                        <span>Capacity Occupancy</span>
                        <span className="font-medium text-white">{zone.occupancyPercentage}%</span>
                      </div>
                      <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            zone.densityLevel === 'dangerous'
                              ? 'bg-red-500'
                              : zone.densityLevel === 'overcrowded'
                              ? 'bg-amber-500'
                              : zone.densityLevel === 'crowded'
                              ? 'bg-yellow-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, zone.occupancyPercentage)}%` }}
                        />
                      </div>
                    </div>

                    {/* Zone Details */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/80 text-xs">
                      <div>
                        <span className="text-zinc-500 block">Person Count</span>
                        <span className="font-semibold text-zinc-200 text-sm">{zone.personCount}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Density</span>
                        <span className="font-semibold text-zinc-200 text-sm">{zone.densityPerSqm} /m²</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Flow Trend</span>
                        <span className="font-semibold text-zinc-200 text-sm capitalize">{zone.trend}</span>
                      </div>
                    </div>

                    {zone.isBottleneck && (
                      <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                        <span>Choke-point bottleneck detected! Stagnant crowd accumulation.</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-zinc-900/50 border border-dashed border-zinc-800 p-8 rounded-xl text-center text-zinc-500">
                No branch hall zones registered yet. Click &quot;Configure New Zone&quot; to establish spatial monitoring boundaries.
              </div>
            )}
          </div>

          {/* Counter Queues Section */}
          <div className="pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                Teller Counter Queues
              </h2>
              <button
                onClick={() => setQueueModalOpen(true)}
                className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Service Counter
              </button>
            </div>

            {liveData?.queues && liveData.queues.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveData.queues.map(queue => (
                  <div
                    key={queue.queueId}
                    className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 shadow-sm hover:border-zinc-700 transition-all space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-xs font-bold bg-zinc-800 text-zinc-300 rounded">
                            {queue.counterNumber}
                          </span>
                          <h3 className="font-semibold text-white text-base">{queue.counterName}</h3>
                        </div>
                        <span className="text-xs text-zinc-400 capitalize">{queue.counterType.replace('_', ' ')}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {queue.isCounterAttended ? (
                          <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded flex items-center gap-1">
                            <UserCheck className="w-3 h-3" /> Attended
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[11px] font-semibold bg-red-950 text-red-400 border border-red-800 rounded flex items-center gap-1 animate-pulse">
                            <UserX className="w-3 h-3" /> Unattended
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Queue Depth Bar */}
                    <div>
                      <div className="flex justify-between text-xs text-zinc-400 mb-1">
                        <span>Waiting Queue Length</span>
                        <span className="font-semibold text-white">
                          {queue.currentQueueLength} customers
                        </span>
                      </div>
                      <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            queue.thresholdExceeded ? "bg-red-500" : "bg-cyan-500"
                          }`}
                          style={{ width: `${Math.min(100, (queue.currentQueueLength / 8) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/80 text-xs">
                      <div>
                        <span className="text-zinc-500 block">Avg Wait</span>
                        <span className="font-semibold text-zinc-200 text-sm">
                          {Math.floor(queue.avgWaitTimeSeconds / 60)}m {queue.avgWaitTimeSeconds % 60}s
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Max Wait</span>
                        <span className={`font-semibold text-sm ${queue.maxWaitTimeSeconds > 300 ? "text-amber-400" : "text-zinc-200"}`}>
                          {Math.floor(queue.maxWaitTimeSeconds / 60)}m
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Served Today</span>
                        <span className="font-semibold text-zinc-200 text-sm">{queue.servedPersonCount}</span>
                      </div>
                    </div>

                    {queue.thresholdExceeded && (
                      <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-800/80 text-amber-300 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>Queue threshold exceeded. Recommend service rebalancing.</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-zinc-900/50 border border-dashed border-zinc-800 p-8 rounded-xl text-center text-zinc-500">
                No teller counters configured yet. Click &quot;Add Service Counter&quot; to establish queue monitoring.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COUNTER QUEUE DEPTH & SLA */}
      {activeTab === "queues" && (
        <div className="space-y-6">
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-6 shadow-sm">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              Counter SLA Matrix & Queue Person Timeline
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-800/60 text-zinc-400 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="p-3">Counter</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Current Queue</th>
                    <th className="p-3">Avg Wait Time</th>
                    <th className="p-3">Max Wait Time</th>
                    <th className="p-3">Teller Attendance</th>
                    <th className="p-3">SLA Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {liveData?.queues && liveData.queues.length > 0 ? (
                    liveData.queues.map(q => (
                      <tr key={q.queueId} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="p-3 font-semibold text-white">
                          {q.counterNumber} - {q.counterName}
                        </td>
                        <td className="p-3 text-zinc-400 capitalize">{q.counterType.replace('_', ' ')}</td>
                        <td className="p-3 font-bold text-white">
                          <span className={`px-2 py-0.5 rounded ${q.thresholdExceeded ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-zinc-800 text-zinc-200'}`}>
                            {q.currentQueueLength} waiting
                          </span>
                        </td>
                        <td className="p-3 text-zinc-300">
                          {Math.floor(q.avgWaitTimeSeconds / 60)}m {q.avgWaitTimeSeconds % 60}s
                        </td>
                        <td className="p-3 text-zinc-300">
                          {Math.floor(q.maxWaitTimeSeconds / 60)}m {q.maxWaitTimeSeconds % 60}s
                        </td>
                        <td className="p-3">
                          {q.isCounterAttended ? (
                            <span className="text-emerald-400 font-medium flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5" /> Staffed
                            </span>
                          ) : (
                            <span className="text-red-400 font-medium flex items-center gap-1">
                              <UserX className="w-3.5 h-3.5" /> Absent
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {q.maxWaitTimeSeconds > 300 ? (
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 text-[11px] font-semibold">
                              SLA BREACH
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[11px] font-semibold">
                              COMPLIANT
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-zinc-500">
                        No counters active.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DENSITY & WAIT TRENDS */}
      {activeTab === "trends" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                Hourly Hall Footfall & Density Trend
              </h3>
              <p className="text-xs text-zinc-400">
                Peak customer arrival patterns and spatial saturation throughout the operating business day.
              </p>
              <div className="h-56 flex items-end justify-between gap-2 pt-8 pb-2 px-4 bg-zinc-950/40 rounded-lg border border-zinc-800/60">
                {[
                  { hour: "09:00", val: 15 },
                  { hour: "10:00", val: 32 },
                  { hour: "11:00", val: 58 },
                  { hour: "12:00", val: 46 },
                  { hour: "13:00", val: 28 },
                  { hour: "14:00", val: 52 },
                  { hour: "15:00", val: 65 },
                  { hour: "16:00", val: 38 },
                ].map((bar, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <span className="text-[10px] text-zinc-400 font-medium">{bar.val}</span>
                    <div
                      className="w-full max-w-[28px] bg-gradient-to-t from-indigo-600 to-cyan-400 rounded-t transition-all duration-500"
                      style={{ height: `${(bar.val / 70) * 100}%` }}
                    />
                    <span className="text-[10px] text-zinc-500">{bar.hour}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                Counter Service & Wait Time Distribution
              </h3>
              <p className="text-xs text-zinc-400">
                Percentage breakdown of customer wait times against regulatory SLA standards.
              </p>
              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Under 3 Minutes (Optimal)</span>
                    <span className="text-emerald-400 font-medium">68%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: "68%" }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>3 to 5 Minutes (Acceptable)</span>
                    <span className="text-yellow-400 font-medium">22%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-yellow-500 h-full rounded-full" style={{ width: "22%" }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>5 to 10 Minutes (Warning)</span>
                    <span className="text-amber-400 font-medium">7%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: "7%" }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Over 10 Minutes (SLA Breach)</span>
                    <span className="text-red-400 font-medium">3%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-red-500 h-full rounded-full" style={{ width: "3%" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: INCIDENTS & VIOLATIONS */}
      {activeTab === "incidents" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 font-medium">Severity:</label>
              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Severities</option>
                <option value="P1">P1 Critical</option>
                <option value="P2">P2 Warning</option>
                <option value="P3">P3 Advisory</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 font-medium">Status:</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="pending">Pending Review</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
                <option value="false_positive">False Positive</option>
              </select>
            </div>
          </div>

          <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-800/60 text-zinc-400 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Severity</th>
                    <th className="p-3">Incident Type</th>
                    <th className="p-3">Entity</th>
                    <th className="p-3">Trigger vs Threshold</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {incidents && incidents.length > 0 ? (
                    incidents.map(inc => (
                      <tr key={inc.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="p-3 text-zinc-300 font-mono text-[11px]">
                          {new Date(inc.occurred_at).toLocaleTimeString()}
                        </td>
                        <td className="p-3">{getSeverityBadge(inc.severity)}</td>
                        <td className="p-3 font-semibold text-white capitalize">
                          {inc.incident_type.replace(/_/g, ' ')}
                        </td>
                        <td className="p-3 text-zinc-300">{inc.entity_name}</td>
                        <td className="p-3 text-zinc-400">
                          <span className="text-white font-semibold">{inc.trigger_value}</span> / {inc.threshold_value}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                            inc.review_status === 'resolved'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : inc.review_status === 'acknowledged'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : inc.review_status === 'false_positive'
                              ? 'bg-zinc-800 text-zinc-400'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}>
                            {inc.review_status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setSelectedIncident(inc)}
                            className="px-2.5 py-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 transition-colors"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-zinc-500">
                        No threshold violation incidents recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ZONE & COUNTER SETUP */}
      {activeTab === "config" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-zinc-900/70 border border-zinc-800 p-6 rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Building className="w-5 h-5 text-indigo-400" />
                Monitored Zones
              </h3>
              <button
                onClick={() => setZoneModalOpen(true)}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Zone
              </button>
            </div>

            <div className="space-y-2">
              {liveData?.zones && liveData.zones.length > 0 ? (
                liveData.zones.map(z => (
                  <div key={z.zoneId} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/40 border border-zinc-800">
                    <div>
                      <h4 className="text-xs font-semibold text-white">{z.zoneName}</h4>
                      <p className="text-[11px] text-zinc-400 capitalize">{z.zoneType.replace('_', ' ')}</p>
                    </div>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete zone '${z.zoneName}'?`)) {
                          await crowdApi.deleteZone(z.zoneId);
                          fetchData();
                        }
                      }}
                      className="p-1.5 text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No zones configured.</p>
              )}
            </div>
          </div>

          <div className="bg-zinc-900/70 border border-zinc-800 p-6 rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                Counter Queues
              </h3>
              <button
                onClick={() => setQueueModalOpen(true)}
                className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Counter
              </button>
            </div>

            <div className="space-y-2">
              {liveData?.queues && liveData.queues.length > 0 ? (
                liveData.queues.map(q => (
                  <div key={q.queueId} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/40 border border-zinc-800">
                    <div>
                      <h4 className="text-xs font-semibold text-white">{q.counterNumber} - {q.counterName}</h4>
                      <p className="text-[11px] text-zinc-400 capitalize">{q.counterType.replace('_', ' ')}</p>
                    </div>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete counter '${q.counterName}'?`)) {
                          await crowdApi.deleteQueue(q.queueId);
                          fetchData();
                        }
                      }}
                      className="p-1.5 text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No counter queues configured.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: INCIDENT REVIEW */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Operator Incident Review</span>
                <h3 className="text-base font-bold text-white mt-1 capitalize">
                  {selectedIncident.incident_type.replace(/_/g, ' ')}
                </h3>
              </div>
              {getSeverityBadge(selectedIncident.severity)}
            </div>

            <p className="text-xs text-zinc-300 bg-zinc-800/50 p-3 rounded-lg border border-zinc-700/50">
              {selectedIncident.explanation}
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
              <div>Entity: <span className="text-white font-medium">{selectedIncident.entity_name}</span></div>
              <div>Trigger Value: <span className="text-white font-medium">{selectedIncident.trigger_value}</span></div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Resolution Notes:</label>
              <textarea
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Enter actions taken or justification..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 h-20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setSelectedIncident(null)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingReview}
                onClick={() => handleReview('false_positive')}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
              >
                False Positive
              </button>
              <button
                type="button"
                disabled={submittingReview}
                onClick={() => handleReview('acknowledged')}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors"
              >
                Acknowledge
              </button>
              <button
                type="button"
                disabled={submittingReview}
                onClick={() => handleReview('resolved')}
                className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE ZONE */}
      {zoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form onSubmit={handleCreateZone} className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Configure New Monitoring Zone</h3>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Zone Name</label>
              <input
                type="text"
                required
                value={newZoneName}
                onChange={e => setNewZoneName(e.target.value)}
                placeholder="e.g. Main Banking Hall"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Zone Type</label>
              <select
                value={newZoneType}
                onChange={e => setNewZoneType(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white"
              >
                <option value="branch_hall">Branch Hall</option>
                <option value="waiting_lounge">Waiting Lounge</option>
                <option value="atm_vestibule">ATM Vestibule</option>
                <option value="teller_area">Teller Area</option>
                <option value="kiosk_zone">Self-Service Kiosks</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Area (m²)</label>
                <input
                  type="number"
                  min="1"
                  value={newZoneArea}
                  onChange={e => setNewZoneArea(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Nominal Capacity</label>
                <input
                  type="number"
                  min="1"
                  value={newZoneNominal}
                  onChange={e => setNewZoneNominal(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Warning Threshold</label>
                <input
                  type="number"
                  min="1"
                  value={newZoneWarning}
                  onChange={e => setNewZoneWarning(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Max Capacity</label>
                <input
                  type="number"
                  min="1"
                  value={newZoneMax}
                  onChange={e => setNewZoneMax(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setZoneModalOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded"
              >
                Create Zone
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CREATE COUNTER QUEUE */}
      {queueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form onSubmit={handleCreateQueue} className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Add Service Counter</h3>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Counter #</label>
                <input
                  type="text"
                  required
                  value={newCounterNum}
                  onChange={e => setNewCounterNum(e.target.value)}
                  placeholder="e.g. C1"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-zinc-400 mb-1">Counter Name</label>
                <input
                  type="text"
                  required
                  value={newCounterName}
                  onChange={e => setNewCounterName(e.target.value)}
                  placeholder="Cash Deposit Counter"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Service Type</label>
              <select
                value={newCounterType}
                onChange={e => setNewCounterType(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white"
              >
                <option value="cash_deposit">Cash Deposit</option>
                <option value="cash_withdrawal">Cash Withdrawal</option>
                <option value="general_teller">General Teller</option>
                <option value="forex_remittance">Forex & Remittance</option>
                <option value="loan_desk">Loan Services</option>
                <option value="account_services">Account Services</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Queue Limit</label>
                <input
                  type="number"
                  min="1"
                  value={newQueueThreshold}
                  onChange={e => setNewQueueThreshold(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Wait SLA (Seconds)</label>
                <input
                  type="number"
                  min="30"
                  step="30"
                  value={newWaitSlaSeconds}
                  onChange={e => setNewWaitSlaSeconds(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setQueueModalOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded"
              >
                Add Counter
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
