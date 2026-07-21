"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assetId, setAssetId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: any = { title, description: description || undefined, assetId: assetId || undefined, priority, scheduledAt: scheduledAt || undefined };
      await maintenanceApi.createWorkOrder(payload);
      router.push('/maintenance/workorders');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Create Work Order</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: 8 }}>
          <label>Title<br />
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Description<br />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Asset ID (optional)<br />
            <input value={assetId} onChange={(e) => setAssetId(e.target.value)} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Priority<br />
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Scheduled At<br />
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create'}</button>
      </form>
    </div>
  );
}
