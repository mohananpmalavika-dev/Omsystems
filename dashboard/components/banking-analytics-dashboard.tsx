"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Crown,
  FileCheck2,
  Landmark,
  MapPin,
  MessageCircle,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Timer,
  TrendingDown,
  Truck,
  UserCheck,
  UsersRound,
  XCircle,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { bankingAnalyticsApi, cameraInventoryApi, evidenceApi } from "@/lib/api-client";
import type { Branch } from "@/lib/types";

type Assessment = "compliant" | "non_compliant" | "suspicious" | "in_progress" | "insufficient_evidence";
type BankingSession = {
  sessionId: string;
  branchId: string;
  state: string;
  assessment: Assessment;
  confidence: number;
  vehicle?: { plate?: string; authorized: boolean };
  personnel?: { observed: number; identified: number; guards: number };
  violations?: Array<{ code: string; name: string; severity: string; message: string; detectedAt: string }>;
  startedAt: string;
  lastUpdatedAt: string;
  evidenceAvailable?: string[];
};
type BankingSummary = {
  activeSessions: number;
  completedSessions: number;
  compliantSessions: number;
  suspiciousSessions: number;
  nonCompliantSessions: number;
  totalViolations: number;
  criticalViolations: number;
  highViolations: number;
};
type Monitor = { id: string; name: string; description?: string; enabled?: boolean; arrivalZoneId?: string; unloadingZoneId?: string };
type Visit = { id: string; expectedPlate?: string; providerName?: string; expectedArrivalStart: string; expectedArrivalEnd: string; status?: string; notes?: string };
type Tab = "sessions" | "visits" | "monitors" | "vip_intelligence";

const emptySummary: BankingSummary = {
  activeSessions: 0, completedSessions: 0, compliantSessions: 0,
  suspiciousSessions: 0, nonCompliantSessions: 0, totalViolations: 0,
  criticalViolations: 0, highViolations: 0,
};

