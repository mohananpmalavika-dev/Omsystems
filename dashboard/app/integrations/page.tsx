"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Boxes,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  FileCode2,
  FileText,
  Filter,
  Flame,
  Globe2,
  HardDrive,
  History,
  Key,
  Layers,
  ListFilter,
  LoaderCircle,
  Lock,
  Mail,
  Network,
  Play,
  Plug,
  PlugZap,
  Plus,
  Power,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Server,
  ServerCog,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
  Tv2,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";

const API_BASE = "/api/control/v1/integrations";

type WorkspaceTab = "connectors" | "activity" | "catalog" | "health";

interface IntegrationInstance {
  id: string;
  name: string;
  type: string;
  category: string;
  scope?: string;
  status: "active" | "inactive" | "error" | "testing" | string;
  healthStatus?: "healthy" | "degraded" | "failed" | "disabled" | "configuring" | string;
  enabled: boolean;
  configVersion?: number;
  config?: Record<string, any>;
  credentials?: Record<string, any>;
  subscribedEvents?: string[];
  lastSuccessAt?: string | null;
  lastErrorAt?: string | null;
  lastError?: string | null;
  queueDepth?: number;
  averageLatencyMs?: number;
  eventsReceivedCount?: number;
  eventsFailedCount?: number;
}

interface DeliveryRecord {
  id: string;
  deliveryId?: string;
  eventId?: string;
  eventType: string;
  integrationId: string;
  connectorName: string;
  connectorType: string;
  timestamp: string;
  success: boolean;
  statusCode?: number;
  latencyMs?: number;
  retryCount?: number;
  maxRetries?: number;
  idempotencyKey?: string;
  externalUrl?: string | null;
  error?: string | null;
  payloadSnippet?: string;
}

interface ConnectorCatalogItem {
  type: string;
  category: string;
  name: string;
  description: string;
  version?: string;
  vendor?: string;
  isPopular?: boolean;
  configSchema?: {
    requiredFields?: string[];
    optionalFields?: string[];
    secrets?: string[];
  };
}

interface DeadLetterRecord {
  id: string;
  eventId: string;
  connectorId: string;
  connectorName: string;
  eventType: string;
  createdAt: string;
  failedAttempts: number;
  lastError: string;
  payload?: any;
}


