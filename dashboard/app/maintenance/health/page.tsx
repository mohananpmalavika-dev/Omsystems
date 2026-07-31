"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Database,
  Gauge,
  LoaderCircle,
  Network,
  Power,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Wifi,
  Wrench,
  X,
} from "lucide-react";

const API_BASE = "/api/control/v1/maintenance";

type HealthSummary = {
  healthPercentage?: number;
  camerasOnline?: number;
  camerasOffline?: number;
  camerasDegraded?: number;
  camerasCount?: number;
  storageCritical?: number;
  storageWarning?: number;
  storageTotal?: number;
  networkCritical?: number;
  networkWarning?: number;
  networkTotal?: number;
  upsCritical?: number;
  upsWarning?: number;
  upsTotal?: number;
  overdueVisits?: number;
  overdueMaintenanceCount?: number;
  openWorkOrders?: number;
};

type DashboardStatus = {
  totalAssets?: number;
  assetsOnline?: number;
  assetsOffline?: number;
  assetsDegraded?: number;
  workOrdersOpen?: number;
  workOrdersOverdueSla?: number;
  visitsPending?: number;
  visitsOverdue?: number;
  criticalAlerts?: number;
  warningAlerts?: number;
};

type FleetAsset = {
  id: string;
  name?: string;
  model?: string;
  status?: string;
  lastCheck?: string;
  lastCheckAt?: string;
  usagePercentage?: number;
  latencyMs?: number;
  packetLoss?: number;
  batteryHealthPercent?: number;
};

type HealthAlert = {
  id: string;
  severity?: string;
  title?: string;
  message?: string;
  description?: string;
  category?: string;
  type?: string;
  createdAt?: string;
  created_at?: string;
};

type Collector = {
  running?: boolean;
  collectors?: string[];
  lastRunAt?: string;
  last_run_at?: string;
};

type LoadResult = {
  value: unknown;
  name: string;
};

