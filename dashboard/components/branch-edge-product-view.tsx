"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, FileCode, RefreshCw, Server, ShieldCheck, Terminal } from "lucide-react";
import { cameraInventoryApi } from "@/lib/api-client";

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

      {/* Edge Agent Download & Certificate Panel */}
      <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-slate-900/90 via-indigo-950/20 to-slate-900/90 p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <h3 className="text-base font-semibold text-slate-100">
                Official Edge Agent Software & Security Certificate
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                Authenticode Signed
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl">
              Digitally signed by <strong className="text-slate-100">OmSystems Sentinel Edge Agent</strong>. Download the complete signed bundle to run camera discovery and edge stream telemetry on branch PCs without Windows Defender or SmartScreen blocking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => cameraInventoryApi.downloadEdgeAgentSignedPackage()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition active:scale-95"
            >
              <Download size={15} /> Download Signed ZIP Package (132 MB)
            </button>

            <button
              type="button"
              onClick={() => cameraInventoryApi.downloadEdgeAgentCertificate()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-750 text-xs font-medium text-slate-200 hover:text-white transition"
              title="Download public certificate (omsystems-edge-agent.cer)"
            >
              <ShieldCheck size={14} className="text-emerald-400" /> Certificate (.cer)
            </button>

            <button
              type="button"
              onClick={() => cameraInventoryApi.downloadEdgeAgentCertInstaller()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-750 text-xs font-medium text-slate-200 hover:text-white transition"
              title="Download 1-click certificate installer batch script"
            >
              <Terminal size={14} className="text-blue-400" /> Installer Script (.bat)
            </button>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-start gap-2 text-slate-300">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-200">1</span>
            <div><strong className="text-slate-200">Trust Certificate:</strong> Right-click <code>Install-Certificate.bat</code> and run as admin to trust in Windows Root.</div>
          </div>
          <div className="flex items-start gap-2 text-slate-300">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-200">2</span>
            <div><strong className="text-slate-200">Configure:</strong> Get branch activation from Device Manager or configure <code>edge-agent.env</code>.</div>
          </div>
          <div className="flex items-start gap-2 text-slate-300">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-200">3</span>
            <div><strong className="text-slate-200">Run Scanner:</strong> Double-click <code>START_SCANNER.bat</code> to begin live camera discovery.</div>
          </div>
        </div>
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
