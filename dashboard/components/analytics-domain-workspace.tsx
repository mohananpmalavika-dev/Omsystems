"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  Camera,
  CheckCircle2,
  Factory,
  RefreshCw,
  ShieldCheck,
  Truck,
  UserRoundCog,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { analyticsApi, cameraInventoryApi } from "@/lib/api-client";
import type { AnalyticsAlert, AnalyticsRule, Branch, Camera as CameraType } from "@/lib/types";

type DomainId = "human" | "vehicle" | "industrial";
type Capability = {
  id: string;
  name: string;
  stage: "core" | "derived" | "open-model";
  defaultSeverity: "P1" | "P2" | "P3" | "P4" | "P5";
  description: string;
};
type CapabilityDomain = {
  id: string;
  name: string;
  description: string;
  capabilities: Capability[];
};

const presets = {
  human: {
    eyebrow: "PEOPLE INTELLIGENCE",
    title: "People analytics",
    description: "Occupancy, behaviour, PPE, dwell time and consent-aware identity workflows.",
    icon: UserRoundCog,
    accent: "text-violet-300",
    panel: "border-violet-500/25 bg-violet-500/10",
    examples: ["Occupancy & crowd", "Behaviour & safety", "Identity continuity"],
  },
  vehicle: {
    eyebrow: "VEHICLE INTELLIGENCE",
    title: "Vehicle & ANPR",
    description: "Vehicle classification, plate recognition, journey reconstruction and parking events.",
    icon: Truck,
    accent: "text-sky-300",
    panel: "border-sky-500/25 bg-sky-500/10",
    examples: ["ANPR & watchlists", "Traffic movement", "Parking compliance"],
  },
  industrial: {
    eyebrow: "INDUSTRIAL SAFETY",
    title: "Industrial analytics",
    description: "Equipment tracking, worker proximity, restricted zones and machine-state monitoring.",
    icon: Factory,
    accent: "text-amber-300",
    panel: "border-amber-500/25 bg-amber-500/10",
    examples: ["Equipment tracking", "Worker proximity", "Zone violations"],
  },
} as const;

