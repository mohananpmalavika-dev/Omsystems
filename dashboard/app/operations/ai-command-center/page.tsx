"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Bot, CheckCircle2, ChevronDown, ChevronUp, Clock3,
  FileSearch, GitBranch, Loader2, MessageSquareText, PlayCircle, Send, ShieldCheck,
  Sparkles, Wrench,
} from "lucide-react";

type Certainty = "confirmed" | "likely" | "possible" | "unknown";
type Action = {
  id: string; actionType: string; title: string; reason: string; risk: string;
  expectedImpact: string; approvalRequired: boolean; executionMode: string; status: string; href?: string;
};
type Entity = { id: string; entityType: string; name: string; status: string; observedAt: string | null; source: string; metrics: Record<string, unknown> };
type TimelineEvent = { id: string; occurredAt: string; title: string; detail: string; severity: string; source: string; certainty: Certainty; raw: Record<string, unknown> };
type Diagnosis = {
  caseId: string;
  branch: { id: string; name: string };
  status: { label: string; explanation: string };
  rootCause: { label: string; certainty: Certainty; confidence: number; summary?: string; explanation: string; confidenceDetails?: string[]; reasoningVersion?: string };
  evidence: Array<{ id: string; assertion: string; observedAt: string; source: string; quality: string; raw: Record<string, unknown> }>;
  impact: { statement: string; unavailableCameras: number; totalCameras: number; offlineRecorders: number; affectedEntityIds: string[] };
  currentRecoveryActivity: string[];
  recoveryEstimate: { available: boolean; statement: string; confidence: string; missingInputs: string[] };
  recommendedActions: Action[];
  alternativeCauses: Array<{ label: string; certainty: Certainty; confidence: number; explanation: string }>;
  missingEvidence: string[];
  lastUpdatedAt: string;
  graph: { entities: Entity[]; dependencies: Array<{ fromEntityId: string; toEntityId: string; relationship: string }> };
  timeline: TimelineEvent[];
};
type Answer = {
  conversationId: string;
  answer: { status: string; rootCause: string; evidence: string[]; impact: string; currentRecoveryActivity: string[]; estimatedRecoveryTime: string; recommendedAction: string; confidence: number; alternativeCause: string; lastUpdatedAt: string };
  diagnosis: Diagnosis;
};

const suggestions = [
  "What is the current health of Bengaluru Branch 001?",
  "Why are cameras unavailable?",
  "Show the evidence and event timeline",
  "What is being done and when will service recover?",
];

