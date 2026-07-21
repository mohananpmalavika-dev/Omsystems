"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

<<<<<<< HEAD
export default function WorkOrdersListPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
=======
export default function WorkOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
>>>>>>> c3a5c2bcbd7e63f2e57e4b702517ddd24cd20012
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
<<<<<<< HEAD
    void maintenanceApi.listWorkOrders().then((r) => setItems(r.data)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
=======
    void maintenanceApi.listWorkOrders()
      .then((resp) => setOrders(resp.data || []))
      .catch((err) => setError(err.message || "Failed to load work orders"))
      .finally(() => setLoading(false));
>>>>>>> c3a5c2bcbd7e63f2e57e4b702517ddd24cd20012
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Work Orders</h1>
<<<<<<< HEAD
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
=======
      <p>Active and historical maintenance work orders.</p>
      <div style={{ margin: "12px 0" }}>
        <Link href="/maintenance">Back to maintenance</Link>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && orders.length === 0 && <p>No work orders found.</p>}

      <ul>
        {orders.map((o) => (
          <li key={o.id} style={{ margin: "8px 0" }}>
            <strong>{o.workOrderNumber}</strong> — {o.problem}
            <div>Status: {o.status} • Severity: {o.severity}</div>
            <div>
              <Link href={`/maintenance/workorders/${o.id}`}>View</Link>
            </div>
          </li>
        ))}
      </ul>
>>>>>>> c3a5c2bcbd7e63f2e57e4b702517ddd24cd20012
    </div>
  );
}
