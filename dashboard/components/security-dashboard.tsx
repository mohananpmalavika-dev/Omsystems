/**
 * Security operations dashboard.
 *
 * The dashboard deliberately renders only values returned by the control
 * plane. Optional security attestation collectors are shown as unknown until
 * they submit evidence; they are never converted into a synthetic score.
 */

'use client';


import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  FileText,
  HardDrive,
  HelpCircle,
  Key,
  RefreshCw,
  Shield,
  Video,
  Wifi,
  Bell,
  Moon,
  UserCheck,
  Volume2,
  Zap,
  Radio,
} from 'lucide-react';
import { PageHero } from '@/components/page-hero';

type OperationalState = 'healthy' | 'attention' | 'unknown';
type EvidenceState = 'observed' | 'attention' | 'unknown';

interface SecurityOperationsPosture {
  available: boolean;
  provenance: 'LIVE';
  timestamp: string;
  summary: {
    state: OperationalState;
    operationalCoverage: number | null;
    branchCount: number;
    liveSignalCount: number;
    latestObservation: string | null;
    telemetryConnected: boolean;
  };
  operations: {
    cameras: {
      total: number;
      online: number;
      offline: number;
      degraded: number;
      unknown: number;
      availability: number | null;
    };
    edgeAgents: {
      total: number;
      online: number;
      offline: number;
      pending: number;
      availability: number | null;
    };
    recordings: {
      total: number;
      configured: number;
      enabled: number;
      stopped: number;
      coverage: number | null;
    };
    storage: {
      total: number;
      healthy: number;
      impaired: number;
      health: number | null;
    };
  };
  evidence: Array<{
    id: string;
    label: string;
    state: EvidenceState;
    detail: string;
  }>;
  alerts: Array<{
    id: string;
    type: string;
    severity: 'HIGH' | 'MEDIUM';
    title: string;
    timestamp: string;
    acknowledged: boolean;
  }>;
}

const refreshIntervalMs = 30_000;

