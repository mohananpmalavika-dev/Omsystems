"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, HardDrive, RefreshCw, Filter, ShieldCheck, ThermometerSun, Zap } from "lucide-react";
import type { DiskHealth } from "@/lib/types/operational-health";
import { fetchDisksHealth } from "@/lib/api/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";
import { DiskHealthCard } from "./disk-health-card";
import { rankAtRiskDisks, summarizeHddFleet } from "./hdd-fleet-model";

type FleetFilter = "ALL" | "AT_RISK" | "SMART_FAILED" | "HIGH_TEMP" | "BAD_SECTORS";

export function HddFleetWidget({ detailed = false, autoRefresh = true, refreshToken }: { detailed?: boolean; autoRefresh?: boolean; refreshToken?: number }) {
  const [disks, setDisks] = useState<DiskHealth[]>([]);
  const [activeFilter, setActiveFilter] = useState<FleetFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchDisksHealth();
      setDisks(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load HDD health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (!autoRefresh) return;
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [autoRefresh, load, refreshToken]);

  useOperationalHealthStream(useCallback(() => { void load(); }, [load]), refreshToken === undefined);

  const summary = summarizeHddFleet(disks);

  // Apply exception-first filtering
  let filtered = detailed ? disks : rankAtRiskDisks(disks, 6);
  if (activeFilter === "AT_RISK") {
    filtered = disks.filter((d) => d.operationalStatus !== "healthy");
  } else if (activeFilter === "SMART_FAILED") {
    filtered = disks.filter((d) => d.smartStatus === "failed" || d.smartStatus === "degraded");
  } else if (activeFilter === "HIGH_TEMP") {
    filtered = disks.filter((d) => (d.temperature ?? 0) >= 50);
  } else if (activeFilter === "BAD_SECTORS") {
    filtered = disks.filter((d) => d.sectorGrowth > 0 || d.reasonCodes.some((c) => c.includes("sector")));
  }

  const stats = [
    ["Total HDDs", summary.total, "border-slate-200 bg-slate-50 text-slate-800"],
    ["Detected", summary.detected, "border-emerald-200 bg-emerald-50 text-emerald-800"],
    ["Missing", summary.missing, "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800"],
    ["SMART healthy", summary.smartHealthy, "border-emerald-200 bg-emerald-50 text-emerald-800"],
    ["SMART unavailable", summary.smartUnavailable, "border-slate-200 bg-slate-50 text-slate-800"],
    ["RAID at risk", summary.raidAtRisk, "border-orange-200 bg-orange-50 text-orange-800"],
    ["Write verified", summary.writeVerified, "border-cyan-200 bg-cyan-50 text-cyan-800"],
    ["Write failed", summary.writeFailed, "border-red-200 bg-red-50 text-red-800"],
    ["Write unverified", summary.writeUnverified, "border-amber-200 bg-amber-50 text-amber-800"],
    ["Capacity critical", summary.capacityCritical, "border-red-200 bg-red-50 text-red-800"],
    ["Branches at risk", summary.branchesAtRisk, "border-orange-200 bg-orange-50 text-orange-800"],
  ] as const;

  return (
    <section className="card" aria-labelledby="hdd-fleet-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="hdd-fleet-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <HardDrive size={20} /> HDD fleet health
          </h2>
          <p className="mt-1 text-sm text-gray-600">SMART risk, capacity pressure, and failing disks across all accessible branches.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick Filter Buttons */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs">
            <button
              onClick={() => setActiveFilter("ALL")}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                activeFilter === "ALL" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveFilter("AT_RISK")}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                activeFilter === "AT_RISK" ? "bg-red-50 text-red-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              At Risk
            </button>
            <button
              onClick={() => setActiveFilter("SMART_FAILED")}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                activeFilter === "SMART_FAILED" ? "bg-amber-50 text-amber-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              SMART Alerts
            </button>
          </div>

          <button className="btn-secondary flex items-center gap-2" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {stats.map(([label, value, color]) => (
          <div key={label} className={`rounded-lg border p-3 ${color}`}>
            <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {!loading && !error && disks.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
          No HDD telemetry received. Configure the recorder adapter to submit its HDD status payload.
        </div>
      ) : null}
      {filtered.length > 0 ? (
        <div className="mt-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <AlertTriangle size={16} className="text-red-600" /> {detailed ? "Disk-slot evidence" : "Monitored Physical Disks"}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((disk) => <DiskHealthCard key={disk.id} disk={disk} />)}
          </div>
        </div>
      ) : null}
      {!detailed && disks.length > 0 ? <a href="/operations/storage" className="btn-secondary mt-5 inline-flex">View all disk health</a> : null}
    </section>
  );
}
