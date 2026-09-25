"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, ArrowUpRight, Building2, Camera, Check, ChevronRight, CircleAlert, Clock3, HardDrive, Radio, RefreshCw, Search, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { getTelemetryFreshness } from "@/lib/telemetry-freshness";

type Lens = "incidents" | "coverage" | "risk" | "continuity";
type Branch = {
  branchId: string | number; name?: string; branchCode?: string; region?: string; operationalState?: string;
  cameras?: { total?: number; notWorking?: number; offline?: number; degraded?: number };
  risk?: { level?: string };
  recording?: { status?: string };
};
type Summary = {
  lastTelemetryTimestamp?: string;
  liveIncidents?: Array<{ id?: string; branchCode?: string; headline?: string }>;
  branches?: { total?: number };
  cameras?: { total?: number; notWorking?: number; offline?: number; degraded?: number };
  atRiskBranchesCount?: number;
};

const lenses = [
  { id: "incidents", label: "Incidents", icon: CircleAlert, path: "/incidents", action: "Open response", tone: "coral" },
  { id: "coverage", label: "Coverage", icon: Camera, path: "/operations/cameras", action: "Inspect cameras", tone: "mint" },
  { id: "risk", label: "Branch risk", icon: Activity, path: "/operations/branches", action: "Explore branches", tone: "amber" },
  { id: "continuity", label: "Continuity", icon: HardDrive, path: "/operations/recording", action: "Inspect recording", tone: "violet" },
] as const;

function cameraFaults(branch: Branch) {
  const cameras = branch.cameras;
  if (!cameras) return 0;
  return Math.max(0, Number(cameras.notWorking ?? (Number(cameras.offline ?? 0) + Number(cameras.degraded ?? 0))));
}
function recordingFault(branch: Branch) {
  const status = branch.recording?.status;
  return Boolean(status && !["HEALTHY", "UNKNOWN"].includes(status));
}
function relevant(branch: Branch, lens: Lens) {
  if (lens === "coverage") return cameraFaults(branch) > 0;
  if (lens === "risk") return ["HIGH", "MEDIUM"].includes(branch.risk?.level ?? "");
  if (lens === "continuity") return recordingFault(branch);
  return false;
}
function priority(branch: Branch) {
  return (branch.risk?.level === "HIGH" ? 5 : branch.risk?.level === "MEDIUM" ? 2 : 0)
    + Math.min(cameraFaults(branch), 5) + (recordingFault(branch) ? 3 : 0);
}

