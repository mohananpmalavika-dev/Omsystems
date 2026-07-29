"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Camera, Clock, RefreshCw, Server, ServerOff } from "lucide-react";
import { fetchRecordersHealth } from "@/lib/api/operational-health";
import type { RecorderFleetHealth } from "@/lib/types/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";
import { rankRecorders, recorderTone } from "./recorder-fleet-model";

export function RecorderFleetWidget({ detailed = false, autoRefresh = true, refreshToken }: { detailed?: boolean; autoRefresh?: boolean; refreshToken?: number }) {
  const [fleet, setFleet] = useState<RecorderFleetHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setFleet(await fetchRecordersHealth()); setError(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Recorder health unavailable"); } finally { setLoading(false); } }, []);
  useEffect(() => {
    void load();
    if (!autoRefresh) return;
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [autoRefresh, load, refreshToken]);
  useOperationalHealthStream(useCallback(() => { void load(); }, [load]), refreshToken === undefined);
  const summary = fleet?.summary ?? { total: 0, online: 0, offline: 0, degraded: 0, unknown: 0, affectedBranches: 0 };
  const all = rankRecorders(fleet?.recorders ?? []);
  const visible = detailed ? all : all.filter((item) => item.status !== "online").slice(0, 8);
  const stats = [["Total", summary.total, "border-slate-200 bg-slate-50 text-slate-800"], ["Online", summary.online, "border-emerald-200 bg-emerald-50 text-emerald-800"], ["Offline", summary.offline, "border-red-200 bg-red-50 text-red-800"], ["Degraded", summary.degraded, "border-amber-200 bg-amber-50 text-amber-800"], ["Unknown", summary.unknown, "border-gray-200 bg-gray-50 text-gray-800"], ["Affected branches", summary.affectedBranches, "border-orange-200 bg-orange-50 text-orange-800"]] as const;
  return <section className="card" aria-labelledby="recorder-fleet-title">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 id="recorder-fleet-title" className="flex items-center gap-2 text-lg font-semibold"><Server size={20}/> DVR/NVR real-time status</h2><p className="mt-1 text-sm text-gray-600">Vendor API and ONVIF reachability reported by branch edge agents.</p></div><button className="btn-secondary flex items-center gap-2" onClick={() => void load()}><RefreshCw size={15} className={loading ? "animate-spin" : ""}/> Refresh</button></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{stats.map(([label, value, tone]) => <div key={label} className={`rounded-lg border p-3 ${tone}`}><p className="text-xs font-medium uppercase tracking-wide">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</div>
    {error ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{visible.map((recorder) => <article key={recorder.id} className={`rounded-lg border-2 p-4 ${recorderTone(recorder.status)}`}>
      <div className="flex items-start justify-between gap-3"><div className="flex gap-2">{recorder.status === "offline" ? <ServerOff className="text-red-700" size={20}/> : <Server size={20}/>}<div><h3 className="font-semibold">{recorder.name}</h3><p className="text-xs text-gray-600">{recorder.branchName} · {recorder.deviceType.toUpperCase()}</p></div></div><span className={`rounded px-2 py-1 text-xs font-bold uppercase ${recorder.status === "offline" ? "bg-red-600 text-white" : recorder.status === "degraded" ? "bg-amber-500 text-white" : recorder.status === "online" ? "bg-emerald-600 text-white" : "bg-gray-300"}`}>{recorder.status}</span></div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-gray-500">Device</p><strong>{recorder.vendor} {recorder.model}</strong></div><div><p className="text-gray-500">Address</p><strong>{recorder.ipAddress ?? "Hidden"}</strong></div><div className="flex items-center gap-2"><Clock size={13}/><span>{recorder.latencyMs === null ? "--" : `${recorder.latencyMs}ms`}</span></div><div className="flex items-center gap-2"><Camera size={13}/><span>{recorder.connectedCameras ?? "--"}/{recorder.totalCameras ?? "--"} channels</span></div><div className="col-span-2 flex items-center gap-2"><Activity size={13}/><span>Recording: <strong>{recorder.recordingStatus}</strong></span></div></div>
      {recorder.reasonCodes.length ? <p className="mt-3 text-[11px] text-gray-500">{recorder.reasonCodes.join(" · ")}</p> : null}
    </article>)}</div>
    {!loading && all.length === 0 ? <div className="mt-5 rounded-lg border border-dashed p-6 text-center text-sm text-gray-600">No recorder telemetry received. Add DVR/NVR devices to the branch edge-agent configuration.</div> : null}
    {!detailed && all.length > 0 ? <a href="/maintenance/dvr-nvr-monitor" className="btn-secondary mt-5 inline-flex">View all recorders</a> : null}
  </section>;
}
