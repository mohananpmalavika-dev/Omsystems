"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Globe2,
  LoaderCircle,
  PlugZap,
  Plus,
  Power,
  RefreshCw,
  Search,
  Send,
  ServerCog,
  ShieldCheck,
  Wifi,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";

const API_BASE = "/api/control/v1/integrations";

type Integration = {
  id: string;
  name: string;
  type: string;
  category: string;
  status: "active" | "inactive" | "error" | "testing" | string;
  enabled: boolean;
  subscribedEvents?: string[];
  lastSuccessAt?: string | null;
  lastErrorAt?: string | null;
  lastError?: string | null;
};

type Connector = {
  type: string;
  category: string;
  name: string;
  description: string;
  version?: string;
  configSchema?: { requiredFields?: string[]; secrets?: string[] };
};

type IntegrationHealth = {
  id?: string;
  connector_id?: string;
  name?: string;
  connector_type?: string;
  health?: string;
  health_status?: string;
  status?: string;
  queueDepth?: number;
  queue_depth?: number;
  last_successful_event_at?: string | null;
  lastSuccessAt?: string | null;
  events_received_count?: number;
  events_failed_count?: number;
  average_latency_ms?: number;
};

type Delivery = {
  id: string;
  event_type?: string;
  timestamp?: string;
  success?: boolean;
  error?: string | null;
  retry_count?: number;
  external_url?: string | null;
};

type Workspace = "connectors" | "activity" | "catalog" | "health";