export default function HealthMonitoringPage() {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [dashboardStatus, setDashboardStatus] = useState<DashboardStatus | null>(null);
  const [cameras, setCameras] = useState<FleetAsset[]>([]);
  const [storage, setStorage] = useState<FleetAsset[]>([]);
  const [network, setNetwork] = useState<FleetAsset[]>([]);
  const [power, setPower] = useState<FleetAsset[]>([]);
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [collector, setCollector] = useState<Collector | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkRunning, setCheckRunning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unavailableSources, setUnavailableSources] = useState<string[]>([]);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);

    const requests: Array<{ name: string; url: string }> = [
      { name: "health summary", url: `${API_BASE}/dashboard/health` },
      { name: "asset status", url: `${API_BASE}/dashboard/status` },
      { name: "camera signals", url: `${API_BASE}/health/cameras?limit=100` },
      { name: "storage signals", url: `${API_BASE}/health/storage` },
      { name: "network signals", url: `${API_BASE}/health/network` },
      { name: "power signals", url: `${API_BASE}/health/power` },
      { name: "active alerts", url: `${API_BASE}/alerts?status=active&limit=8` },
      { name: "collector status", url: `${API_BASE}/health/collector/status` },
    ];
    const results = await Promise.allSettled(requests.map(async ({ name, url }): Promise<LoadResult> => ({ name, value: await request(url) })));
    const resolved = new Map<string, unknown>();
    const unavailable: string[] = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") resolved.set(result.value.name, result.value.value);
      else unavailable.push(requests[index].name);
    });

    const healthSummary = resolved.get("health summary");
    const assetStatus = resolved.get("asset status");
    const cameraData = resolved.get("camera signals");
    const storageData = resolved.get("storage signals");
    const networkData = resolved.get("network signals");
    const powerData = resolved.get("power signals");
    const alertData = resolved.get("active alerts");
    const collectorData = resolved.get("collector status");

    if (healthSummary) setSummary(healthSummary as HealthSummary);
    if (assetStatus) setDashboardStatus(assetStatus as DashboardStatus);
    if (cameraData) setCameras(dataItems<FleetAsset>(cameraData));
    if (storageData) setStorage(dataItems<FleetAsset>(storageData));
    if (networkData) setNetwork(dataItems<FleetAsset>(networkData));
    if (powerData) setPower(dataItems<FleetAsset>(powerData));
    if (alertData) setAlerts(dataItems<HealthAlert>(alertData));
    if (collectorData) setCollector(collectorData as Collector);

    setUnavailableSources(unavailable);
    setLastUpdated(new Date());
    if (!resolved.size) setError("Health data could not be loaded. Confirm the control-plane connection, then refresh this workspace.");
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load(true);
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const runHealthCheck = async () => {
    setCheckRunning(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${API_BASE}/health/check/run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentType: "all" }),
      });
      if (!response.ok) throw new Error("health_check_not_accepted");
      setNotice("A full health check has been queued. This workspace will refresh automatically as results arrive.");
      window.setTimeout(() => void load(), 1_800);
    } catch {
      setError("The health check could not be started. Verify your access and try again.");
    } finally {
      setCheckRunning(false);
    }
  };

  const attentionCount = useMemo(() => {
    const fromAssets = (dashboardStatus?.assetsOffline ?? 0) + (dashboardStatus?.assetsDegraded ?? 0);
    const fromCameras = (summary?.camerasOffline ?? 0) + (summary?.camerasDegraded ?? 0);
    return fromAssets || fromCameras;
  }, [dashboardStatus, summary]);
  const healthScore = clamp(summary?.healthPercentage ?? (attentionCount ? 0 : 100), 0, 100);
  const openWorkOrders = dashboardStatus?.workOrdersOpen ?? summary?.openWorkOrders ?? 0;
  const overdueWork = dashboardStatus?.workOrdersOverdueSla ?? dashboardStatus?.visitsOverdue ?? summary?.overdueVisits ?? summary?.overdueMaintenanceCount ?? 0;
  const displayedAlerts = alerts.length ? alerts : [];
  const liveAssets = dashboardStatus?.assetsOnline ?? summary?.camerasOnline ?? cameras.filter((asset) => isHealthy(asset.status)).length;
  const totalAssets = dashboardStatus?.totalAssets ?? summary?.camerasCount ?? cameras.length + storage.length + power.length;

  return (
    <main className="mx-auto max-w-[1520px] space-y-6 px-5 py-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white shadow-xl shadow-slate-950/10">
        <div className="relative px-6 py-7 sm:px-8">
          <div className="absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_center,rgba(20,184,166,.22),transparent_65%)]" />
          <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div className="max-w-2xl">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-teal-300"><Activity size={14} /> Fleet operations</div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Device health, made actionable.</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">A live operational snapshot of camera, storage, network, and power readiness. Run checks, spot risk, and focus the maintenance team on what needs attention.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void load()} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/15 disabled:opacity-50"><RefreshCw size={15} className={refreshing || loading ? "animate-spin" : ""} />Refresh snapshot</button>
              <button type="button" onClick={() => void runHealthCheck()} disabled={checkRunning} className="inline-flex items-center gap-2 rounded-lg bg-teal-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:opacity-50"><ClipboardCheck size={16} />{checkRunning ? "Starting check..." : "Run health check"}</button>
            </div>
          </div>
        </div>
      </section>

      {error && <Banner tone="error" text={error} onDismiss={() => setError(null)} />}
      {notice && <Banner tone="success" text={notice} onDismiss={() => setNotice(null)} />}
      {!!unavailableSources.length && <Banner tone="notice" text={`${unavailableSources.map(humanize).join(", ")} ${unavailableSources.length === 1 ? "is" : "are"} unavailable. The rest of the workspace reflects the latest signals received.`} onDismiss={() => setUnavailableSources([])} />}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Fleet health" value={`${healthScore}%`} detail={healthScore >= 95 ? "Operating within target" : "Review the affected fleet"} icon={Gauge} tone={healthScore >= 95 ? "green" : healthScore >= 80 ? "amber" : "red"} />
        <MetricCard label="Live assets" value={liveAssets.toLocaleString()} detail={totalAssets ? `of ${totalAssets.toLocaleString()} reported assets` : "No assets reported yet"} icon={CheckCircle2} tone="blue" />
        <MetricCard label="Needs attention" value={attentionCount.toLocaleString()} detail={attentionCount ? "Offline or degraded assets" : "No reported issues"} icon={attentionCount ? AlertTriangle : ShieldCheck} tone={attentionCount ? "red" : "green"} />
        <MetricCard label="Open work orders" value={openWorkOrders.toLocaleString()} detail={overdueWork ? `${overdueWork} overdue for action` : "No overdue maintenance"} icon={Wrench} tone={overdueWork ? "amber" : "violet"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.85fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.15em] text-teal-700">Current posture</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Fleet readiness</h2>
              <p className="mt-1 text-sm text-slate-500">Reported state from the latest available device and service checks.</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">Last refreshed</span>
              <span className="mt-0.5 block text-sm font-semibold text-slate-700">{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Connecting..."}</span>
            </div>
          </div>

          {loading ? <LoadingState label="Loading fleet signals" /> : <>
            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3"><div><span className="text-sm font-semibold text-slate-800">Overall readiness</span><p className="mt-1 text-xs text-slate-500">Calculated from the control plane&apos;s current health summary.</p></div><strong className="text-2xl tracking-tight text-slate-900">{healthScore}%</strong></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${healthScore >= 95 ? "bg-emerald-500" : healthScore >= 80 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${healthScore}%` }} /></div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <SystemRow icon={Camera} title="Camera estate" status={cameraStatus(summary, cameras)} detail={`${numberValue(summary?.camerasOnline, cameras.filter((asset) => isHealthy(asset.status)).length)} online${summary?.camerasCount ? ` of ${summary.camerasCount}` : ""}`} meta={`${numberValue(summary?.camerasOffline) + numberValue(summary?.camerasDegraded)} require review`} />
              <SystemRow icon={Database} title="Storage capacity" status={componentStatus(summary?.storageCritical, summary?.storageWarning, storage)} detail={storage.length ? `${storage.length} monitored storage devices` : "No storage devices reporting"} meta={storage.length ? storageCapacityDetail(storage) : "Awaiting device telemetry"} />
              <SystemRow icon={Network} title="Network connectivity" status={componentStatus(summary?.networkCritical, summary?.networkWarning, network)} detail={network.length ? `${network.length} monitored network links` : "No network links reporting"} meta={network.length ? networkDetail(network) : "Awaiting network telemetry"} />
              <SystemRow icon={Power} title="Power continuity" status={componentStatus(summary?.upsCritical, summary?.upsWarning, power)} detail={power.length ? `${power.length} monitored power devices` : "No UPS devices reporting"} meta={power.length ? powerDetail(power) : "Awaiting power telemetry"} />
            </div>
          </>}
        </div>

        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-5">
            <div><p className="text-xs font-bold uppercase tracking-[.15em] text-rose-600">Priority queue</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Active alerts</h2></div>
            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">{displayedAlerts.length}</span>
          </div>
          <div className="p-3">
            {loading ? <LoadingState label="Loading alerts" compact /> : displayedAlerts.length ? displayedAlerts.map((alert) => <AlertItem key={alert.id} alert={alert} />) : <div className="grid min-h-64 place-items-center px-5 py-8 text-center"><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><ShieldCheck size={21} /></span><h3 className="mt-4 font-semibold text-slate-900">No active alerts</h3><p className="mt-2 text-sm leading-5 text-slate-500">The alert service has not reported an active maintenance issue.</p></div></div>}
          </div>
        </aside>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-violet-700">Control services</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Signal collection</h2><p className="mt-1 text-sm text-slate-500">Health checks are evaluated on the control plane; this view never fabricates a historical trend when telemetry is absent.</p></div><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${collector?.running ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}><ServerCog size={19} /></span></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><ServiceStatus label="Health collector" value={collector?.running ? "Running" : "Status unavailable"} detail={collector?.collectors?.length ? `${collector.collectors.length} collection services registered` : "Refresh after collector initialization"} good={Boolean(collector?.running)} /><ServiceStatus label="Alert engine" value={unavailableSources.includes("active alerts") ? "Status unavailable" : "Connected"} detail={unavailableSources.includes("active alerts") ? "The alert service did not respond" : `${displayedAlerts.length} active items in the queue`} good={!unavailableSources.includes("active alerts")} /></div>
        </div>
        <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-50 p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3 text-teal-700"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm"><ClipboardCheck size={19} /></span><span className="text-xs font-bold uppercase tracking-[.15em]">Operations ready</span></div><h2 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">Keep the next action clear.</h2><p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">Run a comprehensive check to update available device signals. The workspace will automatically refresh and preserve partial results if an individual service is offline.</p><button type="button" onClick={() => void runHealthCheck()} disabled={checkRunning} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">{checkRunning ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}{checkRunning ? "Starting check..." : "Run comprehensive check"}</button></div>
      </section>
    </main>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string | number; detail: string; icon: LucideIcon; tone: "blue" | "green" | "red" | "amber" | "violet" }) {
  const colors = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", red: "bg-rose-50 text-rose-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700" };
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><span className="text-sm font-medium text-slate-500">{label}</span><span className={`grid h-9 w-9 place-items-center rounded-lg ${colors[tone]}`}><Icon size={18} /></span></div><strong className="mt-4 block text-2xl tracking-tight text-slate-900">{value}</strong><span className="mt-1 block text-xs text-slate-400">{detail}</span></article>;
}

