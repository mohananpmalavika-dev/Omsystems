"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function WorkOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [item, setItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void maintenanceApi.getWorkOrder(id).then((r) => setItem(r)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        title: item.title,
        description: item.description || undefined,
        assetId: item.assetId || undefined,
        priority: item.priority,
        scheduledAt: item.scheduledAt || undefined,
        status: item.status,
      };
      await maintenanceApi.updateWorkOrder(id, payload);
      router.push('/maintenance/workorders');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!item) return <div style={{ padding: 16 }}>Work order not found</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>Work Order {item.id}</h1>
      <form onSubmit={handleSave} style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: 8 }}>
          <label>Title<br />
            <input value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} required />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Description<br />
            <textarea value={item.description ?? ""} onChange={(e) => setItem({ ...item, description: e.target.value })} rows={4} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Asset ID<br />
            <input value={item.assetId ?? ""} onChange={(e) => setItem({ ...item, assetId: e.target.value })} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Priority<br />
            <select value={item.priority} onChange={(e) => setItem({ ...item, priority: e.target.value })}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Scheduled At<br />
            <input type="datetime-local" value={item.scheduledAt ?? ""} onChange={(e) => setItem({ ...item, scheduledAt: e.target.value })} />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Status<br />
            <select value={item.status ?? 'open'} onChange={(e) => setItem({ ...item, status: e.target.value })}>
              <option value="open">open</option>
              <option value="in_progress">in_progress</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
