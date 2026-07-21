"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function NewAssetPage() {
  const router = useRouter();
  const [assetType, setAssetType] = useState('camera');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await maintenanceApi.createAsset({ category: assetType, assetType: assetType, make, model });
      router.push('/maintenance/assets');
    } catch (err: any) {
      setError(err?.message ?? 'Create failed');
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h1>New Asset</h1>
      <form onSubmit={submit}>
        <div>
          <label>Category
            <select value={assetType} onChange={(e) => setAssetType(e.target.value)}>
              <option value="camera">Camera</option>
              <option value="recorder">Recorder</option>
              <option value="storage">Storage</option>
              <option value="network">Network</option>
              <option value="power">Power</option>
              <option value="accessory">Accessory</option>
            </select>
          </label>
        </div>
        <div>
          <label>Make<input value={make} onChange={(e) => setMake(e.target.value)} /></label>
        </div>
        <div>
          <label>Model<input value={model} onChange={(e) => setModel(e.target.value)} /></label>
        </div>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button type="submit">Create</button>
      </form>
    </div>
  );
}
