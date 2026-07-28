"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, HardDrive, RefreshCw } from "lucide-react";
import type { DiskHealth } from "@/lib/types/operational-health";
import { fetchDisksHealth } from "@/lib/api/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";
import { DiskHealthCard } from "./disk-health-card";
import { rankAtRiskDisks, summarizeHddFleet } from "./hdd-fleet-model";

export function HddFleetWidget({ detailed = false }: { detailed?: boolean }) {
  const [disks, setDisks] = useState<DiskHealth[]>([]);
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
  useEffect(() => { void load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [load]);
  useOperationalHealthStream(useCallback(() => { void load(); }, [load]));

  const summary = summarizeHddFleet(disks);
  const atRisk = rankAtRiskDisks(disks, detailed ? disks.length : 6);
  const stats = [
    ["Total HDDs", summary.total, "border-slate-200 bg-slate-50 text-slate-800"],
    ["Healthy", summary.healthy, "border-emerald-200 bg-emerald-50 text-emerald-800"],
    ["Warning", summary.warning, "border-amber-200 bg-amber-50 text-amber-800"],
    ["Critical", summary.critical, "border-red-200 bg-red-50 text-red-800"],
    ["Missing", summary.missing, "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800"],
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
        <button className="btn-secondary flex items-center gap-2" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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
      {atRisk.length > 0 ? (
        <div className="mt-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <AlertTriangle size={16} className="text-red-600" /> Highest-risk disks
          </h3>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {atRisk.map((disk) => <DiskHealthCard key={disk.id} disk={disk} />)}
          </div>
        </div>
      ) : null}
      {!detailed && disks.length > 0 ? <a href="/operations/storage" className="btn-secondary mt-5 inline-flex">View all disk health</a> : null}
    </section>
  );
}
