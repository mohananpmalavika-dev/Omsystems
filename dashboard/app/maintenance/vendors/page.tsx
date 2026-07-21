"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function VendorsListPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi.listVendors().then((r) => setVendors(r.data)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Vendors</h1>
      <div style={{ marginBottom: 12 }}>
        <Link href="/maintenance/vendors/new">Add vendor</Link>
      </div>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 8 }}>ID</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Name</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Contact</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Phone</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Active</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{v.id}</td>
              <td style={{ padding: 8 }}>{v.name}</td>
              <td style={{ padding: 8 }}>{v.contactName ?? '-'}</td>
              <td style={{ padding: 8 }}>{v.phone ?? '-'}</td>
              <td style={{ padding: 8 }}>{v.active ? 'yes' : 'no'}</td>
              <td style={{ padding: 8 }}>
                <Link href={`/maintenance/vendors/${v.id}`}>View / Edit</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
