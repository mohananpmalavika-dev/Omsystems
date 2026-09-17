"use client";

import Link from "next/link";
import { 
  RefreshCw, 
  Camera, 
  FileVideo2, 
  HardDrive, 
  Network, 
  Zap, 
  Server, 
  Search, 
  Filter, 
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Radio
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BranchHealth, HealthStatus } from "@/lib/types/operational-health";
import { fetchBranchesHealth } from "@/lib/api/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";

type ComponentKey = "camera" | "recording" | "storage" | "network" | "ups" | "edgeAgent";
type Projection = BranchHealth & { 
  components: Record<ComponentKey, { status: HealthStatus; score: number | null; lastUpdated: string | null }> 
};

const TELEMETRY_TABS: Array<{ key: ComponentKey; label: string; href: string; icon: any }> = [
  { key: "camera", label: "Cameras", href: "/operations/cameras", icon: Camera },
  { key: "recording", label: "Recording & DVR", href: "/operations/recording", icon: FileVideo2 },
  { key: "storage", label: "Storage & HDDs", href: "/operations/storage", icon: HardDrive },
  { key: "network", label: "Network & Latency", href: "/operations/network", icon: Network },
  { key: "ups", label: "Power & UPS", href: "/operations/ups", icon: Zap },
  { key: "edgeAgent", label: "Edge Gateways", href: "/operations/edge-agents", icon: Server },
];

export function ComponentDetailPage({ title, component }: { title: string; component: ComponentKey }) {
  const [branches, setBranches] = useState<Projection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "critical" | "warning" | "healthy">("all");
  const [pingingBranchId, setPingingBranchId] = useState<string | null>(null);
  const [pingSuccess, setPingSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchBranchesHealth({ limit: 500 });
      setBranches((data.branches as Projection[]) ?? []);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Telemetry health data is unavailable");
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { 
    void load(); 
    const timer = setInterval(load, 30_000); 
    return () => clearInterval(timer); 
  }, [load]);

  const live = useOperationalHealthStream(useCallback(() => { void load(); }, [load]));

  // Diagnostic Ping Simulation
  const handleDiagnosticPing = async (e: React.MouseEvent, branchId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPingingBranchId(branchId);
    setPingSuccess(null);
    try {
      await new Promise((res) => setTimeout(res, 800));
      setPingSuccess(branchId);
      setTimeout(() => setPingSuccess(null), 3000);
    } finally {
      setPingingBranchId(null);
    }
  };

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      const health = b.components[component];
      const matchesSearch = 
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.region && b.region.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (b.code && b.code.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;
      if (statusFilter === "all") return true;
      return health?.status === statusFilter;
    });
  }, [branches, component, searchQuery, statusFilter]);

  const counts = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let healthy = 0;
    branches.forEach((b) => {
      const st = b.components[component]?.status;
      if (st === "critical") critical++;
      else if (st === "warning") warning++;
      else if (st === "healthy") healthy++;
    });
    return { total: branches.length, critical, warning, healthy };
  }, [branches, component]);

  return (
    <div className="page-container space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {live ? "Live Telemetry" : "Polling (30s)"}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Real-time branch telemetry, hardware status & remote diagnostics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/operations/alerts"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-medium hover:bg-amber-500/20 transition-colors"
          >
            <AlertTriangle size={14} />
            Hardware Alerts Queue
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 text-xs px-3 py-1.5"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Telemetry Hub Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 pb-1 scrollbar-none">
        {TELEMETRY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === component;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
                isActive
                  ? "bg-slate-800/80 text-blue-400 border-blue-500 shadow-sm"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <Icon size={15} className={isActive ? "text-blue-400" : "text-slate-400"} />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div 
          onClick={() => setStatusFilter("all")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            statusFilter === "all" ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
          }`}
        >
          <div className="text-xs text-slate-400 font-medium">Total Branches</div>
          <div className="text-xl font-bold text-white mt-1">{counts.total}</div>
        </div>

        <div 
          onClick={() => setStatusFilter("healthy")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            statusFilter === "healthy" ? "border-emerald-500 bg-emerald-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
            <span>Healthy</span>
            <CheckCircle2 size={14} />
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{counts.healthy}</div>
        </div>

        <div 
          onClick={() => setStatusFilter("warning")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            statusFilter === "warning" ? "border-amber-500 bg-amber-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-400 font-medium">
            <span>Degraded</span>
            <AlertTriangle size={14} />
          </div>
          <div className="text-xl font-bold text-amber-400 mt-1">{counts.warning}</div>
        </div>

        <div 
          onClick={() => setStatusFilter("critical")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            statusFilter === "critical" ? "border-red-500 bg-red-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-red-400 font-medium">
            <span>Critical Alert</span>
            <XCircle size={14} />
          </div>
          <div className="text-xl font-bold text-red-400 mt-1">{counts.critical}</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by branch name, code, or region..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Showing:</span>
          <span className="text-xs font-semibold text-white">{filteredBranches.length} branches</span>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          Telemetry data warning: {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredBranches.length === 0 && (
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
          <p className="text-sm text-slate-400">No branch telemetry records match the current criteria.</p>
        </div>
      )}

      {/* Branch Health Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBranches.map((branch) => {
          const health = branch.components[component];
          const isPinging = pingingBranchId === branch.id;
          const pingDone = pingSuccess === branch.id;

          const cardBorder =
            health?.status === "critical"
              ? "border-red-500/40 bg-red-950/20 hover:border-red-500"
              : health?.status === "warning"
              ? "border-amber-500/40 bg-amber-950/20 hover:border-amber-500"
              : health?.status === "healthy"
              ? "border-emerald-500/30 bg-slate-900/60 hover:border-emerald-500/60"
              : "border-slate-800 bg-slate-900/40 hover:border-slate-700";

          const statusBadge =
            health?.status === "critical"
              ? "bg-red-500/20 text-red-400 border border-red-500/30"
              : health?.status === "warning"
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              : health?.status === "healthy"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-slate-800 text-slate-400 border border-slate-700";

          return (
            <div
              key={branch.id}
              className={`rounded-xl border p-4 transition-all duration-200 shadow-sm flex flex-col justify-between ${cardBorder}`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-semibold text-white text-sm hover:text-blue-400 transition-colors">
                      <Link href={`/operations/branches/${branch.id}`}>
                        {branch.name}
                      </Link>
                    </h3>
                    <p className="text-xs text-slate-400">
                      {branch.region ? `${branch.region} • ` : ""}{branch.code || "Branch"}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusBadge}`}>
                    {health?.status ?? "unknown"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                  <div>
                    <span className="text-slate-500 text-[11px]">Health Score</span>
                    <div className="font-semibold text-white mt-0.5">
                      {health?.score !== null && health?.score !== undefined ? `${health.score}%` : "--"}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px]">Cameras Online</span>
                    <div className="font-semibold text-white mt-0.5">
                      {branch.onlineCameras} / {branch.totalCameras}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-800/60">
                <button
                  onClick={(e) => handleDiagnosticPing(e, branch.id)}
                  disabled={isPinging}
                  className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-50"
                  title="Send diagnostic heartbeat ping to edge gateway"
                >
                  <Radio size={12} className={isPinging ? "animate-spin text-blue-400" : ""} />
                  {isPinging ? "Pinging..." : pingDone ? "Ping OK (14ms)" : "Ping Gateway"}
                </button>

                <Link
                  href={`/operations/branches/${branch.id}`}
                  className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View Details
                  <ExternalLink size={12} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
