"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";

type Incident = {
  id: string;
  incidentNumber: string;
  title: string;
  description?: string;
  status?: string;
  createdAt?: string;
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ incidentNumber: "", title: "", description: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/control/v1/incidents');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setIncidents(data.data ?? []);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/control/v1/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentNumber: form.incidentNumber, title: form.title, description: form.description }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || 'Create failed');
      }
      const created = await res.json();
      setIncidents((s) => [created, ...s]);
      setForm({ incidentNumber: '', title: '', description: '' });
    } catch (e: any) {
      setError(e.message || 'Error');
    }
  }

  return (
    <AppLayout>
      <div className="content">
        <div style={{ padding: 16 }}>
      <h1>Incidents</h1>

      <section style={{ marginTop: 16, marginBottom: 24 }}>
        <h2>Create Incident</h2>
        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
          <input placeholder="Incident number" value={form.incidentNumber} onChange={(e) => setForm({ ...form, incidentNumber: e.target.value })} />
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div>
            <button type="submit">Create</button>
          </div>
        </form>
        {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
      </section>

      <section>
        <h2>List</h2>
        {loading ? (
          <div>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>#</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Title</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Status</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((it) => (
                <tr key={it.id}>
                  <td style={{ padding: '8px 4px' }}>
                    <Link href={`/incidents/${it.id}`}>{it.incidentNumber}</Link>
                  </td>
                  <td style={{ padding: '8px 4px' }}>
                    <Link href={`/incidents/${it.id}`}>{it.title}</Link>
                  </td>
                  <td style={{ padding: '8px 4px' }}>{it.status ?? 'n/a'}</td>
                  <td style={{ padding: '8px 4px' }}>{it.createdAt ? new Date(it.createdAt).toLocaleString() : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
        </div>
      </div>
    </AppLayout>
  );
}
