"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Network,
  Server,
  Camera,
  Download,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Radio,
  ArrowUpRight,
  Filter,
  ShieldCheck,
  HardDrive,
  Cpu,
  Layers,
  Activity,
  AlertCircle,
  FileSpreadsheet,
  Users,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";

type AgentTransitionItem = {
  edgeAgentId: string;
  agentName: string;
  branchName: string;
  transitionTime: string;
  prevStatus: string;
  newStatus: string;
};

type CameraTransitionItem = {
  cameraId: string;
  cameraName: string;
  channel?: number;
  cameraIp?: string;
  agentName: string;
  branchName: string;
  eventTime: string;
  prevStatus: string;
  newStatus: string;
  eventType: string;
};

type EdgeAgentItem = {
  id: string;
  agentName: string;
  hostname: string;
  branchName: string;
  branchId?: string;
  version: string;
  agentVersion?: string;
  ipAddress: string;
  reportedStatus: string;
  calculatedStatus: "ONLINE" | "OFFLINE" | "OFFLINE (HEARTBEAT TIMEOUT)" | string;
  onlineTime: string | null;
  startedAt: string | null;
  offlineTime: string | null;
  lastSeenAt: string | null;
  lastRestartAt: string | null;
  lastRestartReason: string;
  totalCameras: number;
  activeCameras: number;
  metrics?: {
    status?: string;
    version?: string;
    uptimeSeconds?: number;
    cpuUsedPercent?: number;
    memoryUsedPercent?: number;
    diskUsedPercent?: number;
    publicMediaUrl?: string;
    mediaTunnelMode?: string;
  };
  telemetryObservedAt?: string;
};

type ConnectedCameraItem = {
  cameraId: string;
  cameraName: string;
  channel: number;
  branchName: string;
  branchId?: string;
  edgeAgentId?: string;
  agentName: string;
  agentVersion?: string;
  cameraIp: string;
  vendor?: string;
  model?: string;
  connectedSince: string | null;
  lastSeenAt: string | null;
  status: string;
  liveStatus: string;
  streamActive: boolean;
  videoLoss: boolean;
  telemetryObservedAt?: string;
};

type OutageIncidentItem = {
  deviceId: string;
  deviceType: string;
  edgeAgentId?: string;
  agentName: string;
  cameraName: string;
  cameraIp?: string;
  channel?: number;
  disconnectDetectedAt: string;
  lastSignalAt: string;
  probeCount: number;
  reasonCodes: string[];
};

type ReportData = {
  summary: {
    totalAgents: number;
    onlineAgents: number;
    offlineAgents: number;
    totalCameras: number;
    connectedCameras: number;
    disconnectedCameras: number;
    incidentCount: number;
    agentTransitionsCount?: number;
    cameraTransitionsCount?: number;
    generatedAt: string;
  };
  agents: EdgeAgentItem[];
  cameras: ConnectedCameraItem[];
  incidents: OutageIncidentItem[];
  agentTransitions?: AgentTransitionItem[];
  cameraTransitions?: CameraTransitionItem[];
};