export default function AiCommandCenterPage() {
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [result, setResult] = useState<Answer>();
  const [history, setHistory] = useState<Array<{ question: string; answer: string; certainty: Certainty }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [bottomTab, setBottomTab] = useState<"evidence" | "raw" | "audit">("evidence");

  const submit = async (event?: FormEvent, suggested?: string) => {
    event?.preventDefault();
    const prompt = (suggested ?? question).trim();
    if (!prompt || busy) return;
    setBusy(true); setError(undefined); setQuestion("");
    try {
      const response = await fetch("/api/control/v1/command-center/query", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: prompt, conversationId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Command Center query failed");
      const next = body as Answer;
      setResult(next); setConversationId(next.conversationId);
      setHistory((items) => [...items, { question: prompt, answer: `${next.answer.status} ${next.answer.rootCause}`, certainty: next.diagnosis.rootCause.certainty }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Command Center query failed");
    } finally { setBusy(false); }
  };

  const updateAction = async (action: Action, operation: "approve" | "execute") => {
    setBusy(true); setError(undefined);
    try {
      const response = await fetch(`/api/control/v1/command-center/actions/${action.id}/${operation}`, { method: "POST", credentials: "include" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? `Unable to ${operation} action`);
      setResult((current) => current ? {
        ...current,
        diagnosis: { ...current.diagnosis, recommendedActions: current.diagnosis.recommendedActions.map((item) => item.id === action.id ? { ...item, status: body.action.status } : item) },
      } : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : `Unable to ${operation} action`); }
    finally { setBusy(false); }
  };

  return <main className="min-h-[calc(100vh-7rem)] bg-slate-950 p-4 text-slate-100 xl:p-5">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold tracking-[.2em] text-cyan-400"><Sparkles size={14}/> EVIDENCE-BOUND OPERATIONS</p>
        <h1 className="mt-1 text-2xl font-bold">AI Command Center</h1>
        <p className="text-sm text-slate-400">Deterministic branch diagnosis, causal evidence, recovery context and approved actions</p>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"><ShieldCheck size={15}/> No unsupported claims</div>
    </header>

    {error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"><AlertTriangle size={16}/>{error}</div>}

    <section className="grid gap-4 2xl:grid-cols-[minmax(260px,.72fr)_minmax(460px,1.35fr)_minmax(310px,.9fr)]">
      <aside className="flex min-h-[610px] flex-col rounded-2xl border border-slate-800 bg-slate-900/80">
        <div className="border-b border-slate-800 p-4"><h2 className="flex items-center gap-2 font-semibold"><MessageSquareText size={17}/> Ask operations</h2><p className="mt-1 text-xs text-slate-400">Name a branch once; follow-ups retain context.</p></div>
        <div className="flex-1 space-y-3 overflow-auto p-4">
          {history.length === 0 && <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-slate-300"><Bot className="mb-3 text-cyan-400"/><p>I use only authorized inventory, telemetry, incidents and maintenance records. If evidence is missing, I will say so.</p></div>}
          {history.map((item, index) => <div key={`${item.question}-${index}`} className="space-y-2">
            <div className="ml-6 rounded-xl rounded-tr-sm bg-cyan-600 p-3 text-sm">{item.question}</div>
            <div className="mr-4 rounded-xl rounded-tl-sm bg-slate-800 p-3 text-sm leading-6"><CertaintyBadge value={item.certainty}/><p className="mt-2 text-slate-200">{item.answer}</p></div>
          </div>)}
          {busy && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="animate-spin" size={16}/> Correlating authorized evidence…</div>}
        </div>
        <div className="space-y-2 border-t border-slate-800 p-3">
          {history.length === 0 && suggestions.slice(0, 2).map((item) => <button key={item} onClick={() => void submit(undefined, item)} className="block w-full rounded-lg border border-slate-700 px-3 py-2 text-left text-xs text-slate-300 hover:border-cyan-500 hover:bg-cyan-500/5">{item}</button>)}
          <form onSubmit={submit} className="flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about branch health…" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"/><button disabled={busy || !question.trim()} className="rounded-lg bg-cyan-600 p-2.5 hover:bg-cyan-500 disabled:opacity-40" aria-label="Send"><Send size={16}/></button></form>
        </div>
      </aside>

      <div className="space-y-4">
        <HealthPanel diagnosis={result?.diagnosis}/>
        <Timeline events={result?.diagnosis.timeline ?? []}/>
        <DependencyGraph diagnosis={result?.diagnosis}/>
      </div>

      <aside className="space-y-4">
        <RcaPanel diagnosis={result?.diagnosis}/>
        <RecoveryPanel diagnosis={result?.diagnosis}/>
        <ActionsPanel actions={result?.diagnosis.recommendedActions ?? []} busy={busy} update={updateAction}/>
      </aside>
    </section>

    <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/80">
      <div className="flex flex-wrap border-b border-slate-800 px-3">
        {(["evidence", "raw", "audit"] as const).map((tab) => <button key={tab} onClick={() => setBottomTab(tab)} className={`border-b-2 px-4 py-3 text-xs font-semibold uppercase tracking-wider ${bottomTab === tab ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400"}`}>{tab === "raw" ? "Raw telemetry" : tab}</button>)}
      </div>
      <EvidenceConsole tab={bottomTab} diagnosis={result?.diagnosis}/>
    </section>
  </main>;
}

function HealthPanel({ diagnosis }: { diagnosis?: Diagnosis }) {
  const groups = useMemo(() => {
    const values = diagnosis?.graph.entities ?? [];
    return ["power", "ups", "network", "edge-agent", "recorder", "disk", "camera"].map((type) => ({ type, entities: values.filter((item) => item.entityType === type) })).filter((item) => item.entities.length);
  }, [diagnosis]);
  return <Panel title="Current branch health" icon={<GitBranch size={17}/>} extra={diagnosis && <span className="text-xs text-slate-500">Updated {date(diagnosis.lastUpdatedAt)}</span>}>
    {!diagnosis ? <Empty text="Ask about a branch to build its live operational graph."/> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-950/60 p-4"><div><p className="font-semibold">{diagnosis.branch.name}</p><p className="text-xs text-slate-400">{diagnosis.impact.statement}</p></div><Status value={diagnosis.status.label}/></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{groups.map((group) => <div key={group.type} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{group.type.replaceAll("-", " ")}</p><strong className="mt-1 block text-lg">{group.entities.length}</strong><p className="text-xs text-slate-400">{group.entities.filter((item) => ["offline", "critical", "degraded", "warning"].includes(item.status)).length} unhealthy</p></div>)}</div>
    </>}
  </Panel>;
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  const visible = [...events].reverse().slice(0, 8);
  return <Panel title="Event timeline" icon={<Clock3 size={17}/>}>{visible.length === 0 ? <Empty text="No branch timeline loaded."/> : <div className="space-y-0">{visible.map((event) => <div key={event.id} className="grid grid-cols-[95px_14px_1fr] gap-2 text-xs"><span className="py-3 text-slate-500">{time(event.occurredAt)}</span><div className="relative flex justify-center"><span className={`mt-3 h-2.5 w-2.5 rounded-full ${event.severity === "critical" ? "bg-red-500" : event.severity === "warning" ? "bg-amber-400" : "bg-cyan-400"}`}/><span className="absolute bottom-0 top-6 w-px bg-slate-800"/></div><div className="border-b border-slate-800 py-3"><p className="font-semibold text-slate-200">{event.title}</p><p className="mt-1 text-slate-400">{event.detail}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-slate-600">{event.source}</p></div></div>)}</div>}</Panel>;
}

function DependencyGraph({ diagnosis }: { diagnosis?: Diagnosis }) {
  const [expanded, setExpanded] = useState(false);
  if (!diagnosis) return <Panel title="Dependency graph" icon={<GitBranch size={17}/>}><Empty text="Dependencies appear after diagnosis."/></Panel>;
  const entities = diagnosis.graph.entities.filter((item) => item.entityType !== "branch");
  const visible = expanded ? entities : entities.slice(0, 12);
  return <Panel title="Dependency graph" icon={<GitBranch size={17}/>} extra={<button className="text-xs text-cyan-400" onClick={() => setExpanded(!expanded)}>{expanded ? "Collapse" : "Expand"}</button>}>
    <div className="flex flex-wrap gap-2">{visible.map((entity) => <div key={entity.id} title={`${entity.source} · ${entity.observedAt ?? "no observation"}`} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs"><span className={`h-2 w-2 rounded-full ${healthColor(entity.status)}`}/><span>{entity.name}</span><span className="text-slate-600">{entity.entityType}</span></div>)}</div>
    <div className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-950/60 p-3 text-[11px] text-slate-400">{diagnosis.graph.dependencies.slice(0, expanded ? undefined : 8).map((edge, index) => <div key={`${edge.fromEntityId}-${edge.toEntityId}-${index}`} className="flex items-center gap-2 py-1"><span>{edge.fromEntityId}</span><ArrowRight size={11} className="text-cyan-500"/><span>{edge.relationship.replaceAll("_", " ")}</span><ArrowRight size={11} className="text-cyan-500"/><span>{edge.toEntityId}</span></div>)}</div>
  </Panel>;
}

function RcaPanel({ diagnosis }: { diagnosis?: Diagnosis }) {
  if (!diagnosis) return <Panel title="Root-cause assessment" icon={<FileSearch size={17}/>}><Empty text="Evidence-ranked causes appear here."/></Panel>;

  const topAlternatives = diagnosis.alternativeCauses.slice(0, 3);
  const supportItems = diagnosis.evidence.slice(0, 4);

  return <Panel title="Root-cause assessment" icon={<FileSearch size={17}/>}> 
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[.2em] text-slate-500">Primary diagnosis</p><h3 className="mt-2 text-xl font-semibold text-slate-100">{diagnosis.rootCause.label}</h3></div><div className="text-right"><CertaintyBadge value={diagnosis.rootCause.certainty}/><p className="mt-2 text-2xl font-bold text-slate-100">{Math.round(diagnosis.rootCause.confidence * 100)}%</p></div></div>
        {diagnosis.rootCause.summary ? <p className="text-sm font-semibold text-slate-200">{diagnosis.rootCause.summary}</p> : null}
        <p className="text-sm leading-6 text-slate-400">{diagnosis.rootCause.explanation}</p>
        <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-400">
          <div><span className="font-semibold text-slate-200">Branch</span><span className="ml-1">{diagnosis.branch.name}</span></div>
          <div><span className="font-semibold text-slate-200">Cameras affected</span><span className="ml-1">{diagnosis.impact.unavailableCameras}</span></div>
          <div><span className="font-semibold text-slate-200">Recorders affected</span><span className="ml-1">{diagnosis.impact.offlineRecorders}</span></div>
          <div><span className="font-semibold text-slate-200">Evidence</span><span className="ml-1">{diagnosis.evidence.length}</span></div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-500">
          <div><span className="font-semibold">First observed</span> {time(diagnosis.timeline[0]?.occurredAt ?? diagnosis.lastUpdatedAt)}</div>
          <div><span className="font-semibold">Last observed</span> {time(diagnosis.timeline.at(-1)?.occurredAt ?? diagnosis.lastUpdatedAt)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <p className="text-xs uppercase tracking-[.2em] text-slate-500">Why Sentinel thinks this</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          {supportItems.map((item) => <li key={item.id} className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400"/> <span>{item.title}: {item.detail}</span></li>)}
        </ul>
      </div>
      {diagnosis.rootCause.confidenceDetails?.length ? <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <p className="text-xs uppercase tracking-[.2em] text-slate-500">Confidence breakdown</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">{diagnosis.rootCause.confidenceDetails.map((detail) => <li key={detail} className="flex gap-2"><span className="h-2.5 w-2.5 rounded-full bg-cyan-400 mt-1"/> <span>{detail}</span></li>)}</ul>
      </div> : null}

      {topAlternatives.length > 0 && <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <p className="text-xs uppercase tracking-[.2em] text-slate-500">Alternative causes</p>
        <div className="mt-3 space-y-2 text-sm text-slate-300">
          {topAlternatives.map((item) => <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900/80 p-3"><p className="font-semibold">{item.label}</p><p className="mt-1 text-xs text-slate-500">{Math.round(item.confidence * 100)}% · {item.certainty}</p><p className="mt-2 text-xs text-slate-400">{item.explanation}</p></div>)}
        </div>
      </div>}

      {diagnosis.missingEvidence.length > 0 && <details className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100"><summary className="cursor-pointer font-semibold text-amber-200">Missing evidence</summary><ul className="mt-3 list-disc space-y-2 pl-4 text-slate-400">{diagnosis.missingEvidence.map((item) => <li key={item}>{item}</li>)}</ul></details>}
    </div>
  </Panel>;
}

function RecoveryPanel({ diagnosis }: { diagnosis?: Diagnosis }) {
  return <Panel title="Recovery" icon={<PlayCircle size={17}/>}>{!diagnosis ? <Empty text="Recovery evidence appears here."/> : <div className="space-y-3"><p className="text-sm leading-6 text-slate-300">{diagnosis.recoveryEstimate.statement}</p><div className="rounded-lg bg-slate-950/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Reported activity</p>{diagnosis.currentRecoveryActivity.length ? diagnosis.currentRecoveryActivity.map((item) => <p key={item} className="mt-2 text-xs text-slate-300">{item}</p>) : <p className="mt-2 text-xs text-slate-400">No recovery activity is reported by current telemetry.</p>}</div><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Estimate confidence: {diagnosis.recoveryEstimate.confidence}</span></div>}</Panel>;
}

function ActionsPanel({ actions, busy, update }: { actions: Action[]; busy: boolean; update: (action: Action, operation: "approve" | "execute") => Promise<void> }) {
  return <Panel title="Recommended actions" icon={<Wrench size={17}/>}>{actions.length === 0 ? <Empty text="Evidence-safe runbook actions appear here."/> : <div className="space-y-3">{actions.map((action) => <div key={action.id} className="rounded-xl border border-slate-800 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{action.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{action.reason}</p></div><span className="rounded bg-slate-800 px-2 py-1 text-[10px] uppercase">{action.status}</span></div><p className="mt-2 text-[11px] text-slate-500">Impact: {action.expectedImpact}</p><div className="mt-3 flex gap-2">{action.approvalRequired && action.status === "proposed" && <button disabled={busy} onClick={() => void update(action, "approve")} className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950">Approve</button>}{(!action.approvalRequired || action.status === "approved") && <button disabled={busy || action.executionMode === "integration-required"} onClick={() => void update(action, "execute")} className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">{action.executionMode === "integration-required" ? "Adapter required" : "Execute"}</button>}{action.href && <a href={action.href} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs">Open</a>}</div></div>)}</div>}</Panel>;
}

function EvidenceConsole({ tab, diagnosis }: { tab: "evidence" | "raw" | "audit"; diagnosis?: Diagnosis }) {
  if (!diagnosis) return <div className="p-8"><Empty text="Run a diagnosis to inspect evidence and raw telemetry."/></div>;
  if (tab === "audit") return <div className="grid gap-3 p-4 text-xs md:grid-cols-3"><AuditFact label="Case" value={diagnosis.caseId}/><AuditFact label="Branch" value={`${diagnosis.branch.name} (${diagnosis.branch.id})`}/><AuditFact label="Last evaluated" value={date(diagnosis.lastUpdatedAt)}/><p className="md:col-span-3 text-slate-500">Queries, approvals and executions are written to the platform audit log. This panel exposes no inferred execution event.</p></div>;
  if (tab === "raw") return <pre className="max-h-80 overflow-auto p-4 text-[11px] leading-5 text-cyan-100">{JSON.stringify(diagnosis.timeline.map((item) => item.raw), null, 2)}</pre>;
  return <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{diagnosis.evidence.length ? diagnosis.evidence.map((item) => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex justify-between gap-3"><span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Confirmed evidence</span><span className="text-[10px] text-slate-500">{item.quality}</span></div><p className="mt-2 text-sm">{item.assertion}</p><p className="mt-2 text-[10px] text-slate-500">{item.source} · {date(item.observedAt)}</p></div>) : <Empty text="No supporting evidence is available; the root cause is unknown."/>}</div>;
}

function Panel({ title, icon, extra, children }: { title: string; icon: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-800 bg-slate-900/80"><header className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><h2 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h2>{extra}</header><div className="p-4">{children}</div></section>; }
function Empty({ text }: { text: string }) { return <p className="py-6 text-center text-sm text-slate-500">{text}</p>; }
function Status({ value }: { value: string }) { return <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${["Critical", "Offline"].includes(value) ? "bg-red-500/15 text-red-300" : value === "Degraded" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>{value}</span>; }
function CertaintyBadge({ value }: { value: Certainty }) { const style = value === "confirmed" ? "bg-emerald-500/15 text-emerald-300" : value === "likely" ? "bg-cyan-500/15 text-cyan-300" : value === "possible" ? "bg-amber-500/15 text-amber-300" : "bg-slate-700 text-slate-300"; return <span className={`inline-flex rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${style}`}>{value}</span>; }
function AuditFact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-950/50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 break-all text-slate-200">{value}</p></div>; }
function healthColor(value: string) { return ["offline", "critical"].includes(value) ? "bg-red-500" : ["warning", "degraded"].includes(value) ? "bg-amber-400" : value === "unknown" ? "bg-slate-500" : "bg-emerald-500"; }
function date(value: string) { return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : value; }
function time(value: string) { return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : value; }
