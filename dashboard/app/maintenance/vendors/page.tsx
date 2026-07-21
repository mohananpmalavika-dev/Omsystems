"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi.listVendors()
      .then((resp) => setVendors(resp.data || []))
      .catch((err) => setError(err.message || "Failed to load vendors"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Vendors</h1>
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
    </div>
  );
}
