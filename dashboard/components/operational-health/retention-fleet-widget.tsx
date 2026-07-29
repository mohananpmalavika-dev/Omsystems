"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, RefreshCw, Save } from "lucide-react";
import type { RetentionHealth } from "@/lib/types/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";
import { rankRetentionExceptions, summarizeRetention } from "./retention-fleet-model";

type Policy = Record<string, number> & { retentionDays: number; retentionWarningDays: number };

export function RetentionFleetWidget({ detailed = false }: { detailed?: boolean }) {
  const [items, setItems] = useState<RetentionHealth[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [retentionResponse, policyResponse] = await Promise.all([
        fetch("/api/control/v1/operations/health/retention", { cache: "no-store" }),
        fetch("/api/control/v1/operations/health/policy", { cache: "no-store" }),
      ]);
      if (!retentionResponse.ok) throw new Error("Retention health is unavailable");
      setItems((await retentionResponse.json()).data.items ?? []);
      if (policyResponse.ok) setPolicy((await policyResponse.json()).data);
      setMessage(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to load retention health");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [load]);
  useOperationalHealthStream(useCallback(() => { void load(); }, [load]));

  const savePolicy = async () => {
    if (!policy) return;
    const response = await fetch("/api/control/v1/operations/health/policy", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ policy }),
    });
    if (!response.ok) { setMessage("You do not have permission to update the retention policy."); return; }
    setMessage("Retention thresholds saved.");
    await load();
  };
  const summary = summarizeRetention(items);
  const exceptions = rankRetentionExceptions(items);
  const stats = [
    ["Cameras", summary.total, "border-slate-200 bg-slate-50 text-slate-800"],
    ["Compliant", summary.compliant, "border-emerald-200 bg-emerald-50 text-emerald-800"],
    ["At risk", summary.atRisk, "border-amber-200 bg-amber-50 text-amber-800"],
    ["Below threshold", summary.breaches, "border-red-300 bg-red-50 text-red-800"],
    ["Unknown", summary.unknown, "border-gray-200 bg-gray-50 text-gray-700"],
    ["Affected branches", summary.affectedBranches, "border-orange-200 bg-orange-50 text-orange-800"],
  ] as const;

  return <section className="card" aria-labelledby="retention-fleet-title">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="retention-fleet-title" className="flex items-center gap-2 text-lg font-semibold"><CalendarClock size={20}/> Recording retention compliance</h2><p className="mt-1 text-sm text-gray-600">Continuous playable footage versus the prescribed retention period.</p></div>
      <button className="btn-secondary flex items-center gap-2" onClick={() => void load()}><RefreshCw size={15} className={loading ? "animate-spin" : ""}/> Refresh</button>
    </div>
    {detailed && policy ? <div className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border bg-gray-50 p-4">
      <label className="text-sm font-medium">Minimum retention days<input aria-label="Minimum retention days" className="mt-1 block w-32 rounded border px-3 py-2" type="number" min={1} max={3650} value={policy.retentionDays} onChange={(event) => setPolicy({ ...policy, retentionDays: Number(event.target.value) })}/></label>
      <label className="text-sm font-medium">Early-warning days<input aria-label="Early-warning days" className="mt-1 block w-32 rounded border px-3 py-2" type="number" min={1} max={365} value={policy.retentionWarningDays} onChange={(event) => setPolicy({ ...policy, retentionWarningDays: Number(event.target.value) })}/></label>
      <button className="btn-primary flex items-center gap-2" onClick={() => void savePolicy()}><Save size={15}/> Save thresholds</button>
    </div> : null}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{stats.map(([label, value, tone]) => <div key={label} className={`rounded-lg border p-3 ${tone}`}><p className="text-xs font-medium uppercase tracking-wide">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</div>
    {message ? <p className="mt-4 rounded border bg-white p-3 text-sm">{message}</p> : null}
    <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{exceptions.slice(0, detailed ? exceptions.length : 9).map((item) => {
      const breached = item.status === "breach";
      const tone = breached ? "border-red-400 bg-red-50" : item.status === "at_risk" ? "border-amber-400 bg-amber-50" : "border-gray-300 bg-gray-50";
      return <article key={`${item.branchId}:${item.cameraId}`} className={`rounded-lg border-2 p-4 ${tone}`}>
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{item.cameraName}</h3><p className="text-xs text-gray-600">{item.branchName}</p></div><span className={`rounded px-2 py-1 text-xs font-bold uppercase ${breached ? "bg-red-600 text-white" : item.status === "at_risk" ? "bg-amber-500 text-white" : "bg-gray-300"}`}>{item.status.replace("_", " ")}</span></div>
        <div className="mt-4 flex items-end gap-2"><strong className={`text-3xl ${breached ? "text-red-700" : "text-amber-700"}`}>{item.actualDays ?? "--"}</strong><span className="pb-1 text-sm text-gray-600">/ {item.configuredDays} required days</span></div>
        <p className="mt-2 flex items-center gap-1 text-xs"><AlertTriangle size={13}/>{breached ? `${item.shortfallDays ?? "Unknown"} days below policy` : `${item.marginDays ?? 0} days above the minimum`}</p>
        <p className="mt-1 text-xs text-gray-600">Evidence: <strong>{item.dataSource === "recorder_archive" ? "DVR/NVR archive verified" : item.dataSource === "platform_index" ? "platform index fallback" : "unavailable"}</strong>{item.archiveMismatch ? " · archive/index mismatch" : ""}</p>
        <p className="mt-1 text-xs text-gray-600">7-day forecast: <strong>{item.forecastDaysIn7Days ?? "Unknown"} retained days</strong> · trend {item.trend}</p>
        <div className="mt-3 flex h-8 items-end gap-px" aria-label="14-day recording coverage trend">{item.coverageTrend.map((day) => <span key={day.date} title={`${day.date}: ${day.coveragePercent}%`} className={`min-w-1 flex-1 ${day.coveragePercent < 95 ? "bg-red-500" : "bg-emerald-500"}`} style={{ height: `${Math.max(8, day.coveragePercent)}%` }}/>)}</div>
      </article>;
    })}</div>
    {!loading && exceptions.length === 0 ? <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center text-sm text-emerald-800">All cameras with available evidence are above the prescribed retention threshold.</div> : null}
    {!detailed ? <a href="/operations/recording" className="btn-secondary mt-5 inline-flex">View retention details</a> : null}
  </section>;
}
