"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Gauge, RefreshCw, Router, Wifi, WifiOff } from "lucide-react";
import { fetchNetworkHealth } from "@/lib/api/operational-health";
import type { InternetFleetHealth, InternetLinkHealth } from "@/lib/types/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";
import { internetStatusTone, rankInternetBranches } from "./internet-fleet-model";

export function InternetFleetWidget({ detailed = false }: { detailed?: boolean }) {
  const [fleet, setFleet] = useState<InternetFleetHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setFleet(await fetchNetworkHealth()); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Internet health unavailable"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [load]);
  useOperationalHealthStream(useCallback(() => { void load(); }, [load]));
  const summary = fleet?.summary ?? { totalBranches: 0, online: 0, degraded: 0, failover: 0, offline: 0, unknown: 0 };
  const branches = rankInternetBranches(fleet?.branches ?? []);
  const visible = detailed ? branches : branches.filter((branch) => branch.status !== "online").slice(0, 8);
  const stats = [
    ["Branches", summary.totalBranches, "border-slate-200 bg-slate-50 text-slate-800"],
    ["Online", summary.online, "border-emerald-200 bg-emerald-50 text-emerald-800"],
    ["Degraded", summary.degraded, "border-amber-200 bg-amber-50 text-amber-800"],
    ["On backup", summary.failover, "border-orange-200 bg-orange-50 text-orange-800"],
    ["Offline", summary.offline, "border-red-300 bg-red-50 text-red-800"],
    ["No evidence", summary.unknown, "border-gray-200 bg-gray-50 text-gray-700"],
  ] as const;
  return <section className="card" aria-labelledby="internet-fleet-title">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 id="internet-fleet-title" className="flex items-center gap-2 text-lg font-semibold"><Router size={20}/> Branch internet connectivity</h2><p className="mt-1 text-sm text-gray-600">Primary and backup ISP reachability, failover, latency, jitter, packet loss, and bandwidth load.</p></div><button className="btn-secondary flex items-center gap-2" onClick={() => void load()}><RefreshCw size={15} className={loading ? "animate-spin" : ""}/> Refresh</button></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{stats.map(([label, value, tone]) => <div key={label} className={`rounded-lg border p-3 ${tone}`}><p className="text-xs font-medium uppercase tracking-wide">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</div>
    {error ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{visible.map((branch) => <article key={branch.branchId} className={`rounded-lg border-2 p-4 ${internetStatusTone(branch.status)}`}>
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{branch.branchName}</h3><p className="text-xs opacity-75">{branch.branchCode}</p></div><span className="flex items-center gap-1 rounded bg-white/70 px-2 py-1 text-xs font-bold uppercase">{branch.status === "offline" ? <WifiOff size={13}/> : <Wifi size={13}/>} {branch.status}</span></div>
      <div className="mt-4 space-y-3">{branch.links.map((link) => <LinkMetrics key={link.id} link={link}/>)}</div>
      {branch.failoverActive ? <p className="mt-3 rounded bg-orange-100 p-2 text-xs font-semibold text-orange-800">Backup link is carrying surveillance traffic.</p> : null}
    </article>)}</div>
    {!loading && branches.length === 0 ? <div className="mt-5 rounded-lg border border-dashed p-6 text-center text-sm text-gray-600">No internet probe telemetry received from branch edge agents.</div> : null}
    {!detailed && branches.length > 0 ? <a href="/operations/network" className="btn-secondary mt-5 inline-flex">View all branch links</a> : null}
  </section>;
}

function LinkMetrics({ link }: { link: InternetLinkHealth }) {
  const bad = link.status === "offline" || link.status === "degraded";
  return <div className={`rounded border bg-white/80 p-3 ${bad ? "border-red-200" : "border-emerald-200"}`}>
    <div className="flex justify-between gap-2"><div><strong className="text-sm">{link.ispName}</strong><span className="ml-2 text-xs uppercase text-gray-500">{link.role}{link.active ? " · active" : ""}</span></div><span className={`text-xs font-semibold uppercase ${bad ? "text-red-700" : "text-emerald-700"}`}>{link.status}</span></div>
    <div className="mt-2 grid grid-cols-4 gap-2 text-xs"><Metric icon={<Activity size={12}/>} label="Latency" value={format(link.latencyMs, "ms")}/><Metric label="Jitter" value={format(link.jitterMs, "ms")}/><Metric label="Loss" value={format(link.packetLossPercent, "%")}/><Metric icon={<Gauge size={12}/>} label="Load" value={format(link.bandwidthUtilizationPercent, "%")}/></div>
    <p className="mt-2 text-[11px] text-gray-500">Traffic ↓ {format(link.rxMbps, " Mbps")} · ↑ {format(link.txMbps, " Mbps")}{link.interfaceName ? ` · ${link.interfaceName}` : ""}</p>
  </div>;
}
function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) { return <div><p className="flex items-center gap-1 text-gray-500">{icon}{label}</p><strong>{value}</strong></div>; }
function format(value: number | null, suffix: string) { return value === null ? "--" : `${value.toFixed(value < 10 ? 1 : 0)}${suffix}`; }
