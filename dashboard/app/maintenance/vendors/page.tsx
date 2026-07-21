"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

<<<<<<< HEAD
export default function VendorsListPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
=======
export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
>>>>>>> c3a5c2bcbd7e63f2e57e4b702517ddd24cd20012
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
<<<<<<< HEAD
    void maintenanceApi.listVendors().then((r) => setVendors(r.data)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
=======
    void maintenanceApi.listVendors()
      .then((resp) => setVendors(resp.data || []))
      .catch((err) => setError(err.message || "Failed to load vendors"))
      .finally(() => setLoading(false));
>>>>>>> c3a5c2bcbd7e63f2e57e4b702517ddd24cd20012
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Vendors</h1>
<<<<<<< HEAD
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
=======
      <p>Manage vendor contacts and details.</p>
      <div style={{ margin: "12px 0" }}>
        <Link href="/maintenance">Back to maintenance</Link>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && vendors.length === 0 && <p>No vendors found.</p>}

      <ul>
        {vendors.map((v) => (
          <li key={v.id} style={{ margin: "8px 0" }}>
            <strong>{v.name}</strong> — {v.contact ?? v.email ?? "-"}
            <div>
              <Link href={`/maintenance/vendors/${v.id}`}>View</Link>
            </div>
          </li>
        ))}
      </ul>
>>>>>>> c3a5c2bcbd7e63f2e57e4b702517ddd24cd20012
    </div>
  );
}
