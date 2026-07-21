"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function AssetsPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi.listAssets()
      .then((resp) => setAssets(resp.data || []))
      .catch((err) => setError(err.message || "Failed to load assets"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Assets</h1>
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
    </div>
  );
}
