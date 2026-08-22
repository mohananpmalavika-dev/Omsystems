"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Server } from "lucide-react";

type ApiState = {
  summary: Record<string, unknown> | null;
  agents: Array<Record<string, unknown>>;
};

export function BranchEdgeProductView() {
  const [state, setState] = useState<ApiState>({ summary: null, agents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, agentsResponse] = await Promise.all([
        fetch("/api/edge-product/fleet/summary", { cache: "no-store" }),
        fetch("/api/edge-product/agents", { cache: "no-store" }),
      ]);
      const summaryBody = await summaryResponse.json().catch(() => ({}));
      const agentsBody = await agentsResponse.json().catch(() => ({}));
      if (!summaryResponse.ok) throw new Error(summaryBody.error ?? "Fleet summary unavailable");
      if (!agentsResponse.ok) throw new Error(agentsBody.error ?? "Edge-agent inventory unavailable");
      setState({ summary: summaryBody.data ?? null, agents: Array.isArray(agentsBody.data) ? agentsBody.data : [] });
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
      {!error && !state.summary && state.agents.length === 0 && <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-10 text-center text-slate-400">No edge-agent telemetry has been reported.</div>}

      {state.summary && <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(state.summary).map(([key, value]) => <div key={key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><dt className="text-xs uppercase tracking-wide text-slate-500">{key.replaceAll(/([A-Z])/g, " $1")}</dt><dd className="mt-2 text-2xl font-semibold text-slate-100">{typeof value === "object" ? "—" : String(value ?? "—")}</dd></div>)}</dl>}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-200"><Server className="mr-2 inline h-4 w-4" />Registered edge agents</div>
        {state.agents.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No registered edge agents.</div> : <div className="divide-y divide-slate-800">{state.agents.map((agent, index) => <div key={String(agent.id ?? agent.agentId ?? index)} className="grid gap-2 px-4 py-4 sm:grid-cols-4"><span className="font-medium text-slate-200">{String(agent.name ?? agent.agentId ?? "Unnamed agent")}</span><span className="text-slate-400">{String(agent.branchId ?? agent.branchNodeId ?? "—")}</span><span className="text-slate-400">{String(agent.status ?? "unknown")}</span><span className="text-right text-slate-500">{String(agent.version ?? "—")}</span></div>)}</div>}
      </div>
    </section>
  );
}
