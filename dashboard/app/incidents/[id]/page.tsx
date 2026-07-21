"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

type TimelineEntry = { id: string; eventType: string; details: any; createdBy?: string; createdAt: string };
type Incident = { id: string; incidentNumber: string; title: string; description?: string; status?: string; createdAt?: string; assignedTo?: string };

export default function IncidentDetailPage() {
  const pathname = usePathname();
  const id = pathname.split('/').pop() || '';
  const [incident, setIncident] = useState<Incident | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState('');
  const [assignee, setAssignee] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [fromAt, setFromAt] = useState('');
  const [toAt, setToAt] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [incRes, tlRes] = await Promise.all([
        fetch(`/api/control/v1/incidents/${id}`),
        fetch(`/api/control/v1/incidents/${id}/timeline`),
      ]);
      if (!incRes.ok) throw new Error('Failed to load incident');
      const inc = await incRes.json();
      const tl = await tlRes.json();
      setIncident(inc);
      setTimeline(tl.data ?? []);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (id) load(); }, [id]);

  async function updateStatus(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/control/v1/incidents/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error('Failed to update status');
      await load();
    } catch (e: any) { setError(e.message || 'Error'); }
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/control/v1/incidents/${id}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: assignee }) });
      if (!res.ok) throw new Error('Failed to assign');
      await load();
    } catch (e: any) { setError(e.message || 'Error'); }
  }

  async function addRange(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/control/v1/incidents/${id}/video-ranges`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cameraId, from: fromAt, to: toAt }) });
      if (!res.ok) throw new Error('Failed to add range');
      await load();
    } catch (e: any) { setError(e.message || 'Error'); }
  }

  if (!id) return <div style={{ padding: 16 }}>Invalid incident id</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>Incident detail</h1>
      {loading && <div>Loading…</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {incident && (
        <div>
          <h2>{incident.incidentNumber} — {incident.title}</h2>
          <p>{incident.description}</p>
          <p>Status: {incident.status ?? 'n/a'}</p>
          <p>Assigned: {incident.assignedTo ?? 'unassigned'}</p>

          <section style={{ marginTop: 24 }}>
            <h3>Actions</h3>
            <form onSubmit={updateStatus} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input placeholder="New status" value={status} onChange={(e) => setStatus(e.target.value)} />
              <button type="submit">Update Status</button>
            </form>

            <form onSubmit={assign} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input placeholder="Assign user id" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
              <button type="submit">Assign</button>
            </form>

            <form onSubmit={addRange} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input placeholder="Camera id" value={cameraId} onChange={(e) => setCameraId(e.target.value)} />
              <input placeholder="From (ISO)" value={fromAt} onChange={(e) => setFromAt(e.target.value)} />
              <input placeholder="To (ISO)" value={toAt} onChange={(e) => setToAt(e.target.value)} />
              <button type="submit">Add Video Range</button>
            </form>
          </section>

          <section style={{ marginTop: 24 }}>
            <h3>Timeline</h3>
            <ul>
              {timeline.map((t) => (
                <li key={t.id} style={{ marginBottom: 8 }}>
                  <strong>{t.eventType}</strong> — {t.createdAt} — {JSON.stringify(t.details)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