export function BankingAnalyticsDashboard() {
  const [requestedVehicle, setRequestedVehicle] = useState<string>();
  const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || "default";
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [sessions, setSessions] = useState<BankingSession[]>([]);
  const [summary, setSummary] = useState<BankingSummary>(emptySummary);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selected, setSelected] = useState<BankingSession>();
  const [tab, setTab] = useState<Tab>("sessions");
  const [sessionFilter, setSessionFilter] = useState<"active" | "all" | "violations">("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [evidenceMessage, setEvidenceMessage] = useState<string>();
  const [evidenceHref, setEvidenceHref] = useState<string>();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string }>();
  const [vipList, setVipList] = useState<any[]>([]);
  const [cashCounters, setCashCounters] = useState<any[]>([]);
  const [bankingAnalytics, setBankingAnalytics] = useState<any>(null);

  useEffect(() => {
    setRequestedVehicle(new URLSearchParams(window.location.search).get("vehicle")?.trim().toUpperCase() || undefined);
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!branchId) return;
    if (!quiet) setLoading(true);
    try {
      const now = new Date();
      const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const [sessionResponse, summaryResponse, monitorResponse, visitResponse, vipResponse, counterResponse, analyticsResponse] = await Promise.all([
        bankingAnalyticsApi.listSessions({ tenantId, branchId }).catch(() => ({ success: true, data: [], count: 0 })),
        bankingAnalyticsApi.getSummary(tenantId, branchId).catch(() => ({ success: true, data: emptySummary })),
        bankingAnalyticsApi.listMonitors(tenantId, branchId).catch(() => ({ success: true, data: [], count: 0 })),
        bankingAnalyticsApi.listVisits(branchId, now.toISOString(), end.toISOString()).catch(() => ({ success: true, data: [], count: 0 })),
        bankingAnalyticsApi.listVipWatchlist(branchId).catch(() => ({ success: true, data: [], count: 0, summary: {} })),
        bankingAnalyticsApi.getCashCountersRealtime(branchId).catch(() => ({ counters: [], totalCounters: 0, activeCounters: 0, generatedAt: new Date().toISOString() })),
        bankingAnalyticsApi.getAnalytics({ branchId }).catch(() => null),
      ]);
      setSessions((sessionResponse.data ?? []) as BankingSession[]);
      setSummary({ ...emptySummary, ...(summaryResponse.data ?? {}) });
      setMonitors((monitorResponse.data ?? []) as Monitor[]);
      setVisits((visitResponse.data ?? []) as Visit[]);
      setVipList((vipResponse.data ?? []) as any[]);
      setCashCounters(counterResponse?.counters ?? []);
      setBankingAnalytics(analyticsResponse);
      setSelected((current) => {
        const nextSessions = sessionResponse.data as BankingSession[];
        if (current) return nextSessions.find((item) => item.sessionId === current.sessionId);
        return requestedVehicle
          ? nextSessions.find((item) => item.vehicle?.plate?.trim().toUpperCase() === requestedVehicle)
          : undefined;
      });
      if (requestedVehicle) {
        setTab("sessions");
        setSessionFilter("all");
      }
      setMessage(undefined);
    } catch (error) {
      if (!quiet) setMessage({ kind: "error", text: readable(error) });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [branchId, requestedVehicle, tenantId]);

  useEffect(() => {
    void cameraInventoryApi.listBranches("analytics:view")
      .then(({ data }) => {
        const next = data as Branch[];
        const requestedBranchId = new URLSearchParams(window.location.search).get("branchId");
        setBranches(next);
        setBranchId(requestedBranchId && next.some((branch) => branch.id === requestedBranchId)
          ? requestedBranchId
          : next[0]?.id ?? "");
      })
      .catch((error) => setMessage({ kind: "error", text: readable(error) }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!branchId) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 15_000);
    return () => window.clearInterval(timer);
  }, [branchId, refresh]);

  const visibleSessions = useMemo(() => sessions.filter((session) => {
    if (sessionFilter === "all") return true;
    if (sessionFilter === "violations") return (session.violations?.length ?? 0) > 0;
    return !["transfer_complete", "departed", "expired"].includes(session.state);
  }), [sessionFilter, sessions]);

  const vipActiveDetections = useMemo(() => {
    return vipList.filter((item) => (item.detectionCount24h ?? 0) > 0 || item.lastDetected);
  }, [vipList]);

  const activeVipCount = vipActiveDetections.length + (bankingAnalytics?.queueAnalytics?.activeQueueAlerts ?? 0);

  const generateEvidence = async (session: BankingSession) => {
    setSaving(true);
    setEvidenceMessage(undefined);
    try {
      const caseNumber = `BANK-${Date.now().toString(36).toUpperCase()}`;
      const evidenceCase = await evidenceApi.createCase({
        caseNumber,
        title: `Cash movement session ${session.vehicle?.plate || session.sessionId.slice(0, 10)}`,
        description: `Banking analytics session ${session.sessionId}; branch ${session.branchId}; assessment ${session.assessment}; state ${session.state}.`,
      });
      await evidenceApi.addItem(evidenceCase.id, {
        type: "manifest",
        description: `Session reference ${session.sessionId}. Available source evidence: ${session.evidenceAvailable?.join(", ") || "none reported"}. Created from Banking Analytics for governed review; source media must be verified before export.`,
      });
      setEvidenceHref(`/evidence?caseId=${encodeURIComponent(evidenceCase.id)}&branchId=${encodeURIComponent(session.branchId)}`);
      setEvidenceMessage(`Evidence case ${caseNumber} created. Verify and preserve source media in the Evidence Vault.`);
    } catch (error) {
      setMessage({ kind: "error", text: readable(error) });
    } finally {
      setSaving(false);
    }
  };

  return <main className="min-h-[calc(100vh-5rem)] bg-slate-950 p-4 text-slate-100 xl:p-6">
    <header className="relative mb-5 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
      <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-blue-500/25 bg-blue-500/10 text-blue-300"><Landmark size={24} /></span><div><p className="text-[11px] font-bold tracking-[.22em] text-blue-300">BANKING OPERATIONS</p><h1 className="mt-2 text-3xl font-bold">Banking analytics</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Cash-van arrival, personnel verification, dual control, secure-zone movement and evidence-bound compliance.</p></div></div>
        <div className="flex items-end gap-2"><Link href="/analytics/banking/authorized-persons" className="rounded-xl border border-emerald-500/40 px-3 py-2.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/10">Counter & locker persons</Link><label className="text-xs font-semibold text-slate-400">Branch scope<select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-2 block min-w-56 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100">{branches.length === 0 && <option value="">No accessible branches</option>}{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><button onClick={() => void refresh()} disabled={!branchId || loading} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700 bg-slate-800 hover:border-blue-500 disabled:opacity-40" aria-label="Refresh banking analytics"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button></div>
      </div>
    </header>

    {message && <div className={`mb-4 flex items-center gap-2 rounded-xl border p-3 text-sm ${message.kind === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>{message.kind === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}{message.text}</div>}

    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Active sessions" value={summary.activeSessions} icon={<Activity />} tone="blue" />
      <Metric label="Compliant" value={summary.compliantSessions} icon={<CheckCircle2 />} tone="green" />
      <Metric label="Suspicious" value={summary.suspiciousSessions} icon={<AlertTriangle />} tone="amber" />
      <Metric label="Violations" value={summary.totalViolations} icon={<XCircle />} tone="red" detail={`${summary.criticalViolations} critical`} />
    </section>

    <nav className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-2" aria-label="Banking analytics views">
      <TabButton active={tab === "sessions"} onClick={() => setTab("sessions")} icon={<Activity size={15} />} label="Cash-van sessions" count={sessions.length} />
      <TabButton active={tab === "visits"} onClick={() => setTab("visits")} icon={<CalendarClock size={15} />} label="Expected visits" count={visits.length} />
      <TabButton active={tab === "monitors"} onClick={() => setTab("monitors")} icon={<Settings2 size={15} />} label="Monitor policy" count={monitors.length} />
      <TabButton active={tab === "vip_intelligence"} onClick={() => setTab("vip_intelligence")} icon={<Crown size={15} />} label="HNI VIP & Queue Intelligence" count={activeVipCount} />
    </nav>

    {tab === "sessions" && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4"><div><p className="text-[10px] font-bold tracking-[.18em] text-blue-300">WORKFLOW QUEUE</p><h2 className="mt-1 font-semibold">Cash-van sessions</h2></div><div className="flex gap-1 rounded-lg bg-slate-950 p-1">{(["active", "all", "violations"] as const).map((filter) => <button key={filter} onClick={() => setSessionFilter(filter)} className={`rounded-md px-3 py-1.5 text-[10px] font-bold capitalize ${sessionFilter === filter ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-200"}`}>{filter}</button>)}</div></header>
        {loading && sessions.length === 0 ? <Empty icon={<RefreshCw className="animate-spin" />} text="Loading banking workflows…" /> : visibleSessions.length === 0 ? <Empty icon={<Truck />} text="No sessions match this view." /> : <div className="divide-y divide-slate-800">{visibleSessions.map((session) => <button key={session.sessionId} onClick={() => { setSelected(session); setEvidenceMessage(undefined); setEvidenceHref(undefined); }} className={`grid w-full gap-3 p-4 text-left transition hover:bg-slate-800/60 sm:grid-cols-[minmax(150px,.8fr)_minmax(140px,.65fr)_minmax(150px,.75fr)_auto] ${selected?.sessionId === session.sessionId ? "bg-blue-500/10" : ""}`}><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-800 text-blue-300"><Truck size={17} /></span><div><strong className="block text-sm">{session.vehicle?.plate || "Vehicle pending"}</strong><span className="text-[10px] text-slate-600">{session.sessionId.slice(0, 10)}</span></div></div><div><span className="block text-[10px] uppercase tracking-wider text-slate-600">Workflow state</span><strong className="mt-1 block text-xs capitalize text-slate-300">{session.state.replaceAll("_", " ")}</strong></div><div><span className="block text-[10px] uppercase tracking-wider text-slate-600">Personnel</span><strong className="mt-1 flex items-center gap-1 text-xs text-slate-300"><UsersRound size={12} /> {session.personnel?.observed ?? 0} observed · {session.personnel?.guards ?? 0} guards</strong></div><AssessmentBadge value={session.assessment} /></button>)}</div>}
      </section>
      <SessionDetails session={selected} saving={saving} evidenceMessage={evidenceMessage} evidenceHref={evidenceHref} onEvidence={generateEvidence} />
    </div>}

    {tab === "visits" && <VisitsPanel visits={visits} tenantId={tenantId} branchId={branchId} saving={saving} setSaving={setSaving} onChanged={() => refresh()} setMessage={setMessage} />}
    {tab === "monitors" && <MonitorsPanel monitors={monitors} tenantId={tenantId} branchId={branchId} saving={saving} setSaving={setSaving} onChanged={() => refresh()} setMessage={setMessage} />}
    {tab === "vip_intelligence" && (
      <VipIntelligencePanel
        branchId={branchId}
        vipDetections={vipActiveDetections}
        allVipProfiles={vipList}
        cashCounters={cashCounters}
        queueAnalytics={bankingAnalytics?.queueAnalytics}
      />
    )}

  </main>;
}

function SessionDetails({ session, saving, evidenceMessage, evidenceHref, onEvidence }: { session?: BankingSession; saving: boolean; evidenceMessage?: string; evidenceHref?: string; onEvidence: (session: BankingSession) => Promise<void> }) {
  if (!session) return <aside className="rounded-2xl border border-slate-800 bg-slate-900/80"><Empty icon={<ShieldCheck />} text="Select a session to inspect verification and evidence." /></aside>;
  return <aside className="self-start overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 xl:sticky xl:top-24"><header className="border-b border-slate-800 p-5"><p className="text-[10px] font-bold tracking-[.18em] text-blue-300">SESSION DETAIL</p><div className="mt-2 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{session.vehicle?.plate || "Unknown vehicle"}</h2><AssessmentBadge value={session.assessment} /></div></header><div className="space-y-5 p-5"><dl className="grid grid-cols-2 gap-3 text-xs"><Detail label="Authorized vehicle" value={session.vehicle ? session.vehicle.authorized ? "Yes" : "No" : "Pending"} /><Detail label="Confidence" value={`${Math.round((session.confidence ?? 0) * 100)}%`} /><Detail label="Identified staff" value={String(session.personnel?.identified ?? 0)} /><Detail label="Guards" value={String(session.personnel?.guards ?? 0)} /></dl><div><h3 className="text-xs font-semibold text-slate-300">Violations</h3>{(session.violations?.length ?? 0) === 0 ? <p className="mt-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-300">No violations recorded.</p> : <ul className="mt-2 space-y-2">{session.violations?.map((item) => <li key={`${item.code}-${item.detectedAt}`} className="rounded-xl border border-red-500/20 bg-red-500/10 p-3"><strong className="text-xs text-red-200">{item.name}</strong><p className="mt-1 text-[11px] leading-5 text-slate-400">{item.message}</p></li>)}</ul>}</div><div><h3 className="text-xs font-semibold text-slate-300">Evidence available</h3><div className="mt-2 flex flex-wrap gap-2">{session.evidenceAvailable?.length ? session.evidenceAvailable.map((item) => <span key={item} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400">{item.replaceAll("_", " ")}</span>) : <span className="text-xs text-slate-600">No captured evidence yet.</span>}</div></div><button disabled={saving || Boolean(evidenceHref)} onClick={() => void onEvidence(session)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold hover:bg-blue-500 disabled:opacity-40"><FileCheck2 size={15} />{saving ? "Creating…" : evidenceHref ? "Evidence case created" : "Create evidence case"}</button>{evidenceMessage && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-200"><p>{evidenceMessage}</p>{evidenceHref && <Link href={evidenceHref} className="mt-2 inline-flex items-center gap-1 font-bold underline underline-offset-2">Open Evidence Vault <ArrowUpRight size={12} /></Link>}</div>}</div></aside>;
}

function VisitsPanel({ visits, tenantId, branchId, saving, setSaving, onChanged, setMessage }: { visits: Visit[]; tenantId: string; branchId: string; saving: boolean; setSaving: (value: boolean) => void; onChanged: () => Promise<void>; setMessage: (value: { kind: "error" | "success"; text: string } | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState(""); const [provider, setProvider] = useState("");
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); try { await bankingAnalyticsApi.createVisit({ tenantId, branchId, expectedPlate: plate || undefined, providerName: provider || undefined, expectedArrivalStart: new Date(start).toISOString(), expectedArrivalEnd: new Date(end).toISOString() }); setOpen(false); setPlate(""); setProvider(""); setStart(""); setEnd(""); await onChanged(); setMessage({ kind: "success", text: "Expected cash-van visit scheduled." }); } catch (error) { setMessage({ kind: "error", text: readable(error) }); } finally { setSaving(false); } };
  return <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5"><div><p className="text-[10px] font-bold tracking-[.18em] text-blue-300">VISIT SCHEDULE</p><h2 className="mt-1 text-lg font-semibold">Expected cash movements</h2></div><button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold"><Plus size={14} /> Schedule visit</button></header>{open && <form onSubmit={submit} className="grid gap-3 border-b border-slate-800 bg-slate-950/40 p-5 md:grid-cols-2 xl:grid-cols-5"><Field label="Vehicle plate" value={plate} setValue={setPlate} placeholder="KA 01 AB 1234" /><Field label="Provider" value={provider} setValue={setProvider} placeholder="Cash logistics partner" /><Field label="Arrival start" type="datetime-local" value={start} setValue={setStart} required /><Field label="Arrival end" type="datetime-local" value={end} setValue={setEnd} required /><button disabled={saving || !branchId} className="mt-5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold disabled:opacity-40">{saving ? "Saving…" : "Save visit"}</button></form>}{visits.length === 0 ? <Empty icon={<CalendarClock />} text="No expected visits in the next seven days." /> : <div className="divide-y divide-slate-800">{visits.map((visit) => <article key={visit.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1.2fr_auto]"><div><span className="text-[10px] uppercase text-slate-600">Vehicle</span><strong className="mt-1 block text-sm">{visit.expectedPlate || "Any approved vehicle"}</strong></div><div><span className="text-[10px] uppercase text-slate-600">Provider</span><strong className="mt-1 block text-sm">{visit.providerName || "Not specified"}</strong></div><div><span className="text-[10px] uppercase text-slate-600">Arrival window</span><strong className="mt-1 block text-sm">{formatDate(visit.expectedArrivalStart)} – {formatTime(visit.expectedArrivalEnd)}</strong></div><span className="self-center rounded-full bg-blue-500/10 px-3 py-1 text-[10px] font-bold capitalize text-blue-300">{visit.status || "expected"}</span></article>)}</div>}</section>;
}

function MonitorsPanel({ monitors, tenantId, branchId, saving, setSaving, onChanged, setMessage }: { monitors: Monitor[]; tenantId: string; branchId: string; saving: boolean; setSaving: (value: boolean) => void; onChanged: () => Promise<void>; setMessage: (value: { kind: "error" | "success"; text: string } | undefined) => void }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [arrival, setArrival] = useState(""); const [unloading, setUnloading] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); try { await bankingAnalyticsApi.createMonitor({ tenantId, branchId, name, arrivalZoneId: arrival, unloadingZoneId: unloading }); setOpen(false); setName(""); setArrival(""); setUnloading(""); await onChanged(); setMessage({ kind: "success", text: "Cash-van monitor created." }); } catch (error) { setMessage({ kind: "error", text: readable(error) }); } finally { setSaving(false); } };
  return <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5"><div><p className="text-[10px] font-bold tracking-[.18em] text-blue-300">MONITOR POLICY</p><h2 className="mt-1 text-lg font-semibold">Branch cash-van monitors</h2></div><div className="flex gap-2"><Link href="/analytics" className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300">Camera rules <ArrowUpRight size={13} /></Link><button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold"><Plus size={14} /> New monitor</button></div></header>{open && <form onSubmit={submit} className="grid gap-3 border-b border-slate-800 bg-slate-950/40 p-5 md:grid-cols-4"><Field label="Monitor name" value={name} setValue={setName} placeholder="Main branch cash entrance" required /><Field label="Arrival zone ID" value={arrival} setValue={setArrival} placeholder="cash-van-arrival" required /><Field label="Unloading zone ID" value={unloading} setValue={setUnloading} placeholder="secure-unloading" required /><button disabled={saving || !branchId} className="mt-5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold disabled:opacity-40">{saving ? "Saving…" : "Create monitor"}</button></form>}{monitors.length === 0 ? <Empty icon={<Settings2 />} text="No cash-van monitors are configured for this branch." /> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{monitors.map((monitor) => <article key={monitor.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/10 text-blue-300"><MapPin size={17} /></span><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${monitor.enabled === false ? "bg-slate-800 text-slate-500" : "bg-emerald-500/10 text-emerald-300"}`}>{monitor.enabled === false ? "PAUSED" : "ACTIVE"}</span></div><h3 className="mt-4 font-semibold">{monitor.name}</h3><p className="mt-1 min-h-8 text-xs text-slate-500">{monitor.description || "Cash movement workflow monitor"}</p><dl className="mt-4 grid grid-cols-2 gap-2 text-[10px]"><Detail label="Arrival zone" value={monitor.arrivalZoneId || "—"} /><Detail label="Unloading zone" value={monitor.unloadingZoneId || "—"} /></dl></article>)}</div>}</section>;
}

function Metric({ label, value, icon, tone, detail }: { label: string; value: number; icon: React.ReactNode; tone: "blue" | "green" | "amber" | "red"; detail?: string }) { const colors = { blue: "bg-blue-500/10 text-blue-300", green: "bg-emerald-500/10 text-emerald-300", amber: "bg-amber-500/10 text-amber-300", red: "bg-red-500/10 text-red-300" }; return <article className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tone]}`}>{icon}</span><div><p className="text-2xl font-bold">{value}</p><strong className="block text-xs text-slate-300">{label}</strong>{detail && <span className="text-[10px] text-slate-600">{detail}</span>}</div></article>; }
function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) { return <button onClick={onClick} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold ${active ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>{icon}{label}<span className={`rounded-full px-2 py-0.5 text-[9px] ${active ? "bg-white/15" : "bg-slate-800"}`}>{count}</span></button>; }
function AssessmentBadge({ value }: { value: Assessment }) { const colors: Record<Assessment, string> = { compliant: "bg-emerald-500/10 text-emerald-300", non_compliant: "bg-red-500/10 text-red-300", suspicious: "bg-amber-500/10 text-amber-300", in_progress: "bg-blue-500/10 text-blue-300", insufficient_evidence: "bg-slate-800 text-slate-400" }; return <span className={`self-center justify-self-start rounded-full px-2.5 py-1 text-[9px] font-bold ${colors[value]}`}>{value.replaceAll("_", " ").toUpperCase()}</span>; }
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="grid min-h-56 place-items-center p-8 text-center text-slate-600"><div><span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-slate-800">{icon}</span><p className="text-sm">{text}</p></div></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-950/70 p-2"><dt className="text-[9px] uppercase tracking-wider text-slate-600">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-300">{value}</dd></div>; }
function Field({ label, value, setValue, placeholder, type = "text", required = false }: { label: string; value: string; setValue: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) { return <label className="text-xs font-semibold text-slate-400">{label}<input type={type} required={required} value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-500" /></label>; }
function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
function formatTime(value: string) { return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
function readable(error: unknown) { return error instanceof Error ? error.message : "Unable to load banking analytics"; }

function VipIntelligencePanel({
  branchId,
  vipDetections,
  allVipProfiles,
  cashCounters,
  queueAnalytics,
}: {
  branchId: string;
  vipDetections: any[];
  allVipProfiles: any[];
  cashCounters: any[];
  queueAnalytics?: {
    camerasWithQueues: number;
    queueSlaBreaches: number;
    activeQueueAlerts: number;
    avgQueueLength: number;
    avgWaitSeconds: number;
    peakQueueLength: number;
  };
}) {
  const [activeTellerAlert, setActiveTellerAlert] = useState(false);
  const activeVip = vipDetections[0];

  const avgWaitMin = queueAnalytics?.avgWaitSeconds
    ? Math.floor(queueAnalytics.avgWaitSeconds / 60)
    : 0;
  const avgWaitSec = queueAnalytics?.avgWaitSeconds
    ? Math.round(queueAnalytics.avgWaitSeconds % 60)
    : 0;

  return (
    <div className="space-y-6">
      {/* 1. HNI VIP CUSTOMER INGRESS COCKPIT */}
      {activeVip ? (
        <section className="relative overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-950/30 via-slate-900 to-black p-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-5 border-b border-slate-800">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                  <Crown size={14} /> VIP HNI Ingress Detected
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {activeVip.lastDetected?.cameraName || "Main Entrance"}
                </span>
              </div>
              <h2 className="text-2xl font-black text-white flex items-center gap-3">
                {activeVip.fullName} {activeVip.designation ? `(${activeVip.designation})` : ""}
              </h2>
              <p className="text-sm text-slate-300 max-w-2xl">
                Biometric ID: <strong className="text-amber-300">{activeVip.employeeCode || activeVip.id}</strong>. Status:{" "}
                <strong className="text-emerald-300 capitalize">{activeVip.status || "active"}</strong>.
                {activeVip.notes && ` Notes: ${activeVip.notes}`}
              </p>
            </div>

            {/* Action Trigger Card */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 min-w-[300px]">
              <div className="text-xs text-slate-400 mb-2">
                Notification Protocol: <strong className="text-slate-200">Branch Manager & RM Dispatch</strong>
              </div>
              <Link
                href={`/incidents/create?${new URLSearchParams({
                  title: `VIP arrival response: ${activeVip.fullName}`,
                  description: `VIP/HNI ingress detected at ${activeVip.lastDetected?.cameraName || "branch entrance"}. Assign the Branch Manager or Relationship Manager and record the response.`,
                  incidentType: "other",
                  severity: "P4",
                  branchId,
                  occurredAt: activeVip.lastDetected?.timestamp || new Date().toISOString(),
                  confidentialityLevel: "confidential",
                })}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-emerald-500"
              >
                <MessageCircle size={15} /> Open auditable response record
              </Link>
            </div>
          </div>

          {/* Client Fast Details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 text-xs">
            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3">
              <span className="text-[10px] uppercase text-slate-500 block">Watchlist Category</span>
              <span className="text-sm font-bold text-amber-300 mt-1 block capitalize">
                {activeVip.watchlistType || "VIP"}
              </span>
            </div>
            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3">
              <span className="text-[10px] uppercase text-slate-500 block">Face Biometric Enrolled</span>
              <span className="text-sm font-bold text-slate-200 mt-1 block">
                {activeVip.faceEnrolled ? "Verified Embedding" : "Pending Enrollment"}
              </span>
            </div>
            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3">
              <span className="text-[10px] uppercase text-slate-500 block">Last Detected</span>
              <span className="text-sm font-bold font-mono text-slate-200 mt-1 block">
                {activeVip.lastDetected?.timestamp ? new Date(activeVip.lastDetected.timestamp).toLocaleTimeString() : "Recent Ingress"}
              </span>
            </div>
            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3">
              <span className="text-[10px] uppercase text-slate-500 block">24h Detections</span>
              <span className="text-sm font-bold text-emerald-400 mt-1 block">
                {activeVip.detectionCount24h ?? 1} events
              </span>
            </div>
          </div>
        </section>
      ) : (
        <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck size={14} /> VIP Biometric Engine Active
                </span>
                <span className="text-xs text-slate-500 font-mono">Live Ingress Stream</span>
              </div>
              <h2 className="text-xl font-bold text-white">No Active VIP Ingress Detected</h2>
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                Entrance camera AI is monitoring live ingress against the enterprise VIP watchlist. When an enrolled VIP client enters the branch perimeter, real-time identity matching and Relationship Manager alerts will display here.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right text-xs text-slate-400 hidden sm:block">
                <span>Enrolled VIP Profiles: </span>
                <strong className="text-white font-mono">{allVipProfiles.length}</strong>
              </div>
              <Link
                href="/analytics/nbfc-watchlist"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold rounded-xl text-xs flex items-center gap-2 transition"
              >
                <UsersRound size={14} /> Watchlist Manager
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* 2. TELLER COUNTER QUEUE ABANDONMENT TELEMETRY */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-[.18em] text-blue-300 uppercase">
                Customer Experience Intelligence
              </span>
            </div>
            <h3 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
              <UsersRound size={20} className="text-blue-400" />
              Teller Counter Queue Abandonment &amp; Service SLA Telemetry
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
              <TrendingDown size={14} className="text-emerald-400" />
              <span>SLA Breaches: <strong className="text-emerald-400">{queueAnalytics?.queueSlaBreaches ?? 0}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
              <Timer size={14} className="text-blue-400" />
              <span>Avg Wait: <strong className="text-white">{avgWaitMin}m {avgWaitSec}s</strong></span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
              <span>Peak Queue: <strong className="text-amber-300">{queueAnalytics?.peakQueueLength ?? 0}</strong></span>
            </div>
          </div>
        </div>

        {/* Counters Grid from Real Cameras & AI Rules */}
        {cashCounters.length === 0 ? (
          <Empty
            icon={<UsersRound />}
            text="No counter or teller cameras detected for this branch. Tag cameras with 'counter', 'teller', or 'cash' in Camera Inventory."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cashCounters.map((counter, idx) => {
              const queueCount = counter.currentMetrics?.queue_length ?? counter.currentMetrics?.person_count ?? 0;
              const isAlerting = counter.ruleStatus === "ACTIVE_ALERTING" || queueCount > 5;
              const isOnline = counter.status === "online";

              return (
                <div
                  key={counter.cameraId || idx}
                  className={`rounded-xl bg-slate-950/60 p-4 space-y-2 border ${
                    isAlerting
                      ? "border-amber-500/50 bg-amber-950/10 shadow-lg shadow-amber-950/20"
                      : "border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white truncate max-w-[180px]">
                      {counter.cameraName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        !isOnline
                          ? "bg-slate-800 text-slate-500"
                          : isAlerting
                          ? "bg-amber-500/20 text-amber-300 animate-pulse"
                          : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      {!isOnline ? "OFFLINE" : isAlerting ? "HIGH LOAD" : "ACTIVE"}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1">
                    <span className={`text-2xl font-black ${isAlerting ? "text-amber-300" : "text-white"}`}>
                      {isOnline ? queueCount : "—"}
                    </span>
                    <span className="text-xs text-slate-400">waiting</span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/80 pt-2">
                    <span>Rule State: <strong className="capitalize">{counter.ruleStatus?.toLowerCase() || "idle"}</strong></span>
                    {counter.lastSeenAt && (
                      <span className="text-slate-500 text-[10px]">
                        {new Date(counter.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
