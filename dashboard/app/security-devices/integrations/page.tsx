'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Shield, WifiOff } from 'lucide-react';

interface IntegrationSummary {
  id: string;
  name: string;
  branchId: string;
  host: string;
  port: number;
  transport: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'MAINTENANCE';
  enabled: boolean;
  devicesManaged: number;
  totalEventsProcessed: number;
  lastSyncAt?: string;
  lastErrorMessage?: string;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/security-devices/integrations', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Unable to load integrations');
      setIntegrations(body.data || []);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runAction = async (id: string, action: 'test' | 'discover' | 'poll') => {
    setMessage(null);
    try {
      const response = await fetch(`/api/security-devices/integrations/${id}/${action}`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || `${action} failed`);
      setMessage(action === 'discover'
        ? `Discovery completed. ${body.data?.devices?.length || 0} device records were staged for approval.`
        : action === 'poll'
          ? `Event poll completed. ${body.data?.eventsProcessed || 0} new events were stored.`
          : body.data?.success ? 'AX PRO connection succeeded.' : body.data?.errorMessage || 'AX PRO connection failed.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${action} failed`);
    }
  };

  const activeCount = integrations.filter((integration) => integration.status === 'ACTIVE').length;
  const errorCount = integrations.filter((integration) => integration.status === 'ERROR').length;

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Security device integrations</p>
            <h1 className="text-3xl font-semibold">Hikvision AX PRO</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">Read-only ISAPI connectivity, device discovery, health, and event polling. Discovered devices remain pending until an operator approves them.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/security-devices" className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900">Device hub</Link>
            <Link href="/settings/integrations/hikvision/ax-pro" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500">Add AX PRO</Link>
          </div>
        </div>

        {message && <div className="mb-6 rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">{message}</div>}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Summary label="Configured integrations" value={integrations.length} icon={<Shield className="h-5 w-5 text-blue-400" />} />
          <Summary label="Active" value={activeCount} icon={<CheckCircle className="h-5 w-5 text-emerald-400" />} />
          <Summary label="Errors" value={errorCount} icon={<AlertCircle className="h-5 w-5 text-rose-400" />} />
        </div>

        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div><h2 className="text-lg font-semibold">Configured AX PRO integrations</h2><p className="mt-1 text-sm text-slate-400">All values below are read from the integration store.</p></div>
            <button onClick={() => void load()} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" title="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>

          {loading ? <p className="py-10 text-center text-sm text-slate-400">Loading integration state…</p> : integrations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 px-6 py-12 text-center">
              <WifiOff className="mx-auto mb-3 h-8 w-8 text-slate-500" />
              <p className="font-medium">No AX PRO integrations configured</p>
              <p className="mt-1 text-sm text-slate-400">Create one with a vault reference; passwords are never entered or stored here.</p>
              <Link href="/settings/integrations/hikvision/ax-pro" className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500">Configure AX PRO</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {integrations.map((integration) => (
                <article key={integration.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold">{integration.name}</h3><Status status={integration.status} /><span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">{integration.transport} · {integration.host}:{integration.port}</span></div>
                      <p className="mt-2 text-xs text-slate-500">Branch {integration.branchId} · {integration.devicesManaged} enrolled devices · {integration.totalEventsProcessed} stored events</p>
                      {integration.lastSyncAt && <p className="mt-1 text-xs text-slate-500">Last sync: {new Date(integration.lastSyncAt).toLocaleString()}</p>}
                      {integration.lastErrorMessage && <p className="mt-2 text-sm text-rose-300">{integration.lastErrorMessage}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2"><button onClick={() => void runAction(integration.id, 'test')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800">Test</button><button onClick={() => void runAction(integration.id, 'discover')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800">Discover & stage</button><button onClick={() => void runAction(integration.id, 'poll')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold hover:bg-blue-500">Poll events</button></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Summary({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><div className="mb-3 flex items-center gap-2 text-sm text-slate-400">{icon}{label}</div><p className="text-3xl font-semibold">{value}</p></div>;
}

function Status({ status }: { status: IntegrationSummary['status'] }) {
  const tone = status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-300' : status === 'ERROR' ? 'bg-rose-950 text-rose-300' : 'bg-slate-800 text-slate-300';
  return <span className={`rounded px-2 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}
