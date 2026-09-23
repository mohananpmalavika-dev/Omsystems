"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Server,
  Cpu,
  HardDrive,
  Activity,
  ShieldCheck,
  ShieldAlert,
  ArrowUpCircle,
  RotateCcw,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Radio,
  FileCode,
  Network,
  X,
  Play,
  Zap,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Check,
  ExternalLink,
  Shield,
  Filter,
} from "lucide-react";

interface EdgeAgentTelemetry {
  agentId?: string;
  observedAt?: string;
  cpuPercent?: number;
  memoryUsedBytes?: number;
  memoryTotalBytes?: number;
  diskUsedBytes?: number;
  diskTotalBytes?: number;
  serviceUptimeSeconds?: number;
  services?: Record<string, string>;
  cameras?: {
    configured?: number;
    reachable?: number;
    recording?: number;
  };
  clockOffsetMs?: number;
}

interface EdgeAgentItem {
  id: string;
  tenantId?: string;
  branchId: string;
  branchName: string;
  branchCode?: string;
  gatewayId?: string;
  hostname: string;
  platform?: string;
  architecture?: string;
  agentVersion: string;
  desiredAgentVersion: string;
  configurationVersion: string;
  desiredConfigurationVersion: string;
  status: "ONLINE" | "DEGRADED" | "OFFLINE" | "UPGRADING" | "DRIFTED" | string;
  versionReconciliation: "COMPLIANT" | "DRIFTED" | string;
  configReconciliation: "COMPLIANT" | "DRIFTED" | string;
  lastHeartbeatAt?: string;
  firstSeenAt?: string;
  startedAt?: string;
  certificateHealth?: "HEALTHY" | "WARNING" | "CRITICAL" | "EXPIRED" | string;
  certificateSerial?: string;
  certificateExpiresAt?: string;
  daysToCertExpiry?: number;
  lastRestartReason?: string;
  lastRestartAt?: string;
  telemetry?: EdgeAgentTelemetry;
  region?: string;
}

interface FleetSummaryData {
  totalAgents: number;
  onlineCount: number;
  degradedCount: number;
  offlineCount: number;
  latestVersion?: string;
  versionDistribution?: Record<string, number>;
  configCompliantCount?: number;
  configDriftedCount?: number;
  certificates?: {
    healthyCount?: number;
    expiringWithin30Days?: number;
    expiringWithin14Days?: number;
    expiredCount?: number;
  };
  activeRollouts?: number;
  upgradeFailures24h?: number;
}

type SortField = "branchName" | "agentVersion" | "configurationVersion" | "status" | "cpuPercent" | "certExpiry" | "lastHeartbeat";
type SortDirection = "asc" | "desc";

const ITEMS_PER_PAGE = 25;