const workspaceTabs: Array<{ id: Workspace; label: string; icon: typeof PlugZap }> = [
  { id: "connectors", label: "Configured connectors", icon: PlugZap },
  { id: "activity", label: "Delivery activity", icon: Activity },
  { id: "catalog", label: "Connector catalog", icon: Boxes },
  { id: "health", label: "Health & queues", icon: ServerCog },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [catalog, setCatalog] = useState<Connector[]>([]);
  const [health, setHealth] = useState<IntegrationHealth[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [workspace, setWorkspace] = useState<Workspace>("connectors");
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [integrationsResult, catalogResult, healthResult] = await Promise.allSettled([
      fetchData<Integration[]>(API_BASE),
      fetchData<Connector[]>(`${API_BASE}/connectors`),
      fetchData<IntegrationHealth[]>(`${API_BASE}/health`),
    ]);

    if (integrationsResult.status === "fulfilled") {
      setIntegrations(integrationsResult.value);
      setSelectedId((current) => current || integrationsResult.value[0]?.id || "");
    } else {
      setError("Connector data could not be loaded. Check the control-plane connection and try again.");
    }
    if (catalogResult.status === "fulfilled") setCatalog(catalogResult.value);
    if (healthResult.status === "fulfilled") setHealth(healthResult.value);
    setLoading(false);
  }, []);

  const loadActivity = useCallback(async () => {
    if (!selectedId) {
      setDeliveries([]);
      return;
    }
    setLoadingActivity(true);
    try {
      setDeliveries(await fetchData<Delivery[]>(`${API_BASE}/${encodeURIComponent(selectedId)}/events`));
    } catch {
      setDeliveries([]);
    } finally {
      setLoadingActivity(false);
    }
  }, [selectedId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (workspace === "activity") void loadActivity();
  }, [loadActivity, workspace]);

  const selected = integrations.find((integration) => integration.id === selectedId);
  const filteredIntegrations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return integrations;
    return integrations.filter((item) => `${item.name} ${item.type} ${item.category}`.toLowerCase().includes(query));
  }, [integrations, search]);
  const activeCount = integrations.filter((item) => item.enabled && item.status === "active").length;
  const errorCount = integrations.filter((item) => item.status === "error").length;
  const queued = health.reduce((total, item) => total + Number(item.queueDepth ?? item.queue_depth ?? 0), 0);

  const runAction = async (integration: Integration, action: "test" | "enable" | "disable") => {
    setBusyId(integration.id);
    setNotice(null);
    try {
      const response = await fetch(`${API_BASE}/${encodeURIComponent(integration.id)}${action === "test" ? "/test" : `/${action}`}`, {
        method: "POST",
        credentials: "include",
      });
      const body = await response.json().catch(() => ({})) as { success?: boolean; message?: string; error?: string };
      if (!response.ok || body.success === false) throw new Error(body.error ?? body.message ?? "connector_action_failed");
      setNotice(action === "test" ? (body.message ?? `${integration.name} connection test completed.`) : `${integration.name} ${action === "enable" ? "enabled" : "disabled"}.`);
      await load();
      if (workspace === "activity") await loadActivity();
    } catch {
      setError(`Unable to ${action} ${integration.name}. Verify access and connector configuration.`);
    } finally {
      setBusyId(null);
    }
  };

  return <AppLayout>
    <main className="mx-auto max-w-[1520px] space-y-6 px-5 py-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white shadow-xl shadow-slate-950/10">
        <div className="relative px-6 py-7 sm:px-8">
          <div className="absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_center,rgba(34,211,238,.2),transparent_65%)]" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-cyan-300"><Globe2 size={14} /> Integration control plane</div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">External systems, under one operational lens.</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Monitor connector health, event delivery, queues, and configuration readiness without leaving the security workspace.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Refresh</button>
              <button type="button" onClick={() => setShowCatalog(true)} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"><Plus size={16} />Browse connectors</button>
            </div>
          </div>
        </div>
      </section>

      {error && <Banner tone="error" text={error} onDismiss={() => setError(null)} />}
      {notice && <Banner tone="success" text={notice} onDismiss={() => setNotice(null)} />}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Configured connectors" value={integrations.length} detail="Across all integration domains" icon={PlugZap} tone="blue" />
        <Metric label="Delivering normally" value={activeCount} detail="Enabled and active" icon={CheckCircle2} tone="green" />
        <Metric label="Needs attention" value={errorCount} detail={errorCount ? "Review failed connectors" : "No connector errors"} icon={CircleAlert} tone={errorCount ? "red" : "amber"} />
        <Metric label="Queued deliveries" value={queued.toLocaleString()} detail="Awaiting downstream processing" icon={Clock3} tone="violet" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Integration workspaces">
            {workspaceTabs.map((tab) => {
              const Icon = tab.icon;
              const active = workspace === tab.id;
              return <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => setWorkspace(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><Icon size={15} />{tab.label}</button>;
            })}
          </div>
          {workspace === "connectors" && <label className="relative block min-w-[230px]"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search connectors" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" /></label>}
        </div>

        <div className="p-5">
          {workspace === "connectors" && <ConnectorWorkspace loading={loading} integrations={filteredIntegrations} busyId={busyId} onSelect={(id) => { setSelectedId(id); setWorkspace("activity"); }} onAction={runAction} onBrowse={() => setShowCatalog(true)} />}
          {workspace === "activity" && <ActivityWorkspace integrations={integrations} selectedId={selectedId} onSelect={setSelectedId} selected={selected} deliveries={deliveries} loading={loadingActivity} onTest={() => selected && void runAction(selected, "test")} />}
          {workspace === "catalog" && <CatalogWorkspace catalog={catalog} loading={loading} onBrowse={() => setShowCatalog(true)} />}
          {workspace === "health" && <HealthWorkspace health={health} integrations={integrations} loading={loading} />}
        </div>
      </section>
    </main>
    {showCatalog && <ConnectorCatalogDialog catalog={catalog} onClose={() => setShowCatalog(false)} />}
  </AppLayout>;
}

