"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Wifi,
  RefreshCw,
  ArrowUpRight,
  ShieldAlert,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { FleetFilterBar } from "@/components/ui/fleet-filter-bar";

type NullableNumber = number | null;

interface FleetBranch {
  branchId: string;
  branchCode: string;
  name: string;
  region: string;
  operationalState: string;
  internet: {
    state: string;
  };
  cameras: {
    healthy: NullableNumber;
    total: NullableNumber;
    recording: NullableNumber;
  };
  retention: {
    breaches: NullableNumber;
    observedDays: NullableNumber;
    requiredDays: NullableNumber;
    compliant: boolean | null;
  };
  storage: {
    state: string;
  };
  alerts: {
    critical: NullableNumber;
  };
}

interface RawFleetBranch {
  id?: unknown;
  branchId?: unknown;
  name?: unknown;
  code?: unknown;
  branchCode?: unknown;
  region?: unknown;
  healthStatus?: unknown;
  operationalState?: unknown;
  internetStatus?: unknown;
  internet?: { state?: unknown };
  totalCameras?: unknown;
  onlineCameras?: unknown;
  recordingCameras?: unknown;
  cameras?: { total?: unknown; healthy?: unknown; recording?: unknown };
  retentionBreaches?: unknown;
  retention?: {
    breaches?: unknown;
    observedDays?: unknown;
    requiredDays?: unknown;
    compliant?: unknown;
  };
  components?: { storage?: { status?: unknown } };
  storage?: { state?: unknown };
  criticalAlerts?: unknown;
  alerts?: { critical?: unknown; p1?: unknown };
}

const RETENTION_DEFICIT = "RETENTION_DEFICIT";