function SystemRow({ icon: Icon, title, status, detail, meta }: { icon: LucideIcon; title: string; status: string; detail: string; meta: string }) {
  const good = isHealthy(status);
  const critical = isCritical(status);
  return <article className="rounded-xl border border-slate-200 p-4"><div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${good ? "bg-emerald-50 text-emerald-600" : critical ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}><Icon size={18} /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">{title}</h3><StatusBadge value={status} /></div><p className="mt-2 text-sm text-slate-600">{detail}</p><p className="mt-1 truncate text-xs text-slate-400">{meta}</p></div></div></article>;
}

function ServiceStatus({ label, value, detail, good }: { label: string; value: string; detail: string; good: boolean }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2"><i className={`h-2 w-2 rounded-full ${good ? "bg-emerald-500" : "bg-amber-500"}`} /><span className="text-sm font-semibold text-slate-800">{label}</span></div><strong className="mt-3 block text-lg text-slate-900">{value}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>;
}

function AlertItem({ alert }: { alert: HealthAlert }) {
  const critical = (alert.severity ?? "").toLowerCase() === "critical";
  const title = alert.title ?? alert.message ?? alert.description ?? humanize(alert.type ?? alert.category ?? "Maintenance alert");
  return <article className="rounded-xl p-3 transition hover:bg-slate-50"><div className="flex gap-3"><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${critical ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}>{critical ? <CircleAlert size={16} /> : <AlertTriangle size={16} />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="line-clamp-1 text-sm font-semibold text-slate-800">{title}</h3><StatusBadge value={alert.severity ?? "warning"} /></div><p className="mt-1 text-xs text-slate-400">{formatDate(alert.createdAt ?? alert.created_at)}</p></div></div></article>;
}

function Banner({ tone, text, onDismiss }: { tone: "error" | "success" | "notice"; text: string; onDismiss: () => void }) {
  const styles = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800";
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? CircleAlert : Wifi;
  return <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}><Icon size={18} /><span className="flex-1">{text}</span><button type="button" onClick={onDismiss} className="rounded p-1 hover:bg-black/5" aria-label="Dismiss"><X size={16} /></button></div>;
}

function LoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={`grid place-items-center text-sm text-slate-500 ${compact ? "min-h-48" : "min-h-72"}`}><span className="inline-flex items-center gap-3"><LoaderCircle size={20} className="animate-spin text-teal-600" />{label}</span></div>;
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = isHealthy(normalized) ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : isCritical(normalized) ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200";
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold capitalize ring-1 ring-inset ${tone}`}><i className={`h-1.5 w-1.5 rounded-full ${isHealthy(normalized) ? "bg-emerald-500" : isCritical(normalized) ? "bg-rose-500" : "bg-amber-500"}`} />{humanize(value)}</span>;
}

async function request(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(`request_failed_${response.status}`);
  return response.json();
}

function dataItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && "data" in payload && Array.isArray((payload as { data?: unknown }).data)) return (payload as { data: T[] }).data;
  return [];
}

function numberValue(value: number | undefined, fallback = 0) { return Number.isFinite(value) ? value ?? 0 : fallback; }
function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), max); }
function isHealthy(value?: string) { return ["healthy", "online", "operational", "active", "running", "connected"].includes((value ?? "unknown").toLowerCase()); }
function isCritical(value?: string) { return ["critical", "offline", "error", "failed"].includes((value ?? "unknown").toLowerCase()); }
function humanize(value: string) { return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value?: string) { if (!value) return "Reported just now"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Recent signal" : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function cameraStatus(summary: HealthSummary | null, assets: FleetAsset[]) { if (numberValue(summary?.camerasOffline) > 0) return "offline"; if (numberValue(summary?.camerasDegraded) > 0 || assets.some((asset) => !isHealthy(asset.status))) return "degraded"; return "healthy"; }
function componentStatus(critical?: number, warning?: number, assets: FleetAsset[] = []) { if (numberValue(critical) > 0 || assets.some((asset) => isCritical(asset.status))) return "critical"; if (numberValue(warning) > 0 || assets.some((asset) => !isHealthy(asset.status))) return "warning"; return assets.length ? "healthy" : "unknown"; }
function storageCapacityDetail(assets: FleetAsset[]) { const values = assets.map((asset) => asset.usagePercentage).filter((value): value is number => typeof value === "number"); return values.length ? `${Math.max(...values)}% highest reported capacity use` : "Capacity telemetry not reported"; }
function networkDetail(assets: FleetAsset[]) { const values = assets.map((asset) => asset.latencyMs).filter((value): value is number => typeof value === "number"); return values.length ? `${Math.max(...values)} ms highest reported latency` : "Latency telemetry not reported"; }
function powerDetail(assets: FleetAsset[]) { const values = assets.map((asset) => asset.batteryHealthPercent).filter((value): value is number => typeof value === "number"); return values.length ? `${Math.min(...values)}% lowest reported battery health` : "Battery telemetry not reported"; }