function ConnectorWorkspace({ loading, integrations, busyId, onSelect, onAction, onBrowse }: { loading: boolean; integrations: Integration[]; busyId: string | null; onSelect: (id: string) => void; onAction: (integration: Integration, action: "test" | "enable" | "disable") => void; onBrowse: () => void }) {
  if (loading) return <LoadingState label="Loading connector inventory" />;
  if (!integrations.length) return <EmptyState icon={PlugZap} title="No connectors are configured" detail="Start with the connector catalog, then add only the systems your operations team is ready to monitor." action="Browse connector catalog" onAction={onBrowse} />;
  return <div className="grid gap-4 xl:grid-cols-2">{integrations.map((integration) => <article key={integration.id} className="rounded-xl border border-slate-200 p-4 transition hover:border-cyan-300 hover:shadow-md">
    <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><PlugZap size={19} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold text-slate-900">{integration.name}</h2><StatusPill value={integration.status} /></div><p className="mt-1 text-xs text-slate-500">{humanize(integration.type)} · {humanize(integration.category)}</p></div></div><button type="button" onClick={() => onSelect(integration.id)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`View ${integration.name} activity`}><ChevronRight size={18} /></button></div>
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs"><div><span className="block text-slate-400">Subscribed events</span><strong className="mt-1 block text-slate-700">{integration.subscribedEvents?.length ?? 0} event types</strong></div><div><span className="block text-slate-400">Last delivery</span><strong className="mt-1 block truncate text-slate-700">{timeAgo(integration.lastSuccessAt)}</strong></div></div>
    {integration.lastError && <p className="mt-3 truncate rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">Last error: {integration.lastError}</p>}
    <div className="mt-4 flex items-center justify-between gap-3"><button type="button" onClick={() => onAction(integration, "test")} disabled={busyId === integration.id} className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:text-cyan-900 disabled:opacity-50"><Wifi size={15} />Test connection</button><button type="button" onClick={() => onAction(integration, integration.enabled ? "disable" : "enable")} disabled={busyId === integration.id} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${integration.enabled ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-slate-900 text-white hover:bg-slate-700"}`}><Power size={14} />{busyId === integration.id ? "Updating…" : integration.enabled ? "Disable" : "Enable"}</button></div>
  </article>)}</div>;
}

function ActivityWorkspace({ integrations, selectedId, onSelect, selected, deliveries, loading, onTest }: { integrations: Integration[]; selectedId: string; onSelect: (id: string) => void; selected?: Integration; deliveries: Delivery[]; loading: boolean; onTest: () => void }) {
  if (!integrations.length) return <EmptyState icon={Activity} title="Delivery activity will appear here" detail="Configure a connector to inspect deliveries, retry behavior, and outbound system responses." />;
  return <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"><aside className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="px-2 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Connector activity</p>{integrations.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left ${item.id === selectedId ? "bg-white shadow-sm ring-1 ring-cyan-200" : "hover:bg-white"}`}><span className={`h-2.5 w-2.5 rounded-full ${statusDot(item.status)}`} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800">{item.name}</strong><span className="block truncate text-xs text-slate-500">{humanize(item.type)}</span></span></button>)}</aside><section><div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">Selected connector</p><h2 className="mt-1 text-xl font-semibold text-slate-900">{selected?.name ?? "Connector activity"}</h2><p className="mt-1 text-sm text-slate-500">Recent delivery attempts and responses from the connected system.</p></div><button type="button" onClick={onTest} className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Send size={15} />Test connection</button></div>{loading ? <LoadingState label="Loading delivery history" /> : deliveries.length ? <div className="divide-y divide-slate-100">{deliveries.map((delivery) => <div key={delivery.id} className="flex items-start gap-3 py-4"><div className={`mt-0.5 grid h-8 w-8 place-items-center rounded-full ${delivery.success ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{delivery.success ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><strong className="text-sm text-slate-800">{humanize(delivery.event_type ?? "External event")}</strong><span className="text-xs text-slate-400">{formatDate(delivery.timestamp)}</span></div><p className="mt-1 truncate text-sm text-slate-500">{delivery.success ? `Delivered${delivery.retry_count ? ` after ${delivery.retry_count} retries` : ""}` : delivery.error ?? "Delivery was not accepted by the external system."}</p></div>{delivery.external_url && <a href={delivery.external_url} target="_blank" rel="noreferrer" className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-cyan-700" aria-label="Open external delivery"><ExternalLink size={15} /></a>}</div>)}</div> : <EmptyState icon={Send} title="No delivery history yet" detail="Use the connection test to validate the configured endpoint, then delivery results will be recorded here." />}</section></div>;
}

function CatalogWorkspace({ catalog, loading, onBrowse }: { catalog: Connector[]; loading: boolean; onBrowse: () => void }) {
  if (loading) return <LoadingState label="Loading connector catalog" />;
  if (!catalog.length) return <EmptyState icon={Boxes} title="Connector catalog is unavailable" detail="The control plane did not return any registered connector types. Check service configuration and refresh." />;
  return <div><div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-lg font-semibold text-slate-900">Available connector types</h2><p className="mt-1 text-sm text-slate-500">Choose an approved integration pattern; credentials stay in the control plane and are never shown here.</p></div><button type="button" onClick={onBrowse} className="inline-flex items-center gap-2 self-start rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"><Boxes size={15} />Open catalog</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{catalog.map((connector) => <article key={connector.type} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Boxes size={18} /></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{humanize(connector.category)}</span></div><h3 className="mt-4 font-semibold text-slate-900">{connector.name}</h3><p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">{connector.description}</p><div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500"><span>{connector.configSchema?.requiredFields?.length ?? 0} required configuration fields</span><span className="mx-2 text-slate-300">·</span><span>v{connector.version ?? "1"}</span></div></article>)}</div></div>;
}

function HealthWorkspace({ health, integrations, loading }: { health: IntegrationHealth[]; integrations: Integration[]; loading: boolean }) {
  if (loading) return <LoadingState label="Loading connector health" />;
  if (!health.length) return <EmptyState icon={ServerCog} title="No connector health data yet" detail={integrations.length ? "Health checks will appear after enabled connectors complete their first scheduled check." : "Configure a connector to begin collecting delivery and health telemetry."} />;
  return <div><div className="mb-5"><h2 className="text-lg font-semibold text-slate-900">Health and delivery queues</h2><p className="mt-1 text-sm text-slate-500">Use this view to triage delayed processing before it affects downstream security workflows.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[740px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400"><tr><th className="pb-3 font-semibold">Connector</th><th className="pb-3 font-semibold">Health</th><th className="pb-3 font-semibold">Queue</th><th className="pb-3 font-semibold">Events</th><th className="pb-3 font-semibold">Avg. latency</th><th className="pb-3 font-semibold">Last successful delivery</th></tr></thead><tbody className="divide-y divide-slate-100">{health.map((item, index) => { const healthValue = item.health_status ?? item.health ?? item.status ?? "unknown"; return <tr key={item.id ?? item.connector_id ?? index}><td className="py-4"><strong className="block text-slate-800">{item.name ?? item.connector_type ?? "Connector"}</strong><span className="text-xs text-slate-500">{humanize(item.connector_type ?? "external system")}</span></td><td className="py-4"><StatusPill value={healthValue} /></td><td className="py-4 font-medium text-slate-700">{Number(item.queueDepth ?? item.queue_depth ?? 0).toLocaleString()}</td><td className="py-4 text-slate-600">{Number(item.events_received_count ?? 0).toLocaleString()} received <span className="text-slate-300">/</span> <span className={Number(item.events_failed_count ?? 0) ? "text-rose-600" : "text-slate-500"}>{Number(item.events_failed_count ?? 0).toLocaleString()} failed</span></td><td className="py-4 text-slate-600">{item.average_latency_ms ? `${item.average_latency_ms} ms` : "—"}</td><td className="py-4 text-slate-600">{formatDate(item.last_successful_event_at ?? item.lastSuccessAt)}</td></tr>; })}</tbody></table></div></div>;
}

function ConnectorCatalogDialog({ catalog, onClose }: { catalog: Connector[]; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Connector catalog"><div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white shadow-2xl"><div className="sticky top-0 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5"><div><p className="text-xs font-bold uppercase tracking-wider text-cyan-700">Connector catalog</p><h2 className="mt-1 text-xl font-semibold text-slate-900">Choose a trusted integration pattern</h2><p className="mt-1 text-sm text-slate-500">Review configuration requirements before beginning the secured setup flow.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={18} /></button></div><div className="grid gap-3 p-6 sm:grid-cols-2">{catalog.map((connector) => <article key={connector.type} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><strong className="block text-slate-900">{connector.name}</strong><span className="mt-1 block text-xs text-slate-500">{humanize(connector.category)}</span></div><ArrowRight size={17} className="text-slate-300" /></div><p className="mt-3 text-sm leading-5 text-slate-500">{connector.description}</p></article>)}</div><div className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-xs text-slate-500"><ShieldCheck size={14} className="mr-1 inline text-emerald-600" /> Secrets are encrypted in the control plane and redacted from the dashboard.</div></div></div>;
}

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string | number; detail: string; icon: typeof PlugZap; tone: "blue" | "green" | "red" | "amber" | "violet" }) { const colors = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", red: "bg-rose-50 text-rose-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700" }; return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><span className="text-sm font-medium text-slate-500">{label}</span><span className={`grid h-9 w-9 place-items-center rounded-lg ${colors[tone]}`}><Icon size={18} /></span></div><strong className="mt-4 block text-2xl tracking-tight text-slate-900">{value}</strong><span className="mt-1 block text-xs text-slate-400">{detail}</span></article>; }
function Banner({ tone, text, onDismiss }: { tone: "error" | "success"; text: string; onDismiss: () => void }) { const success = tone === "success"; return <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}><span>{success ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}</span><span className="flex-1">{text}</span><button type="button" onClick={onDismiss} className="rounded p-1 hover:bg-black/5" aria-label="Dismiss"><X size={16} /></button></div>; }
function EmptyState({ icon: Icon, title, detail, action, onAction }: { icon: typeof PlugZap; title: string; detail: string; action?: string; onAction?: () => void }) { return <div className="grid min-h-64 place-items-center px-6 py-12 text-center"><div className="max-w-md"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-cyan-50 text-cyan-700"><Icon size={22} /></span><h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>{action && onAction && <button type="button" onClick={onAction} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">{action}<ArrowRight size={15} /></button>}</div></div>; }
function LoadingState({ label }: { label: string }) { return <div className="grid min-h-64 place-items-center text-sm text-slate-500"><span className="inline-flex items-center gap-3"><LoaderCircle size={20} className="animate-spin text-cyan-600" />{label}</span></div>; }
function StatusPill({ value }: { value?: string | null }) { const normalized = (value ?? "unknown").toLowerCase(); const tone = normalized === "active" || normalized === "healthy" || normalized === "online" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : normalized === "error" || normalized === "failed" || normalized === "offline" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200"; return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold capitalize ring-1 ring-inset ${tone}`}><i className={`h-1.5 w-1.5 rounded-full ${statusDot(normalized)}`} />{humanize(value ?? "unknown")}</span>; }
function statusDot(value?: string | null) { const normalized = (value ?? "unknown").toLowerCase(); return normalized === "active" || normalized === "healthy" || normalized === "online" ? "bg-emerald-500" : normalized === "error" || normalized === "failed" || normalized === "offline" ? "bg-rose-500" : "bg-amber-500"; }
function humanize(value: string) { return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value?: string | null) { if (!value) return "No successful delivery yet"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString(); }
function timeAgo(value?: string | null) { if (!value) return "No successful delivery yet"; const date = new Date(value).getTime(); if (Number.isNaN(date)) return "Unavailable"; const seconds = Math.max(0, Math.floor((Date.now() - date) / 1000)); if (seconds < 60) return "Just now"; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86_400)}d ago`; }
async function fetchData<T>(url: string) { const response = await fetch(url, { credentials: "include", cache: "no-store" }); if (!response.ok) throw new Error("integration_api_unavailable"); const body = await response.json() as { data?: T } | T; return (isDataEnvelope<T>(body) ? body.data ?? ([] as unknown as T) : body) as T; }
function isDataEnvelope<T>(body: { data?: T } | T): body is { data?: T } { return typeof body === "object" && body !== null && "data" in body; }
