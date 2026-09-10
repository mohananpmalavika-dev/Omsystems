"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Network, Radio, RefreshCw, Server, ShieldCheck } from "lucide-react";

type TelemetryRecord = Record<string, unknown>;

interface HAStatus {
  metrics: TelemetryRecord;
  nodes: TelemetryRecord[];
  activeLeasesCount: number;
  recentEvents: TelemetryRecord[];
}

interface PlacementPlan {
  cameraId: string;
  branchId: string;
  primaryNodeId: string;
  secondaryNodeId: string;
  tertiaryNodeId: string;
  updatedAt: string;
}

function textValue(value: unknown, fallback = "Not reported"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== "string") return "Time not reported";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "Time not reported";
}

export function HAClusterView() {
  const [status, setStatus] = useState<HAStatus | null>(null);
  const [placements, setPlacements] = useState<PlacementPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/control/api/ha/status", {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || body?.error || `HA telemetry request failed (${response.status})`);
      }

      const data = body?.data;
      if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.recentEvents)) {
        throw new Error("HA telemetry response is incomplete.");
      }

      setStatus({
        metrics: data.metrics && typeof data.metrics === "object" ? data.metrics : {},
        nodes: data.nodes,
        activeLeasesCount: Number.isFinite(data.activeLeasesCount) ? data.activeLeasesCount : 0,
        recentEvents: data.recentEvents,
      });
      // Placement plans are supplemental topology information.  Do not hide
      // the authoritative cluster status when this optional read is delayed.
      const placementResponse = await fetch("/api/control/api/ha/placements", {
        credentials: "include",
        cache: "no-store",
      });
      const placementBody = await placementResponse.json().catch(() => null);
      setPlacements(
        placementResponse.ok && Array.isArray(placementBody?.data)
          ? placementBody.data.filter(isPlacementPlan)
          : [],
      );
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "HA telemetry is unavailable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const timer = window.setInterval(() => void fetchStatus(), 10_000);
    return () => window.clearInterval(timer);
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 p-8 text-slate-400">
        <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
        <span>Loading HA telemetry…</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-2xl border border-amber-800/70 bg-amber-950/30 p-6 text-amber-100">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-5 w-5" />
          HA telemetry unavailable
        </div>
        <p className="mt-2 text-sm text-amber-200/80">{error || "No cluster status was reported."}</p>
        <button
          type="button"
          onClick={() => void fetchStatus(true)}
          disabled={refreshing}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-700 px-3 py-2 text-sm hover:bg-amber-900/40 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Retry
        </button>
      </div>
    );
  }

  const metrics = Object.entries(status.metrics).filter(([, value]) =>
    ["string", "number", "boolean"].includes(typeof value),
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-400">
              <Network className="h-4 w-4" />
              Media high availability
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white">Cluster status</h1>
            <p className="mt-1 text-xs text-slate-400">
              Registered media nodes, authoritative camera leases, and observed failover events.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchStatus(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-600 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-amber-300">Latest refresh failed: {error}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
            <Server className="h-4 w-4" /> Registered nodes
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{status.nodes.length}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
            <Radio className="h-4 w-4" /> Active camera leases
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{status.activeLeasesCount}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
            <Activity className="h-4 w-4" /> Reported events
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{status.recentEvents.length}</div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Media nodes</h2>
        {status.nodes.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No media nodes are currently registered.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {status.nodes.map((node, index) => {
              const nodeId = textValue(node.nodeId ?? node.id, `node-${index + 1}`);
              const nodeStatus = textValue(node.status, "UNKNOWN");
              const nodeAddress = textValue(node.host ?? node.ipAddress, "");
              return (
                <div key={nodeId} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-100">{textValue(node.name ?? node.nodeName, nodeId)}</span>
                    <span className="rounded border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                      {nodeStatus}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-slate-400">
                    <div>Node ID: {nodeId}</div>
                    {nodeAddress && <div>Address: {nodeAddress}</div>}
                    {node.activeStreams !== undefined && <div>Active streams: {textValue(node.activeStreams)}</div>}
                    {node.capacityStreams !== undefined && <div>Capacity: {textValue(node.capacityStreams)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Failure-domain placement</h2>
            <p className="mt-1 text-xs text-slate-400">Preferred handoff order for cameras with an HA placement plan.</p>
          </div>
          <span className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">{placements.length} plans</span>
        </div>
        {placements.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No camera placement plans have been recorded for this tenant.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-500"><tr><th className="p-2">Camera</th><th className="p-2">Branch</th><th className="p-2">Primary</th><th className="p-2">Standby</th><th className="p-2">DR</th></tr></thead>
              <tbody>{placements.slice(0, 50).map((plan) => <tr key={plan.cameraId} className="border-b border-slate-800/70 text-slate-300"><td className="p-2 font-medium text-slate-100">{plan.cameraId}</td><td className="p-2">{plan.branchId}</td><td className="p-2">{plan.primaryNodeId}</td><td className="p-2">{plan.secondaryNodeId}</td><td className="p-2">{plan.tertiaryNodeId}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-indigo-900/80 bg-indigo-950/20 p-6">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" />
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-100">Chaos lab safety gate</h2>
            <p className="mt-1 text-sm text-indigo-100/80">This production console is observability-only. Fault injection requires an isolated environment, a recorded approval, passing capacity checks, and an auditable runbook.</p>
            <p className="mt-2 text-xs text-indigo-200/60">No simulated success results or in-browser destructive controls are exposed here.</p>
          </div>
        </div>
      </section>

      {metrics.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Coordinator metrics</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(([key, value]) => (
              <div key={key} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                <dt className="text-[11px] text-slate-500">{key}</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-200">{textValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Observed failover events</h2>
        {status.recentEvents.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No failover events have been reported.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {status.recentEvents.map((event, index) => (
              <ClusterEventCard key={textValue(event.id ?? event.eventId, `event-${index + 1}`)} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ClusterEventCard({ event }: { event: TelemetryRecord }) {
  const message = textValue(event.message ?? event.reason, "");
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <div className="text-sm font-semibold text-slate-200">
        {textValue(event.type ?? event.eventType, "Cluster event")}
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {formatTimestamp(event.timestamp ?? event.createdAt)}
      </div>
      {message && <p className="mt-2 text-xs text-slate-400">{message}</p>}
    </div>
  );
}

function isPlacementPlan(value: unknown): value is PlacementPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  return ["cameraId", "branchId", "primaryNodeId", "secondaryNodeId", "tertiaryNodeId", "updatedAt"].every(
    (key) => typeof plan[key] === "string",
  );
}
