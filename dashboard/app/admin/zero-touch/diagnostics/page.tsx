"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowLeft, RefreshCw, Server, ShieldCheck } from "lucide-react";

type FleetBranch = { branchId: string; branchName: string };
type Diagnostics = {
  branchName: string; generatedAt: string;
  agent: { id: string; name: string; status: string; version: string; lastHeartbeat?: string | null } | null;
  scan: { id: string; status: string; requestedAt: string; startedAt?: string | null; completedAt?: string | null; resultCount: number; verifiedCount: number; provisionedCount: number; error?: string } | null;
  discoveries: { total: number; verified: number; credentialsRequired: number; pendingVerification: number; duplicates: number };
  telemetry: Array<{ deviceType: string; deviceId: string; observedAt: string; source: string; reasonCodes: string[] }>;
  issues: Array<{ severity: "warning" | "critical"; code: string; message: string }>;
};
const timestamp = (value?: string | null) => value ? new Date(value).toLocaleString() : "Not reported";

export default function ZeroTouchDiagnosticsPage() {
  const [branches, setBranches] = useState<FleetBranch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadDiagnostics = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/control/v1/zero-touch/diagnostics/${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.message || body.error || `Diagnostics request failed (${response.status})`);
      setDiagnostics(body.data);
    } catch (reason) {
      setDiagnostics(null); setError(reason instanceof Error ? reason.message : "Diagnostics are unavailable.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/control/v1/zero-touch/fleet", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.message || body.error || "Fleet inventory is unavailable.");
      return (Array.isArray(body.data?.branches) ? body.data.branches : []).filter((branch: any) => typeof branch?.branchId === "string").map((branch: any) => ({ branchId: branch.branchId, branchName: branch.branchName || branch.branchId })) as FleetBranch[];
    }).then((items) => { if (active) { setBranches(items); setBranchId((current) => current || items[0]?.branchId || ""); } }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Fleet inventory is unavailable."); });
    return () => { active = false; };
  }, []);
  useEffect(() => { void loadDiagnostics(branchId); }, [branchId, loadDiagnostics]);

  return <main className="min-h-screen bg-slate-950 p-6 text-slate-100"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div className="flex items-start gap-3"><Link href="/admin/zero-touch" className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:text-white" aria-label="Back to zero-touch provisioning"><ArrowLeft size={16} /></Link><div><h1 className="flex items-center gap-2 text-xl font-bold"><Activity className="text-indigo-400" size={20} />ZTP fleet diagnostics</h1><p className="mt-1 text-sm text-slate-400">Authenticated agent, scan, discovery, and telemetry state. Sensitive probe payloads are never displayed.</p></div></div><div className="flex gap-2"><select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" aria-label="Select branch"><option value="">Select branch</option>{branches.map((branch) => <option key={branch.branchId} value={branch.branchId}>{branch.branchName}</option>)}</select><button type="button" disabled={!branchId || loading} onClick={() => void loadDiagnostics(branchId)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={loading ? "animate-spin" : ""} size={15} />Refresh</button></div></header>
    {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-rose-100">{error}</div>}
    {!error && !diagnostics && <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">{loading ? "Loading diagnostics…" : "Select a branch to inspect its fleet state."}</div>}
    {diagnostics && <section className="space-y-5"><p className="text-xs text-slate-500">Snapshot generated {timestamp(diagnostics.generatedAt)} for {diagnostics.branchName}</p><div className="grid gap-4 md:grid-cols-3"><Card icon={<Server size={16} />} title="Edge agent" state={diagnostics.agent?.status || "NOT ENROLLED"} tone={diagnostics.agent?.status === "online" ? "good" : "bad"}><p>{diagnostics.agent ? `${diagnostics.agent.name} · v${diagnostics.agent.version}` : "Enroll an Edge Gateway before starting a scan."}</p><p>Heartbeat: {timestamp(diagnostics.agent?.lastHeartbeat)}</p></Card><Card icon={<ShieldCheck size={16} />} title="Latest scan" state={diagnostics.scan?.status || "NOT STARTED"} tone={diagnostics.scan?.status === "completed" ? "good" : "warn"}><p>{diagnostics.scan ? `${diagnostics.scan.verifiedCount}/${diagnostics.scan.resultCount} streams verified` : "No persisted scan job."}</p><p>{diagnostics.scan?.error || `Completed: ${timestamp(diagnostics.scan?.completedAt)}`}</p></Card><Card icon={<Activity size={16} />} title="Discovery review" state={`${diagnostics.discoveries.verified}/${diagnostics.discoveries.total} VERIFIED`} tone={diagnostics.discoveries.credentialsRequired ? "warn" : "good"}><p>{diagnostics.discoveries.pendingVerification} awaiting verification · {diagnostics.discoveries.credentialsRequired} need credentials</p><p>{diagnostics.discoveries.duplicates} duplicate candidates excluded</p></Card></div>
      {diagnostics.issues.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4"><h2 className="mb-3 flex items-center gap-2 font-semibold text-amber-100"><AlertTriangle size={17} />Action required</h2><ul className="space-y-2 text-sm text-amber-50">{diagnostics.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul></div>}
      <section className="rounded-xl border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 px-4 py-3"><h2 className="font-semibold">Recent authenticated telemetry</h2></div>{diagnostics.telemetry.length === 0 ? <p className="p-4 text-sm text-slate-400">No operational telemetry has been received for this branch.</p> : <div className="divide-y divide-slate-800">{diagnostics.telemetry.map((item, index) => <div key={`${item.deviceId}-${index}`} className="flex flex-col gap-1 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between"><span><strong>{item.deviceType}</strong> · {item.deviceId}</span><span className="text-slate-400">{timestamp(item.observedAt)} · {item.source}{item.reasonCodes.length ? ` · ${item.reasonCodes.join(", ")}` : ""}</span></div>)}</div>}</section></section>}
  </div></main>;
}
function Card({ icon, title, state, tone, children }: { icon: ReactNode; title: string; state: string; tone: "good" | "warn" | "bad"; children: ReactNode }) { const color = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-rose-300"; return <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</span><span className={`text-xs font-bold ${color}`}>{state.toUpperCase()}</span></div><div className="space-y-1 text-xs text-slate-400">{children}</div></section>; }