export function SignalCanvas() {
  const [lens, setLens] = useState<Lens>("incidents");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = window.setTimeout(() => {
      controller.abort();
      setError("Live signals timed out. Retry when the connection returns.");
    }, 15_000);
    setRefreshing(true);
    try {
      const [summaryResponse, branchesResponse] = await Promise.all([
        fetch("/api/control/v1/operations/command-center", { credentials: "include", signal: controller.signal }).catch(() => null),
        fetch("/api/control/v1/operations/branches", { credentials: "include", signal: controller.signal }).catch(() => null),
      ]);
      if (controller.signal.aborted) return;
      const summaryPayload = summaryResponse?.ok ? await summaryResponse.json().catch(() => null) : null;
      const branchesPayload = branchesResponse?.ok ? await branchesResponse.json().catch(() => null) : null;
      if (controller.signal.aborted) return;
      const gotSummary = summaryPayload?.success && summaryPayload.data && typeof summaryPayload.data === "object";
      const gotBranches = branchesPayload?.success && Array.isArray(branchesPayload.data);
      if (gotSummary) setSummary(summaryPayload.data);
      if (gotBranches) setBranches(branchesPayload.data.filter((branch: unknown): branch is Branch => {
        if (!branch || typeof branch !== "object") return false;
        const id = (branch as { branchId?: unknown }).branchId;
        return typeof id === "string" || typeof id === "number";
      }));
      setError(gotSummary && gotBranches ? null : "Some live signals are unavailable. Showing only confirmed information.");
    } catch {
      if (!controller.signal.aborted) setError("Could not refresh the signal field. Retry when the connection returns.");
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    return () => { window.clearInterval(interval); pending.current?.abort(); pending.current = null; };
  }, [load]);

  const incidents = Array.isArray(summary?.liveIncidents) ? summary.liveIncidents : [];
  const cameraTotal = branches
    ? branches.reduce((total, branch) => total + Math.max(0, Number(branch.cameras?.total ?? 0)), 0)
    : Number(summary?.cameras?.total ?? 0);
  const cameraDown = branches
    ? branches.reduce((total, branch) => total + cameraFaults(branch), 0)
    : Math.max(0, Number(summary?.cameras?.notWorking ?? (Number(summary?.cameras?.offline ?? 0) + Number(summary?.cameras?.degraded ?? 0))));
  const riskCount = branches ? branches.filter((branch) => relevant(branch, "risk")).length : Number(summary?.atRiskBranchesCount ?? 0);
  const recordingCount = branches ? branches.filter(recordingFault).length : null;
  const branchCount = branches?.length ?? summary?.branches?.total ?? null;
  const freshness = getTelemetryFreshness(summary?.lastTelemetryTimestamp);
  const activeLens = lenses.find((item) => item.id === lens)!;
  const ActiveIcon = activeLens.icon;
  const counts: Record<Lens, number | null> = {
    incidents: summary ? incidents.length : null,
    coverage: branches || summary?.cameras ? cameraDown : null,
    risk: branches || summary?.atRiskBranchesCount != null ? riskCount : null,
    continuity: recordingCount,
  };
  const story: Record<Lens, { title: string; detail: string; unit: string; note: string }> = {
    incidents: {
      title: counts.incidents === null ? "Waiting for incident signal" : counts.incidents > 0 ? "An event needs a decision." : "No active incidents reported.",
      detail: counts.incidents === null ? "Incident data will appear when the command center responds." : counts.incidents > 0 ? "Move from alert to response with the incident record and the people who can act." : "Keep the estate in view. New incidents appear here as they are reported.",
      unit: "active incidents", note: "From the incident feed",
    },
    coverage: {
      title: counts.coverage === null ? "Waiting for camera signal" : counts.coverage > 0 ? "Coverage has a gap." : "Camera coverage is holding.",
      detail: counts.coverage === null ? "Camera health will appear when branch telemetry responds." : counts.coverage > 0 ? "See the branches behind the gap, then inspect the affected devices." : "Every confirmed camera is accounted for in the current snapshot.",
      unit: "cameras needing attention", note: cameraTotal > 0 ? `Across ${cameraTotal.toLocaleString()} cameras` : "From branch telemetry",
    },
    risk: {
      title: counts.risk === null ? "Waiting for branch risk" : counts.risk > 0 ? "Risk is concentrating." : "No elevated branch risk reported.",
      detail: counts.risk === null ? "Branch risk will appear when the operations feed responds." : counts.risk > 0 ? "Focus on branches with an elevated risk level before opening the wider estate." : "Branch risk is currently below the elevated threshold.",
      unit: "branches at elevated risk", note: branchCount != null ? `Across ${branchCount} branches` : "From the operations feed",
    },
    continuity: {
      title: counts.continuity === null ? "Waiting for recording signal" : counts.continuity > 0 ? "Recording needs a closer look." : "Recording status is holding.",
      detail: counts.continuity === null ? "Recording health will appear when branch telemetry responds." : counts.continuity > 0 ? "Find the branches with a reported recording issue and inspect continuity." : "No confirmed recording faults in the current branch snapshot.",
      unit: "branches with recording issues", note: "From branch telemetry",
    },
  };
  const visibleBranches = useMemo(() => {
    if (!branches) return [];
    const incidentCodes = new Set(incidents.map((incident) => incident.branchCode).filter(Boolean));
    const matching = branches.filter((branch) => lens === "incidents"
      ? Boolean(branch.branchCode && incidentCodes.has(branch.branchCode))
      : relevant(branch, lens));
    return (matching.length > 0 ? matching : branches).slice()
      .sort((a, b) => priority(b) - priority(a) || String(a.name ?? "").localeCompare(String(b.name ?? ""))).slice(0, 5);
  }, [branches, incidents, lens]);
  const selectedBranch = visibleBranches.find((branch) => branch.branchId === selectedBranchId) ?? visibleBranches[0];
  const branchItemsAreRelevant = visibleBranches.some((branch) => lens === "incidents"
    ? incidents.some((incident) => incident.branchCode && incident.branchCode === branch.branchCode)
    : relevant(branch, lens));

  return <main className="signal-canvas" id="workspace-content"><div className="signal-canvas-inner">
    <header className="signal-header">
      <div className="signal-identity"><span className="signal-identity-mark"><Radio size={20} /></span><span><strong>KRYPTON / FIELD</strong><small>OPERATIONS, REIMAGINED</small></span></div>
      <div className="signal-header-actions"><span className={`signal-freshness is-${freshness.state}`} title={freshness.detail}><span />{freshness.label}</span><button type="button" className="signal-refresh" onClick={() => void load()} disabled={refreshing} aria-label="Refresh live signals" title="Refresh live signals"><RefreshCw size={17} className={refreshing ? "spinning" : ""} /></button></div>
    </header>
    <div className="signal-heading"><div><p className="signal-eyebrow"><span className="signal-eyebrow-line" /> A DIFFERENT WAY TO OPERATE</p><h1>Read the field.<br /><em>Move with intent.</em></h1></div><p>One living view of the estate. Choose a signal, see where it lands, and move straight into the work.</p></div>
    {error && <div className="signal-error" role="status"><CircleAlert size={16} />{error}</div>}
    <div className="signal-main-grid">
      <section className="signal-field" aria-label="Choose an operational signal">
        <div className="signal-field-index"><span>01 / SIGNAL FIELD</span><span>{loading ? "CONNECTING" : "SELECT A SIGNAL"}</span></div>
        <div className="signal-orbit" data-lens={lens}>
          <div className="signal-orbit-ring ring-one" /><div className="signal-orbit-ring ring-two" /><div className="signal-orbit-axis axis-one" /><div className="signal-orbit-axis axis-two" />
          <div className="signal-orbit-core"><span className="signal-core-pulse" /><ShieldCheck size={29} /><strong>{branchCount === null ? "—" : branchCount}</strong><small>{branchCount === 1 ? "BRANCH IN VIEW" : "BRANCHES IN VIEW"}</small></div>
          {lenses.map((item, index) => { const Icon = item.icon; return <button type="button" key={item.id} className={`signal-node signal-node-${index + 1} is-${item.tone} ${lens === item.id ? "is-active" : ""}`} onClick={() => { setLens(item.id); setSelectedBranchId(null); }} aria-pressed={lens === item.id} aria-label={`${item.label}, ${counts[item.id] === null ? "data unavailable" : `${counts[item.id]} needing attention`}`}><span className="signal-node-icon"><Icon size={20} /></span><span className="signal-node-copy"><strong>{item.label}</strong><small>{counts[item.id] === null ? "Awaiting data" : `${counts[item.id]} ${counts[item.id] === 1 ? "signal" : "signals"}`}</small></span><ChevronRight size={15} /></button>; })}
        </div>
        <div className="signal-field-footer"><span><span className="signal-live-dot" />{freshness.detail}</span><span>Updates every 15 sec</span></div>
      </section>
      <section className={`signal-decision is-${activeLens.tone}`} aria-live="polite" aria-label={`${activeLens.label} decision panel`}>
        <div className="signal-decision-top"><span>02 / DECISION THREAD</span><span className="signal-decision-symbol"><ActiveIcon size={20} /></span></div>
        <div className="signal-decision-body"><span className="signal-decision-number">{counts[lens] === null ? "—" : String(counts[lens]).padStart(2, "0")}</span><span className="signal-decision-unit">{story[lens].unit}</span><h2>{story[lens].title}</h2><p>{story[lens].detail}</p></div>
        <div className="signal-decision-bottom"><span><Clock3 size={14} />{story[lens].note}</span><Link href={activeLens.path}>{activeLens.action}<ArrowUpRight size={17} /></Link></div>
      </section>
    </div>
    <section className="signal-lower-grid">
      <div className="signal-places"><div className="signal-section-head"><div><p>03 / WHERE IT LANDS</p><h2>{branchItemsAreRelevant ? "Branches in focus" : lens === "incidents" ? "Estate context" : "Branch overview"}</h2></div><Link href="/operations/branches">Open estate <ArrowUpRight size={16} /></Link></div>
        {lens === "incidents" && incidents.length > 0 && <div className="signal-incident-list">{incidents.slice(0, 2).map((incident, index) => <Link href="/incidents" key={incident.id ?? index}><span className="signal-incident-flash" /><span><strong>{incident.headline || "Active incident"}</strong><small>{incident.branchCode || "Branch not specified"}</small></span><ArrowUpRight size={15} /></Link>)}</div>}
        {branches === null ? <div className="signal-empty"><Building2 size={22} /><span>Branch telemetry is unavailable. The estate view will populate when the connection returns.</span></div> : branches.length === 0 ? <div className="signal-empty"><Building2 size={22} /><span>No branches are onboarded yet.</span><Link href="/admin/branch-onboarding">Onboard a branch <ArrowRight size={14} /></Link></div> : <div className="signal-branch-layout"><div className="signal-branch-list">{visibleBranches.map((branch) => <button type="button" key={branch.branchId} className={selectedBranch?.branchId === branch.branchId ? "is-selected" : ""} onClick={() => setSelectedBranchId(branch.branchId)} aria-pressed={selectedBranch?.branchId === branch.branchId}><span className="signal-branch-glyph"><Building2 size={17} /></span><span className="signal-branch-name"><strong>{branch.name || branch.branchCode || "Unnamed branch"}</strong><small>{branch.region || "Region unavailable"} · {branch.branchCode || "No code"}</small></span><span className={`signal-branch-state ${priority(branch) > 0 ? "has-signal" : ""}`}>{priority(branch) > 0 ? "Review" : branch.operationalState || "Unknown"}</span><ChevronRight size={16} /></button>)}</div>{selectedBranch && <aside className="signal-branch-detail"><span>SELECTED BRANCH</span><h3>{selectedBranch.name || selectedBranch.branchCode || "Unnamed branch"}</h3><p>{selectedBranch.region || "Region unavailable"} · {selectedBranch.branchCode || "No branch code"}</p><div className="signal-branch-facts"><span><Camera size={15} /> {selectedBranch.cameras?.total == null ? "Camera data unavailable" : `${cameraFaults(selectedBranch)} / ${selectedBranch.cameras.total} cameras need attention`}</span><span><Activity size={15} /> Risk: {selectedBranch.risk?.level || "Unavailable"}</span><span><HardDrive size={15} /> Recording: {selectedBranch.recording?.status || "Unavailable"}</span></div><Link href={`/operations/branches/${encodeURIComponent(String(selectedBranch.branchId))}`}>Enter branch workspace <ArrowUpRight size={16} /></Link></aside>}</div>}
      </div>
      <nav className="signal-actions" aria-label="Operational next steps"><div className="signal-section-head"><div><p>04 / NEXT MOVE</p><h2>Work from the signal</h2></div><Sparkles size={20} /></div><Link href="/control-room"><span><Radio size={18} /></span><strong>Watch live coverage</strong><ArrowUpRight size={16} /></Link><Link href="/video-search"><span><Search size={18} /></span><strong>Investigate video</strong><ArrowUpRight size={16} /></Link><Link href="/maintenance/workorders"><span><Wrench size={18} /></span><strong>Resolve a fault</strong><ArrowUpRight size={16} /></Link><Link href="/evidence"><span><Check size={18} /></span><strong>Preserve evidence</strong><ArrowUpRight size={16} /></Link><div className="signal-actions-foot"><span><ShieldCheck size={15} /> Operations stay connected</span><Link href="/modules">All workspaces <ArrowRight size={15} /></Link></div></nav>
    </section>
  </div></main>;
}
