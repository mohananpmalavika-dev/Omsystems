"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function WorkOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi.listWorkOrders()
      .then((resp) => setOrders(resp.data || []))
      .catch((err) => setError(err.message || "Failed to load work orders"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Work Orders</h1>
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
    </div>
  );
}