function numberOrNull(value: unknown): NullableNumber {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function statusValue(value: unknown): string {
  return stringOrFallback(value, "UNKNOWN").toUpperCase();
}

function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeBranch(raw: RawFleetBranch): FleetBranch | null {
  const branchId = stringOrFallback(raw.branchId ?? raw.id, "");
  const name = stringOrFallback(raw.name, "");
  if (!branchId || !name) return null;

  const cameras = raw.cameras;
  const retention = raw.retention;

  return {
    branchId,
    branchCode: stringOrFallback(raw.branchCode ?? raw.code, branchId),
    name,
    region: stringOrFallback(raw.region, "Unassigned"),
    operationalState: statusValue(raw.operationalState ?? raw.healthStatus),
    internet: {
      state: statusValue(raw.internet?.state ?? raw.internetStatus),
    },
    cameras: {
      healthy: numberOrNull(cameras?.healthy ?? raw.onlineCameras),
      total: numberOrNull(cameras?.total ?? raw.totalCameras),
      recording: numberOrNull(cameras?.recording ?? raw.recordingCameras),
    },
    retention: {
      breaches: numberOrNull(retention?.breaches ?? raw.retentionBreaches),
      observedDays: numberOrNull(retention?.observedDays),
      requiredDays: numberOrNull(retention?.requiredDays),
      compliant: typeof retention?.compliant === "boolean" ? retention.compliant : null,
    },
    storage: {
      state: statusValue(raw.storage?.state ?? raw.components?.storage?.status),
    },
    alerts: {
      critical: numberOrNull(raw.alerts?.critical ?? raw.alerts?.p1 ?? raw.criticalAlerts),
    },
  };
}

function displayNumber(value: NullableNumber, suffix = ""): string {
  return value === null ? "N/A" : `${value}${suffix}`;
}

export default function FleetBranchesPage() {
  const [branches, setBranches] = useState<FleetBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedRegion, setSelectedRegion] = useState("ALL");

  const loadBranches = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/control/v1/operations/health/branches?limit=400", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !Array.isArray(data?.data?.branches)) {
        throw new Error(data?.error || `Branch telemetry request failed (${res.status})`);
      }

      setBranches(
        data.data.branches
          .map((branch: RawFleetBranch) => normalizeBranch(branch))
          .filter((branch: FleetBranch | null): branch is FleetBranch => branch !== null),
      );
    } catch (err: unknown) {
      console.error("Failed to load branches:", err);
      setBranches([]);
      setError(err instanceof Error ? err.message : "Failed to communicate with control plane.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const retentionDeficitBranches = branches.filter(
    (b) => b.retention.breaches !== null && b.retention.breaches > 0 || b.retention.compliant === false,
  );

  const regionOptions = [
    { label: "All Regions", value: "ALL" },
    ...Array.from(new Set(branches.map((branch) => branch.region)))
      .filter((region) => region !== "Unassigned")
      .sort((left, right) => left.localeCompare(right))
      .map((region) => ({ label: region, value: region })),
  ];

  const statusOptions = [
    { label: "All Statuses", value: "ALL" },
    ...Array.from(new Set(branches.map((branch) => branch.operationalState)))
      .sort((left, right) => left.localeCompare(right))
      .map((status) => ({ label: statusLabel(status), value: status })),
    { label: "Retention Evidence Deficit", value: RETENTION_DEFICIT },
  ];

  const filtered = branches.filter((b) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!b.name.toLowerCase().includes(q) && !b.branchCode.toLowerCase().includes(q) && !b.region.toLowerCase().includes(q)) return false;
    }
    if (selectedStatus === RETENTION_DEFICIT) {
      if (!retentionDeficitBranches.some((branch) => branch.branchId === b.branchId)) {
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
      "Health Status",
      "Internet Status",
      "Cameras Online",
      "Cameras Total",
      "Recording Evidence",
      "Retention Breaches",
      "Storage State",
      "Critical Alerts",
    ];

    const rows = branches.map((b) => [
      `"${b.name.replaceAll('"', '""')}"`,
      `"${b.branchCode.replaceAll('"', '""')}"`,
      `"${b.region.replaceAll('"', '""')}"`,
      b.operationalState,
      b.internet.state,
      b.cameras.healthy ?? "",
      b.cameras.total ?? "",
      b.cameras.recording ?? "",
      b.retention.breaches ?? "",
      b.storage.state,
      b.alerts.critical ?? "",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Sentinel_Grid_Branch_Health_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportAlertsCsv = () => {
    const headers = ["Branch Name", "Branch Code", "Critical Alerts"];
    const rows = branches
      .filter((b) => b.alerts.critical !== null && b.alerts.critical > 0)
      .map((b) => [
        `"${b.name.replaceAll('"', '""')}"`,
        `"${b.branchCode.replaceAll('"', '""')}"`,
        b.alerts.critical,
      ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Sentinel_Grid_Critical_Alerts_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header and Quick Batch Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white tracking-tight">Fleet Branches Status Board</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
              {branches.length} Accessible Branches
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Live branch inventory and telemetry from the control plane
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={exportHealthCsv}
            disabled={branches.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors shadow-sm"
            title="Download branch health report"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Health Check</span>
          </button>

          <button
            onClick={exportAlertsCsv}
            disabled={!branches.some((branch) => branch.alerts.critical !== null && branch.alerts.critical > 0)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors shadow-sm"
            title="Download critical alert counts"
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
                Verified Retention Breaches Detected ({retentionDeficitBranches.length} {retentionDeficitBranches.length === 1 ? "Branch" : "Branches"})
              </div>
              <div className="text-xs text-rose-300/80 mt-0.5">
                Recording evidence for these branches is below the configured policy.
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

      {error && (
        <div className="p-4 bg-amber-950/40 border border-amber-500/50 rounded-xl text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>Unable to load live branch telemetry: {error}</span>
        </div>
      )}

      <FleetFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search branches by name, code, or region..."
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        statusOptions={statusOptions}
        selectedRegion={selectedRegion}
        onRegionChange={setSelectedRegion}
        regionOptions={regionOptions}
        onRefresh={loadBranches}
        onExport={branches.length > 0 ? exportHealthCsv : undefined}
      />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Branch Name & Code</th>
              <th className="px-4 py-3">Health Status</th>
              <th className="px-4 py-3">WAN / Internet Link</th>
              <th className="px-4 py-3">Cameras</th>
              <th className="px-4 py-3">Retention Evidence</th>
              <th className="px-4 py-3">Storage State</th>
              <th className="px-4 py-3">Critical Alerts</th>
              <th className="px-4 py-3 text-right">Workspace</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  {loading ? "Loading branch network..." : "No branches match the selected filters."}
                </td>
              </tr>
            ) : (
              filtered.map((b) => {
                const isRetentionViolation =
                  (b.retention.breaches !== null && b.retention.breaches > 0) || b.retention.compliant === false;

                return (
                  <tr key={b.branchId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <Link href={`/operations/branches/${encodeURIComponent(b.branchId)}`} className="block">
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
                            ["ONLINE", "HEALTHY"].includes(b.internet.state) ? "text-emerald-400" : "text-slate-400"
                          }`}
                        />
                        <span>
                          <StatusBadge status={b.internet.state} size="sm" />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium">
                        {displayNumber(b.cameras.healthy)}/{displayNumber(b.cameras.total)} Online
                      </div>
                      {b.cameras.recording !== null && (
                        <div className="text-slate-400 font-medium text-[11px]">
                          {b.cameras.recording} with recording evidence
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {isRetentionViolation ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-950/90 text-rose-200 border border-rose-500/70 font-bold text-[11px] shadow-sm shadow-rose-950 animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                          <span>
                            {displayNumber(b.retention.breaches)} breach{b.retention.breaches === 1 ? "" : "es"}
                          </span>
                        </span>
                      ) : b.retention.observedDays !== null && b.retention.requiredDays !== null ? (
                        <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{b.retention.observedDays} / {b.retention.requiredDays} days verified</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">Evidence unavailable</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={b.storage.state} size="sm" />
                    </td>
                    <td className="px-4 py-3.5">
                      {b.alerts.critical !== null && b.alerts.critical > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                          {b.alerts.critical} Critical
                        </span>
                      ) : (
                        <span className="text-slate-500">{b.alerts.critical === null ? "N/A" : "0"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/operations/branches/${encodeURIComponent(b.branchId)}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition-colors"
                      >
                        <span>Open</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
