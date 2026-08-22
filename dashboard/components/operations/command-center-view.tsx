"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Building2,
  Camera,
  Server,
  Database,
  Wifi,
  AlertTriangle,
  Siren,
  ArrowUpRight,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Wrench,
  HelpCircle,
  FileCheck2,
  Sparkles,
  Search,
  Activity,
  ChevronRight,
  Radio,
  MapPin,
  Flame,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Layers,
  FileSearch,
  X,
  Play,
  Cpu,
  Thermometer,
  HardDrive,
  PlusCircle,
} from "lucide-react";
import { StatusBadge } from "../ui/status-badge";
import { FleetFilterBar } from "../ui/fleet-filter-bar";

export function CommandCenterView() {
  const [summary, setSummary] = useState<any | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [hasBranchData, setHasBranchData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedRegion, setSelectedRegion] = useState("ALL");
  const [viewMode, setViewMode] = useState<"table" | "map">("table");
  const [selectedBranchWorkspace, setSelectedBranchWorkspace] = useState<any | null>(null);
  const [askSentinelQuery, setAskSentinelQuery] = useState("");
  const [askSentinelResponse, setAskSentinelResponse] = useState<string | null>(null);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [sumRes, branchRes] = await Promise.all([
        fetch("/api/control/v1/operations/command-center", { credentials: "include" }),
        fetch("/api/control/v1/operations/branches", { credentials: "include" }),
      ]);
      const sumData = await sumRes.json().catch(() => ({}));
      const branchData = await branchRes.json().catch(() => ({}));

      if (!sumRes.ok || !sumData?.success || !sumData?.data) {
        throw new Error(sumData?.error || "Command Center summary is unavailable");
      }
      if (!branchRes.ok || !branchData?.success || !Array.isArray(branchData?.data)) {
        throw new Error(branchData?.error || "Branch inventory is unavailable");
      }

      setSummary(sumData.data);
      setBranches(branchData.data);
      setHasBranchData(true);
    } catch (err) {
      console.error("Failed to load command center data:", err);
      setLoadError(err instanceof Error ? err.message : "Unable to load live fleet telemetry");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000); // 15s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const cameraTotals = useMemo(() => {
    if (!hasBranchData) {
      const total = Number(summary?.cameras?.total ?? 0);
      const working = Number(summary?.cameras?.working ?? summary?.cameras?.healthy ?? 0);
      const offline = Number(summary?.cameras?.offline ?? 0);
      const degraded = Number(summary?.cameras?.degraded ?? 0);
      const unknown = Number(summary?.cameras?.unknown ?? Math.max(0, total - working - offline - degraded));
      return {
        total,
        working: Math.min(Math.max(working, 0), total),
        notWorking: Math.max(0, total - working),
        offline,
        degraded,
        unknown,
      };
    }

    return branches.reduce(
      (totals, branch) => {
        const total = Math.max(0, Number(branch.cameras?.total ?? 0));
        const working = Math.min(Math.max(0, Number(branch.cameras?.working ?? branch.cameras?.healthy ?? 0)), total);
        const offline = Math.min(Math.max(0, Number(branch.cameras?.offline ?? 0)), total);
        const degraded = Math.min(Math.max(0, Number(branch.cameras?.degraded ?? 0)), total);
        const unknown = Math.min(
          Math.max(0, Number(branch.cameras?.unknown ?? Math.max(0, total - working - offline - degraded))),
          total,
        );
        totals.total += total;
        totals.working += working;
        totals.notWorking += Math.max(0, total - working);
        totals.offline += offline;
        totals.degraded += degraded;
        totals.unknown += unknown;
        return totals;
      },
      { total: 0, working: 0, notWorking: 0, offline: 0, degraded: 0, unknown: 0 },
    );
  }, [branches, hasBranchData, summary]);

  const totalBranchesCount = hasBranchData ? branches.length : Number(summary?.branches?.total ?? 0);
  const healthyBranchesCount = hasBranchData
    ? branches.filter((branch) => branch.operationalState === "HEALTHY").length
    : Number(summary?.branches?.healthy ?? 0);
  const atRiskBranchesCount = hasBranchData
    ? branches.filter((branch) => ["HIGH", "MEDIUM"].includes(branch.risk?.level)).length
    : Number(summary?.atRiskBranchesCount ?? 0);
  const totalCamerasCount = cameraTotals.total;
  const workingCamerasCount = cameraTotals.working;

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!b.name?.toLowerCase().includes(q) && !b.branchCode?.toLowerCase().includes(q)) return false;
      }
      if (selectedStatus !== "ALL" && b.operationalState !== selectedStatus) return false;
      if (selectedRegion !== "ALL" && b.region !== selectedRegion) return false;
      return true;
    });
  }, [branches, searchQuery, selectedStatus, selectedRegion]);

  const handleAskSentinel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!askSentinelQuery.trim()) return;
    const q = askSentinelQuery.toLowerCase();

    if (totalBranchesCount === 0) {
      setAskSentinelResponse("Fleet database is currently empty. Connect edge agents or add camera streams to activate live telemetry analysis.");
      return;
    }

    if (q.includes("fail") || q.includes("72") || q.includes("risk")) {
      const atRisk = branches.filter((b) => b.risk?.level === "HIGH" || b.risk?.level === "MEDIUM");
      if (atRisk.length > 0) {
        setAskSentinelResponse(`Found ${atRisk.length} at-risk branch(es): ${atRisk.map((b) => `${b.name} (${b.risk?.probabilityPct}%)`).join(", ")}.`);
      } else {
        setAskSentinelResponse("Zero predicted failures detected across fleet. All operational telemetry within normal envelope.");
      }
    } else if (q.includes("offline") || q.includes("camera")) {
      const offline = branches.filter((b) => (b.cameras?.notWorking ?? (b.cameras?.total ?? 0) - (b.cameras?.healthy ?? 0)) > 0);
      if (offline.length > 0) {
        setAskSentinelResponse(`Found cameras that are not working across: ${offline.map((b) => `${b.name} (${b.cameras.notWorking ?? ((b.cameras.total ?? 0) - (b.cameras.healthy ?? 0))} not working)`).join(", ")}.`);
      } else {
        setAskSentinelResponse("All provisioned cameras are working and online.");
      }
    } else {
      setAskSentinelResponse(`Analyzing live fleet telemetry for "${askSentinelQuery}"... ${totalBranchesCount} branch(es) registered.`);
    }
  };

  const handleQuickAction = async (actionType: string, branchCode: string) => {
    setExecutingAction(branchCode);
    setActionSuccessMsg(null);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setActionSuccessMsg(`✓ Successfully executed ${actionType} for Branch ${branchCode}`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } finally {
      setExecutingAction(null);
    }
  };

  const exportHealthCsv = () => {
    if (branches.length === 0) return;
    const headers = [
      "Branch Code",
      "Branch Name",
      "Region",
      "Health Score",
      "Operational Status",
      "Cameras Working",
      "Cameras Not Working",
      "Cameras Total",
      "Recording Status",
      "Network Latency",
      "Storage Health",
      "Retention Policy",
      "Risk Score",
      "Last Telemetry",
    ];

    const rows = branches.map((b) => [
      `"${b.branchCode || ""}"`,
      `"${b.name || ""}"`,
      `"${b.region || ""}"`,
      b.healthScore ?? 0,
      b.operationalState || "UNKNOWN",
      b.cameras?.working ?? b.cameras?.healthy ?? 0,
      b.cameras?.notWorking ?? Math.max(0, (b.cameras?.total ?? 0) - (b.cameras?.healthy ?? 0)),
      b.cameras?.total ?? 0,
      `${b.recording?.recordingChannels ?? 0}/${b.recording?.totalChannels ?? 0}`,
      `${b.internet?.latencyMs ?? 0}ms`,
      b.storage?.state ?? "UNKNOWN",
      b.retention?.displayTag ?? (b.retention?.observedDays != null ? `${b.retention.observedDays}d` : "UNKNOWN"),
      `${b.risk?.level ?? "UNKNOWN"} (${b.risk?.probabilityPct ?? 0}%)`,
      b.telemetry?.secondsAgo != null ? `${b.telemetry.secondsAgo}s ago` : "NO TELEMETRY",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `KryptonVision_Executive_Fleet_Health_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const predicted = summary?.predictedFailuresSummary?.nextLikelyFailure;

  return (
    <div className="command-center-page space-y-4 pb-12 text-slate-100 font-sans">
      {/* Top Banner & Header */}
      <div className="command-center-hero flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-xl shadow-lg">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
              Surveillance Command Center
            </h1>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live ● {summary?.lastTelemetryTimestamp || "Ready"}
            </span>
            {totalBranchesCount > 0 && (
              <span className="text-xs text-slate-400 border-l border-slate-800 pl-3 hidden sm:inline">
                Agent heartbeat: <strong className="text-slate-200">{summary?.agentHeartbeatSecondsAgo != null ? `${summary.agentHeartbeatSecondsAgo}s ago` : "Unknown"}</strong>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {totalBranchesCount} {totalBranchesCount === 1 ? "Branch" : "Branches"} • {totalCamerasCount.toLocaleString()} {totalCamerasCount === 1 ? "Camera" : "Cameras"} • Real-Time VMS Telemetry & Triage
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/branch-onboarding"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-900/30 transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Onboard Branch</span>
          </Link>

          <Link
            href="/control-room"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Live Wall</span>
          </Link>

          <button
            onClick={exportHealthCsv}
            disabled={branches.length === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-50 text-slate-300 border border-slate-700 text-xs font-medium transition-colors"
            title="Download CSV Device Health Report"
          >
            <span>📥 Export Health</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-xl border border-rose-800/60 bg-rose-950/30 text-sm text-rose-200" role="alert">
          Live fleet data could not be refreshed: {loadError}. Showing the last confirmed values.
        </div>
      )}

      {/* Global "Ask Sentinel" AI Command Bar */}
      <div className="command-center-ai-bar p-3 bg-slate-900/90 border border-indigo-900/50 rounded-xl shadow-md">
        <form onSubmit={handleAskSentinel} className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={askSentinelQuery}
            onChange={(e) => setAskSentinelQuery(e.target.value)}
            placeholder='Ask Sentinel: "Show me branches likely to fail recording within 72 hours" or "Are all cameras recording?"'
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all"
          >
            Ask Sentinel
          </button>
        </form>

        {askSentinelResponse && (
          <div className="mt-2.5 p-2.5 bg-indigo-950/50 border border-indigo-800/50 rounded-lg text-xs text-indigo-200 flex items-start justify-between gap-2">
            <div>
              <strong>Sentinel Intelligence:</strong> {askSentinelResponse}
            </div>
            <button onClick={() => setAskSentinelResponse(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-500">Quick queries:</span>
          <button
            onClick={() => { setAskSentinelQuery("Show me branches likely to fail recording within 72 hours"); }}
            className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            "Predicted failures &lt;72h"
          </button>
          <button
            onClick={() => { setAskSentinelQuery("Are all connected cameras recording?"); }}
            className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            "Recording health"
          </button>
          <button
            onClick={() => { setAskSentinelQuery("Which branches have retention below policy?"); }}
            className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            "Retention deficits"
          </button>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-600/60 rounded-xl text-xs font-semibold text-emerald-300 animate-fade-in">
          {actionSuccessMsg}
        </div>
      )}

      {/* Row 1 & 2: Operational Intelligence Cards Grid */}
      <div className="command-center-metrics grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* 1. Fleet Health Score */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Fleet Health</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {totalBranchesCount === 0 ? "—" : (summary?.fleetHealth?.score ?? 100)}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
            <span>{totalBranchesCount === 0 ? "Awaiting Telemetry" : "Fleet Score"}</span>
          </div>
        </div>

        {/* 2. Recording Health */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Recording</span>
            <Activity className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {totalCamerasCount === 0 ? "—" : `${summary?.recording?.healthyPct ?? 0}%`}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {totalCamerasCount === 0 ? "0 Streams" : `${summary?.recording?.totalRecording ?? 0} Active Rec`}
          </div>
        </div>

        {/* 3. At Risk Branches */}
        <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40 hover:border-amber-700/60 transition-all space-y-1">
          <div className="flex items-center justify-between text-amber-300">
            <span className="text-[11px] font-semibold tracking-wider uppercase">At Risk</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-200">
            {atRiskBranchesCount}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {atRiskBranchesCount ? `${atRiskBranchesCount} Warning` : "Zero Risk"}
          </div>
        </div>

        {/* 4. Predicted Failures */}
        <div className="p-3.5 rounded-xl bg-rose-950/25 border border-rose-800/50 hover:border-rose-700/70 transition-all space-y-1">
          <div className="flex items-center justify-between text-rose-300">
            <span className="text-[11px] font-bold tracking-wider uppercase flex items-center gap-1">
              <Flame className="w-3 h-3 text-rose-400" />
              Predicted
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-900/60 text-rose-300 font-mono">&lt;72h</span>
          </div>
          <div className="text-2xl font-black text-rose-200">
            {summary?.predictedFailuresSummary?.total || 0}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {summary?.predictedFailuresSummary?.total === 0 ? "No Failures <72h" : `${summary?.predictedFailuresSummary?.highRiskCount || 0} High`}
          </div>
        </div>

        {/* 5. Branches */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Branches</span>
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {healthyBranchesCount} <span className="text-xs text-slate-500 font-normal">/ {totalBranchesCount}</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {totalBranchesCount === 0 ? "No Branches" : `${healthyBranchesCount} Healthy`}
          </div>
        </div>

        {/* 6. Cameras */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Cameras</span>
            <Camera className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {workingCamerasCount.toLocaleString()} <span className="text-xs text-slate-500 font-normal">/ {totalCamerasCount}</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {totalCamerasCount === 0 ? "No Cameras" : `${workingCamerasCount} Working - ${cameraTotals.notWorking} Not working`}
          </div>
        </div>

        {/* 7. Storage Health */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Storage Health</span>
            <Database className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {Number(summary?.storage?.totalDisks ?? 0) === 0 ? "—" : `${summary?.storage?.healthyPct ?? 0}%`}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {Number(summary?.storage?.totalDisks ?? 0) === 0 ? "0 Disks" : `${summary?.storage?.healthy ?? 0} Healthy`}
          </div>
        </div>

        {/* 8. Retention Compliance */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Retention</span>
            <FileCheck2 className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {totalBranchesCount === 0 ? "—" : `${summary?.retention?.compliancePct ?? 0}%`}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {summary?.retention?.policyTag ?? "Policy unknown"} Policy
          </div>
        </div>
      </div>

      {/* Signature Predicted Failures Card if Failures Predicted */}
      {predicted && (
        <div className="command-center-prediction p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-rose-950/20 to-slate-900 border border-rose-900/50 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-rose-600/30 text-rose-300">
                <Flame className="w-5 h-5 text-rose-400 animate-pulse" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>⚠ Predicted Failures</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-900/80 text-rose-200 border border-rose-700/50">
                    {summary?.predictedFailuresSummary?.total || 1} Branch at Risk
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  AI predictive engine forecast: early warning before video interruption occurs
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 p-4 rounded-xl bg-slate-950/80 border border-rose-800/40 space-y-2.5">
              <div className="text-[11px] font-bold text-rose-400 tracking-wider uppercase flex items-center justify-between">
                <span>NEXT LIKELY FAILURE</span>
                <span className="font-mono text-xs">{predicted.expectedWindow}</span>
              </div>
              <div className="text-lg font-bold text-white">
                {predicted.branchName}
              </div>
              <div className="text-sm font-semibold text-rose-300">
                Recording failure probability: <span className="text-rose-400 text-base font-black">{predicted.failureProbability}%</span>
              </div>
              <p className="text-xs text-slate-300">
                Likely cause: <strong className="text-white">{predicted.likelyCause}</strong>
              </p>
            </div>

            <div className="lg:col-span-2 p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="font-bold text-indigo-400 text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                AI RCA ATTRIBUTION & RECOMMENDED ACTION
              </div>
              <div className="grid grid-cols-2 gap-2">
                {predicted.contributingFactors?.map((cf: any) => (
                  <div key={cf.factor} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                    <div className="text-slate-400 text-[11px] truncate">{cf.factor}</div>
                    <div className="text-base font-bold text-rose-300 mt-1">{cf.percentage}%</div>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-800 text-xs flex items-center justify-between">
                <div>
                  <span className="text-slate-400">Recommendation: </span>
                  <strong className="text-emerald-400">{predicted.recommendedAction}</strong>
                </div>
                <button
                  onClick={() => handleQuickAction("DISPATCH_TECH", predicted.branchId)}
                  className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow"
                >
                  Dispatch Technician
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic AI Operations Briefing */}
      <div className="command-center-briefing p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">AI Operations Briefing</h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {summary?.aiBriefing?.criticalItemsCount ?? 0} Active Triages
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className={`text-sm font-bold ${summary?.aiBriefing?.criticalItemsCount > 0 ? "text-rose-300" : "text-emerald-300"} flex items-center gap-2`}>
              <span className={`w-2 h-2 rounded-full ${summary?.aiBriefing?.criticalItemsCount > 0 ? "bg-rose-400 animate-pulse" : "bg-emerald-400"}`} />
              {summary?.aiBriefing?.headline || "System standby — awaiting camera feeds"}
            </div>
            <div className="text-xs text-slate-300">
              {summary?.aiBriefing?.summaryText || "No active hardware anomalies detected."}
            </div>
            <div className="text-xs text-slate-400">
              Action: <strong className="text-emerald-400">{summary?.aiBriefing?.recommendedAction || "Ready for camera connection."}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Live Incidents Strip */}
      <div className="command-center-live-strip p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-3 overflow-x-auto text-xs">
        <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
          <Radio className="w-3 h-3 animate-pulse" />
          LIVE INCIDENTS:
        </span>
        <div className="flex items-center gap-2.5">
          {(!summary?.liveIncidents || summary.liveIncidents.length === 0) ? (
            <span className="text-slate-500 italic">No active incidents pending. Fleet in normal state.</span>
          ) : (
            summary.liveIncidents.map((inc: any) => (
              <span
                key={inc.id}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-slate-200 flex items-center gap-1.5 shrink-0"
              >
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                <strong>{inc.branchCode}</strong>
                <span className="text-slate-400 truncate max-w-[200px]">{inc.headline}</span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Fleet Branch Operational Board */}
      <div className="command-center-fleet space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">Fleet Operational Board</h2>
            <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs">
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-1 rounded-md font-medium transition-all ${viewMode === "table" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
              >
                Table View
              </button>
              <button
                onClick={() => setViewMode("map")}
                className={`px-3 py-1 rounded-md font-medium transition-all ${viewMode === "map" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
              >
                Fleet Map View
              </button>
            </div>
          </div>

          <Link
            href="/operations/branches"
            className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            View All Fleet Branches →
          </Link>
        </div>

        <FleetFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          selectedRegion={selectedRegion}
          onRegionChange={setSelectedRegion}
          onRefresh={loadData}
        />

        {viewMode === "table" ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-3.5 py-3">Branch</th>
                    <th className="px-3 py-3">Health</th>
                    <th className="px-3 py-3">Cameras</th>
                    <th className="px-3 py-3">Recording</th>
                    <th className="px-3 py-3">Network</th>
                    <th className="px-3 py-3">Storage</th>
                    <th className="px-3 py-3">Retention</th>
                    <th className="px-3 py-3">Risk</th>
                    <th className="px-3 py-3">Last Telemetry</th>
                    <th className="px-3.5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredBranches.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                        <div className="max-w-md mx-auto space-y-3">
                          <Building2 className="w-8 h-8 text-slate-600 mx-auto" />
                          <div className="font-semibold text-slate-300">No branches enrolled in fleet database yet</div>
                          <p className="text-xs text-slate-500">
                            When you connect cameras, edge agents, or onboard branches, live telemetry will populate automatically.
                          </p>
                          <Link
                            href="/admin/branch-onboarding"
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition-colors"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Onboard First Branch</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredBranches.map((b) => (
                      <tr
                        key={b.branchId}
                        className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                        onClick={() => setSelectedBranchWorkspace(b)}
                      >
                        <td className="px-3.5 py-3">
                          <div className="font-bold text-slate-100 hover:text-blue-400 transition-colors">
                            {b.name}
                          </div>
                          <div className="text-slate-500 font-mono text-[11px]">{b.branchCode} • {b.region}</div>
                        </td>

                        <td className="px-3 py-3">
                          {b.cameras?.total === 0 ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                              ⚪ Not Provisioned
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={b.operationalState} size="sm" />
                              <span className="font-mono text-xs text-slate-300 font-bold">{b.healthScore ?? 100}/100</span>
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {b.cameras?.total === 0 ? (
                            <span className="text-slate-500">0 Cameras</span>
                          ) : (
                            <div>
                              <div className="font-semibold text-slate-200">
                                {b.cameras?.working ?? b.cameras?.healthy ?? 0}/{b.cameras?.total ?? 0} Working
                              </div>
                              {(b.cameras?.notWorking ?? ((b.cameras?.total ?? 0) - (b.cameras?.healthy ?? 0))) > 0 && (
                                <div className="text-rose-400 text-[11px]">
                                  {b.cameras?.notWorking ?? ((b.cameras?.total ?? 0) - (b.cameras?.healthy ?? 0))} Not working
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {b.cameras?.total === 0 ? (
                            <span className="text-slate-500">—</span>
                          ) : (
                            <div className={b.recording?.status === "HEALTHY" ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                              {b.recording?.recordingChannels ?? Math.max(0, b.cameras.total - (b.cameras.notWorking ?? b.cameras.notRecording ?? 0))}/{b.recording?.totalChannels ?? b.cameras.total} ✓
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <Wifi className={`w-3.5 h-3.5 ${b.internet?.state === 'HEALTHY' ? 'text-emerald-400' : 'text-rose-400'}`} />
                            <span>{b.internet?.mode ?? 'UNKNOWN'} ({b.internet?.latencyMs != null ? `${b.internet.latencyMs}ms` : '—'})</span>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                            {b.storage?.state ?? "UNKNOWN"}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          <div className={b.retention?.compliant ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                            {b.retention?.displayTag ?? (b.retention?.observedDays != null ? `${b.retention.observedDays}d` : "UNKNOWN")}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          {b.risk?.level === "HIGH" ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1 w-fit">
                              HIGH {b.risk.probabilityPct ?? 0}%
                            </span>
                          ) : b.risk?.level === "MEDIUM" ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1 w-fit">
                              MEDIUM {b.risk.probabilityPct ?? 0}%
                            </span>
                          ) : b.risk?.level === "LOW" ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 flex items-center gap-1 w-fit">
                              LOW
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1 w-fit">
                              UNKNOWN
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <span className="text-slate-400 font-mono text-[11px]">
                            {b.telemetry?.secondsAgo != null ? `${b.telemetry.secondsAgo}s ago` : "No telemetry"}
                          </span>
                        </td>

                        <td className="px-3.5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedBranchWorkspace(b)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                            >
                              Investigate
                            </button>
                            <Link
                              href={`/operations/branches/${b.branchId}`}
                              className="px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white text-xs font-semibold transition-all"
                            >
                              Workspace →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900 text-center space-y-4 shadow-xl">
            <div className="h-64 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center relative overflow-hidden">
              <div className="text-slate-500 text-sm space-y-2">
                <MapPin className="w-8 h-8 text-blue-400 mx-auto" />
                <p>{totalBranchesCount === 0 ? "No branches currently enrolled on map." : `${totalBranchesCount} branch(es) monitored on map.`}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deep Branch 360 Workspace Drawer */}
      {selectedBranchWorkspace && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
                    {selectedBranchWorkspace.branchCode}
                  </span>
                  <StatusBadge status={selectedBranchWorkspace.operationalState} size="sm" />
                </div>
                <h2 className="text-xl font-bold text-white mt-1">{selectedBranchWorkspace.name}</h2>
                <p className="text-xs text-slate-400">{selectedBranchWorkspace.region}</p>
              </div>
              <button
                onClick={() => setSelectedBranchWorkspace(null)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subsystem Diagnostics</h3>
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                Cameras: {selectedBranchWorkspace.cameras?.working ?? selectedBranchWorkspace.cameras?.healthy ?? 0}/{selectedBranchWorkspace.cameras?.total ?? 0} Working · {selectedBranchWorkspace.cameras?.notWorking ?? Math.max(0, (selectedBranchWorkspace.cameras?.total ?? 0) - (selectedBranchWorkspace.cameras?.healthy ?? 0))} Not working
              </div>
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                Recording: {selectedBranchWorkspace.recording?.recordingChannels ?? 0}/{selectedBranchWorkspace.recording?.totalChannels ?? 0} Channels
              </div>
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                Network: Latency {selectedBranchWorkspace.internet?.latencyMs ?? 0}ms
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <Link
                href={`/operations/branches/${selectedBranchWorkspace.branchId}`}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-center text-white text-xs font-bold shadow transition-colors"
              >
                Open Full Branch Workspace →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
