"use client";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ProtectionPolicy, RecordingCheck, SopReview } from '../../src/branch-protection/types';

interface Overview {
  status: string; reasons: string[]; totalCameras: number; verifiedCameras: number; lastRunAt: string | null;
  verificationRunning: boolean;
  policy: ProtectionPolicy; reviews: SopReview[];
  cameras: Array<{ id: string; name: string; critical: boolean; check: RecordingCheck | null }>;
}
const button = 'rounded border border-slate-600 px-3 py-2 text-sm disabled:opacity-40 hover:bg-slate-800';
const field = 'w-full rounded border border-slate-600 bg-slate-950 p-2 text-sm';
function headers() {
  const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}`, 'x-sentinel-session': token } : {}) };
}
export function BranchProtectionPanel({ branchId }: { branchId: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [policy, setPolicy] = useState<ProtectionPolicy | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [offline, setOffline] = useState('No authoritative sync telemetry received');
  const [delivery, setDelivery] = useState<Array<{ incident_id: string; channel: string; status: string; delivered_at: string | null; last_error: string | null }>>([]);
  const [evidence, setEvidence] = useState({ ruleId: '', cameraId: '', evidenceId: '', occurredAt: '' });
  const [recordings, setRecordings] = useState<Array<{ id: string; started_at: string; ended_at: string }>>([]);
  const [recordingError, setRecordingError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const request = useCallback(async (suffix: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`/v1/branches/${encodeURIComponent(branchId)}/protection${suffix}`, {
      method, headers: headers(), credentials: 'include', cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.message || json.error || `Request failed (${response.status})`);
    return json;
  }, [branchId]);
  const refresh = useCallback(async () => {
    const result = await request(''); setData(result.data); setPolicy(result.data.policy);
    try { const receipts = await request('/incident-delivery'); setDelivery(receipts.data); } catch { setDelivery([]); }
    try {
      const sync = await request('/offline');
      setOffline(sync.data.observed ? `Connectivity: ${sync.data.status.connectivity_state ?? 'Unknown'} · Queued: ${sync.data.status.queued_items_count ?? 'Unknown'}` : 'No authoritative sync telemetry received');
    } catch { setOffline('Offline sync telemetry unavailable'); }
  }, [request]);
  useEffect(() => {
    let active = true; setRecordings([]); setRecordingError('');
    setEvidence(previous => ({ ...previous, evidenceId: '' }));
    if (!evidence.cameraId || !Number.isFinite(Date.parse(evidence.occurredAt))) return;
    request(`/sop/recordings?cameraId=${encodeURIComponent(evidence.cameraId)}&at=${encodeURIComponent(new Date(evidence.occurredAt).toISOString())}`)
      .then(result => { if (active) { setRecordings(result.data); setEvidence(previous => ({ ...previous, evidenceId: result.data[0]?.id ?? '' })); } })
      .catch(cause => { if (active) setRecordingError(cause.message); });
    return () => { active = false; };
  }, [evidence.cameraId, evidence.occurredAt, request]);
  useEffect(() => {
    if (!data?.verificationRunning) return;
    const timer = setInterval(() => { request('').then(async result => { setData(result.data); const receipts = await request('/incident-delivery'); setDelivery(receipts.data); }).catch(cause => setError(cause.message)); }, 5000);
    return () => clearInterval(timer);
  }, [data?.verificationRunning, request]);
  useEffect(() => { let active = true; setData(null); setPolicy(null); setError('');
    request('').then(result => { if (active) { setData(result.data); setPolicy(result.data.policy); } }).catch(cause => { if (active) setError(cause.message); });
    request('/offline').then(result => { if (active) setOffline(result.data.observed ? `Connectivity: ${result.data.status.connectivity_state} · Queued: ${result.data.status.queued_items_count}` : 'No authoritative sync telemetry received'); }).catch(() => { if (active) setOffline('Offline sync telemetry unavailable'); });
    request('/incident-delivery').then(result => { if (active) setDelivery(result.data); }).catch(() => { if (active) setDelivery([]); });
    return () => { active = false; };
  }, [request]);
  const act = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); await refresh(); setMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Request failed'); }
    finally { setBusy(false); }
  };
  const download = async () => {
    const to = new Date(); const from = new Date(to.getTime() - 86400_000);
    const report = await request(`/report?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'branch-protection-report.json'; anchor.click(); URL.revokeObjectURL(url);
  };
  return <section className="space-y-5 text-slate-200" aria-label="Verified branch protection">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Verified branch protection</h2><p className="text-sm text-slate-400">Recording evidence, branch health and operating procedures.</p></div>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => act(refresh, 'Status refreshed')}>Refresh</button>
        <button className={button} disabled={busy || !data || data.verificationRunning} onClick={() => act(() => request('/verify', 'POST'), 'Recording verification started; results update automatically')}>{data?.verificationRunning ? 'Verifying recordings…' : busy ? 'Working…' : 'Verify recordings'}</button>
        <button className={button} disabled={busy || !data} onClick={() => act(download, 'Daily report downloaded')}>Daily report</button></div></div>
    {error && <p role="alert" className="rounded border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
    {!data && !error && <p>Loading protection evidence…</p>}
    {data && <><div className="rounded-xl border border-slate-700 bg-slate-900 p-5"><div className="flex flex-wrap justify-between gap-3">
      <strong className={data.status === 'PROTECTED' ? 'text-emerald-300' : data.status === 'AT_RISK' ? 'text-amber-300' : 'text-slate-300'}>{data.status.replaceAll('_', ' ')}</strong><span>{data.verifiedCameras}/{data.totalCameras} cameras with fresh decoded playback evidence</span></div>
      <p className="mt-2 text-xs text-slate-400">Last verification: {data.lastRunAt ? new Date(data.lastRunAt).toLocaleString() : 'Never'}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{data.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></div>
      <div className="overflow-x-auto rounded-xl border border-slate-700"><table className="w-full text-left text-sm"><thead className="bg-slate-900"><tr>{['Camera', 'Playback', 'Last checked', 'Gaps / indexed retention', 'Incident'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{data.cameras.map(camera => <tr className="border-t border-slate-800" key={camera.id}><td className="p-3">{camera.name}{camera.critical && <span className="ml-2 text-xs text-amber-300">Critical area</span>}</td>
          <td className="p-3">{camera.check?.status ?? 'UNKNOWN'}<p className="max-w-xs text-xs text-slate-400">{camera.check?.reason ?? 'No playback evidence'}</p></td><td className="p-3">{camera.check ? new Date(camera.check.checkedAt).toLocaleString() : 'Never'}</td>
          <td className="p-3">{camera.check ? `${camera.check.gaps.length} gaps / ${camera.check.indexedRetentionDays?.toFixed(1) ?? 'Unknown'} days` : 'Unknown'}{camera.check?.gaps.map((gap, index) => <p key={index} className="text-xs text-amber-300">{new Date(gap.from).toLocaleTimeString()} – {new Date(gap.to).toLocaleTimeString()} ({Math.round(gap.seconds)}s)</p>)}</td>
          <td className="p-3">{camera.check?.incidentId ? <div className="space-y-2"><Link className="text-blue-300 underline" href={`/incidents/${encodeURIComponent(camera.check.incidentId)}`}>Assign / investigate</Link>
            <input aria-label={`Recovery notes for ${camera.name}`} className={field} placeholder="Recovery notes" value={notes[camera.id] ?? ''} onChange={event => setNotes({ ...notes, [camera.id]: event.target.value })} />
            {delivery.filter(receipt => receipt.incident_id === camera.check?.incidentId).map((receipt, index) => <p key={index} className="text-xs text-slate-400">{receipt.channel}: {receipt.status}{receipt.delivered_at ? ` · ${new Date(receipt.delivered_at).toLocaleString()}` : ''}{receipt.last_error ? ` · ${receipt.last_error}` : ''}</p>)}
            {!delivery.some(receipt => receipt.incident_id === camera.check?.incidentId) && <p className="text-xs text-slate-400">No external delivery receipt available</p>}
            <button className={button} disabled={busy || data.verificationRunning || camera.check.status !== 'VERIFIED' || camera.check.gaps.length > 0} onClick={() => act(() => request(`/cameras/${encodeURIComponent(camera.id)}/resolve`, 'POST', { notes: notes[camera.id] ?? '' }), 'Recovery verified and incident closed')}>Confirm recovery</button></div> : '—'}</td></tr>)}</tbody></table></div>
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-5"><h3 className="font-semibold">Connectivity and priority replay</h3><p className="mt-2 text-sm">Cloud streaming: {data.policy.bandwidthMode === 'low' ? 'Low bandwidth · substream' : 'Normal'} · Viewer budget: {data.policy.maxConcurrentStreams}</p>
        <p className="mt-1 text-sm text-slate-400">Local recording continues independently. Offline requests replay critical incidents and evidence before routine telemetry.</p><p className="mt-2 text-sm">{offline}</p></div></>}
    {policy && <details className="rounded-xl border border-slate-700 bg-slate-900 p-5"><summary className="cursor-pointer font-semibold">Protection policy and SOP rules</summary>
      <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); void act(() => request('/policy', 'PUT', policy), 'Protection policy saved'); }}>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.enabled} onChange={event => setPolicy({ ...policy, enabled: event.target.checked })} /> Enable scheduled verification</label>
        <div className="grid gap-4 sm:grid-cols-3">{[
          ['verificationIntervalMinutes', 'Verification interval (minutes)'], ['verificationFreshMinutes', 'Evidence freshness (minutes)'], ['maxGapSeconds', 'Allowed gap (seconds)'], ['requiredRetentionDays', 'Retention policy (days)'], ['maxConcurrentStreams', 'Viewer stream budget'],
        ].map(([key, label]) => <label key={key} className="text-sm">{label}<input className={field} type="number" min="0" required value={policy[key as keyof ProtectionPolicy] as number} onChange={event => setPolicy({ ...policy, [key]: Number(event.target.value) })} /></label>)}
          <label className="text-sm">Bandwidth mode<select className={field} value={policy.bandwidthMode} onChange={event => setPolicy({ ...policy, bandwidthMode: event.target.value as 'normal' | 'low' })}><option value="normal">Normal</option><option value="low">Low bandwidth</option></select></label></div>
        <fieldset><legend className="text-sm font-semibold">Critical-area cameras</legend><div className="mt-2 flex flex-wrap gap-4">{data?.cameras.map(camera => <label key={camera.id} className="text-sm"><input type="checkbox" checked={policy.criticalCameraIds.includes(camera.id)} onChange={event => setPolicy({ ...policy, criticalCameraIds: event.target.checked ? [...policy.criticalCameraIds, camera.id] : policy.criticalCameraIds.filter(id => id !== camera.id) })} /> {camera.name}</label>)}</div></fieldset>
        {policy.sopRules.map((rule, index) => {
          const change = (patch: Partial<typeof rule>) => setPolicy({ ...policy, sopRules: policy.sopRules.map((item, at) => at === index ? { ...item, ...patch } : item) });
          return <fieldset className="space-y-3 rounded border border-slate-700 p-3" key={rule.id}><legend className="text-sm">SOP {index + 1}</legend><div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Title<input className={field} required minLength={3} value={rule.title} onChange={event => change({ title: event.target.value })} /></label>
            <label className="text-sm">Procedure<select className={field} value={rule.kind} onChange={event => change({ kind: event.target.value as typeof rule.kind })}>{['OPENING', 'CLOSING', 'RESTRICTED_ACCESS', 'AFTER_HOURS'].map(kind => <option key={kind}>{kind}</option>)}</select></label>
            <label className="text-sm">Time zone<input className={field} required value={rule.timeZone} onChange={event => change({ timeZone: event.target.value })} /></label>
            {(['startMinute', 'endMinute'] as const).map(key => <label key={key} className="text-sm">{key === 'startMinute' ? 'Window starts' : 'Window ends'}<input className={field} type="time" required value={`${Math.floor(rule[key] / 60).toString().padStart(2, '0')}:${(rule[key] % 60).toString().padStart(2, '0')}`} onChange={event => { const [hour, minute] = event.target.value.split(':').map(Number); change({ [key]: hour! * 60 + minute! }); }} /></label>)}</div>
            <div className="flex flex-wrap gap-3">{data?.cameras.map(camera => <label className="text-sm" key={camera.id}><input type="checkbox" checked={rule.cameraIds.includes(camera.id)} onChange={event => change({ cameraIds: event.target.checked ? [...rule.cameraIds, camera.id] : rule.cameraIds.filter(id => id !== camera.id) })} /> {camera.name}</label>)}</div>
            <label className="mr-4 text-sm"><input type="checkbox" checked={rule.mandatory} onChange={event => change({ mandatory: event.target.checked })} /> Mandatory review</label><button type="button" className={button} onClick={() => setPolicy({ ...policy, sopRules: policy.sopRules.filter(item => item.id !== rule.id) })}>Remove rule</button></fieldset>;
        })}
        <div className="flex gap-3"><button type="button" className={button} onClick={() => setPolicy({ ...policy, sopRules: [...policy.sopRules, { id: crypto.randomUUID(), title: '', kind: 'OPENING', cameraIds: [], timeZone: 'Asia/Kolkata', startMinute: 540, endMinute: 600, mandatory: true }] })}>Add SOP rule</button><button className={button} disabled={busy} type="submit">Save policy</button></div>
      </form></details>}
    {!!data?.policy.sopRules.length && <div className="rounded-xl border border-slate-700 p-5"><h3 className="font-semibold">SOP evidence and human review</h3>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void act(() => request('/sop/evidence', 'POST', { ...evidence, occurredAt: new Date(evidence.occurredAt).toISOString() }), 'Evidence added for review'); }}>
        <label className="text-sm">Procedure<select required className={field} value={evidence.ruleId} onChange={event => setEvidence({ ...evidence, ruleId: event.target.value })}><option value="">Select procedure</option>{data.policy.sopRules.map(rule => <option key={rule.id} value={rule.id}>{rule.title}</option>)}</select></label>
        <label className="text-sm">Camera<select required className={field} value={evidence.cameraId} onChange={event => setEvidence({ ...evidence, cameraId: event.target.value })}><option value="">Select camera</option>{data.cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.name}</option>)}</select></label>
        <label className="text-sm">Event time<input required className={field} type="datetime-local" value={evidence.occurredAt} onChange={event => setEvidence({ ...evidence, occurredAt: event.target.value })} /></label>
        <label className="text-sm">Recording evidence<select required className={field} value={evidence.evidenceId} onChange={event => setEvidence({ ...evidence, evidenceId: event.target.value })}><option value="">Select camera and event time</option>{recordings.map(recording => <option key={recording.id} value={recording.id}>{new Date(recording.started_at).toLocaleString()} – {new Date(recording.ended_at).toLocaleTimeString()}</option>)}</select>{recordingError && <span className="text-xs text-amber-300">{recordingError}</span>}{evidence.cameraId && evidence.occurredAt && !recordings.length && !recordingError && <span className="text-xs text-slate-400">No indexed recording is available at this event time.</span>}</label><button className={button} disabled={busy || !evidence.evidenceId}>Submit evidence</button></form>
      <div className="mt-4 space-y-3">{data.reviews.map(review => <div key={review.id} className="rounded border border-slate-700 p-3"><p className="text-sm">{data.policy.sopRules.find(rule => rule.id === review.ruleId)?.title ?? review.ruleId} · {review.outcome} · {new Date(review.occurredAt).toLocaleString()}</p>
        <Link className="text-xs text-blue-300 underline" href={`/recordings?branchId=${encodeURIComponent(branchId)}&cameraId=${encodeURIComponent(review.cameraId)}&from=${encodeURIComponent(review.occurredAt)}&to=${encodeURIComponent(new Date(Date.parse(review.occurredAt) + 60_000).toISOString())}`}>Review recording</Link>
        <label className="mt-2 block text-sm">Review notes<input className={field} value={notes[review.id] ?? ''} onChange={event => setNotes({ ...notes, [review.id]: event.target.value })} /></label><div className="mt-2 flex gap-2">{(['PASS', 'FAIL'] as const).map(outcome => <button key={outcome} className={button} disabled={busy} onClick={() => act(() => request(`/sop/${review.id}/review`, 'POST', { outcome, notes: notes[review.id] ?? '' }), 'SOP review recorded')}>{outcome === 'PASS' ? 'Confirm pass' : 'Flag failure'}</button>)}</div></div>)}</div></div>}
  </section>;
}
