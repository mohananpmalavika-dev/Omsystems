"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function AssetsListPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi.listAssets().then((res) => setAssets(res.data)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Assets</h1>
      <div style={{ marginBottom: 12 }}>
        <Link href="/maintenance/assets/new">Create new asset</Link>
      </div>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8 }}>ID</th>
            <th style={{ textAlign: "left", padding: 8 }}>Type</th>
            <th style={{ textAlign: "left", padding: 8 }}>Category</th>
            <th style={{ textAlign: "left", padding: 8 }}>Status</th>
            <th style={{ textAlign: "left", padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.id} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{a.id}</td>
              <td style={{ padding: 8 }}>{a.assetType}</td>
              <td style={{ padding: 8 }}>{a.category}</td>
              <td style={{ padding: 8 }}>{a.status}</td>
              <td style={{ padding: 8 }}>
                <Link href={`/maintenance/assets/${a.id}`}>View / Edit</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
