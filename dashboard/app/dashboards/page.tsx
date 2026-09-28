"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Camera,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileText,
  Gauge,
  HardDrive,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import "./executive-decision.css";

type FeedStatus = "AVAILABLE" | "UNAVAILABLE";
type DashboardSummary = {
  systemStatus: string;
  systemHealthScore: number | null;
  activeIncidents: number;
  lastUpdated: string;
  status?: FeedStatus;
};
type CameraMetrics = {
  totalRegistered: number;
  operational: number;
  online: number;
  offline: number;
  degraded: number;
  underMaintenance: number | null;
  availabilityPercentage: number | null;
  status?: FeedStatus;
};
type RecordingMetrics = {
  recordingNormally: number | null;
  recordingWithGaps: number | null;
  recordingStopped: number | null;
  verificationPending: number | null;
  availabilityPercentage: number | null;
  status?: FeedStatus;
};
type StorageMetrics = {
  totalCapacityBytes: string | null;
  usedCapacityBytes: string | null;
  availableCapacityBytes: string | null;
  utilizationPercentage: number | null;
  forecastFullDays: number | null;
  criticalNodes: number;
  status?: FeedStatus;
};
type AlertMetrics = {
  totalActive: number;
  unacknowledged: number;
  critical: number;
  escalated: number | null;
  slaBreached: number | null;
  status?: FeedStatus;
};
type CapacityAssessment = {
  capability: string;
  status: string;
  verifiedCompletion: number;
  summary: string;
  metrics?: { branches: number; cameras: number; branchScaleTarget?: number; cameraScaleTarget?: number };
  evidence?: {
    loadTestCompleted: boolean;
    productionBenchmarkCompleted: boolean;
    enduranceBenchmarkCompleted: boolean;
    failoverValidated: boolean;
  };
};
type Incident = {
  id?: string;
  incidentNumber?: string;
  incidentType?: string;
  branchName?: string;
  severity?: string;
  status?: string;
  occurredAt?: string;
};
type DashboardData = {
  summary: DashboardSummary | null;
  cameras: CameraMetrics | null;
  recording: RecordingMetrics | null;
  storage: StorageMetrics | null;
  alerts: AlertMetrics | null;
  incidents: Incident[] | null;
  capacity: CapacityAssessment | null;
};
type Decision = {
  id: string;
  title: string;
  detail: string;
  count: number;
  label: string;
  tone: "critical" | "warning";
  href: string;
};

const initialData: DashboardData = {
  summary: null,
  cameras: null,
  recording: null,
  storage: null,
  alerts: null,
  incidents: null,
  capacity: null,
};

async function readFeed<T>(path: string, signal: AbortSignal): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE || "/api/control";
  const response = await fetch(`${base}${path}`, { credentials: "include", cache: "no-store", signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.success === false) throw new Error(payload?.error || "Feed unavailable");
  return (payload?.data ?? payload) as T;
}

function formatCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "—";
}

function formatPercent(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}%` : "—";
}

function formatBytes(value: string | null | undefined) {
  if (value == null) return "—";
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(1)} ${units[index]}`;
}

function confirmed<T extends { status?: FeedStatus }>(feed: T | null): feed is T {
  return feed !== null && feed.status !== "UNAVAILABLE";
}

