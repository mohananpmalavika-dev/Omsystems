"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Server } from "lucide-react";

type HaState = {
  metrics?: Record<string, unknown>;
  nodes?: Array<Record<string, any>>;
};

/** Read-only HA view. Fault injection belongs in the separately protected test tooling. */
export function HaFailoverView() {
  const [cluster, setCluster] = useState<HaState | null>(null);
  const [leases, setLeases] = useState<Array<Record<string, any>>>([]);
  const [events, setEvents] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setError(null);
    try {
      const responses = await Promise.all([
        fetch("/api/ha/status", { credentials: "include", cache: "no-store" }),
        fetch("/api/ha/leases", { credentials: "include", cache: "no-store" }),
        fetch("/api/ha/events", { credentials: "include", cache: "no-store" }),
      ]);
      const payloads = await Promise.all(responses.map(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.success === false) throw new Error(body.error || `HA request failed (${response.status})`);
        return body;
      }));
      setCluster(payloads[0]?.data ?? null);
      setLeases(Array.isArray(payloads[1]?.data) ? payloads[1].data : []);
      setEvents(Array.isArray(payloads[2]?.data) ? payloads[2].data : []);
    } catch (reason) {
      setCluster(null);
      setLeases([]);
      setEvents([]);
      setError(reason instanceof Error ? reason.message : "HA telemetry is unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(), 5_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (loading && !cluster) {
    return <div className="flex items-center justify-center p-12 text-slate-400"><RefreshCw className="mr-2 animate-spin" size={22} /> Loading HA telemetry…</div>;
  }

  const metrics = cluster?.metrics ?? {};
  const nodes = cluster?.nodes ?? [];

  return (
    <div className="space-y-6">
      {error && <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200"><AlertTriangle size={18} /> {error}</div>}
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">High-availability cluster telemetry</h2>
          <p className="mt-1 text-xs text-slate-400">Live node, lease, and failover data from the HA service.</p>
        </div>
        <button type="button" onClick={() => void fetchStatus()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"><RefreshCw size={14} /> Refresh</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["Protected cameras", metrics.protectedCameras],
          ["Active nodes", metrics.activeNodes],
          ["Healthy nodes", metrics.healthyNodes],
          ["Failovers today", metrics.failoversToday],
        ] as [string, unknown][]).map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-slate-100">{value == null ? "—" : String(value)}</p></div>)}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {nodes.length === 0 ? <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-6 text-sm text-slate-400">No HA nodes were returned.</div> : nodes.map((node) => (
          <div key={String(node.nodeId)} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
            <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Server size={16} /> {node.nodeName || node.nodeId}</h3><span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 size={14} /> {node.status || "UNKNOWN"}</span></div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">Host</dt><dd className="mt-1 text-slate-200">{node.host || "—"}</dd></div><div><dt className="text-slate-500">Role</dt><dd className="mt-1 text-slate-200">{node.role || "—"}</dd></div><div><dt className="text-slate-500">Cameras</dt><dd className="mt-1 text-slate-200">{node.capacity?.currentCameras ?? "—"} / {node.capacity?.maxCameras ?? "—"}</dd></div><div><dt className="text-slate-500">Ingress</dt><dd className="mt-1 text-slate-200">{node.capacity?.ingressMbps ?? "—"} / {node.capacity?.maxIngressMbps ?? "—"} Mbps</dd></div></dl>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4"><h3 className="text-sm font-semibold text-slate-100">Active camera leases ({leases.length})</h3><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="p-2">Camera</th><th className="p-2">Owner</th><th className="p-2">Fencing token</th><th className="p-2">Expires</th></tr></thead><tbody>{leases.map((lease, index) => <tr key={String(lease.cameraId || index)} className="border-t border-slate-800"><td className="p-2 text-slate-200">{lease.cameraId || "—"}</td><td className="p-2 text-slate-300">{lease.nodeId || "—"}</td><td className="p-2 text-slate-300">{lease.fencingToken ?? "—"}</td><td className="p-2 text-slate-300">{lease.expiresAt ? new Date(lease.expiresAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div></div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4"><h3 className="text-sm font-semibold text-slate-100">Recent failover events ({events.length})</h3><div className="mt-3 space-y-2">{events.length === 0 ? <p className="text-xs text-slate-400">No events were returned.</p> : events.slice(0, 20).map((event, index) => <div key={String(event.id || index)} className="rounded-lg border border-slate-800 p-3 text-xs"><div className="flex justify-between gap-3"><span className="font-semibold text-slate-200">{event.type || "EVENT"}</span><span className="text-slate-500">{event.timestamp ? new Date(event.timestamp).toLocaleString() : "—"}</span></div><p className="mt-1 text-slate-400">Camera {event.cameraId || "—"}: {event.reason || `${event.previousNode || "—"} → ${event.newNode || "—"}`}</p></div>)}</div></div>
    </div>
  );
}
