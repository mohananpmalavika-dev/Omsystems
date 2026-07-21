"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [asset, setAsset] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void maintenanceApi.getAsset(id).then((res) => setAsset(res)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!asset) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        assetType: asset.assetType,
        category: asset.category,
        serialNumber: asset.serialNumber || undefined,
        status: asset.status,
        notes: asset.notes || undefined,
      };
      await maintenanceApi.updateAsset(id, payload);
      router.push('/maintenance/assets');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!asset) return <div style={{ padding: 16 }}>Asset not found</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>Asset {asset.id}</h1>
      <form onSubmit={handleSave} style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 8 }}>
          <label>Category<br />
            <select value={asset.category} onChange={(e) => setAsset({ ...asset, category: e.target.value })}>
              <option value="camera">camera</option>
              <option value="recorder">recorder</option>
              <option value="storage">storage</option>
              <option value="network">network</option>
              <option value="power">power</option>
              <option value="accessory">accessory</option>
            </select>
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Type<br />
            <input value={asset.assetType} onChange={(e) => setAsset({ ...asset, assetType: e.target.value })} required />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Serial number<br />
            <input value={asset.serialNumber ?? ""} onChange={(e) => setAsset({ ...asset, serialNumber: e.target.value })} />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Status<br />
            <select value={asset.status} onChange={(e) => setAsset({ ...asset, status: e.target.value })}>
              <option value="operational">operational</option>
              <option value="degraded">degraded</option>
              <option value="maintenance_due">maintenance_due</option>
              <option value="offline">offline</option>
              <option value="retired">retired</option>
            </select>
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Notes<br />
            <textarea value={asset.notes ?? ""} onChange={(e) => setAsset({ ...asset, notes: e.target.value })} rows={4} />
          </label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