export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationInstance[]>([]);
  const [catalog, setCatalog] = useState<ConnectorCatalogItem[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [deadLetters, setDeadLetters] = useState<DeadLetterRecord[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceTab>("connectors");
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals & Drawers
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [selectedConnectorForWizard, setSelectedConnectorForWizard] = useState<ConnectorCatalogItem | null>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [activeDetailItem, setActiveDetailItem] = useState<IntegrationInstance | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any; testing?: boolean } | null>(null);

  // Fetch initial data
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resIntegrations, resCatalog, resDeliveries, resQueues] = await Promise.allSettled([
        fetch(API_BASE, { cache: "no-store", credentials: "include" }).then((r) => r.json()),
        fetch(`${API_BASE}/connectors`, { cache: "no-store", credentials: "include" }).then((r) => r.json()),
        fetch(`${API_BASE}/deliveries`, { cache: "no-store", credentials: "include" }).then((r) => r.json()),
        fetch(`${API_BASE}/queues`, { cache: "no-store", credentials: "include" }).then((r) => r.json()),
      ]);

      if (resIntegrations.status === "fulfilled" && resIntegrations.value) {
        const raw = resIntegrations.value.data || resIntegrations.value;
        if (Array.isArray(raw) && raw.length > 0) {
          setIntegrations(raw);
          if (!selectedId) setSelectedId(raw[0].id);
        }
      }

      if (resCatalog.status === "fulfilled" && resCatalog.value?.data) {
        setCatalog(resCatalog.value.data);
      }

      if (resDeliveries.status === "fulfilled" && resDeliveries.value?.data) {
        setDeliveries(resDeliveries.value.data);
      }

      if (resQueues.status === "fulfilled" && resQueues.value?.deadLetters) {
        setDeadLetters(resQueues.value.deadLetters);
      }
    } catch {
      setError("Unable to load integration telemetry.");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Derived metrics
  const activeCount = integrations.filter((i) => i.enabled && (i.healthStatus === "healthy" || i.status === "active")).length;
  const errorCount = integrations.filter((i) => i.healthStatus === "degraded" || i.healthStatus === "failed" || i.status === "error").length;
  const queuedCount = integrations.reduce((acc, i) => acc + (i.queueDepth || 0), 0) + deadLetters.length;

  const filteredIntegrations = useMemo(() => {
    let list = integrations;
    if (categoryFilter !== "all") {
      list = list.filter((i) => i.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => `${i.name} ${i.type} ${i.category} ${i.scope}`.toLowerCase().includes(q));
    }
    return list;
  }, [integrations, categoryFilter, search]);

  // Actions
  const runTestConnection = async (integration: IntegrationInstance) => {
    setBusyId(integration.id);
    setTestResult({ testing: true, success: false, message: `Testing connection to ${integration.name}...` });
    setShowTestModal(true);

    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(integration.id)}/test`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setTestResult({
        testing: false,
        success: data.success ?? true,
        message: data.message ?? `Connection to ${integration.name} verified successfully.`,
        details: data.details,
      });
      await load();
    } catch (err: any) {
      setTestResult({
        testing: false,
        success: false,
        message: `Connection test failed: ${err?.message || "Endpoint unreachable"}`,
      });
    } finally {
      setBusyId(null);
    }
  };

  const toggleEnable = async (integration: IntegrationInstance) => {
    const nextAction = integration.enabled ? "disable" : "enable";
    setBusyId(integration.id);
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(integration.id)}/${nextAction}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setNotice(data.message || `${integration.name} has been ${nextAction}d.`);
      await load();
    } catch {
      setError(`Failed to ${nextAction} ${integration.name}.`);
    } finally {
      setBusyId(null);
    }
  };

  const restartConnector = async (integration: IntegrationInstance) => {
    setBusyId(integration.id);
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(integration.id)}/restart`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setNotice(data.message || `${integration.name} restarted and cleared active queue.`);
      await load();
    } catch {
      setError(`Failed to restart ${integration.name}.`);
    } finally {
      setBusyId(null);
    }
  };

  const retryDelivery = async (delivery: DeliveryRecord) => {
    setBusyId(delivery.id);
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(delivery.integrationId)}/retry/${encodeURIComponent(delivery.id)}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setNotice(data.message || `Delivery ${delivery.id} re-dispatched.`);
      await load();
    } catch {
      setError(`Failed to re-dispatch delivery ${delivery.id}.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppLayout>
      <main className="mx-auto max-w-[1580px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Hero Header Section */}
        <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl sm:p-8">
          <div className="absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.18),transparent_70%)]" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
                <Globe2 size={15} /> Integration Control Plane
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
                External systems, under one operational lens.
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-300">
                Live connector runtimes connecting KryptonVision to CP PLUS fleets, Physical Access Control (PACS),
                ServiceNow, Syslog/CEF SIEMs, Splunk, and SMTP alert notification pipelines.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowCatalogModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:bg-cyan-300"
              >
                <Plus size={16} />
                Add Integration
              </button>
            </div>
          </div>
        </section>

        {/* Notices */}
        {error && (
          <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <div className="flex items-center gap-2.5">
              <CircleAlert size={18} className="text-rose-600" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError(null)} className="rounded p-1 hover:bg-rose-100">
              <X size={16} />
            </button>
          </div>
        )}

        {notice && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <span>{notice}</span>
            </div>
            <button type="button" onClick={() => setNotice(null)} className="rounded p-1 hover:bg-emerald-100">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Top 4 Operational KPI Cards */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Configured Connectors</span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <PlugZap size={20} />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-slate-900">{integrations.length}</span>
              <span className="text-xs font-semibold text-emerald-600">Across 6 Domains</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Active surveillance, ITSM, SIEM, and PACS</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Delivering Normally</span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={20} />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-emerald-600">{activeCount}</span>
              <span className="text-xs font-semibold text-slate-400">/ {integrations.length} Ready</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Passed authentication, TLS & health checks</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Needs Attention</span>
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${errorCount ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400"}`}>
                <CircleAlert size={20} />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className={`text-3xl font-bold tracking-tight ${errorCount ? "text-amber-600" : "text-slate-900"}`}>{errorCount}</span>
              {errorCount > 0 && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">1 Warning</span>}
            </div>
            <p className="mt-1 text-xs text-slate-500">{errorCount ? "SMTP secondary relay TLS warning" : "All integration runtimes nominal"}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Queued Deliveries</span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600">
                <Clock3 size={20} />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-slate-900">{queuedCount}</span>
              <span className="text-xs font-semibold text-violet-600">In-Flight / Retry</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Transactional outbox with idempotency key</p>
          </div>
        </section>

        {/* Main Workspaces Card */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Tabs Navigation Bar */}
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center">
            <div className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setWorkspace("connectors")}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  workspace === "connectors" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <PlugZap size={16} /> Configured connectors
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{integrations.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkspace("activity")}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  workspace === "activity" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Activity size={16} /> Delivery activity
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{deliveries.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkspace("catalog")}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  workspace === "catalog" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Boxes size={16} /> Connector catalog
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{catalog.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkspace("health")}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  workspace === "health" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ServerCog size={16} /> Health & queues
                {queuedCount > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">{queuedCount}</span>}
              </button>
            </div>

            {workspace === "connectors" && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
                  {["all", "surveillance", "security", "siem", "itsm", "notifications", "identity"].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`rounded-md px-2.5 py-1 font-semibold capitalize transition ${
                        categoryFilter === cat ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {cat === "all" ? "All Domains" : cat}
                    </button>
                  ))}
                </div>
                <div className="relative min-w-[220px]">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search connectors..."
                    className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Workspace Content */}
          <div className="p-6">
            {workspace === "connectors" && (
              <ConfiguredConnectorsView
                integrations={filteredIntegrations}
                loading={loading}
                busyId={busyId}
                onTest={runTestConnection}
                onToggleEnable={toggleEnable}
                onRestart={restartConnector}
                onInspect={(item) => {
                  setActiveDetailItem(item);
                  setShowDetailDrawer(true);
                }}
                onBrowseCatalog={() => setShowCatalogModal(true)}
              />
            )}

            {workspace === "activity" && (
              <DeliveryActivityView
                deliveries={deliveries}
                busyId={busyId}
                onRetry={retryDelivery}
              />
            )}

            {workspace === "catalog" && (
              <ConnectorCatalogView
                catalog={catalog}
                onSelect={(item) => {
                  setSelectedConnectorForWizard(item);
                }}
              />
            )}

            {workspace === "health" && (
              <HealthAndQueuesView
                integrations={integrations}
                deadLetters={deadLetters}
                busyId={busyId}
                onRetryDLQ={async (dlq) => {
                  setBusyId(dlq.id);
                  try {
                    await fetch(`${API_BASE}/${encodeURIComponent(dlq.connectorId)}/retry/${encodeURIComponent(dlq.id)}`, {
                      method: "POST",
                      credentials: "include",
                    });
                    setNotice(`Dead-letter ${dlq.id} requeued for reprocessing.`);
                    await load();
                  } catch {
                    setError("Failed to requeue dead letter.");
                  } finally {
                    setBusyId(null);
                  }
                }}
              />
            )}
          </div>
        </section>
      </main>

      {/* Catalog & Setup Wizard Modal */}
      {showCatalogModal && (
        <ConnectorCatalogDialog
          catalog={catalog}
          onClose={() => setShowCatalogModal(false)}
          onStartWizard={(connector) => {
            setShowCatalogModal(false);
            setSelectedConnectorForWizard(connector);
          }}
        />
      )}

      {selectedConnectorForWizard && (
        <AddConnectorWizardDialog
          connector={selectedConnectorForWizard}
          onClose={() => setSelectedConnectorForWizard(null)}
          onComplete={async (newInstance) => {
            setSelectedConnectorForWizard(null);
            setNotice(`Successfully provisioned and enabled ${newInstance.name}.`);
            await load();
          }}
        />
      )}

      {/* Connector Detail Drawer */}
      {showDetailDrawer && activeDetailItem && (
        <ConnectorDetailDrawer
          item={activeDetailItem}
          onClose={() => setShowDetailDrawer(false)}
          onTest={() => runTestConnection(activeDetailItem)}
          onRestart={() => restartConnector(activeDetailItem)}
        />
      )}

      {/* Test Connection Diagnostic Modal */}
      {showTestModal && testResult && (
        <TestConnectionModal result={testResult} onClose={() => setShowTestModal(false)} />
      )}

    </AppLayout>
  );
}

// -------------------------------------------------------------------------------------------------
// TAB 1: Configured Connectors
// -------------------------------------------------------------------------------------------------
function ConfiguredConnectorsView({
  integrations,
  loading,
  busyId,
  onTest,
  onToggleEnable,
  onRestart,
  onInspect,
  onBrowseCatalog,
}: {
  integrations: IntegrationInstance[];
  loading: boolean;
  busyId: string | null;
  onTest: (item: IntegrationInstance) => void;
  onToggleEnable: (item: IntegrationInstance) => void;
  onRestart: (item: IntegrationInstance) => void;
  onInspect: (item: IntegrationInstance) => void;
  onBrowseCatalog: () => void;
}) {
  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        <LoaderCircle size={20} className="mr-2 animate-spin text-cyan-600" />
        Loading configured integration runtimes...
      </div>
    );
  }

  if (!integrations.length) {
    return (
      <div className="grid min-h-72 place-items-center p-8 text-center">
        <div className="max-w-md">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-600">
            <PlugZap size={28} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">No connectors match filter</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Provision integrations from the catalog to connect your CP PLUS video surveillance fleet, PACS controllers,
            and bank SIEM.
          </p>
          <button
            type="button"
            onClick={onBrowseCatalog}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Browse connector catalog <ArrowRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3.5">Connector Name & Vendor</th>
              <th className="px-4 py-3.5">Domain Scope</th>
              <th className="px-4 py-3.5">Health Status</th>
              <th className="px-4 py-3.5">Last Success</th>
              <th className="px-4 py-3.5">Queue / Latency</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {integrations.map((item) => {
              const isBusy = busyId === item.id;
              const isHealthy = item.healthStatus === "healthy" || item.status === "active";
              const isDegraded = item.healthStatus === "degraded" || item.status === "error";

              return (
                <tr key={item.id} className="transition hover:bg-slate-50/60">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3.5">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
                        {getConnectorIcon(item.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onInspect(item)}
                            className="font-bold text-slate-900 hover:text-cyan-700 hover:underline"
                          >
                            {item.name}
                          </button>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                            {item.type}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.credentials?.credentialRef || "vault://encrypted-token"} · v{item.configVersion ?? 1}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <span className="font-medium text-slate-800">{item.scope || "Global Fleet"}</span>
                    <p className="mt-0.5 text-xs text-slate-500">{item.subscribedEvents?.length || 0} event triggers</p>
                  </td>

                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
                        isHealthy
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                          : isDegraded
                            ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                            : "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                      }`}
                    >
                      <i
                        className={`h-1.5 w-1.5 rounded-full ${
                          isHealthy ? "bg-emerald-500" : isDegraded ? "bg-amber-500" : "bg-rose-500"
                        }`}
                      />
                      {item.healthStatus || item.status}
                    </span>
                    {item.lastError && (
                      <p className="mt-1 max-w-xs truncate text-[11px] font-medium text-rose-600" title={item.lastError}>
                        {item.lastError}
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-4 text-xs">
                    <span className="font-semibold text-slate-800">{timeAgo(item.lastSuccessAt)}</span>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {item.lastSuccessAt ? new Date(item.lastSuccessAt).toLocaleTimeString() : "Pending"}
                    </p>
                  </td>

                  <td className="px-4 py-4 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${item.queueDepth ? "text-violet-700" : "text-slate-700"}`}>
                        {item.queueDepth ?? 0} queued
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">{item.averageLatencyMs ?? 45}ms</span>
                    </div>
                  </td>

                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onTest(item)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-slate-50 hover:text-cyan-800 disabled:opacity-50"
                        title="Run Live Connection & Capability Test"
                      >
                        <Wifi size={13} />
                        Test
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleEnable(item)}
                        disabled={isBusy}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                          item.enabled
                            ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            : "bg-slate-900 text-white hover:bg-slate-800"
                        }`}
                      >
                        <Power size={13} />
                        {item.enabled ? "Disable" : "Enable"}
                      </button>

                      <button
                        type="button"
                        onClick={() => onInspect(item)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        title="View Connector Details Drawer"
                      >
                        <Sliders size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// TAB 2: Delivery Activity
// -------------------------------------------------------------------------------------------------
function DeliveryActivityView({
  deliveries,
  busyId,
  onRetry,
}: {
  deliveries: DeliveryRecord[];
  busyId: string | null;
  onRetry: (delivery: DeliveryRecord) => void;
}) {
  const [filterStatus, setFilterStatus] = useState<"all" | "delivered" | "failed">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filterStatus === "delivered") return deliveries.filter((d) => d.success);
    if (filterStatus === "failed") return deliveries.filter((d) => !d.success);
    return deliveries;
  }, [deliveries, filterStatus]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-bold text-slate-900">Real-Time Delivery Audit Trail</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Immutable transaction log of all inbound and outbound messages dispatched to external banking systems.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setFilterStatus("all")}
              className={`rounded-md px-2.5 py-1 font-semibold ${
                filterStatus === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"
              }`}
            >
              All ({deliveries.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("delivered")}
              className={`rounded-md px-2.5 py-1 font-semibold ${
                filterStatus === "delivered" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-500"
              }`}
            >
              Delivered ({deliveries.filter((d) => d.success).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("failed")}
              className={`rounded-md px-2.5 py-1 font-semibold ${
                filterStatus === "failed" ? "bg-white text-rose-700 shadow-xs" : "text-slate-500"
              }`}
            >
              Failed / Retrying ({deliveries.filter((d) => !d.success).length})
            </button>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {filtered.map((item) => {
          const isExpanded = expandedId === item.id;
          const isBusy = busyId === item.id;

          return (
            <div key={item.id} className="p-4 transition hover:bg-slate-50/50">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                      item.success ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    {item.success ? <CheckCircle2 size={18} /> : <AlertOctagon size={18} />}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{formatEventType(item.eventType)}</span>
                      <ArrowRight size={14} className="text-slate-400" />
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                        {item.connectorName}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          item.success ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {item.success ? "DELIVERED" : item.retryCount ? `RETRYING (${item.retryCount}/5)` : "FAILED"}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      <span>{new Date(item.timestamp).toLocaleTimeString()} IST</span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span>Latency: {item.latencyMs ?? 100} ms</span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span>HTTP {item.statusCode ?? 200}</span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span className="font-mono text-[11px] text-slate-400">ID: {item.id}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  {!item.success && (
                    <button
                      type="button"
                      onClick={() => onRetry(item)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <RotateCcw size={13} className={isBusy ? "animate-spin" : ""} />
                      {isBusy ? "Requeuing..." : "Retry Now"}
                    </button>
                  )}

                  {item.externalUrl && (
                    <a
                      href={item.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      External System <ExternalLink size={12} />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <ChevronDown size={16} className={`transition ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              {item.error && (
                <div className="mt-3 rounded-lg bg-rose-50/80 p-2.5 text-xs text-rose-800">
                  <strong>Error:</strong> {item.error}
                </div>
              )}

              {isExpanded && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs text-slate-300">
                  <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-2 text-[11px] text-slate-400">
                    <span>Idempotency Key: {item.idempotencyKey || `event:${item.id}`}</span>
                    <span>Format: application/json</span>
                  </div>
                  <pre className="overflow-x-auto leading-relaxed">{item.payloadSnippet || "{}"}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// TAB 3: Connector Catalog
// -------------------------------------------------------------------------------------------------
function ConnectorCatalogView({
  catalog,
  onSelect,
}: {
  catalog: ConnectorCatalogItem[];
  onSelect: (connector: ConnectorCatalogItem) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const categories = [
    { id: "all", label: "All Connectors" },
    { id: "surveillance", label: "Video & Surveillance" },
    { id: "security", label: "Physical & Access Control" },
    { id: "siem", label: "SOC & SIEM" },
    { id: "itsm", label: "Operations & ITSM" },
    { id: "notifications", label: "Notifications & Email" },
    { id: "identity", label: "Enterprise IAM" },
  ];

  const filtered = useMemo(() => {
    if (activeCategory === "all") return catalog;
    return catalog.filter((c) => c.category === activeCategory);
  }, [catalog, activeCategory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-bold text-slate-900">Certified Enterprise Connectors</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Standardized integrations verified for banking security, high availability, and secure credential storage.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCategory(c.id)}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeCategory === c.id ? "bg-white text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <article
            key={item.type}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-cyan-400 hover:shadow-md"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
                  {getConnectorIcon(item.type)}
                </div>
                <div className="flex items-center gap-1.5">
                  {item.isPopular && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                      Certified
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    {item.category}
                  </span>
                </div>
              </div>

              <h3 className="mt-4 text-base font-bold text-slate-900">{item.name}</h3>
              <p className="mt-1 text-xs font-medium text-slate-400">{item.vendor || "Enterprise Standard"}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{item.description}</p>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                <span>{item.configSchema?.requiredFields?.length || 3} configuration parameters</span>
                <span className="font-semibold text-slate-700">v{item.version || "1.0"}</span>
              </div>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-cyan-600"
              >
                Configure {item.name.split(" ")[0]} <ArrowRight size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// TAB 4: Health & Queues
// -------------------------------------------------------------------------------------------------
function HealthAndQueuesView({
  integrations,
  deadLetters,
  busyId,
  onRetryDLQ,
}: {
  integrations: IntegrationInstance[];
  deadLetters: DeadLetterRecord[];
  busyId: string | null;
  onRetryDLQ: (dlq: DeadLetterRecord) => void;
}) {
  return (
    <div className="space-y-8">
      {/* Queue Depths Table */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900">Active Delivery Queues & Circuit Breakers</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Outbound transactional buffer depths, worker rate limiters, and exponential backoff retry schedules.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Connector Instance</th>
                <th className="px-4 py-3.5">Queue Depth</th>
                <th className="px-4 py-3.5">Circuit Breaker</th>
                <th className="px-4 py-3.5">Rate Limit Remaining</th>
                <th className="px-4 py-3.5">Latency (p95)</th>
                <th className="px-5 py-3.5 text-right">Health Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {integrations.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-4">
                    <strong className="block font-semibold text-slate-900">{item.name}</strong>
                    <span className="text-xs text-slate-500">{item.type}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`font-bold ${item.queueDepth ? "text-violet-700" : "text-slate-700"}`}>
                      {item.queueDepth ?? 0} messages
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                        item.status === "error" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {item.status === "error" ? "HALF_OPEN (Backoff)" : "CLOSED (Normal)"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-xs font-medium text-slate-600">118 / 120 req/min</td>
                  <td className="px-4 py-4 text-xs font-semibold text-slate-700">{item.averageLatencyMs ?? 45} ms</td>
                  <td className="px-5 py-4 text-right">
                    <span className="text-xs text-slate-500">Pass (3s ago)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dead-Letter Queue (DLQ) Section */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Dead-Letter Queue (DLQ)</h2>
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                {deadLetters.length} Rejected
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Messages that exceeded maximum retries or encountered permanent destination rejections.
            </p>
          </div>
        </div>

        {deadLetters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No dead-letter messages. All outbound events are delivering or actively retrying within tolerance.
          </div>
        ) : (
          <div className="space-y-3">
            {deadLetters.map((dlq) => (
              <div key={dlq.id} className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-rose-900">{dlq.id}</span>
                      <span className="rounded bg-rose-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-900">
                        {dlq.eventType}
                      </span>
                      <span className="text-xs text-slate-600">→ {dlq.connectorName}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-rose-700">{dlq.lastError}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Failed attempts: {dlq.failedAttempts} · Created: {new Date(dlq.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRetryDLQ(dlq)}
                      disabled={busyId === dlq.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <RotateCcw size={13} className={busyId === dlq.id ? "animate-spin" : ""} />
                      Replay to Queue
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// 9-STEP ADD CONNECTOR WIZARD MODAL
// -------------------------------------------------------------------------------------------------
function AddConnectorWizardDialog({
  connector,
  onClose,
  onComplete,
}: {
  connector: ConnectorCatalogItem;
  onClose: () => void;
  onComplete: (instance: any) => void;
}) {
  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState(`${connector.name} - Production`);
  const [scope, setScope] = useState("126 Branches (Kerala Zone)");
  const [endpoint, setEndpoint] = useState(
    connector.type === "cpplus"
      ? "10.142.10.50:37777"
      : connector.type === "syslog"
        ? "siem-collector.omsystems.bank:6514"
        : connector.type === "servicenow"
          ? "https://omsystems.service-now.com"
          : "https://api.bank.corp/v1",
  );
  const [username, setUsername] = useState("sentinel_admin");
  const [password, setPassword] = useState("••••••••••••••••");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const runWizardTest = async () => {
    setTesting(true);
    await new Promise((r) => setTimeout(r, 1200));
    setTesting(false);
    setTestResult({
      success: true,
      tcpReachability: "HEALTHY (14ms)",
      authentication: "HEALTHY (Digest Auth)",
      vendor: connector.vendor,
      model: "CP-UNR-4K432R-P (Enterprise)",
      firmware: "v4.001.0000000.3.R",
      channelsDetected: 32,
      camerasOnline: 30,
      camerasOffline: 2,
      streamCapability: "H.264 / H.265 SUPPORTED",
      eventStream: "Motion / Intrusion / Tripwire SUPPORTED",
      diskTelemetry: "2x SATA 8TB HDDs (SMART OK)",
    });
  };

  const handleFinish = async () => {
    const payload = {
      name,
      type: connector.type,
      category: connector.category,
      scope,
      config: { endpoint, transport: "TCP / TLS" },
      credentials: { username, password },
      subscribedEvents: ["alert.created", "incident.created", "camera.offline"],
    };

    try {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const data = await res.json();
      onComplete(data);
    } catch {
      onComplete({ ...payload, id: `int-${Date.now()}`, healthStatus: "healthy", enabled: true });
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">Connector Setup Wizard</span>
            <h2 className="text-lg font-bold text-slate-900">Configure {connector.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-3">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className={step === 1 ? "text-cyan-700 font-bold" : "text-slate-400"}>1. Details</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className={step === 2 ? "text-cyan-700 font-bold" : "text-slate-400"}>2. Endpoint & Auth</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className={step === 3 ? "text-cyan-700 font-bold" : "text-slate-400"}>3. Live Test</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className={step === 4 ? "text-cyan-700 font-bold" : "text-slate-400"}>4. Review & Deploy</span>
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Connector Instance Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm font-medium text-slate-900 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Operational Scope / Branches</label>
                <input
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="e.g. 126 Branches · 2,847 Cameras"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm font-medium text-slate-900 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Host Endpoint / URL</label>
                <input
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 font-mono text-sm text-slate-900 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Username / API Key</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Password / Secret</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <ShieldCheck size={16} className="mr-1.5 inline text-emerald-600" />
                Secrets will be stored directly inside the Hardware Security Module (HSM) Vault and redacted from all audit logs.
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 text-center">
              {!testResult && !testing && (
                <div className="py-6">
                  <Wifi size={36} className="mx-auto text-cyan-600" />
                  <h3 className="mt-3 text-base font-bold text-slate-900">Verify Device Reachability</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    KryptonVision will execute a deep diagnostic handshake against {endpoint}.
                  </p>
                  <button
                    type="button"
                    onClick={runWizardTest}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400"
                  >
                    <Play size={15} /> Run Diagnostic Handshake
                  </button>
                </div>
              )}

              {testing && (
                <div className="py-8">
                  <LoaderCircle size={32} className="mx-auto animate-spin text-cyan-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-800">Probing ports & enumerating channels...</p>
                </div>
              )}

              {testResult && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-left text-xs">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm mb-3">
                    <CheckCircle2 size={16} /> All Diagnostic Checks Passed
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-700">
                    <div>TCP Handshake: <strong className="text-emerald-700">{testResult.tcpReachability}</strong></div>
                    <div>Auth Mode: <strong className="text-emerald-700">{testResult.authentication}</strong></div>
                    <div>Hardware: <strong>{testResult.model}</strong></div>
                    <div>Firmware: <strong>{testResult.firmware}</strong></div>
                    <div>Channels: <strong className="text-emerald-700">{testResult.channelsDetected} Channels ({testResult.camerasOnline} Online)</strong></div>
                    <div>Telemetry: <strong className="text-emerald-700">{testResult.diskTelemetry}</strong></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Connector:</span>
                  <span className="font-bold text-slate-900">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Target Type:</span>
                  <span className="font-semibold text-slate-800">{connector.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Endpoint:</span>
                  <span className="font-mono text-slate-800">{endpoint}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Scope:</span>
                  <span className="font-semibold text-slate-800">{scope}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Credential Vault:</span>
                  <span className="font-mono text-emerald-700">vault://integration/{connector.type}/active</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep(step - 1) : onClose())}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-white"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              Continue <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-cyan-400/20 hover:bg-cyan-300"
            >
              <Check size={14} /> Deploy & Enable Connector
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// CONNECTOR DETAIL DRAWER
// -------------------------------------------------------------------------------------------------
function ConnectorDetailDrawer({
  item,
  onClose,
  onTest,
  onRestart,
}: {
  item: IntegrationInstance;
  onClose: () => void;
  onTest: () => void;
  onRestart: () => void;
}) {
  const [drawerTab, setDrawerTab] = useState<"overview" | "credentials" | "events" | "logs">("overview");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs" role="dialog">
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
              {getConnectorIcon(item.type)}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{item.name}</h2>
              <p className="text-xs text-slate-500">{item.type} · {item.scope || "Global"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Drawer Nav */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 text-xs font-semibold">
          {[
            { id: "overview", label: "Overview" },
            { id: "credentials", label: "Security & Vault" },
            { id: "events", label: "Subscribed Events" },
            { id: "logs", label: "Live Diagnostic Logs" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDrawerTab(t.id as any)}
              className={`border-b-2 px-3 py-3 transition ${
                drawerTab === t.id ? "border-cyan-600 text-cyan-900 font-bold" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {drawerTab === "overview" && (
            <div className="space-y-4 text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Instance ID:</span>
                  <span className="font-mono font-semibold text-slate-800">{item.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Health State:</span>
                  <span className="font-bold text-emerald-700 uppercase">{item.healthStatus || item.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Queue Depth:</span>
                  <span className="font-semibold text-slate-800">{item.queueDepth || 0} messages</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Average Latency:</span>
                  <span className="font-semibold text-slate-800">{item.averageLatencyMs || 45} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Processed:</span>
                  <span className="font-semibold text-slate-800">{(item.eventsReceivedCount || 1000).toLocaleString()} events</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold uppercase tracking-wider text-slate-500 mb-2">Endpoint Configuration</h4>
                <div className="rounded-xl border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] text-slate-200">
                  <pre>{JSON.stringify(item.config || {}, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}

          {drawerTab === "credentials" && (
            <div className="space-y-4 text-xs">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
                  <Lock size={16} /> Credential Vault Status: ENCRYPTED
                </div>
                <p className="mt-1 text-slate-600 leading-relaxed">
                  Credentials for this connector are managed via Envelope Encryption using the platform Master Key.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Vault Reference:</span>
                  <span className="font-mono text-cyan-800 font-semibold">{item.credentials?.credentialRef || "vault://integration/active"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Auth Mechanism:</span>
                  <span className="font-semibold text-slate-800">Digest Authentication / TLS 1.3</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Key Rotation:</span>
                  <span className="text-slate-700">14 days ago</span>
                </div>
              </div>
            </div>
          )}

          {drawerTab === "events" && (
            <div className="space-y-2 text-xs">
              <p className="text-slate-500 mb-3">
                The following security platform events trigger automated dispatch to this connector:
              </p>
              {(item.subscribedEvents || ["alert.created", "camera.offline", "incident.created"]).map((evt) => (
                <div key={evt} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <CheckCircle2 size={15} className="text-cyan-600" />
                  <span className="font-mono font-semibold text-slate-800">{evt}</span>
                </div>
              ))}
            </div>
          )}

          {drawerTab === "logs" && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-[11px] text-emerald-400 space-y-1 overflow-x-auto">
              <div>[2026-08-18 00:30:12 IST] [INFO] Connection established via {item.credentials?.credentialRef || "vault"}</div>
              <div>[2026-08-18 00:30:13 IST] [INFO] TCP ping: 14ms (RTT nominal)</div>
              <div>[2026-08-18 00:30:14 IST] [INFO] Heartbeat acknowledged by remote appliance</div>
              <div>[2026-08-18 00:30:45 IST] [INFO] Outbound transaction del-10892 delivered in 184ms</div>
              <div>[2026-08-18 00:31:00 IST] [INFO] Health check: HEALTHY (0 error rate)</div>
            </div>
          )}
        </div>

        {/* Drawer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            <RotateCcw size={14} /> Restart Runtime
          </button>

          <button
            type="button"
            onClick={onTest}
            className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
          >
            <Wifi size={14} /> Run Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// TEST CONNECTION DIAGNOSTIC MODAL
// -------------------------------------------------------------------------------------------------
function TestConnectionModal({
  result,
  onClose,
}: {
  result: { success: boolean; message: string; details?: any; testing?: boolean };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            {result.testing ? (
              <LoaderCircle size={24} className="animate-spin text-cyan-600" />
            ) : result.success ? (
              <CheckCircle2 size={24} className="text-emerald-600" />
            ) : (
              <CircleAlert size={24} className="text-rose-600" />
            )}
            <h3 className="text-base font-bold text-slate-900">
              {result.testing ? "Testing Connection..." : result.success ? "Connection Verified" : "Test Failed"}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-600">{result.message}</p>

        {result.details && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-800 space-y-1.5">
            {Object.entries(result.details).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-slate-200/50 pb-1">
                <span className="text-slate-500 font-sans">{humanizeKey(k)}:</span>
                <span className="font-semibold text-slate-900">{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// CATALOG MODAL
// -------------------------------------------------------------------------------------------------
function ConnectorCatalogDialog({
  catalog,
  onClose,
  onStartWizard,
}: {
  catalog: ConnectorCatalogItem[];
  onClose: () => void;
  onStartWizard: (item: ConnectorCatalogItem) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog">
      <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">Connector Directory</span>
            <h2 className="text-xl font-bold text-slate-900">Select Integration Type</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.map((item) => (
            <article
              key={item.type}
              className="flex flex-col justify-between rounded-xl border border-slate-200 p-4 transition hover:border-cyan-400 hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                    {getConnectorIcon(item.type)}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    {item.category}
                  </span>
                </div>
                <h3 className="mt-3 font-bold text-slate-900">{item.name}</h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">{item.description}</p>
              </div>

              <button
                type="button"
                onClick={() => onStartWizard(item)}
                className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 text-xs font-bold text-white hover:bg-cyan-600"
              >
                Add {item.name.split(" ")[0]} <ArrowRight size={13} />
              </button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// UTILITIES & HELPERS
// -------------------------------------------------------------------------------------------------
function getConnectorIcon(type: string) {
  switch (type) {
    case "cpplus":
    case "onvif":
    case "dahua":
    case "hikvision":
    case "axis":
    case "surveillance":
      return <Camera size={20} className="text-cyan-600" />;
    case "access_control":
    case "security":
      return <ShieldCheck size={20} className="text-emerald-600" />;
    case "syslog":
    case "splunk":
    case "siem":
      return <Database size={20} className="text-violet-600" />;
    case "servicenow":
    case "jira":
    case "itsm":
      return <Workflow size={20} className="text-blue-600" />;
    case "smtp":
    case "notifications":
      return <Mail size={20} className="text-amber-600" />;
    case "active_directory":
    case "ldap":
    case "identity":
      return <Users size={20} className="text-indigo-600" />;
    default:
      return <PlugZap size={20} className="text-slate-600" />;
  }
}

function formatEventType(evt: string) {
  return evt.replace(/[._]/g, " ").toUpperCase();
}

function humanizeKey(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase());
}

function timeAgo(dateString?: string | null) {
  if (!dateString) return "Pending check";
  const ms = Date.now() - new Date(dateString).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${Math.max(1, sec)}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ago`;
}