function getDecisions(data: DashboardData): Decision[] {
  const decisions: Decision[] = [];
  if (confirmed(data.alerts) && data.alerts.critical > 0) {
    decisions.push({
      id: "alerts", title: "Critical alerts need triage",
      detail: `${formatCount(data.alerts.unacknowledged)} unacknowledged across the monitored estate.`,
      count: data.alerts.critical, label: "critical alerts", tone: "critical", href: "#executive-alerts",
    });
  }
  if (data.summary && Number.isFinite(data.summary.activeIncidents) && data.summary.activeIncidents > 0) {
    decisions.push({
      id: "incidents", title: "Active incidents need a decision",
      detail: "Review the latest cases and their current response state.",
      count: data.summary.activeIncidents, label: "active incidents", tone: "critical", href: "#executive-incidents",
    });
  }
  if (confirmed(data.cameras) && data.cameras.offline > 0) {
    decisions.push({
      id: "cameras", title: "Camera coverage has gaps",
      detail: `${formatCount(data.cameras.degraded)} more cameras are degraded.`,
      count: data.cameras.offline, label: "offline cameras", tone: "warning", href: "#executive-cameras",
    });
  }
  if (confirmed(data.recording) && (data.recording.recordingStopped ?? 0) > 0) {
    decisions.push({
      id: "recording", title: "Recording has stopped",
      detail: "Inspect continuity before an evidence request is affected.",
      count: data.recording.recordingStopped!, label: "stopped streams", tone: "critical", href: "#executive-recording",
    });
  } else if (confirmed(data.recording) && (data.recording.recordingWithGaps ?? 0) > 0) {
    decisions.push({
      id: "recording", title: "Recording continuity has gaps",
      detail: "Inspect the affected streams and verify retained footage.",
      count: data.recording.recordingWithGaps!, label: "streams with gaps", tone: "warning", href: "#executive-recording",
    });
  }
  if (confirmed(data.storage) && data.storage.criticalNodes > 0) {
    decisions.push({
      id: "storage", title: "Storage nodes are critical",
      detail: "Review capacity and device health at the affected nodes.",
      count: data.storage.criticalNodes, label: "critical nodes", tone: "critical", href: "#executive-storage",
    });
  } else if (confirmed(data.storage) && (data.storage.utilizationPercentage ?? 0) >= 90) {
    decisions.push({
      id: "storage", title: "Storage is nearing capacity",
      detail: "Review available capacity and plan the next action.",
      count: data.storage.utilizationPercentage!, label: "percent used", tone: "warning", href: "#executive-storage",
    });
  }
  return decisions.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "critical" ? -1 : 1));
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setRefreshing(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
    const results = await Promise.allSettled([
      readFeed<DashboardSummary>("/v1/dashboard/summary", controller.signal),
      readFeed<CameraMetrics>("/v1/dashboard/camera-health", controller.signal),
      readFeed<RecordingMetrics>("/v1/dashboard/recording-status", controller.signal),
      readFeed<StorageMetrics>("/v1/dashboard/storage", controller.signal),
      readFeed<AlertMetrics>("/v1/dashboard/alerts", controller.signal),
      readFeed<Incident[]>("/v1/dashboard/incidents?limit=5", controller.signal),
      readFeed<CapacityAssessment>("/v1/capacity/assessment", controller.signal),
    ]);
    window.clearTimeout(timeout);
    if (controller.signal.aborted && !timedOut) return;

    const next: Partial<DashboardData> = {};
    if (results[0].status === "fulfilled") next.summary = results[0].value;
    if (results[1].status === "fulfilled") next.cameras = results[1].value;
    if (results[2].status === "fulfilled") next.recording = results[2].value;
    if (results[3].status === "fulfilled") next.storage = results[3].value;
    if (results[4].status === "fulfilled") next.alerts = results[4].value;
    if (results[5].status === "fulfilled") next.incidents = Array.isArray(results[5].value) ? results[5].value : [];
    if (results[6].status === "fulfilled") next.capacity = results[6].value;

    const failures = results.filter((result) => result.status === "rejected").length;
    setData((current) => ({ ...current, ...next }));
    setFeedError(failures ? `${failures} of 7 live feeds could not be refreshed. Showing the last confirmed values where available.` : null);
    if (failures < results.length) setLastChecked(new Date().toISOString());
    if (inFlight.current === controller) {
      inFlight.current = null;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearInterval(timer);
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [load]);

  const { summary, cameras, recording, storage, alerts, incidents, capacity } = data;
  const decisions = getDecisions(data);
  const health = summary?.status === "UNAVAILABLE" ? null : summary?.systemHealthScore;
  const cameraAvailable = confirmed(cameras);
  const recordingAvailable = confirmed(recording);
  const storageAvailable = confirmed(storage);
  const alertAvailable = confirmed(alerts);
  const capacityAvailable = capacity && ((capacity.metrics?.branches ?? 0) > 0 || (capacity.metrics?.cameras ?? 0) > 0);
  const confirmedFeedCount = [
    confirmed(summary), cameraAvailable, recordingAvailable, storageAvailable,
    alertAvailable, incidents !== null, Boolean(capacityAvailable),
  ].filter(Boolean).length;
  const checkedAt = lastChecked || summary?.lastUpdated;

  return (
    <AppLayout>
      <main className="content decision-board-page">
        <div className="decision-board-inner">
          <header className="decision-board-hero">
            <div className="decision-board-hero-copy">
              <p className="decision-board-kicker"><span /> EXECUTIVE / DECISION DESK</p>
              <h1>Know what needs<br /><em>a decision.</em></h1>
              <p>One live view of risk, continuity and readiness. Follow each signal into its evidence and next action.</p>
              <div className="decision-board-hero-actions">
                <span className="decision-board-system"><CircleDot size={14} /> {summary?.systemStatus || "Status unavailable"}</span>
                <span><Clock3 size={14} /> {checkedAt ? `Checked ${new Date(checkedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : "Awaiting live data"}</span>
                <button type="button" onClick={() => void load()} disabled={refreshing} aria-label="Refresh executive dashboard"><RefreshCw size={15} className={refreshing ? "decision-spin" : undefined} /> Refresh</button>
              </div>
            </div>
            <div className="decision-board-health" aria-label={health == null ? "System health unavailable" : `System health ${formatPercent(health)}`}>
              <div className="decision-board-health-ring" style={{ background: health == null ? undefined : `conic-gradient(#a3e7bb ${Math.max(0, Math.min(health, 100))}%, #ffffff24 0)` }}>
                <div><Gauge size={22} /><strong>{formatPercent(health, 0)}</strong><span>System health</span></div>
              </div>
              <small>{health == null ? "No confirmed coverage score" : "Based on online camera coverage"}</small>
            </div>
            <nav className="decision-board-path" aria-label="Executive decision workflow">
              <a href="#decision-priorities"><span>01</span><strong>See the signal</strong><ArrowDownRight size={16} /></a>
              <a href="#decision-evidence"><span>02</span><strong>Inspect the evidence</strong><ArrowDownRight size={16} /></a>
              <Link href="/reports/mis"><span>03</span><strong>Explain the outcome</strong><ArrowUpRight size={16} /></Link>
            </nav>
          </header>

          {feedError && <div className="decision-board-notice" role="alert"><AlertTriangle size={18} /> {feedError}</div>}

          <section className="decision-board-pulse" aria-label="Current executive measures">
            <Pulse href="#executive-alerts" label="Critical alerts" value={alertAvailable ? formatCount(alerts.critical) : "—"} note={alertAvailable ? `${formatCount(alerts.unacknowledged)} unacknowledged` : "Feed unavailable"} tone={alertAvailable && alerts.critical > 0 ? "critical" : "neutral"} />
            <Pulse href="#executive-incidents" label="Active incidents" value={formatCount(summary?.activeIncidents)} note={summary ? "Cases requiring response" : "Feed unavailable"} tone={summary && summary.activeIncidents > 0 ? "warning" : "neutral"} />
            <Pulse href="#executive-cameras" label="Camera availability" value={cameraAvailable ? formatPercent(cameras.availabilityPercentage) : "—"} note={cameraAvailable ? `${formatCount(cameras.offline)} offline` : "No confirmed coverage"} tone={cameraAvailable && cameras.offline > 0 ? "warning" : "neutral"} />
            <Pulse href="#executive-storage" label="Storage used" value={storageAvailable ? formatPercent(storage.utilizationPercentage, 0) : "—"} note={storageAvailable ? `${formatCount(storage.criticalNodes)} critical nodes` : "Feed unavailable"} tone={storageAvailable && storage.criticalNodes > 0 ? "critical" : "neutral"} />
          </section>

          <section id="decision-priorities" className="decision-board-main" aria-label="Decision priorities">
            <div className="decision-board-priorities">
              <div className="decision-board-section-heading">
                <div><p>LIVE SIGNAL / 01</p><h2>What needs attention</h2><span>Ranked from confirmed operating data.</span></div>
                <strong>{decisions.length} {decisions.length === 1 ? "priority" : "priorities"}</strong>
              </div>
              {decisions.length ? (
                <div className="decision-board-priority-list">
                  {decisions.slice(0, 5).map((decision, index) => (
                    <a href={decision.href} className={`decision-board-priority is-${decision.tone}`} key={decision.id}>
                      <span className="decision-board-priority-order">{String(index + 1).padStart(2, "0")}</span>
                      <span className="decision-board-priority-icon">{decision.tone === "critical" ? <ShieldAlert size={20} /> : <Activity size={20} />}</span>
                      <span className="decision-board-priority-copy"><strong>{decision.title}</strong><small>{decision.detail}</small></span>
                      <span className="decision-board-priority-count"><b>{formatCount(decision.count)}</b><small>{decision.label}</small></span>
                      <ArrowUpRight size={17} className="decision-board-priority-arrow" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="decision-board-clear">
                  {confirmedFeedCount ? <CheckCircle2 size={28} /> : <Activity size={28} />}
                  <strong>{loading ? "Checking live feeds" : confirmedFeedCount ? `No priority exception in ${confirmedFeedCount} confirmed ${confirmedFeedCount === 1 ? "feed" : "feeds"}` : "Live feeds are unavailable"}</strong>
                  <p>{confirmedFeedCount ? "Continue through the evidence map below. Unavailable measures remain clearly marked." : "Refresh to retry the connection. No status is inferred from missing telemetry."}</p>
                </div>
              )}
            </div>

            <aside className="decision-board-context" aria-label="Executive context">
              <p className="decision-board-context-kicker">READOUT / NOW</p>
              <h2>The estate in context.</h2>
              <p>Use these measures to distinguish an isolated exception from a wider continuity risk.</p>
              <dl>
                <div><dt><Camera size={16} /> Cameras registered</dt><dd>{cameraAvailable ? formatCount(cameras.totalRegistered) : "—"}</dd></div>
                <div><dt><CircleDot size={16} /> Recording normally</dt><dd>{recordingAvailable ? formatCount(recording.recordingNormally) : "—"}</dd></div>
                <div><dt><HardDrive size={16} /> Capacity available</dt><dd>{storageAvailable ? formatBytes(storage.availableCapacityBytes) : "—"}</dd></div>
                <div><dt><Gauge size={16} /> Scale readiness</dt><dd>{capacityAvailable ? formatPercent(capacity.verifiedCompletion, 0) : "—"}</dd></div>
              </dl>
              <Link href="/reports/mis">Open executive reports <ArrowUpRight size={16} /></Link>
            </aside>
          </section>

          <section id="decision-evidence" className="decision-board-evidence" aria-label="Operational evidence">
            <div className="decision-board-section-heading">
              <div><p>EVIDENCE MAP / 02</p><h2>Follow the signal</h2><span>Each measure opens the operational workspace behind it.</span></div>
              <Link href="/reports">Build a report <ArrowUpRight size={16} /></Link>
            </div>
            <div className="decision-board-evidence-grid">
              <EvidenceCard id="executive-cameras" icon={<Camera size={20} />} label="Coverage" title="Camera estate" value={cameraAvailable ? formatPercent(cameras.availabilityPercentage) : "—"} description={cameraAvailable ? `${formatCount(cameras.online)} online · ${formatCount(cameras.offline)} offline · ${formatCount(cameras.degraded)} degraded` : "No confirmed camera availability"} href="/operations/cameras" action="Inspect cameras" progress={cameraAvailable ? cameras.availabilityPercentage : null} />
              <EvidenceCard id="executive-recording" icon={<CircleDot size={20} />} label="Continuity" title="Recording" value={recordingAvailable ? formatPercent(recording.availabilityPercentage) : "—"} description={recordingAvailable ? `${formatCount(recording.recordingNormally)} normal · ${formatCount(recording.recordingStopped)} stopped · ${formatCount(recording.recordingWithGaps)} with gaps` : "Recording telemetry unavailable"} href="/operations/recording" action="Inspect recording" progress={recordingAvailable ? recording.availabilityPercentage : null} />
              <EvidenceCard id="executive-storage" icon={<HardDrive size={20} />} label="Resilience" title="Storage" value={storageAvailable ? formatPercent(storage.utilizationPercentage, 0) : "—"} description={storageAvailable ? `${formatBytes(storage.usedCapacityBytes)} used of ${formatBytes(storage.totalCapacityBytes)} · ${formatCount(storage.criticalNodes)} critical nodes` : "Storage telemetry unavailable"} href="/operations/storage" action="Inspect storage" progress={storageAvailable ? storage.utilizationPercentage : null} reverse />
              <EvidenceCard id="executive-capacity" icon={<Gauge size={20} />} label="Readiness" title="Scale assessment" value={capacityAvailable ? formatPercent(capacity.verifiedCompletion, 0) : "—"} description={capacityAvailable ? capacity.summary : "No verified scale assessment yet"} href="/reports/benchmarking" action="Review benchmarks" progress={capacityAvailable ? capacity.verifiedCompletion : null} />
            </div>
          </section>

          <section className="decision-board-bottom">
            <article id="executive-alerts" className="decision-board-detail">
              <div className="decision-board-detail-heading"><span><AlertTriangle size={18} /></span><div><p>RISK SIGNALS</p><h2>Alert state</h2></div></div>
              <div className="decision-board-detail-grid">
                <Fact label="Active" value={alertAvailable ? alerts.totalActive : null} />
                <Fact label="Critical" value={alertAvailable ? alerts.critical : null} />
                <Fact label="Unacknowledged" value={alertAvailable ? alerts.unacknowledged : null} />
                <Fact label="SLA breached" value={alertAvailable ? alerts.slaBreached : null} />
              </div>
              <Link href="/operations/alerts">Open alert workspace <ArrowRight size={15} /></Link>
            </article>

            <article id="executive-incidents" className="decision-board-detail">
              <div className="decision-board-detail-heading"><span><ShieldAlert size={18} /></span><div><p>RESPONSE RECORD</p><h2>Recent incidents</h2></div></div>
              {incidents === null ? <p className="decision-board-detail-empty">Incident feed unavailable.</p> : incidents.length ? (
                <div className="decision-board-incident-list">
                  {incidents.slice(0, 4).map((incident, index) => (
                    <div key={incident.id ?? index}>
                      <span>{incident.incidentNumber || `Case ${index + 1}`}</span>
                      <strong>{incident.incidentType || "Incident"}</strong>
                      <small>{[incident.branchName, incident.status].filter(Boolean).join(" · ")}</small>
                    </div>
                  ))}
                </div>
              ) : <p className="decision-board-detail-empty">No recent incidents in the current feed.</p>}
              <Link href="/incidents">Open incident response <ArrowRight size={15} /></Link>
            </article>
          </section>

          <details className="decision-board-ledger">
            <summary><span><BarChart3 size={18} /> Detailed operational measures</span><span>Camera · recording · storage · scale <ArrowDownRight size={16} /></span></summary>
            <div className="decision-board-ledger-grid">
              <div><h3>Camera estate</h3><dl>
                <Measure label="Registered" value={cameraAvailable ? formatCount(cameras.totalRegistered) : "—"} />
                <Measure label="Operational" value={cameraAvailable ? formatCount(cameras.operational) : "—"} />
                <Measure label="Online" value={cameraAvailable ? formatCount(cameras.online) : "—"} />
                <Measure label="Offline" value={cameraAvailable ? formatCount(cameras.offline) : "—"} />
                <Measure label="Degraded" value={cameraAvailable ? formatCount(cameras.degraded) : "—"} />
                <Measure label="Maintenance" value={cameraAvailable ? formatCount(cameras.underMaintenance) : "—"} />
              </dl></div>
              <div><h3>Recording continuity</h3><dl>
                <Measure label="Normal" value={formatCount(recordingAvailable ? recording.recordingNormally : null)} />
                <Measure label="With gaps" value={formatCount(recordingAvailable ? recording.recordingWithGaps : null)} />
                <Measure label="Stopped" value={formatCount(recordingAvailable ? recording.recordingStopped : null)} />
                <Measure label="Verification pending" value={formatCount(recordingAvailable ? recording.verificationPending : null)} />
                <Measure label="Availability" value={recordingAvailable ? formatPercent(recording.availabilityPercentage) : "—"} />
              </dl></div>
              <div><h3>Storage capacity</h3><dl>
                <Measure label="Total" value={storageAvailable ? formatBytes(storage.totalCapacityBytes) : "—"} />
                <Measure label="Used" value={storageAvailable ? formatBytes(storage.usedCapacityBytes) : "—"} />
                <Measure label="Available" value={storageAvailable ? formatBytes(storage.availableCapacityBytes) : "—"} />
                <Measure label="Utilization" value={storageAvailable ? formatPercent(storage.utilizationPercentage, 0) : "—"} />
                <Measure label="Forecast full" value={storageAvailable && storage.forecastFullDays != null ? `${storage.forecastFullDays} days` : "—"} />
                <Measure label="Critical nodes" value={storageAvailable ? formatCount(storage.criticalNodes) : "—"} />
              </dl></div>
              <div><h3>Scale evidence</h3><dl>
                <Measure label="Status" value={capacity?.status || "—"} />
                <Measure label="Verified completion" value={capacityAvailable ? formatPercent(capacity.verifiedCompletion, 0) : "—"} />
                <Measure label="Branches" value={formatCount(capacity?.metrics?.branches)} />
                <Measure label="Cameras" value={formatCount(capacity?.metrics?.cameras)} />
                <Measure label="Load test" value={formatEvidence(capacity?.evidence?.loadTestCompleted)} />
                <Measure label="Production benchmark" value={formatEvidence(capacity?.evidence?.productionBenchmarkCompleted)} />
                <Measure label="Endurance benchmark" value={formatEvidence(capacity?.evidence?.enduranceBenchmarkCompleted)} />
                <Measure label="Failover validation" value={formatEvidence(capacity?.evidence?.failoverValidated)} />
              </dl></div>
            </div>
          </details>

          <footer className="decision-board-footer">
            <div><FileText size={20} /><span><strong>Ready to explain the outcome?</strong><small>Turn the live readout into a report with a selected scope and delivery method.</small></span></div>
            <Link href="/reports">Go to Report Studio <ArrowUpRight size={16} /></Link>
          </footer>
        </div>
      </main>
    </AppLayout>
  );
}

function Pulse({ href, label, value, note, tone }: { href: string; label: string; value: string; note: string; tone: "critical" | "warning" | "neutral" }) {
  return <a href={href} className={`decision-board-pulse-card is-${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small><ArrowUpRight size={15} /></a>;
}

function EvidenceCard({ id, icon, label, title, value, description, href, action, progress, reverse = false }: {
  id: string; icon: ReactNode; label: string; title: string; value: string; description: string;
  href: string; action: string; progress: number | null | undefined; reverse?: boolean;
}) {
  const safeProgress = typeof progress === "number" ? Math.max(0, Math.min(progress, 100)) : null;
  return <article id={id} className="decision-board-evidence-card">
    <div className="decision-board-evidence-top"><span>{icon}</span><small>{label}</small></div>
    <h3>{title}</h3><strong>{value}</strong><p>{description}</p>
    <div className="decision-board-meter" aria-hidden="true"><span style={{ width: `${safeProgress ?? 0}%` }} className={reverse ? "is-reverse" : undefined} /></div>
    <Link href={href}>{action}<ArrowUpRight size={15} /></Link>
  </article>;
}

function Fact({ label, value }: { label: string; value: number | null }) {
  return <div><span>{label}</span><strong>{formatCount(value)}</strong></div>;
}

function Measure({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function formatEvidence(value: boolean | undefined) {
  return value === undefined ? "—" : value ? "Verified" : "Not verified";
}