export function EdgeFleetManager() {
  const [summary, setSummary] = useState<FleetSummaryData | null>(null);
  const [agents, setAgents] = useState<EdgeAgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [driftOnly, setDriftOnly] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("branchName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Selection & Details
  const [selectedAgent, setSelectedAgent] = useState<EdgeAgentItem | null>(null);
  const [digitalTwin, setDigitalTwin] = useState<any | null>(null);
  const [loadingTwin, setLoadingTwin] = useState(false);

  // Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    variant: "primary" | "warning" | "danger";
    onConfirm: () => void;
  } | null>(null);

  const fetchFleetData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setFetchError(null);

    try {
      const [sumRes, agRes] = await Promise.all([
        fetch("/api/control/v1/edge/fleet/summary", { cache: "no-store" }),
        fetch("/api/control/v1/edge/agents", { cache: "no-store" }),
      ]);

      const sumData = await sumRes.json().catch(() => null);
      const agData = await agRes.json().catch(() => null);

      if (sumRes.ok && sumData?.success && sumData.data) {
        setSummary(sumData.data);
      }

      if (agRes.ok && agData?.success && Array.isArray(agData.data)) {
        setAgents(agData.data);
      } else if (!agRes.ok) {
        const rawMsg = agData?.message || agData?.error;
        const msg = typeof rawMsg === "string" ? rawMsg : (rawMsg?.message && typeof rawMsg.message === "string" ? rawMsg.message : "Failed to load edge gateways");
        setFetchError(msg);
      }

      setLastUpdated(new Date());
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "Failed to reach edge fleet control plane";
      setFetchError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFleetData();
    const timer = setInterval(() => {
      fetchFleetData();
    }, 10000);
    return () => clearInterval(timer);
  }, [fetchFleetData]);

  const openAgentDetail = async (agent: EdgeAgentItem) => {
    setSelectedAgent(agent);
    setLoadingTwin(true);
    setDigitalTwin(null);
    try {
      const res = await fetch(`/api/control/v1/edge/agents/${agent.id}/digital-twin`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (data?.success && data?.data) {
        setDigitalTwin(data.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingTwin(false);
    }
  };

  const handleSingleUpgrade = async (agent: EdgeAgentItem) => {
    const targetVer = agent.desiredAgentVersion || summary?.latestVersion || "0.1.18";
    setActionLoading(`upgrading-${agent.id}`);
    setActionError(null);
    try {
      const res = await fetch(`/api/control/v1/edge/agents/${agent.id}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetVersion: targetVer }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setActionSuccessMsg(`Upgrade to v${targetVer} dispatched successfully for ${agent.branchName}.`);
        await fetchFleetData();
        if (selectedAgent && selectedAgent.id === agent.id) {
          openAgentDetail({
            ...selectedAgent,
            agentVersion: targetVer,
            status: "ONLINE",
            versionReconciliation: "COMPLIANT",
          });
        }
      } else {
        throw new Error(data?.error || data?.message || "Upgrade request rejected by control plane.");
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to initiate remote upgrade.");
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleSingleRollback = async (agent: EdgeAgentItem) => {
    setActionLoading(`rollback-${agent.id}`);
    setActionError(null);
    try {
      const res = await fetch(`/api/control/v1/edge/agents/${agent.id}/rollback`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setActionSuccessMsg(`Rollback command executed for ${agent.branchName}.`);
        await fetchFleetData();
        if (selectedAgent && selectedAgent.id === agent.id) {
          openAgentDetail({
            ...selectedAgent,
            status: "ONLINE",
            versionReconciliation: "DRIFTED",
          });
        }
      } else {
        throw new Error(data?.error || data?.message || "Rollback request failed.");
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to execute rollback.");
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleReconcileConfig = async (agent: EdgeAgentItem) => {
    setActionLoading(`config-${agent.id}`);
    setActionError(null);
    try {
      const res = await fetch(`/api/control/v1/edge/agents/${agent.id}/reconcile-config`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setActionSuccessMsg(`Configuration reconciled to ${agent.desiredConfigurationVersion || "desired"} for ${agent.branchName}.`);
        await fetchFleetData();
      } else {
        throw new Error(data?.error || data?.message || "Configuration reconciliation failed.");
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to reconcile configuration.");
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  const latestFleetVersion = summary?.latestVersion || "0.1.18";

  const handleFleetRollout = async () => {
    setActionLoading("fleet-rollout");
    setActionError(null);
    try {
      const res = await fetch("/api/control/v1/edge-updates/fleet-rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: latestFleetVersion }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || data?.error || "Fleet update could not be queued.");
      setActionSuccessMsg(
        `v${latestFleetVersion} update queued for ${data.queued ?? 0} of ${data.agents ?? 0} branch gateways. ` +
        `${data.alreadyCurrent ?? 0} already current; ${data.legacyBaseRepairRequired ?? 0} require base repair.`,
      );
      await fetchFleetData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Fleet update could not be queued.");
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  // Export fleet inventory as CSV
  const exportFleetCsv = () => {
    if (agents.length === 0) return;
    const headers = [
      "Agent ID",
      "Branch ID",
      "Branch Name",
      "Hostname",
      "Status",
      "Agent Version",
      "Desired Version",
      "Version Status",
      "Config Version",
      "Desired Config",
      "Config Status",
      "CPU %",
      "Memory Used (MB)",
      "Cert Health",
      "Cert Days Left",
      "Cameras Reachable",
      "Cameras Configured",
      "Last Heartbeat",
    ];

    const rows = agents.map((a) => [
      a.id,
      a.branchId,
      `"${(a.branchName || "").replace(/"/g, '""')}"`,
      a.hostname,
      a.status,
      a.agentVersion,
      a.desiredAgentVersion,
      a.versionReconciliation,
      a.configurationVersion,
      a.desiredConfigurationVersion,
      a.configReconciliation,
      a.telemetry?.cpuPercent?.toFixed(1) ?? "",
      a.telemetry?.memoryUsedBytes ? (a.telemetry.memoryUsedBytes / (1024 * 1024)).toFixed(0) : "",
      a.certificateHealth ?? "",
      a.daysToCertExpiry ?? "",
      a.telemetry?.cameras?.reachable ?? "",
      a.telemetry?.cameras?.configured ?? "",
      a.lastHeartbeatAt ?? "",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `edge-agent-fleet-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Sorting Handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filtered & Sorted Agents
  const filteredAndSortedAgents = useMemo(() => {
    const filtered = agents.filter((a) => {
      if (filterStatus === "ONLINE" && a.status !== "ONLINE") return false;
      if (filterStatus === "DEGRADED" && a.status !== "DEGRADED") return false;
      if (filterStatus === "OFFLINE" && a.status !== "OFFLINE") return false;
      if (driftOnly && a.versionReconciliation === "COMPLIANT" && a.configReconciliation === "COMPLIANT") return false;
      if (filterStatus === "EXPIRING_CERTS" && a.certificateHealth === "HEALTHY") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          a.branchName?.toLowerCase().includes(q) ||
          a.branchId?.toLowerCase().includes(q) ||
          a.branchCode?.toLowerCase().includes(q) ||
          a.hostname?.toLowerCase().includes(q) ||
          a.id?.toLowerCase().includes(q) ||
          a.agentVersion?.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "branchName":
          comparison = (a.branchName || "").localeCompare(b.branchName || "");
          break;
        case "agentVersion":
          comparison = (a.agentVersion || "").localeCompare(b.agentVersion || "");
          break;
        case "configurationVersion":
          comparison = (a.configurationVersion || "").localeCompare(b.configurationVersion || "");
          break;
        case "status":
          comparison = (a.status || "").localeCompare(b.status || "");
          break;
        case "cpuPercent":
          comparison = (a.telemetry?.cpuPercent || 0) - (b.telemetry?.cpuPercent || 0);
          break;
        case "certExpiry":
          comparison = (a.daysToCertExpiry || 999) - (b.daysToCertExpiry || 999);
          break;
        case "lastHeartbeat":
          comparison = new Date(a.lastHeartbeatAt || 0).getTime() - new Date(b.lastHeartbeatAt || 0).getTime();
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [agents, filterStatus, driftOnly, searchQuery, sortField, sortDirection]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedAgents.length / ITEMS_PER_PAGE));
  const paginatedAgents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedAgents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAndSortedAgents, currentPage]);

  const formatUptime = (seconds?: number) => {
    if (!seconds && seconds !== 0) return "—";
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatBytesToGb = (bytes?: number) => {
    if (!bytes) return "—";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/40 border border-slate-800 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>Edge Gateway & Fleet Lifecycle Control Plane</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
              Edge Agent Management
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Desired vs Actual State Reconciliation • Cryptographic Signed OTA Rollouts • Fleet Health Telemetry & Digital Twin
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => fetchFleetData(true)}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/80 flex items-center gap-1.5 transition-all"
              title="Refresh live fleet state"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-cyan-400" : ""}`} />
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </button>

            <button
              onClick={exportFleetCsv}
              disabled={agents.length === 0}
              className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/80 flex items-center gap-1.5 transition-all disabled:opacity-40"
              title="Download fleet inventory as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  title: `Initiate Fleet Rollout (v${latestFleetVersion})?`,
                  description: `This will queue signed update commands for all enrolled gateways. Offline gateways will apply the update automatically once reconnected.`,
                  confirmText: `Queue Fleet Update (v${latestFleetVersion})`,
                  variant: "primary",
                  onConfirm: handleFleetRollout,
                });
              }}
              disabled={actionLoading !== null}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-900/30 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <ArrowUpCircle className="w-4 h-4" />
              <span>{actionLoading === "fleet-rollout" ? "Queuing Update..." : `Deploy v${latestFleetVersion} to Fleet`}</span>
            </button>
          </div>
        </div>

        {lastUpdated && (
          <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Telemetry Stream Active
            </span>
            <span>Last polled: {lastUpdated.toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      {/* Notifications */}
      {actionSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button onClick={() => setActionSuccessMsg(null)} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{typeof actionError === "string" ? actionError : JSON.stringify(actionError)}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {fetchError && (
        <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-200 text-xs font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{typeof fetchError === "string" ? fetchError : JSON.stringify(fetchError)}</span>
          </div>
          <button onClick={() => setFetchError(null)} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Fleet KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Gateways */}
        <div
          onClick={() => { setFilterStatus("ALL"); setDriftOnly(false); }}
          className={`p-4 rounded-xl border space-y-1 cursor-pointer transition-all ${
            filterStatus === "ALL" && !driftOnly
              ? "bg-slate-900 border-blue-500/50 shadow-md ring-1 ring-blue-500/20"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>Total Gateways</span>
            <Server className="w-3.5 h-3.5 text-slate-500" />
          </div>
          {loading ? (
            <div className="text-2xl font-bold text-slate-600 font-mono animate-pulse">—</div>
          ) : (
            <div className="text-2xl font-bold text-white font-mono">
              {summary?.totalAgents ?? agents.length}
            </div>
          )}
          <div className="text-[10px] text-slate-400">
            {(summary?.totalAgents ?? agents.length) > 0 ? "Enrolled Gateways" : "No gateways reported"}
          </div>
        </div>

        {/* Online & Streaming */}
        <div
          onClick={() => { setFilterStatus("ONLINE"); setDriftOnly(false); }}
          className={`p-4 rounded-xl border space-y-1 cursor-pointer transition-all ${
            filterStatus === "ONLINE"
              ? "bg-slate-900 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/20"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>Online & Healthy</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          {loading ? (
            <div className="text-2xl font-bold text-slate-600 font-mono animate-pulse">—</div>
          ) : (
            <div className="text-2xl font-bold text-emerald-400 font-mono">
              {summary?.onlineCount ?? agents.filter((a) => a.status === "ONLINE").length}
            </div>
          )}
          <div className="text-[10px] text-emerald-400">
            {summary?.totalAgents || agents.length
              ? `${(((summary?.onlineCount ?? agents.filter((a) => a.status === "ONLINE").length) / (summary?.totalAgents || agents.length || 1)) * 100).toFixed(0)}% Availability`
              : "—"}
          </div>
        </div>

        {/* Latest Version Target */}
        <div
          className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1"
        >
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>Standard (v{latestFleetVersion})</span>
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          {loading ? (
            <div className="text-2xl font-bold text-slate-600 font-mono animate-pulse">—</div>
          ) : (
            <div className="text-2xl font-bold text-cyan-400 font-mono">
              {summary?.versionDistribution?.[latestFleetVersion] ?? agents.filter((a) => a.agentVersion === latestFleetVersion).length}
            </div>
          )}
          <div className="text-[10px] text-cyan-300 font-mono">Target Golden Release</div>
        </div>

        {/* Config Drifted */}
        <div
          onClick={() => { setDriftOnly(true); }}
          className={`p-4 rounded-xl border space-y-1 cursor-pointer transition-all ${
            driftOnly
              ? "bg-slate-900 border-amber-500/50 shadow-md ring-1 ring-amber-500/20"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>Config Drifted</span>
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
          </div>
          {loading ? (
            <div className="text-2xl font-bold text-slate-600 font-mono animate-pulse">—</div>
          ) : (
            <div className="text-2xl font-bold text-amber-400 font-mono">
              {summary?.configDriftedCount ?? agents.filter((a) => a.configReconciliation === "DRIFTED").length}
            </div>
          )}
          <div className="text-[10px] text-amber-300">Requires Sync</div>
        </div>

        {/* Expiring Certs */}
        <div
          onClick={() => { setFilterStatus("EXPIRING_CERTS"); setDriftOnly(false); }}
          className={`p-4 rounded-xl border space-y-1 cursor-pointer transition-all ${
            filterStatus === "EXPIRING_CERTS"
              ? "bg-slate-900 border-rose-500/50 shadow-md ring-1 ring-rose-500/20"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>Certs (&lt;30 Days)</span>
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          </div>
          {loading ? (
            <div className="text-2xl font-bold text-slate-600 font-mono animate-pulse">—</div>
          ) : (
            <div className="text-2xl font-bold text-amber-400 font-mono">
              {summary?.certificates?.expiringWithin30Days ?? agents.filter((a) => (a.daysToCertExpiry || 999) <= 30).length}
            </div>
          )}
          <div className="text-[10px] text-rose-400">
            {summary?.certificates?.expiringWithin14Days
              ? `${summary.certificates.expiringWithin14Days} critical (<14d)`
              : "Certificate Health"}
          </div>
        </div>

        {/* Degraded / Offline */}
        <div
          onClick={() => { setFilterStatus("OFFLINE"); setDriftOnly(false); }}
          className={`p-4 rounded-xl border space-y-1 cursor-pointer transition-all ${
            filterStatus === "OFFLINE"
              ? "bg-slate-900 border-rose-500/50 shadow-md ring-1 ring-rose-500/20"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>Degraded / Offline</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          {loading ? (
            <div className="text-2xl font-bold text-slate-600 font-mono animate-pulse">—</div>
          ) : (
            <div className="text-2xl font-bold text-rose-400 font-mono">
              {(summary?.degradedCount ?? 0) + (summary?.offlineCount ?? 0) || agents.filter((a) => a.status === "OFFLINE" || a.status === "DEGRADED").length}
            </div>
          )}
          <div className="text-[10px] text-rose-400">Needs Attention</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search branch name, branch code, gateway ID, version..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {["ALL", "ONLINE", "DEGRADED", "OFFLINE", "EXPIRING_CERTS"].map((st) => (
            <button
              key={st}
              onClick={() => {
                setFilterStatus(st);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === st
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              {st.replaceAll("_", " ")}
            </button>
          ))}

          <button
            onClick={() => {
              setDriftOnly(!driftOnly);
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all ${
              driftOnly
                ? "bg-amber-950 border-amber-600 text-amber-300"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Drift Only</span>
          </button>
        </div>
      </div>

      {/* Fleet Table */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl">
        {loading && agents.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-cyan-400" />
            <div className="text-sm font-semibold text-slate-200">Loading live edge fleet telemetry...</div>
            <div className="text-xs text-slate-500 mt-1">Connecting to control plane state store</div>
          </div>
        ) : filteredAndSortedAgents.length === 0 ? (
          <div className="p-12 text-center">
            <Server className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No Edge Gateways Found</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              {agents.length === 0
                ? "Edge gateways will appear here automatically once enrolled. Gateways report continuous telemetry and heartbeats to the control plane."
                : "No gateways match your current search or filter criteria. Try resetting the filters."}
            </p>
            {agents.length > 0 && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("ALL");
                  setDriftOnly(false);
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800 select-none">
                  <th
                    onClick={() => handleSort("branchName")}
                    className="py-3.5 px-4 font-semibold cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>Branch & Gateway</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("agentVersion")}
                    className="py-3.5 px-4 font-semibold cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>Agent Version</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("configurationVersion")}
                    className="py-3.5 px-4 font-semibold cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>Config (Act / Des)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("cpuPercent")}
                    className="py-3.5 px-4 font-semibold cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>CPU / RAM</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("certExpiry")}
                    className="py-3.5 px-4 font-semibold cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>Cert Health</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4 font-semibold">Cameras</th>
                  <th
                    onClick={() => handleSort("status")}
                    className="py-3.5 px-4 font-semibold cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedAgents.map((agent) => {
                  const isVersionDrift = agent.versionReconciliation === "DRIFTED";
                  const isConfigDrift = agent.configReconciliation === "DRIFTED";
                  const isUpgrading = actionLoading === `upgrading-${agent.id}` || agent.status === "UPGRADING";

                  return (
                    <tr
                      key={agent.id}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                      onClick={() => openAgentDetail(agent)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-200 group-hover:text-cyan-400 transition-colors">
                          {agent.branchName}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>{agent.branchCode || agent.branchId}</span>
                          <span>•</span>
                          <span className="text-slate-500">{agent.hostname}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                              isVersionDrift
                                ? "bg-amber-950 text-amber-300 border border-amber-800"
                                : "bg-slate-950 text-slate-300 border border-slate-800"
                            }`}
                          >
                            v{agent.agentVersion}
                          </span>
                          {isVersionDrift && (
                            <span className="text-[10px] text-amber-400 font-mono font-bold">
                              ➔ v{agent.desiredAgentVersion}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                              isConfigDrift
                                ? "bg-amber-950 text-amber-300 border border-amber-800 font-bold"
                                : "bg-slate-950 text-slate-300 border border-slate-800"
                            }`}
                          >
                            {agent.configurationVersion}
                          </span>
                          {isConfigDrift && (
                            <span className="text-[10px] text-amber-400 font-mono font-bold">
                              ➔ {agent.desiredConfigurationVersion}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px]">
                        {agent.status === "OFFLINE" ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="text-slate-300">
                              {agent.telemetry?.cpuPercent != null
                                ? `${agent.telemetry.cpuPercent.toFixed(1)}% CPU`
                                : "CPU: —"}
                            </div>
                            <div className="text-slate-500 text-[10px]">
                              {agent.telemetry?.memoryUsedBytes
                                ? `${formatBytesToGb(agent.telemetry.memoryUsedBytes)} / ${agent.telemetry.memoryTotalBytes ? formatBytesToGb(agent.telemetry.memoryTotalBytes) : "8"} GB RAM`
                                : "RAM: —"}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 w-fit ${
                            agent.certificateHealth === "HEALTHY"
                              ? "bg-slate-950 text-slate-300 border border-slate-800"
                              : agent.certificateHealth === "WARNING"
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : "bg-rose-950 text-rose-300 border border-rose-800 animate-pulse"
                          }`}
                        >
                          {agent.certificateHealth === "CRITICAL" && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                          <span>{agent.daysToCertExpiry != null ? `${agent.daysToCertExpiry}d remaining` : "Cert: OK"}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px]">
                        <span className="text-slate-300">
                          {agent.telemetry?.cameras?.reachable ?? "—"} / {agent.telemetry?.cameras?.configured ?? "—"}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            agent.status === "ONLINE"
                              ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
                              : agent.status === "DEGRADED"
                              ? "bg-amber-950/80 text-amber-300 border border-amber-800"
                              : agent.status === "UPGRADING"
                              ? "bg-blue-950 text-blue-300 border border-blue-600 animate-pulse"
                              : "bg-rose-950/80 text-rose-300 border border-rose-800"
                          }`}
                        >
                          {agent.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {isVersionDrift && (
                            <button
                              onClick={() => {
                                setConfirmModal({
                                  isOpen: true,
                                  title: `Upgrade ${agent.branchName}?`,
                                  description: `This will deploy binary version v${agent.desiredAgentVersion || latestFleetVersion} to ${agent.hostname}. The supervisor will unpack the release, verify cryptographic signatures, and switch daemon execution safely.`,
                                  confirmText: `Upgrade to v${agent.desiredAgentVersion || latestFleetVersion}`,
                                  variant: "primary",
                                  onConfirm: () => handleSingleUpgrade(agent),
                                });
                              }}
                              disabled={isUpgrading}
                              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm"
                            >
                              <ArrowUpCircle className="w-3.5 h-3.5" />
                              <span>{isUpgrading ? "Upgrading..." : "Upgrade"}</span>
                            </button>
                          )}

                          {isConfigDrift && !isVersionDrift && (
                            <button
                              onClick={() => {
                                setConfirmModal({
                                  isOpen: true,
                                  title: `Reconcile Config for ${agent.branchName}?`,
                                  description: `This will push configuration version ${agent.desiredConfigurationVersion} to the gateway and apply updated runtime parameters.`,
                                  confirmText: `Reconcile Config`,
                                  variant: "warning",
                                  onConfirm: () => handleReconcileConfig(agent),
                                });
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-medium text-[11px] border border-amber-900/60"
                            >
                              Reconcile
                            </button>
                          )}

                          <button
                            onClick={() => openAgentDetail(agent)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium"
                          >
                            Digital Twin ➔
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination & Footer */}
        {filteredAndSortedAgents.length > 0 && (
          <div className="p-3.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
            <div>
              Showing {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredAndSortedAgents.length)}–
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedAgents.length)} of {filteredAndSortedAgents.length} gateways
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 border border-slate-800"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 py-0.5 text-slate-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 border border-slate-800"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-tight">{confirmModal.title}</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{confirmModal.description}</p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md"
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Digital Twin & Detail Drawer */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-slate-950 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase">
                  <Server className="w-4 h-4 text-cyan-400" />
                  <span>Edge Gateway Digital Twin Node</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight mt-1">{selectedAgent.branchName}</h2>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  ID: {selectedAgent.id} • Host: {selectedAgent.hostname}
                </div>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: `Upgrade ${selectedAgent.branchName}?`,
                    description: `Deploy version v${selectedAgent.desiredAgentVersion || latestFleetVersion} to ${selectedAgent.hostname}.`,
                    confirmText: `Upgrade Gateway`,
                    variant: "primary",
                    onConfirm: () => handleSingleUpgrade(selectedAgent),
                  });
                }}
                disabled={actionLoading !== null}
                className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                <ArrowUpCircle className="w-4 h-4" />
                <span>Remote Upgrade v{selectedAgent.desiredAgentVersion || latestFleetVersion}</span>
              </button>

              <button
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: `Rollback ${selectedAgent.branchName}?`,
                    description: `Revert active binary to previous stable release.`,
                    confirmText: `Execute Rollback`,
                    variant: "warning",
                    onConfirm: () => handleSingleRollback(selectedAgent),
                  });
                }}
                disabled={actionLoading !== null}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>Rollback</span>
              </button>

              <button
                onClick={() => handleReconcileConfig(selectedAgent)}
                disabled={actionLoading !== null}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-amber-900/60 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <span>Sync Config</span>
              </button>
            </div>

            {/* Live Hardware Telemetry */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span>Hardware & Uptime Telemetry</span>
              </h3>
              <div className="grid grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400">CPU Utilization</div>
                  <div className="text-lg font-bold text-blue-400">
                    {selectedAgent.telemetry?.cpuPercent != null ? `${selectedAgent.telemetry.cpuPercent.toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {digitalTwin?.hardware?.cpuCores ? `${digitalTwin.hardware.cpuCores} Cores` : "System Load"}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Memory (RAM)</div>
                  <div className="text-lg font-bold text-emerald-400">
                    {selectedAgent.telemetry?.memoryUsedBytes
                      ? `${formatBytesToGb(selectedAgent.telemetry.memoryUsedBytes)} GB`
                      : "—"}
                  </div>
                  <div className="text-[10px] text-emerald-400">
                    {selectedAgent.telemetry?.memoryTotalBytes
                      ? `of ${formatBytesToGb(selectedAgent.telemetry.memoryTotalBytes)} GB Total`
                      : "Memory Status"}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Disk Buffer</div>
                  <div className="text-lg font-bold text-purple-400">
                    {selectedAgent.telemetry?.diskUsedBytes && selectedAgent.telemetry?.diskTotalBytes
                      ? `${formatBytesToGb(selectedAgent.telemetry.diskUsedBytes)} / ${formatBytesToGb(selectedAgent.telemetry.diskTotalBytes)} GB`
                      : digitalTwin?.hardware?.diskTotalGb
                      ? `${digitalTwin.hardware.diskTotalGb} GB Total`
                      : "Ring Buffer"}
                  </div>
                  <div className="text-[10px] text-slate-500">Local Store & Forward</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 text-slate-400">
                <div>
                  Service Uptime:{" "}
                  <strong className="text-slate-200">
                    {formatUptime(selectedAgent.telemetry?.serviceUptimeSeconds)}
                  </strong>
                </div>
                <div>
                  Last Restart:{" "}
                  <strong className="text-amber-400">{selectedAgent.lastRestartReason || "OS_BOOT"}</strong>
                </div>
              </div>
            </div>

            {/* Software Stack & Components */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-400" />
                <span>Software Stack & Desired State Comparison</span>
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-300">Edge Agent Binary</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">
                      Actual: <strong>v{selectedAgent.agentVersion}</strong>
                    </span>
                    <span>•</span>
                    <span className="text-slate-400">
                      Desired: <strong>v{selectedAgent.desiredAgentVersion}</strong>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        selectedAgent.versionReconciliation === "COMPLIANT"
                          ? "bg-emerald-950 text-emerald-300"
                          : "bg-amber-950 text-amber-300"
                      }`}
                    >
                      {selectedAgent.versionReconciliation}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-300">Branch Configuration</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">
                      Actual: <strong>{selectedAgent.configurationVersion}</strong>
                    </span>
                    <span>•</span>
                    <span className="text-slate-400">
                      Desired: <strong>{selectedAgent.desiredConfigurationVersion}</strong>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        selectedAgent.configReconciliation === "COMPLIANT"
                          ? "bg-emerald-950 text-emerald-300"
                          : "bg-amber-950 text-amber-300"
                      }`}
                    >
                      {selectedAgent.configReconciliation}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-300">Media Relays & Streaming</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    RTSP / WebRTC Active
                  </span>
                </div>
              </div>
            </div>

            {/* Blast Radius & Impact Tree */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Network className="w-4 h-4 text-cyan-400" />
                <span>Topology & Blast Radius</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs text-center">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">Cameras Managed</div>
                  <div className="text-base font-bold text-blue-400">
                    {digitalTwin?.blastRadius?.camerasImpacted ?? selectedAgent.telemetry?.cameras?.configured ?? 0}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">Recording Channels</div>
                  <div className="text-base font-bold text-emerald-400">
                    {digitalTwin?.blastRadius?.recordingChannelsAtRisk ?? selectedAgent.telemetry?.cameras?.recording ?? 0}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">Recorders Attached</div>
                  <div className="text-base font-bold text-purple-400">
                    {digitalTwin?.blastRadius?.nvrsAttached ?? 1}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">Active Incidents</div>
                  <div className="text-base font-bold text-rose-400">
                    {digitalTwin?.blastRadius?.activeAlertsAffected ?? 0}
                  </div>
                </div>
              </div>

              {/* Topology Path */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-1 text-slate-400">
                <div className="text-slate-300 font-bold">Graph Path:</div>
                <div className="text-cyan-400">
                  {selectedAgent.tenantId || "Enterprise"} ➔ {selectedAgent.region || "Regional Fleet"} ➔ {selectedAgent.branchName} ➔ {selectedAgent.hostname}
                </div>
                <div className="text-slate-500 pl-4">
                  └── [Agent v{selectedAgent.agentVersion} | Media Streaming Engine] ➔ {selectedAgent.telemetry?.cameras?.configured ?? 0} Cameras ➔ RTSP Plane
                </div>
              </div>
            </div>

            {/* Certificate Lifecycle */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-bold">mTLS Device Certificate</span>
                <span className="text-emerald-400 font-bold">
                  {selectedAgent.daysToCertExpiry != null ? `${selectedAgent.daysToCertExpiry} Days Remaining` : "Valid"}
                </span>
              </div>
              <div className="text-slate-400 text-[11px]">
                Serial: <strong className="text-slate-200">{selectedAgent.certificateSerial || "N/A"}</strong>
                {selectedAgent.certificateExpiresAt && (
                  <span> • Expires: {new Date(selectedAgent.certificateExpiresAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