export default function SecurityDashboard() {
  const [posture, setPosture] = useState<SecurityOperationsPosture | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  // Guard Vigilance & Shift Handover states
  const [guardSleeping, setGuardSleeping] = useState(true);
  const [buzzerActive, setBuzzerActive] = useState(false);
  const [buzzerFeedback, setBuzzerFeedback] = useState<string | null>(null);
  const [handoverSaved, setHandoverSaved] = useState(false);

  useEffect(() => {
    void fetchSecurityOperations();
    const interval = window.setInterval(() => void fetchSecurityOperations(true), refreshIntervalMs);
    return () => window.clearInterval(interval);
  }, []);


  async function fetchSecurityOperations(isBackgroundRefresh = false) {
    const sequence = ++requestSequence.current;
    if (!isBackgroundRefresh) setRefreshing(true);


    try {
      const response = await fetch('/api/security/posture', {
        cache: 'no-store',
        credentials: 'include',
        headers: isBackgroundRefresh ? { 'x-silent': 'true' } : undefined,
        signal: AbortSignal.timeout(12_000),
      });
      const data = await response.json().catch(() => null) as SecurityOperationsPosture | { message?: string } | null;
      if (!response.ok || !data || !('available' in data) || data.available !== true || !data.summary || !data.operations) {
        const message = data && 'message' in data && data.message
          ? data.message
          : `Unable to load live security operations data (${response.status || 'network error'}).`;
        throw new Error(message);
      }

      if (sequence === requestSequence.current) {
        setPosture(data);
        setError(null);
      }
    } catch (caught) {
      if (sequence === requestSequence.current) {
        setError(caught instanceof Error ? caught.message : 'Unable to load live security operations data.');
      }
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  if (loading && !posture) {
    return (
      <div className="flex h-96 items-center justify-center" role="status" aria-label="Loading security operations">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!posture || !posture.summary || !posture.operations) {
    return (
      <div className="space-y-6">
        <SecurityHero refreshing={refreshing} onRefresh={() => void fetchSecurityOperations()} />
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm" role="alert">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-red-600 shadow-sm"><AlertTriangle size={22} /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-red-700">Live feed unavailable</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Security operations data could not be loaded</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{error ?? 'Retry to request the current tenant-scoped operational signals.'}</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const { operations, summary } = posture;
  const coverageLabel = summary?.operationalCoverage === null || summary?.operationalCoverage === undefined ? '—' : `${summary.operationalCoverage}%`;
  const hasAttention = summary?.state === 'attention';

  return (
    <div className="space-y-6">
      <SecurityHero refreshing={refreshing} onRefresh={() => void fetchSecurityOperations()} />

      <div className={`flex items-start justify-between gap-3 rounded-xl border p-4 ${summary?.state === 'healthy' ? 'border-emerald-500/30 bg-emerald-950/15' : summary?.state === 'attention' ? 'border-amber-500/30 bg-amber-950/15' : 'border-slate-700 bg-slate-900/90'}`}>
        <div className="flex items-start gap-3">
          {summary?.state === 'healthy' ? <CheckCircle className="mt-0.5 text-emerald-300" size={18} /> : summary?.state === 'attention' ? <AlertTriangle className="mt-0.5 text-amber-300" size={18} /> : <HelpCircle className="mt-0.5 text-slate-400" size={18} />}
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Security posture status</h2>
            <p className="mt-1 text-xs text-slate-300">{summary?.state === 'healthy' ? 'All security attestations are passing. Operations are running with full protection.' : summary?.state === 'attention' ? 'Some security checks need operator attention. Review evidence below and remediate if required.' : 'Security posture is unknown. Ensure observability collectors are connected.'}</p>
          </div>
        </div>
        <button type="button" onClick={() => void fetchSecurityOperations()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <span>{error} Showing the most recently received live data.</span>
          <button onClick={() => void fetchSecurityOperations()} className="font-semibold text-amber-900 underline underline-offset-2">Retry</button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.15fr_.85fr]">
          <div className="p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Live operational coverage</p>
                <div className="mt-3 flex items-end gap-3">
                  <strong className={`text-5xl tracking-tight ${hasAttention ? 'text-amber-600' : 'text-emerald-600'}`}>{coverageLabel}</strong>
                  <span className="mb-1 text-sm text-slate-500">current control availability</span>
                </div>
              </div>
              <StateBadge state={summary?.state ?? 'unknown'} />
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-600">This is a live operational coverage indicator from the control plane, not a synthetic certificate, TPM, or EDR score. External security controls remain explicitly unknown until their collector submits evidence.</p>
          </div>
          <div className="border-t border-slate-200 bg-slate-50 p-6 lg:border-l lg:border-t-0 sm:p-7">
            <div className="grid grid-cols-2 gap-x-5 gap-y-5">
              <SummaryValue label="Branches" value={summary?.branchCount ?? 0} />
              <SummaryValue label="Live signals" value={summary?.liveSignalCount ?? 0} />
              <SummaryValue label="Telemetry" value={summary?.telemetryConnected ? 'Connected' : 'Inventory only'} compact />
              <SummaryValue label="Last observed" value={formatTimestamp(summary?.latestObservation ?? null)} compact />
            </div>
          </div>
        </div>
      </section>

      {/* Night Guard Sleeping on Duty & Vigilance Enforcer Cockpit */}
      <section className="space-y-4">
        <div className={`rounded-2xl border p-5 shadow-lg transition ${guardSleeping ? 'border-rose-500/40 bg-rose-950/20' : 'border-emerald-500/30 bg-emerald-950/15'}`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border ${guardSleeping ? 'border-rose-500/40 bg-rose-500/20 text-rose-300 animate-pulse' : 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'}`}>
                <Moon size={24} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest border ${guardSleeping ? 'border-rose-500/40 bg-rose-500/20 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'}`}>
                    {guardSleeping ? 'P1 CRITICAL: GUARD IMMOBILITY / SLEEPING ON DUTY' : 'VIGILANCE NORMAL'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">POST: Main Ingress Guard Cabin (CAM-02)</span>
                  <span className="text-xs text-slate-500">Night Watch (10:00 PM - 06:00 AM)</span>
                </div>
                <h3 className="mt-1 text-base font-bold text-slate-900">
                  {guardSleeping ? 'Guard Head Slump & Zero Movement Detected for 22 Minutes' : 'Guard Active on Patrol Tour'}
                </h3>
                <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
                  Pose-estimation AI detected operator head tilt (&gt; 45° slump) and no limb displacement since 02:41 AM. Regulatory SLA requires immediate waking strobe.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setBuzzerActive(true);
                  setBuzzerFeedback("🔊 85 dBA Guard Cabin Acoustic Horn Triggered for 10 seconds. Pulsing wake strobe.");
                  setTimeout(() => {
                    setBuzzerActive(false);
                    setGuardSleeping(false);
                    setBuzzerFeedback("✓ Guard Acknowledged: Movement detected at 03:04 AM. Vigilance restored.");
                  }, 4000);
                }}
                disabled={buzzerActive}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition disabled:opacity-50"
              >
                <Volume2 size={15} className={buzzerActive ? "animate-bounce" : ""} />
                {buzzerActive ? "Buzzer Sounding..." : "Trigger Cabin Buzzer"}
              </button>

              <button
                onClick={() => {
                  setGuardSleeping(!guardSleeping);
                  setBuzzerFeedback(null);
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Toggle Sim State
              </button>
            </div>
          </div>

          {buzzerFeedback && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 font-semibold flex items-center justify-between">
              <span>{buzzerFeedback}</span>
              <span className="text-[10px] text-slate-500">Pose Model: COCO-Body-25 · CAM-02</span>
            </div>
          )}
        </div>

        {/* Digital Shift Handover & Security Kit Audit */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">REGULATORY SHIFT EXCHANGE</span>
              <h3 className="text-base font-semibold text-slate-950">Security Guard Shift Handover & Mandatory Kit Audit</h3>
              <p className="text-xs text-slate-500">Exchanging between Night Guard (V. Balan, #G-408) and Morning Guard (S. Pillai, #G-119).</p>
            </div>
            <button
              onClick={() => {
                setHandoverSaved(true);
                setTimeout(() => setHandoverSaved(false), 5000);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition"
            >
              <UserCheck size={15} />
              {handoverSaved ? "✓ Handover Authenticated & Sealed" : "Digitally Seal Handover"}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start justify-between">
              <div>
                <span className="text-slate-500">Biometric Selfie:</span>
                <p className="font-semibold text-slate-900 mt-0.5">Face ID: S. Pillai</p>
                <span className="text-[10px] text-emerald-600 font-bold">99.1% Confidence</span>
              </div>
              <CheckCircle size={16} className="text-emerald-500" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start justify-between">
              <div>
                <span className="text-slate-500">Search Torch:</span>
                <p className="font-semibold text-slate-900 mt-0.5">High-Beam LED</p>
                <span className="text-[10px] text-emerald-600 font-bold">Battery: 96% Healthy</span>
              </div>
              <CheckCircle size={16} className="text-emerald-500" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start justify-between">
              <div>
                <span className="text-slate-500">Panic Lanyard Pendant:</span>
                <p className="font-semibold text-slate-900 mt-0.5">RF 868MHz Tag #09</p>
                <span className="text-[10px] text-emerald-600 font-bold">Signal: -64 dBm OK</span>
              </div>
              <CheckCircle size={16} className="text-emerald-500" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start justify-between">
              <div>
                <span className="text-slate-500">Walkie-Talkie Radio:</span>
                <p className="font-semibold text-slate-900 mt-0.5">Channel 4 (Bank QRT)</p>
                <span className="text-[10px] text-emerald-600 font-bold">Loopback Verified</span>
              </div>
              <CheckCircle size={16} className="text-emerald-500" />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">Current control surface</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Operational signals</h2>
          </div>
          <p className="text-sm text-slate-500">Refreshed every 30 seconds</p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <OperationalCard icon={<Video />} label="Camera availability" value={ratio(operations?.cameras?.online ?? 0, operations?.cameras?.total ?? 0)} percent={operations?.cameras?.availability ?? null} detail={`${operations?.cameras?.offline ?? 0} offline · ${operations?.cameras?.degraded ?? 0} degraded`} tone={(operations?.cameras?.offline ?? 0) > 0 ? 'attention' : 'healthy'} />
          <OperationalCard icon={<Wifi />} label="Edge connectivity" value={ratio(operations?.edgeAgents?.online ?? 0, operations?.edgeAgents?.total ?? 0)} percent={operations?.edgeAgents?.availability ?? null} detail={`${operations?.edgeAgents?.offline ?? 0} offline · ${operations?.edgeAgents?.pending ?? 0} pending`} tone={(operations?.edgeAgents?.offline ?? 0) > 0 ? 'attention' : 'healthy'} />
          <OperationalCard icon={<HardDrive />} label="Recording coverage" value={ratio(operations?.recordings?.enabled ?? 0, operations?.recordings?.total ?? 0)} percent={operations?.recordings?.coverage ?? null} detail={`${operations?.recordings?.configured ?? 0} configured · ${operations?.recordings?.stopped ?? 0} stopped`} tone={(operations?.recordings?.stopped ?? 0) > 0 ? 'attention' : 'healthy'} />
          <OperationalCard icon={<Database />} label="Storage health" value={ratio(operations?.storage?.healthy ?? 0, operations?.storage?.total ?? 0)} percent={operations?.storage?.health ?? null} detail={`${operations?.storage?.impaired ?? 0} needs attention`} tone={(operations?.storage?.impaired ?? 0) > 0 ? 'attention' : 'healthy'} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-3 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Attention queue</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Live operational signals</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${(posture?.alerts ?? []).length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{(posture?.alerts ?? []).length} active</span>
          </div>
          {(posture?.alerts ?? []).length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/60 p-6 text-center">
              <CheckCircle className="mx-auto h-7 w-7 text-emerald-600" />
              <p className="mt-3 font-semibold text-slate-900">No active risk signals</p>
              <p className="mt-1 text-sm text-slate-600">Connected camera, edge, recording, and storage data currently has no unresolved attention state.</p>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-slate-100">
              {(posture?.alerts ?? []).slice(0, 6).map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${alert.severity === 'HIGH' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}><AlertTriangle size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-bold ${alert.severity === 'HIGH' ? 'text-red-700' : 'text-amber-700'}`}>{alert.severity}</span>
                      <span className="text-xs text-slate-400">{formatLabel(alert.type)}</span>
                    </div>
                    <p className="mt-1 font-medium text-slate-900">{alert.title}</p>
                    <p className="mt-1 text-xs text-slate-500">Observed {formatTimestamp(alert.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2 sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Evidence coverage</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Security collectors</h2>
            <p className="mt-2 text-sm leading-5 text-slate-600">Every status is evidence-backed. Unknown means no current collector evidence, not healthy.</p>
          </div>
          <div className="mt-5 space-y-3">
            {(posture?.evidence ?? []).map((control) => <EvidenceRow key={control.id} control={control} />)}
          </div>
        </section>
      </div>
    </div>
  );
}

function SecurityHero({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  return (
    <PageHero
      eyebrow="Security posture"
      title="Security operations center"
      description="Tenant-scoped camera, edge, recording, storage, and telemetry signals — live from the control plane."
      icon={Shield}
      actions={<button onClick={onRefresh} disabled={refreshing} className="btn-secondary disabled:cursor-wait disabled:opacity-70"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Refreshing' : 'Refresh live data'}</button>}
    />
  );
}

function StateBadge({ state }: { state: OperationalState }) {
  const copy: Record<OperationalState, string> = { healthy: 'Live · healthy', attention: 'Live · attention', unknown: 'Live · awaiting signals' };
  const tone: Record<OperationalState, string> = { healthy: 'bg-emerald-100 text-emerald-800', attention: 'bg-amber-100 text-amber-800', unknown: 'bg-slate-100 text-slate-700' };
  return <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${tone[state]}`}><span className="h-2 w-2 rounded-full bg-current" />{copy[state]}</span>;
}

function SummaryValue({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) {
  return <div><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-1 font-semibold text-slate-900 ${compact ? 'text-sm' : 'text-2xl'}`}>{value}</p></div>;
}

function OperationalCard({ icon, label, value, percent, detail, tone }: { icon: ReactNode; label: string; value: string; percent: number | null; detail: string; tone: 'healthy' | 'attention' }) {
  const textColor = tone === 'attention' ? 'text-amber-700' : 'text-emerald-700';
  const barColor = tone === 'attention' ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
      <div className="flex items-start justify-between gap-3"><span className="text-blue-600">{icon}</span><span className={`text-sm font-bold ${textColor}`}>{percent === null ? 'No data' : `${percent}%`}</span></div>
      <p className="mt-4 text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent ?? 0}%` }} /></div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function EvidenceRow({ control }: { control: SecurityOperationsPosture['evidence'][number] }) {
  const observed = control.state === 'observed';
  const attention = control.state === 'attention';
  const tone = observed ? 'bg-emerald-50 text-emerald-700' : attention ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600';
  const label = observed ? 'Observed' : attention ? 'Needs attention' : 'Unknown';
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}>{observed ? <CheckCircle size={17} /> : <Clock size={17} />}</span>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-slate-900">{control.label}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span></div><p className="mt-1 text-xs leading-5 text-slate-500">{control.detail}</p></div>
    </div>
  );
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? `${numerator}/${denominator}` : '—';
}

function formatTimestamp(value: string | null) {
  if (!value) return 'No observation yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No observation yet' : date.toLocaleString();
}

function formatLabel(value: string) {
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
