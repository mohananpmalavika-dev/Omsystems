"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Server } from "lucide-react";

type ApiState = {
  summary: { total: number; online: number; offline: number; pending: number } | null;
  agents: EdgeAgent[];
};

type EdgeAgent = {
  id: string;
  name: string;
  branchId: string;
  branchName?: string;
  version: string;
  status: "online" | "offline" | "pending" | string;
  lastSeenAt?: string | null;
};

export function BranchEdgeProductView() {
  const [state, setState] = useState<ApiState>({ summary: null, agents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // This is the authoritative, access-scoped gateway inventory.  The old
      // edge-product endpoint has an isolated in-memory service and therefore
      // could show an empty fleet even after a gateway enrolled successfully.
      const response = await fetch("/api/control/v1/edge-agents", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Edge-agent inventory unavailable");
      const agents = Array.isArray(body.data) ? body.data as EdgeAgent[] : [];
      setState({
        agents,
        summary: {
          total: agents.length,
          online: agents.filter((agent) => agent.status === "online").length,
          offline: agents.filter((agent) => agent.status === "offline").length,
          pending: agents.filter((agent) => agent.status === "pending").length,
        },
      });
    } catch (reason) {
      setState({ summary: null, agents: [] });
      setError(reason instanceof Error ? reason.message : "Edge fleet unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (loading && !state.summary) {
    return <div className="flex items-center justify-center p-12 text-slate-400"><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Loading live edge telemetry…</div>;
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Branch edge fleet</h2>
          <p className="text-sm text-slate-400">Only registered agents and reported telemetry are shown.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"><RefreshCw className={`mr-2 inline h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
      </div>

      {error && <div className="rounded-lg border border-rose-800/60 bg-rose-950/30 p-4 text-sm text-rose-200"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
      {!error && !loading && state.agents.length === 0 && <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-10 text-center text-slate-400">No edge gateways are enrolled for the branches you can manage.</div>}

      {state.summary && <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(state.summary).map(([key, value]) => <div key={key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><dt className="text-xs uppercase tracking-wide text-slate-500">{key}</dt><dd className="mt-2 text-2xl font-semibold text-slate-100">{value}</dd></div>)}</dl>}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-200"><Server className="mr-2 inline h-4 w-4" />Registered edge agents</div>
        {state.agents.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No registered edge gateways.</div> : <div className="divide-y divide-slate-800">{state.agents.map((agent) => <div key={agent.id} className="grid gap-2 px-4 py-4 sm:grid-cols-4"><span className="font-medium text-slate-200">{agent.name}</span><span className="text-slate-400">{agent.branchName ?? agent.branchId}</span><span className="text-slate-400">{agent.status}</span><span className="text-right text-slate-500">{agent.version}</span></div>)}</div>}
      </div>
    </section>
  );
}
