"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Wifi,
  Search,
  RefreshCw,
  SlidersHorizontal,
  ArrowUpRight,
  ShieldAlert,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  HardDrive,
  Camera,
  CheckCircle2,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { FleetFilterBar } from "@/components/ui/fleet-filter-bar";

export default function FleetBranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedRegion, setSelectedRegion] = useState("ALL");

  const loadBranches = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/control/v1/operations/health/branches?limit=400", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const list = data.data?.branches || (Array.isArray(data.data) ? data.data : []);
          setBranches(list);
        }
      }
    } catch (err) {
      console.error("Failed to load branches:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const retentionDeficitBranches = branches.filter(
    (b) => !b.retention?.compliant || (b.retention?.observedDays ?? 0) < (b.retention?.requiredDays ?? 90)
  );

  const filtered = branches.filter((b) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!b.name?.toLowerCase().includes(q) && !b.branchCode?.toLowerCase().includes(q)) return false;
    }
    if (selectedStatus === "RETENTION_DEFICIT") {
      if (b.retention?.compliant && (b.retention?.observedDays ?? 0) >= (b.retention?.requiredDays ?? 90)) {
        return false;
      }
    } else if (selectedStatus !== "ALL" && b.operationalState !== selectedStatus) {
      return false;
    }
    if (selectedRegion !== "ALL" && b.region !== selectedRegion) return false;
    return true;
  });

  const exportHealthCsv = () => {
    const headers = [
      "Branch Name",
      "Branch Code",
      "Region",
      "Operational State",
      "WAN Internet State",
      "Latency (ms)",
      "Cameras Healthy",
      "Cameras Total",
      "Cameras No Recording",
      "Verified Retention Days",
      "Required Retention Days",
      "Retention Status",
      "Storage State",
      "P1 Critical Alerts",
    ];

    const rows = branches.map((b) => [
      `"${b.name || ""}"`,
      `"${b.branchCode || ""}"`,
      `"${b.region || ""}"`,
      b.operationalState || "UNKNOWN",
      b.internet?.state || "UNKNOWN",
      b.internet?.latencyMs ?? 0,
      b.cameras?.healthy ?? 0,
      b.cameras?.total ?? 0,
      b.cameras?.notRecording ?? 0,
      b.retention?.observedDays ?? 0,
      b.retention?.requiredDays ?? 90,
      b.retention?.compliant ? "COMPLIANT" : "RETENTION_DEFICIT",
      b.storage?.state || "HEALTHY",
      b.alerts?.p1 ?? 0,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SentinelGrid_Branch_Health_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportAlertsCsv = () => {
    const headers = ["Severity", "Branch Name", "Branch Code", "Alert Category", "Timestamp", "Status", "Mode"];
    const rows = branches
      .filter((b) => (b.alerts?.p1 ?? 0) > 0 || !b.retention?.compliant)
      .map((b) => [
        b.alerts?.p1 > 0 ? "P1 (Critical)" : "P2 (High)",
        `"${b.name || ""}"`,
        `"${b.branchCode || ""}"`,
        !b.retention?.compliant ? "Recording Retention Deficit" : "Critical Hardware/Security Breach",
        new Date().toISOString(),
        "ACTIVE",
        "Dashboard + SMS + Email + Voice Call",
      ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SentinelGrid_Segregated_Alerts_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header and Quick Batch Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-white tracking-tight">Fleet Branches Status Board</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                {branches.length} Active Branches
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Authoritative edge telemetry, retention audit & multi-branch health projections
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={exportHealthCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors shadow-sm"
              title="Download Excel/CSV Device Health Report"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Health Check</span>
            </button>

            <button
              onClick={exportAlertsCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors shadow-sm"
              title="Download Segregated Alert Log"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Export Alerts Report</span>
            </button>

            <button
              onClick={loadBranches}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Retention Deficit Banner if Violations Exist */}
        {retentionDeficitBranches.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-rose-950/40 border border-rose-600/60 rounded-xl shadow-lg shadow-rose-950/40 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-600/30 text-rose-300">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <div className="font-bold text-rose-200 text-sm">
                  ⚠️ Critical Retention Deficit Detected ({retentionDeficitBranches.length} Branches Below Prescribed Policy)
                </div>
                <div className="text-xs text-rose-300/80 mt-0.5">
                  Footage retention is below regulatory mandate (90 / 180 days). Immediate disk replacement or bitrate adjustment recommended.
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedStatus("RETENTION_DEFICIT")}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow transition-colors self-start sm:self-auto"
            >
              View Non-Compliant Branches ({retentionDeficitBranches.length})
            </button>
          </div>
        )}

        <FleetFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          selectedRegion={selectedRegion}
          onRegionChange={setSelectedRegion}
          onRefresh={loadBranches}
          onExport={exportHealthCsv}
        />

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Branch Name & Code</th>
                <th className="px-4 py-3">Operational Status</th>
                <th className="px-4 py-3">WAN / Internet Link</th>
                <th className="px-4 py-3">Cameras (16-CH)</th>
                <th className="px-4 py-3">Retention Audit (90d / 180d)</th>
                <th className="px-4 py-3">Storage State</th>
                <th className="px-4 py-3">Alerts</th>
                <th className="px-4 py-3 text-right">Workspace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((b) => {
                const isRetentionViolation =
                  !b.retention?.compliant || (b.retention?.observedDays ?? 0) < (b.retention?.requiredDays ?? 90);

                return (
                  <tr key={b.branchId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <Link href={`/operations/branches/${b.branchId}`} className="block">
                        <div className="font-semibold text-slate-100 hover:text-blue-400 transition-colors">
                          {b.name}
                        </div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          {b.branchCode} • {b.region}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={b.operationalState} size="sm" />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Wifi
                          className={`w-3.5 h-3.5 ${
                            b.internet?.state === "HEALTHY" ? "text-emerald-400" : "text-rose-400"
                          }`}
                        />
                        <span>
                          {b.internet?.mode || "Broadband"} ({b.internet?.latencyMs ?? 18}ms)
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium">
                        {b.cameras?.healthy ?? 16}/{b.cameras?.total ?? 16} Streaming
                      </div>
                      {(b.cameras?.notRecording ?? 0) > 0 && (
                        <div className="text-rose-400 font-medium text-[11px]">
                          {b.cameras.notRecording} No Record
                        </div>
                      )}
                    </td>
                    {/* Retention Column: Prominently highlighted in RED if below prescribed retention */}
                    <td className="px-4 py-3.5">
                      {isRetentionViolation ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-950/90 text-rose-200 border border-rose-500/70 font-bold text-[11px] shadow-sm shadow-rose-950 animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                          <span>
                            {b.retention?.observedDays ?? 0} / {b.retention?.requiredDays ?? 90}d (DEFICIT)
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {b.retention?.observedDays ?? 90} / {b.retention?.requiredDays ?? 90} Days
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={b.storage?.state || "HEALTHY"} size="sm" />
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
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition-colors"
                      >
                        <span>Open</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
