"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function WorkOrdersListPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi.listWorkOrders().then((r) => setItems(r.data)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Work Orders</h1>
      <div style={{ marginBottom: 12 }}>
        <Link href="/maintenance/workorders/new">Create work order</Link>
      </div>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 8 }}>ID</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Title</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Asset</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Priority</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Status</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{it.id}</td>
              <td style={{ padding: 8 }}>{it.title}</td>
              <td style={{ padding: 8 }}>{it.assetId ?? '-'}</td>
              <td style={{ padding: 8 }}>{it.priority ?? '-'}</td>
              <td style={{ padding: 8 }}>{it.status ?? '-'}</td>
              <td style={{ padding: 8 }}>
                <Link href={`/maintenance/workorders/${it.id}`}>View / Edit</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
