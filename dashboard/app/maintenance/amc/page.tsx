"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function AmcPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi.listAmcContracts()
      .then((resp) => setList(resp.data || []))
      .catch((err) => setError(err.message || "Failed to load AMC contracts"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>AMC Contracts</h1>
      <p>Active and historical AMC contracts.</p>
      <div style={{ margin: "12px 0" }}>
        <Link href="/maintenance">Back to maintenance</Link>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && list.length === 0 && <p>No AMC contracts found.</p>}

      <ul>
        {list.map((c) => (
          <li key={c.id} style={{ margin: "8px 0" }}>
            <strong>{c.contractNumber}</strong> — Vendor: {c.vendorId ?? "-"}
            <div>
              <Link href={`/maintenance/amc/${c.id}`}>View</Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
