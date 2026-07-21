"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function AmcContractsListPage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi
      .listAmcContracts()
      .then((res) => setContracts(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>AMC contracts</h1>
      <div style={{ marginBottom: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/maintenance/amc/new">Create AMC contract</Link>
        <Link href="/maintenance">Back to maintenance</Link>
      </div>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8 }}>Contract</th>
            <th style={{ textAlign: "left", padding: 8 }}>Vendor</th>
            <th style={{ textAlign: "left", padding: 8 }}>Status</th>
            <th style={{ textAlign: "left", padding: 8 }}>Period</th>
            <th style={{ textAlign: "left", padding: 8 }}>Cost</th>
            <th style={{ textAlign: "left", padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => (
            <tr key={contract.id} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{contract.contractNumber}</td>
              <td style={{ padding: 8 }}>{contract.vendorId}</td>
              <td style={{ padding: 8 }}>{contract.status}</td>
              <td style={{ padding: 8 }}>
                {contract.startDate ?? "-"} {contract.endDate ? `to ${contract.endDate}` : ""}
              </td>
              <td style={{ padding: 8 }}>{contract.cost ?? "-"}</td>
              <td style={{ padding: 8 }}>
                <Link href={`/maintenance/amc/${contract.id}`}>View / Edit</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
