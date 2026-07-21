"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function NewAssetPage() {
  const router = useRouter();
  const [assetType, setAssetType] = useState("");
  const [category, setCategory] = useState("camera");
  const [serialNumber, setSerialNumber] = useState("");
  const [status, setStatus] = useState("operational");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = { category, assetType, serialNumber: serialNumber || undefined, status };
      await maintenanceApi.createAsset(payload);
      router.push('/maintenance/assets');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Create new asset</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 8 }}>
          <label>Category<br />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
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
            <input value={assetType} onChange={(e) => setAssetType(e.target.value)} required />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Serial number<br />
            <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Status<br />
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="operational">operational</option>
              <option value="degraded">degraded</option>
              <option value="maintenance_due">maintenance_due</option>
              <option value="offline">offline</option>
              <option value="retired">retired</option>
            </select>
          </label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Create'}</button>
      </form>
    </div>
  );
}