export function AnalyticsDomainWorkspace({ domainId }: { domainId: DomainId }) {
  const preset = presets[domainId];
  const Icon = preset.icon;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [branchId, setBranchId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [domain, setDomain] = useState<CapabilityDomain>();
  const [rules, setRules] = useState<AnalyticsRule[]>([]);
  const [alerts, setAlerts] = useState<AnalyticsAlert[]>([]);
  const [engineState, setEngineState] = useState<"checking" | "online" | "offline" | "unconfigured">("checking");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string>();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string }>();

  const loadRules = useCallback(async (nextCameraId: string) => {
    if (!nextCameraId) {
      setRules([]);
      return;
    }
    const response = await analyticsApi.listRules(nextCameraId);
    setRules(response.data as AnalyticsRule[]);
  }, []);

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      cameraInventoryApi.listBranches("analytics:view"),
      analyticsApi.capabilities(),
      analyticsApi.engineHealth().catch(() => ({ status: "offline" })),
    ]).then(([branchResponse, catalog, health]) => {
      const nextBranches = branchResponse.data as Branch[];
      setBranches(nextBranches);
      setBranchId(nextBranches[0]?.id ?? "");
      setDomain((catalog.domains as CapabilityDomain[] | undefined)?.find((item) => item.id === domainId));
      setEngineState(health.status === "ok" || health.status === "degraded" || health.status === "online" ? "online" : health.status === "unconfigured" ? "unconfigured" : "offline");
    }).catch((error) => setMessage({ kind: "error", text: readable(error) }))
      .finally(() => setLoading(false));
  }, [domainId]);

  useEffect(() => {
    if (!branchId) {
      setCameras([]);
      setCameraId("");
      setAlerts([]);
      return;
    }
    setLoading(true);
    void Promise.all([
      cameraInventoryApi.listByBranch(branchId, "analytics:view"),
      analyticsApi.listAlerts({ branchId, limit: 100 }),
    ]).then(([cameraResponse, alertResponse]) => {
      const nextCameras = cameraResponse.data as CameraType[];
      setCameras(nextCameras);
      setCameraId((current) => nextCameras.some((camera) => camera.id === current) ? current : nextCameras[0]?.id ?? "");
      setAlerts(alertResponse.data as AnalyticsAlert[]);
    }).catch((error) => setMessage({ kind: "error", text: readable(error) }))
      .finally(() => setLoading(false));
  }, [branchId]);

  useEffect(() => {
    void loadRules(cameraId).catch((error) => setMessage({ kind: "error", text: readable(error) }));
  }, [cameraId, loadRules]);

  const capabilityIds = useMemo(() => new Set(domain?.capabilities.map((item) => item.id) ?? []), [domain]);
  const domainRules = useMemo(() => rules.filter((rule) => capabilityIds.has(rule.detectionType)), [capabilityIds, rules]);
  const ruleIds = useMemo(() => new Set(domainRules.map((rule) => rule.id)), [domainRules]);
  const domainAlerts = useMemo(() => alerts.filter((alert) => alert.cameraId === cameraId && ruleIds.has(alert.ruleId)), [alerts, cameraId, ruleIds]);
  const configuredIds = useMemo(() => new Set(domainRules.map((rule) => rule.detectionType)), [domainRules]);
  const activeCamera = cameras.find((camera) => camera.id === cameraId);

  const addCapability = async (capability: Capability) => {
    if (!cameraId || configuredIds.has(capability.id)) return;
    setSavingId(capability.id);
    setMessage(undefined);
    try {
      await analyticsApi.createRule(cameraId, {
        name: `${capability.name} · ${activeCamera?.name ?? "Camera"}`,
        detectionType: capability.id,
        enabled: true,
        minConfidence: 0.7,
        cooldownSeconds: capability.defaultSeverity === "P1" ? 30 : 60,
        recordingPolicy: ["P1", "P2"].includes(capability.defaultSeverity) ? "protect-window" : "event-recording",
      });
      await loadRules(cameraId);
      setMessage({ kind: "success", text: `${capability.name} is now enabled for ${activeCamera?.name ?? "the selected camera"}.` });
    } catch (error) {
      setMessage({ kind: "error", text: readable(error) });
    } finally {
      setSavingId(undefined);
    }
  };

  const toggleRule = async (rule: AnalyticsRule) => {
    setSavingId(rule.id);
    setMessage(undefined);
    try {
      await analyticsApi.updateRule(rule.cameraId, rule.id, { enabled: !rule.enabled });
      await loadRules(rule.cameraId);
      setMessage({ kind: "success", text: `${rule.name} ${rule.enabled ? "paused" : "enabled"}.` });
    } catch (error) {
      setMessage({ kind: "error", text: readable(error) });
    } finally {
      setSavingId(undefined);
    }
  };

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-slate-950 p-4 text-slate-100 xl:p-6">
      <header className="relative mb-5 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-slate-950/30">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex max-w-3xl items-start gap-4">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${preset.panel} ${preset.accent}`}><Icon size={24} /></span>
            <div>
              <p className={`text-[11px] font-bold tracking-[.22em] ${preset.accent}`}>{preset.eyebrow}</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">{preset.title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{preset.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {preset.examples.map((item) => <span key={item} className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs text-slate-300">{item}</span>)}
              </div>
            </div>
          </div>
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${engineState === "online" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : engineState === "checking" ? "border-slate-700 bg-slate-800 text-slate-300" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
            <i className={`h-2 w-2 rounded-full ${engineState === "online" ? "bg-emerald-400" : engineState === "checking" ? "bg-slate-400" : "bg-amber-400"}`} />
            AI engine {engineState}
          </div>
        </div>
      </header>

      {message && <div className={`mb-4 flex items-center gap-2 rounded-xl border p-3 text-sm ${message.kind === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>
        {message.kind === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}{message.text}
      </div>}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Capabilities" value={domain?.capabilities.length ?? 0} detail="available in this domain" icon={<BrainCircuit />} />
        <Metric label="Configured rules" value={domainRules.length} detail={activeCamera?.name ?? "select a camera"} icon={<ShieldCheck />} />
        <Metric label="Active rules" value={domainRules.filter((rule) => rule.enabled).length} detail="processing enabled" icon={<Activity />} />
        <Metric label="Open signals" value={domainAlerts.filter((alert) => !["resolved", "false_alarm", "suppressed"].includes(alert.status)).length} detail="on selected camera" icon={<AlertTriangle />} />
      </section>

      <section className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-400">Branch scope
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-500">
            {branches.length === 0 && <option value="">No accessible branches</option>}
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-400">Camera
          <select value={cameraId} onChange={(event) => setCameraId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-500">
            {cameras.length === 0 && <option value="">No accessible cameras</option>}
            {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void loadRules(cameraId)} disabled={!cameraId || loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-semibold text-slate-200 hover:border-cyan-500 disabled:opacity-40"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh</button>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[1.08fr_.92fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
          <header className="flex items-center justify-between gap-3 border-b border-slate-800 p-5">
            <div><p className="text-[10px] font-bold tracking-[.18em] text-cyan-400">CAPABILITY CATALOG</p><h2 className="mt-1 text-lg font-semibold">Enable camera intelligence</h2></div>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">{configuredIds.size} configured</span>
          </header>
          {!domain ? <EmptyState text={loading ? "Loading capability catalog…" : "This capability domain is not available from the control plane."} /> : (
            <div className="grid gap-2 p-3 sm:grid-cols-2">
              {domain.capabilities.map((capability) => {
                const configured = configuredIds.has(capability.id);
                return <article key={capability.id} className="flex min-h-24 flex-col rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                  <div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-100">{capability.name}</strong><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{capability.description}</p></div><span className={`rounded-md px-2 py-1 text-[9px] font-bold ${capability.defaultSeverity === "P1" ? "bg-red-500/15 text-red-300" : capability.defaultSeverity === "P2" ? "bg-amber-500/15 text-amber-300" : "bg-slate-800 text-slate-400"}`}>{capability.defaultSeverity}</span></div>
                  <div className="mt-auto flex items-center justify-between pt-3"><span className="text-[10px] uppercase tracking-wider text-slate-600">{capability.stage.replace("-", " ")}</span><button disabled={!cameraId || configured || Boolean(savingId)} onClick={() => void addCapability(capability)} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold ${configured ? "bg-emerald-500/10 text-emerald-300" : "bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40"}`}>{savingId === capability.id ? "Enabling…" : configured ? "Configured" : "Enable"}</button></div>
                </article>;
              })}
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
            <header className="flex items-center justify-between border-b border-slate-800 p-5"><div><p className="text-[10px] font-bold tracking-[.18em] text-cyan-400">CAMERA POLICY</p><h2 className="mt-1 text-lg font-semibold">Configured rules</h2></div><Camera size={20} className="text-slate-600" /></header>
            {domainRules.length === 0 ? <EmptyState text={cameraId ? "No rules from this domain are configured for the selected camera." : "Select a camera to review its rules."} /> : <div className="divide-y divide-slate-800">{domainRules.map((rule) => <div key={rule.id} className="flex items-center gap-3 p-4"><span className={`h-2.5 w-2.5 rounded-full ${rule.enabled ? "bg-emerald-400" : "bg-slate-600"}`} /><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{rule.name}</strong><span className="text-xs text-slate-500">{Math.round(rule.minConfidence * 100)}% confidence · {rule.severity} · {rule.recordingPolicy.replace("-", " ")}</span></div><button disabled={Boolean(savingId)} onClick={() => void toggleRule(rule)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-bold text-slate-300 hover:border-cyan-500 disabled:opacity-40">{savingId === rule.id ? "Saving…" : rule.enabled ? "Pause" : "Enable"}</button></div>)}</div>}
            <footer className="border-t border-slate-800 p-3"><Link href="/analytics" className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700">Open advanced rule configuration <ArrowUpRight size={13} /></Link></footer>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
            <header className="flex items-center justify-between border-b border-slate-800 p-5"><div><p className="text-[10px] font-bold tracking-[.18em] text-cyan-400">RECENT SIGNALS</p><h2 className="mt-1 text-lg font-semibold">Selected camera</h2></div><Link href="/operations/alerts" className="text-xs font-semibold text-cyan-400">All alerts →</Link></header>
            {domainAlerts.length === 0 ? <EmptyState text="No matching signals have been raised by these camera rules." /> : <div className="divide-y divide-slate-800">{domainAlerts.slice(0, 6).map((alert) => <article key={alert.id} className="p-4"><div className="flex items-center gap-2"><span className={`rounded px-2 py-0.5 text-[9px] font-bold ${alert.severity === "P1" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>{alert.severity}</span><strong className="truncate text-sm">{alert.title}</strong><span className="ml-auto text-[10px] text-slate-600">{new Date(alert.lastDetectedAt).toLocaleTimeString()}</span></div><p className="mt-2 text-xs text-slate-500">{alert.status.replace("_", " ")} · {Math.round(alert.confidence * 100)}% confidence</p></article>)}</div>}
          </section>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: React.ReactNode }) {
  return <article className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-800 text-cyan-300">{icon}</span><div><p className="text-2xl font-bold">{value}</p><strong className="block text-xs text-slate-300">{label}</strong><span className="text-[10px] text-slate-600">{detail}</span></div></article>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid min-h-36 place-items-center p-6 text-center text-sm text-slate-500"><div><Activity className="mx-auto mb-3 text-slate-700" /><p>{text}</p></div></div>;
}

function readable(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load analytics data";
}
