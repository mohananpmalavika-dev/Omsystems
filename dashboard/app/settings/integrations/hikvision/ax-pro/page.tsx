'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

interface FormState {
  name: string;
  branchId: string;
  host: string;
  port: string;
  protocol: 'HTTP' | 'HTTPS';
  credentialSecretId: string;
  pollingIntervalSeconds: string;
  systemInfo: string;
  capabilities: string;
  devices: string;
  deviceStatus: string;
  events: string;
}

const initialForm: FormState = {
  name: '', branchId: '', host: '', port: '443', protocol: 'HTTPS', credentialSecretId: '', pollingIntervalSeconds: '60',
  systemInfo: '/ISAPI/System/deviceInfo', capabilities: '', devices: '', deviceStatus: '', events: '',
};

export default function AxProSetupPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discovered, setDiscovered] = useState<number | null>(null);

  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const endpointPaths = Object.fromEntries([
        ['systemInfo', form.systemInfo], ['capabilities', form.capabilities], ['devices', form.devices], ['deviceStatus', form.deviceStatus], ['events', form.events],
      ].filter(([, value]) => value.trim()));
      const response = await fetch('/api/security-devices/integrations/hikvision/ax-pro', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name, branchId: form.branchId, host: form.host, port: Number(form.port), protocol: form.protocol,
          credentialSecretId: form.credentialSecretId, pollingIntervalSeconds: Number(form.pollingIntervalSeconds), endpointPaths,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Could not create integration');
      setIntegrationId(body.data.id); setMessage('Integration saved. Run a connection test before discovery.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create integration'); }
    finally { setBusy(false); }
  };

  const run = async (action: 'test' | 'discover') => {
    if (!integrationId) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/security-devices/integrations/${integrationId}/${action}`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || `${action} failed`);
      if (action === 'discover') setDiscovered(body.data.devices?.length || 0);
      setMessage(action === 'test' ? (body.data.success ? 'AX PRO connection succeeded.' : body.data.errorMessage || 'Connection failed.') : 'Discovery records were staged for approval.');
    } catch (error) { setMessage(error instanceof Error ? error.message : `${action} failed`); }
    finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Integration setup</p><h1 className="text-3xl font-semibold">Hikvision AX PRO</h1><p className="mt-2 text-sm text-slate-400">Credentials are referenced from the secret vault. This setup does not accept or persist a password.</p></div><Link href="/security-devices/integrations" className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900">Back</Link></div>
        {message && <div className="mb-5 rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">{message}</div>}
        <form onSubmit={create} className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
          <Field label="Integration name" value={form.name} onChange={(v) => update('name', v)} required placeholder="Branch AX PRO" />
          <div className="grid gap-4 md:grid-cols-2"><Field label="Branch ID" value={form.branchId} onChange={(v) => update('branchId', v)} required /><Field label="Credential secret reference" value={form.credentialSecretId} onChange={(v) => update('credentialSecretId', v)} required placeholder="secret://branches/<id>#axpro" /></div>
          <div className="grid gap-4 md:grid-cols-4"><Field label="Host" value={form.host} onChange={(v) => update('host', v)} required /><Field label="Port" value={form.port} onChange={(v) => update('port', v)} required type="number" /><label className="text-sm text-slate-300"><span className="mb-2 block">Transport</span><select value={form.protocol} onChange={(e) => update('protocol', e.target.value as 'HTTP' | 'HTTPS')} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"><option>HTTPS</option><option>HTTP</option></select></label><Field label="Poll seconds" value={form.pollingIntervalSeconds} onChange={(v) => update('pollingIntervalSeconds', v)} required type="number" /></div>
          <section><h2 className="mb-1 font-semibold">ISAPI endpoints</h2><p className="mb-4 text-xs text-slate-500">System info is standard. The remaining paths vary by AX PRO model and firmware; leave unsupported paths empty rather than guessing.</p><div className="grid gap-4 md:grid-cols-2"><Field label="System info" value={form.systemInfo} onChange={(v) => update('systemInfo', v)} /><Field label="Capabilities" value={form.capabilities} onChange={(v) => update('capabilities', v)} /><Field label="Devices / zones" value={form.devices} onChange={(v) => update('devices', v)} /><Field label="Device status" value={form.deviceStatus} onChange={(v) => update('deviceStatus', v)} /><Field label="Events" value={form.events} onChange={(v) => update('events', v)} /></div></section>
          <div className="flex flex-wrap gap-3"><button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save integration'}</button>{integrationId && <><button type="button" disabled={busy} onClick={() => void run('test')} className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-50">Test connection</button><button type="button" disabled={busy} onClick={() => void run('discover')} className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-50">Discover & stage</button></>}</div>
          {integrationId && <p className="text-xs text-slate-500">Integration ID: {integrationId}{discovered !== null ? ` · ${discovered} records staged` : ''}</p>}
        </form>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, required, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string; type?: string }) {
  return <label className="text-sm text-slate-300"><span className="mb-2 block">{label}</span><input required={required} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 placeholder:text-slate-600" /></label>;
}

