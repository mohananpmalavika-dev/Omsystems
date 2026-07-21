"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

<<<<<<< HEAD
export default function AssetsListPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
=======
export default function AssetsPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
>>>>>>> c3a5c2bcbd7e63f2e57e4b702517ddd24cd20012
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
<<<<<<< HEAD
    void maintenanceApi.listAssets().then((res) => setAssets(res.data)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
=======
    void maintenanceApi.listAssets()
      .then((resp) => setAssets(resp.data || []))
      .catch((err) => setError(err.message || "Failed to load assets"))
      .finally(() => setLoading(false));
>>>>>>> c3a5c2bcbd7e63f2e57e4b702517ddd24cd20012
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Assets</h1>
<<<<<<< HEAD
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
=======
      <p>Inventory of tracked physical assets.</p>
      <div style={{ margin: "12px 0" }}>
        <Link href="/maintenance">Back to maintenance</Link>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && assets.length === 0 && <p>No assets found.</p>}

      <ul>
        {assets.map((a) => (
          <li key={a.id} style={{ margin: "8px 0" }}>
            <strong>{a.assetType}</strong> — {a.make ?? "-"} {a.model ?? ""}
            {a.branchNodeId ? (<> — branch: {a.branchNodeId}</>) : null}
            <div>
              <Link href={`/maintenance/assets/${a.id}`}>View</Link>
            </div>
          </li>
        ))}
      </ul>
>>>>>>> c3a5c2bcbd7e63f2e57e4b702517ddd24cd20012
    </div>
  );
}
