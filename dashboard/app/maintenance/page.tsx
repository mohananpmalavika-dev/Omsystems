"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function MaintenancePage() {
  const [counts, setCounts] = useState({ assets: 0, workOrders: 0, vendors: 0, amc: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void Promise.all([
      maintenanceApi.listAssets(),
      maintenanceApi.listWorkOrders(),
      maintenanceApi.listVendors(),
      maintenanceApi.listAmcContracts(),
    ]).then(([assets, workOrders, vendors, amc]) => {
      setCounts({
        assets: assets.data.length,
        workOrders: workOrders.data.length,
        vendors: vendors.data.length,
        amc: amc.data.length,
      });
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to calculate maintenance summary");
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>System maintenance</h1>
      <p>Manage assets, work orders, vendors, and AMC contracts for operational uptime.</p>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, margin: "24px 0" }}>
        <article style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
          <h2>{loading ? "…" : counts.assets}</h2>
          <p>Tracked assets</p>
          <Link href="/maintenance/assets">View assets</Link>
        </article>
        <article style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
          <h2>{loading ? "…" : counts.workOrders}</h2>
          <p>Open work orders</p>
          <Link href="/maintenance/workorders">Manage work orders</Link>
        </article>
        <article style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
          <h2>{loading ? "…" : counts.vendors}</h2>
          <p>Vendors</p>
          <Link href="/maintenance/vendors">Manage vendors</Link>
        </article>
        <article style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
          <h2>{loading ? "…" : counts.amc}</h2>
          <p>AMC contracts</p>
          <Link href="/maintenance/amc">Manage AMCs</Link>
        </article>
      </section>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <section style={{ marginTop: 24 }}>
        <h2>Quick actions</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <Link href="/maintenance/assets">Assets</Link>
          <Link href="/maintenance/workorders">Work orders</Link>
          <Link href="/maintenance/vendors">Vendors</Link>
          <Link href="/maintenance/amc">AMC contracts</Link>
        </div>
      </section>
    </div>
  );
}