export default function EdgeConnectivityReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"agents" | "cameras" | "timeline" | "incidents">("agents");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [isExporting, setIsExporting] = useState(false);

  function getReportAuthHeaders(): Record<string, string> {
    const token = typeof window !== "undefined"
      ? (localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken"))
      : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["x-sentinel-session"] = token;
    }
    return headers;
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/control/v1/reports/edge-connectivity", {
        headers: getReportAuthHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || result.error || "Unable to load Edge connectivity telemetry");
      }
      setData(result.data);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      setError(err?.message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      void loadData();
    }, 20_000);
    return () => clearInterval(timer);
  }, [loadData, autoRefresh]);

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/control/v1/reports/edge-connectivity/csv", {
        headers: getReportAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("CSV download request failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `edge_agent_connectivity_report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Failed to export CSV: " + (err?.message || "Server error"));
    } finally {
      setIsExporting(false);
    }
  };

  function formatTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }) + " IST";
    } catch {
      return iso;
    }
  }

  function formatRelative(iso: string | null | undefined): string {
    if (!iso) return "Never";
    try {
      const diffMs = Date.now() - new Date(iso).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return "Unknown";
    }
  }

  // Filtered lists based on search and status
  const filteredAgents = useMemo(() => {
    if (!data?.agents) return [];
    const query = searchQuery.trim().toLowerCase();
    return data.agents.filter((agent) => {
      const matchesSearch =
        !query ||
        agent.agentName.toLowerCase().includes(query) ||
        agent.branchName.toLowerCase().includes(query) ||
        agent.ipAddress.toLowerCase().includes(query) ||
        agent.version.toLowerCase().includes(query) ||
        agent.hostname.toLowerCase().includes(query);

      const isOnline = agent.calculatedStatus === "ONLINE";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "online" && isOnline) ||
        (statusFilter === "offline" && !isOnline);

      return matchesSearch && matchesStatus;
    });
  }, [data?.agents, searchQuery, statusFilter]);

  const filteredCameras = useMemo(() => {
    if (!data?.cameras) return [];
    const query = searchQuery.trim().toLowerCase();
    return data.cameras.filter((cam) => {
      const matchesSearch =
        !query ||
        cam.cameraName.toLowerCase().includes(query) ||
        cam.agentName.toLowerCase().includes(query) ||
        cam.branchName.toLowerCase().includes(query) ||
        cam.cameraIp.toLowerCase().includes(query) ||
        String(cam.channel).includes(query);

      const isOnline = cam.status === "online" || cam.liveStatus === "online";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "online" && isOnline) ||
        (statusFilter === "offline" && !isOnline);

      return matchesSearch && matchesStatus;
    });
  }, [data?.cameras, searchQuery, statusFilter]);

  const filteredIncidents = useMemo(() => {
    if (!data?.incidents) return [];
    const query = searchQuery.trim().toLowerCase();
    return data.incidents.filter((inc) => {
      return (
        !query ||
        inc.cameraName.toLowerCase().includes(query) ||
        inc.agentName.toLowerCase().includes(query) ||
        inc.reasonCodes.some((code) => code.toLowerCase().includes(query)) ||
        (inc.cameraIp && inc.cameraIp.toLowerCase().includes(query))
      );
    });
  }, [data?.incidents, searchQuery]);

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 space-y-6">
        
        {/* Top Header / Kicker */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              <Network className="h-4 w-4" />
              <span>Surveillance Reports & Telemetry</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-50 mt-1">
              Edge Agent & Camera Connectivity Report
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1">
              Authoritative operational audit: Edge Agent software versions, IP addresses, online/offline uptime, and connected camera connect & disconnect timelines.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/reports/user-logins"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 transition-colors shadow-sm"
            >
              <Users className="h-3.5 w-3.5 text-cyan-400" />
              User Login Audit Report
            </Link>

            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                autoRefresh
                  ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                  : "border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              <Radio className={`h-3.5 w-3.5 ${autoRefresh ? "animate-pulse text-emerald-400" : ""}`} />
              Auto Refresh (20s)
            </button>

            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
              Refresh
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {isExporting ? "Exporting..." : "Export CSV Report"}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-4 text-sm text-rose-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="text-xs bg-rose-900/60 hover:bg-rose-800 border border-rose-700 px-2.5 py-1 rounded text-rose-100"
            >
              Retry
            </button>
          </div>
        )}

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Edge Agents */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs uppercase font-medium text-slate-400">
              <span>Edge Agents Registered</span>
              <Server className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-100">
                {data?.summary.totalAgents ?? (loading ? "…" : 0)}
              </span>
              <span className="text-xs text-slate-400">appliances</span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                ● {data?.summary.onlineAgents ?? 0} Online
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                ○ {data?.summary.offlineAgents ?? 0} Offline/Timeout
              </span>
            </div>
          </div>

          {/* Card 2: Cameras */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs uppercase font-medium text-slate-400">
              <span>Cameras Configured</span>
              <Camera className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-100">
                {data?.summary.totalCameras ?? (loading ? "…" : 0)}
              </span>
              <span className="text-xs text-slate-400">streams</span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                ● {data?.summary.connectedCameras ?? 0} Connected
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                ✕ {data?.summary.disconnectedCameras ?? 0} Disconnected
              </span>
            </div>
          </div>

          {/* Card 3: Outage Incidents */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs uppercase font-medium text-slate-400">
              <span>Telemetry Outage Events (7d)</span>
              <Activity className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-amber-300">
                {data?.summary.incidentCount ?? (loading ? "…" : 0)}
              </span>
              <span className="text-xs text-slate-400">recorded failures</span>
            </div>
            <div className="mt-3 text-xs text-slate-400 flex items-center gap-1">
              <span>RTSP timeout, secret, & packet drops</span>
            </div>
          </div>

          {/* Card 4: Cross-Module Navigation */}
          <div className="rounded-xl border border-indigo-900/40 bg-gradient-to-br from-indigo-950/30 to-slate-900 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs uppercase font-medium text-indigo-400">
                <span>Operations Module Link</span>
                <Layers className="h-4 w-4" />
              </div>
              <p className="text-xs text-slate-300 mt-2">
                Need to restart or reconfigure gateways? Switch directly to Edge Gateways Fleet control.
              </p>
            </div>
            <Link
              href="/operations/edge-agents"
              className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Open Edge Fleet Management
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Filter and Tab Navigation Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/70 border border-slate-800 p-3 rounded-xl">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab("agents")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "agents"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>Edge Agents ({filteredAgents.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("cameras")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "cameras"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              <span>Connected Cameras ({filteredCameras.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("incidents")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "incidents"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Disconnect Log ({filteredIncidents.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("timeline")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "timeline"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>
                Timeline History ({(data?.agentTransitions?.length || 0) + (data?.cameraTransitions?.length || 0)})
              </span>
            </button>
          </div>

          {/* Search & Status Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search name, IP, branch, version..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 flex items-center gap-1">
                <Filter className="h-3 w-3" /> Status:
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Devices</option>
                <option value="online">Online Only</option>
                <option value="offline">Offline / Timeout Only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tab 1: Edge Agents Table */}
        {activeTab === "agents" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Server className="h-4 w-4 text-cyan-400" />
                <span>Edge Agent Appliances (Software Version, IP, Online & Offline Timings)</span>
              </div>
              <span className="text-xs text-slate-400">
                Showing {filteredAgents.length} of {data?.agents.length ?? 0} edge agents
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase font-medium tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Edge Agent / Branch</th>
                    <th className="py-3 px-4">Software Version</th>
                    <th className="py-3 px-4">Observed IP Address</th>
                    <th className="py-3 px-4">Online Time (Started)</th>
                    <th className="py-3 px-4">Offline Time (Last Seen)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Cameras</th>
                    <th className="py-3 px-4">Appliance Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {filteredAgents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500">
                        {loading ? "Loading edge agents telemetry..." : "No matching edge agents found."}
                      </td>
                    </tr>
                  ) : (
                    filteredAgents.map((agent) => {
                      const isOnline = agent.calculatedStatus === "ONLINE";
                      const isTimeout = agent.calculatedStatus.includes("TIMEOUT");
                      return (
                        <tr key={agent.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                              {agent.agentName}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>Branch: <strong className="text-slate-300">{agent.branchName}</strong></span>
                              <span>•</span>
                              <span className="font-mono text-slate-500">{agent.hostname}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-slate-800 border border-slate-700 text-cyan-300">
                              v{agent.version}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-mono">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200 text-[11px]">
                              {agent.ipAddress}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="text-slate-200 font-medium">
                              {formatTime(agent.onlineTime)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Started: {formatRelative(agent.onlineTime)}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="text-slate-200 font-medium">
                              {formatTime(agent.offlineTime)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Last Heartbeat: {formatRelative(agent.offlineTime)}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {isOnline ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                🟢 ACTIVE
                              </span>
                            ) : isTimeout ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                🟡 TIMEOUT
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                ⚪ OFFLINE
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-200">
                              {agent.totalCameras}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              ({agent.activeCameras} active)
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            {agent.metrics ? (
                              <div className="space-y-1 text-[10px] w-28">
                                <div className="flex justify-between text-slate-400">
                                  <span>CPU:</span>
                                  <span className="font-mono text-slate-200">{agent.metrics.cpuUsedPercent ? `${agent.metrics.cpuUsedPercent.toFixed(0)}%` : "N/A"}</span>
                                </div>
                                <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-cyan-500 h-1.5 rounded-full"
                                    style={{ width: `${Math.min(agent.metrics.cpuUsedPercent ?? 0, 100)}%` }}
                                  />
                                </div>
                                <div className="flex justify-between text-slate-400">
                                  <span>Disk:</span>
                                  <span className="font-mono text-slate-200">{agent.metrics.diskUsedPercent ? `${agent.metrics.diskUsedPercent.toFixed(0)}%` : "N/A"}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Connected Cameras Mapping */}
        {activeTab === "cameras" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Camera className="h-4 w-4 text-emerald-400" />
                <span>Connected Cameras & Channel Mapping per Edge Agent</span>
              </div>
              <span className="text-xs text-slate-400">
                Showing {filteredCameras.length} cameras
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase font-medium tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Camera / Channel</th>
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4">Connected Edge Agent</th>
                    <th className="py-3 px-4">Camera IP / Stream Target</th>
                    <th className="py-3 px-4">Connected Since (Connect Time)</th>
                    <th className="py-3 px-4">Last Seen / Disconnect Time</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {filteredCameras.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        No matching cameras found.
                      </td>
                    </tr>
                  ) : (
                    filteredCameras.map((cam) => {
                      const isOnline = cam.status === "online" || cam.liveStatus === "online";
                      const isDegraded = cam.status === "degraded" || cam.videoLoss;
                      return (
                        <tr key={cam.cameraId} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-[10px]">
                                CH {cam.channel}
                              </span>
                              {cam.cameraName}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {cam.vendor || "CCTV"} {cam.model ? `• ${cam.model}` : ""}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-slate-300 font-medium">
                            {cam.branchName}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="text-slate-200 font-medium flex items-center gap-1">
                              <Server className="h-3 w-3 text-cyan-400" />
                              {cam.agentName}
                            </div>
                            {cam.agentVersion && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                v{cam.agentVersion}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 font-mono text-slate-300 text-[11px]">
                            {cam.cameraIp}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="text-slate-200 font-medium">
                              {formatTime(cam.connectedSince)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              First Connected: {formatRelative(cam.connectedSince)}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="text-slate-200 font-medium">
                              {formatTime(cam.lastSeenAt)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {formatRelative(cam.lastSeenAt)}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {isOnline && !isDegraded ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                🟢 CONNECTED
                              </span>
                            ) : isDegraded ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                🟠 DEGRADED / VIDEO LOSS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                🔴 DISCONNECTED
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Disconnect & Outage Incidents */}
        {activeTab === "incidents" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <AlertCircle className="h-4 w-4 text-rose-400" />
                <span>Camera & Edge Agent Disconnect / Failure Incidents (Past 7 Days)</span>
              </div>
              <span className="text-xs text-slate-400">
                Showing {filteredIncidents.length} recorded events
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase font-medium tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Event Detected Time</th>
                    <th className="py-3 px-4">Device / Camera</th>
                    <th className="py-3 px-4">Edge Agent Responsible</th>
                    <th className="py-3 px-4">Camera IP / Channel</th>
                    <th className="py-3 px-4">Disconnect Code / Root Cause</th>
                    <th className="py-3 px-4">Failure Probe Signals</th>
                    <th className="py-3 px-4">Last Disconnect Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {filteredIncidents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        No disconnect incidents recorded in the telemetry window.
                      </td>
                    </tr>
                  ) : (
                    filteredIncidents.map((inc, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-slate-200">
                          {formatTime(inc.disconnectDetectedAt)}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-100">
                            {inc.cameraName}
                          </div>
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                            {inc.deviceType}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-300">
                          {inc.agentName}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                          {inc.cameraIp ? `${inc.cameraIp} (CH ${inc.channel ?? '?'})` : `CH ${inc.channel ?? '?'}`}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1">
                            {inc.reasonCodes.map((code, cIdx) => (
                              <span
                                key={cIdx}
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-950/60 border border-rose-800 text-rose-300"
                              >
                                {code}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-mono text-slate-300">
                            {inc.probeCount} probes
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                          {formatTime(inc.lastSignalAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Status Transitions Timeline History */}
        {activeTab === "timeline" && (
          <div className="space-y-6">
            {/* Section A: Edge Agent Active/Inactive Transitions */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <Server className="h-4 w-4 text-cyan-400" />
                  <span>Edge Agent Active / Inactive Transition History (Time to Time with Date)</span>
                </div>
                <span className="text-xs text-slate-400">
                  {data?.agentTransitions?.length || 0} state transitions recorded
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Date & Time (IST)</th>
                      <th className="py-3 px-4">Edge Agent</th>
                      <th className="py-3 px-4">Branch</th>
                      <th className="py-3 px-4">Previous State</th>
                      <th className="py-3 px-4">Transitioned State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {!data?.agentTransitions?.length ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-slate-500">
                          No edge agent state transitions observed in the recent telemetry window.
                        </td>
                      </tr>
                    ) : (
                      data.agentTransitions.map((t, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {formatTime(t.transitionTime)}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-100">
                            {t.agentName}
                          </td>
                          <td className="py-3 px-4 text-slate-400">
                            {t.branchName}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400">
                            {t.prevStatus || "UNKNOWN"}
                          </td>
                          <td className="py-3 px-4">
                            {t.newStatus === "online" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                ● ACTIVE / ONLINE
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                ○ INACTIVE / OFFLINE
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section B: Camera Connection & Agent Association Transitions */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <Camera className="h-4 w-4 text-emerald-400" />
                  <span>Camera Connect / Disconnect Timeline & Agent Association (Time to Time with Date)</span>
                </div>
                <span className="text-xs text-slate-400">
                  {data?.cameraTransitions?.length || 0} camera events recorded
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Date & Time (IST)</th>
                      <th className="py-3 px-4">Camera</th>
                      <th className="py-3 px-4">Channel / IP</th>
                      <th className="py-3 px-4">Connected Edge Agent</th>
                      <th className="py-3 px-4">Branch</th>
                      <th className="py-3 px-4">Previous State</th>
                      <th className="py-3 px-4">Event & New State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {!data?.cameraTransitions?.length ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-slate-500">
                          No camera connection/disconnection transitions observed in the recent telemetry window.
                        </td>
                      </tr>
                    ) : (
                      data.cameraTransitions.map((ct, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {formatTime(ct.eventTime)}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-100">
                            {ct.cameraName}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                            {ct.cameraIp ? `${ct.cameraIp} (CH ${ct.channel ?? '?'})` : `CH ${ct.channel ?? '?'}`}
                          </td>
                          <td className="py-3 px-4 text-cyan-300 font-medium">
                            {ct.agentName}
                          </td>
                          <td className="py-3 px-4 text-slate-400">
                            {ct.branchName}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400">
                            {ct.prevStatus || "UNKNOWN"}
                          </td>
                          <td className="py-3 px-4">
                            {ct.eventType === "CONNECTED" || ct.newStatus === "online" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                🟢 CONNECTED
                              </span>
                            ) : ct.eventType === "DEGRADED" || ct.newStatus === "degraded" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                🟠 STREAM LOSS / DEGRADED
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                🔴 DISCONNECTED
                              </span>
                            )}
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

        {/* Footer timestamp */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-900">
          <div>
            Data sourced from production telemetry (<code className="text-slate-400">sentinel_grid</code>).
          </div>
          <div>
            Last refreshed: {lastRefreshedAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
