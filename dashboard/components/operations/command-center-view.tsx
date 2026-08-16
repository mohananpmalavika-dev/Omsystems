"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { StatusBadge } from "../ui/status-badge";
import { FleetFilterBar } from "../ui/fleet-filter-bar";

export function CommandCenterView() {
  const [summary, setSummary] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedRegion, setSelectedRegion] = useState("ALL");

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, branchRes] = await Promise.all([
        fetch("/api/control/v1/operations/command-center", { credentials: "include" }),
        fetch("/api/control/v1/operations/branches", { credentials: "include" }),
      ]);
      const sumData = await sumRes.json().catch(() => ({}));
      const branchData = await branchRes.json().catch(() => ({}));

      if (sumData?.success && sumData?.data) setSummary(sumData.data);
      if (branchData?.success && Array.isArray(branchData?.data)) setBranches(branchData.data);
    } catch (err) {
      console.error("Failed to load command center data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000); // 20s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const totalBranchesCount = summary?.branches?.total ?? branches.length;
  const totalCamerasCount = summary?.cameras?.total ?? 0;

  const filteredBranches = branches.filter((b) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!b.name?.toLowerCase().includes(q) && !b.branchCode?.toLowerCase().includes(q)) return false;
    }
    if (selectedStatus !== "ALL" && b.operationalState !== selectedStatus) return false;
    if (selectedRegion !== "ALL" && b.region !== selectedRegion) return false;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Attention Metrics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800/80 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">Surveillance Command Center</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
              Live Fleet Active
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {totalBranchesCount} {totalBranchesCount === 1 ? "Branch" : "Branches"} • {totalCamerasCount.toLocaleString()} {totalCamerasCount === 1 ? "Channel" : "Channels"} • Live Surveillance & Incident Triage
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Refreshing..." : "Refresh State"}</span>
          </button>

          <Link
            href="/control-room"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-900/20 transition-all"
          >
            <span>Open Live Wall</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Fleet Dimension Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Branches */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Branches</span>
            <Building2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {totalBranchesCount}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-400 font-medium">{summary?.branches?.healthy ?? 0} healthy</span>
            <span className="text-rose-400 font-medium">{summary?.branches?.critical ?? 0} critical</span>
          </div>
        </div>

        {/* Cameras */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Cameras</span>
            <Camera className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {totalCamerasCount}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-400 font-medium">{summary?.cameras?.healthy ?? 0} stream</span>
            <span className="text-amber-400 font-medium">{summary?.cameras?.recordingFailure ?? 0} no rec</span>
          </div>
        </div>

        {/* Recorders */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Recorders (NVR)</span>
            <Server className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {summary?.recorders?.total ?? 0}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-400 font-medium">{summary?.recorders?.online ?? 0} online</span>
            <span className="text-slate-400 font-medium">{summary?.recorders?.maintenance ?? 0} maint</span>
          </div>
        </div>

        {/* Storage */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">SATA Disks</span>
            <Database className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {summary?.storage?.totalDisks ?? 0}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-400 font-medium">{summary?.storage?.healthy ?? 0} passed</span>
            <span className="text-amber-400 font-medium">{summary?.storage?.warning ?? 0} SMART</span>
          </div>
        </div>

        {/* Retention */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Retention (90d)</span>
            <FileCheck2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {summary?.retention?.compliantBranches !== undefined && totalBranchesCount > 0
              ? `${Math.round((summary.retention.compliantBranches / totalBranchesCount) * 100)}%`
              : totalBranchesCount === 0 ? "100%" : "—"}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-400 font-medium">{summary?.retention?.compliantBranches ?? 0} comp</span>
            <span className="text-rose-400 font-medium">{summary?.retention?.violationBranches ?? 0} viol</span>
          </div>
        </div>

        {/* P1 Alerts */}
        <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/40 space-y-2">
          <div className="flex items-center justify-between text-rose-300">
            <span className="text-xs font-medium">P1 Critical Alerts</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-200 tracking-tight">
            {summary?.alerts?.p1Open ?? 0}
          </div>
          <div className="flex items-center gap-2 text-xs text-rose-300/80">
            <span>{summary?.alerts?.unacknowledged ?? 0} unack</span>
            <span>•</span>
            <span>{summary?.incidents?.active ?? 0} incidents</span>
          </div>
        </div>
      </div>

      {/* Attention Required Triage Matrix */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-semibold text-white">Attention Required (Immediate Triage)</h2>
          </div>
          <span className="text-xs text-slate-400">
            {(summary?.attentionRequired?.length ?? 0)} Critical Exceptions Pending
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(summary?.attentionRequired ?? []).map((item: any) => (
            <Link
              key={item.id}
              href={item.actionUrl}
              className="p-4 rounded-xl bg-slate-950/70 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-all flex items-start justify-between gap-3 group"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <StatusBadge status={item.severity} size="sm" />
                  <span className="text-xs font-medium text-blue-400">{item.branchName}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2">
                  {item.description}
                </p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors shrink-0 mt-1" />
            </Link>
          ))}
          {(!summary?.attentionRequired || summary.attentionRequired.length === 0) && (
            <div className="col-span-2 p-4 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/60">
              No immediate critical triage items pending. All branches operating within normal parameters.
            </div>
          )}
        </div>
      </div>

      {/* Fleet Branch Operational Status Board */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Fleet Branch Operational Board</h2>
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

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Operational Status</th>
                  <th className="px-4 py-3">WAN / Internet</th>
                  <th className="px-4 py-3">Cameras (16-CH)</th>
                  <th className="px-4 py-3">Retention (90d)</th>
                  <th className="px-4 py-3">Storage Health</th>
                  <th className="px-4 py-3">Alerts</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredBranches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No branches enrolled yet. Create or onboard your first branch to begin live surveillance monitoring.
                    </td>
                  </tr>
                ) : (
                  filteredBranches.map((b) => (
                    <tr
                      key={b.branchId}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3.5">
                        <Link href={`/operations/branches/${b.branchId}`} className="block">
                          <div className="font-semibold text-slate-100 hover:text-blue-400 transition-colors">
                            {b.name}
                          </div>
                          <div className="text-slate-500 font-mono text-[11px]">{b.branchCode} • {b.region}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={b.operationalState} size="sm" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Wifi className={`w-3.5 h-3.5 ${b.internet?.state === 'HEALTHY' ? 'text-emerald-400' : 'text-rose-400'}`} />
                          <span>{b.internet?.mode || 'OFFLINE'} ({b.internet?.latencyMs || 0}ms)</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium">
                          {b.cameras?.healthy || 0}/{b.cameras?.total || 0} Streaming
                        </div>
                        {(b.cameras?.notRecording ?? 0) > 0 && (
                          <div className="text-rose-400 font-medium text-[11px]">
                            {b.cameras.notRecording} No Record
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className={b.retention?.compliant ? "text-emerald-400" : "text-rose-400"}>
                          {b.retention?.observedDays ?? 0} / {b.retention?.requiredDays ?? 90} Days
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={b.storage?.state || "UNKNOWN"} size="sm" />
                      </td>
                      <td className="px-4 py-3.5">
                        {(b.alerts?.p1 ?? 0) > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                            P1 × {b.alerts.p1}
                          </span>
                        ) : (
                          <span className="text-slate-500">0 P1</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/operations/branches/${b.branchId}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                        >
                          Workspace →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
