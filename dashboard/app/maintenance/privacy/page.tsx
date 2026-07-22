"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { privacyApi } from "@/lib/api-client";

export default function MaintenancePrivacyPage() {
  const [summary, setSummary] = useState<any>(null);
  const [purposes, setPurposes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    void Promise.all([privacyApi.getSummary(), privacyApi.listPurposes()])
      .then(([summaryData, purposesData]) => {
        setSummary(summaryData);
        setPurposes(purposesData.data ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1>Privacy & Data Protection</h1>
          <p style={{ color: "#555" }}>
            Manage lawful purposes, camera privacy controls, and incident breach response for CCTV.
          </p>
        </div>
        <Link href="/maintenance" style={{ color: "#2563eb" }}>
          Back to maintenance
        </Link>
      </div>

      {error && (
        <div style={{ marginBottom: 20, padding: 12, background: "#fee", border: "1px solid #fbb", borderRadius: 10, color: "#900" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 16, marginBottom: 24, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div style={{ padding: 20, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 8 }}>Active purposes</h2>
          <p style={{ fontSize: 32, margin: 0 }}>{loading ? "…" : summary?.activePurposes ?? 0}</p>
        </div>
        <div style={{ padding: 20, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 8 }}>Assigned camera purposes</h2>
          <p style={{ fontSize: 32, margin: 0 }}>{loading ? "…" : summary?.assignedPurposes ?? 0}</p>
        </div>
        <div style={{ padding: 20, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginBottom: 8 }}>Open breaches</h2>
          <p style={{ fontSize: 32, margin: 0 }}>{loading ? "…" : summary?.openBreaches ?? 0}</p>
        </div>
      </div>

      <section style={{ marginBottom: 24, padding: 20, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>Purpose register</h2>
            <p style={{ color: "#6b7280", margin: 0 }}>Track lawful CCTV purposes and risk levels.</p>
          </div>
          <Link href="/maintenance/privacy/purposes/new" style={{ color: "#2563eb" }}>
            Add purpose
          </Link>
        </div>

        {loading ? (
          <p>Loading purposes…</p>
        ) : purposes.length === 0 ? (
          <p style={{ color: "#4b5563" }}>No privacy purposes defined yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {purposes.slice(0, 5).map((purpose) => (
              <div key={purpose.id} style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                <h3 style={{ margin: "0 0 8px" }}>{purpose.name}</h3>
                <p style={{ margin: "0 0 8px", color: "#4b5563" }}>{purpose.lawfulBasis}</p>
                <p style={{ margin: 0, color: "#6b7280" }}>Risk: {purpose.riskLevel}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div style={{ padding: 20, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
          <h2>Key actions</h2>
          <ul style={{ margin: 0, paddingLeft: 20, color: "#374151" }}>
            <li><Link href="/maintenance/privacy/purposes">Manage purposes</Link></li>
            <li><Link href="/maintenance/privacy/purposes/new">Add new purpose</Link></li>
            <li><Link href="/maintenance/privacy/breaches">View breaches</Link></li>
            <li><Link href="/maintenance/privacy/breaches/new">Report breach</Link></li>
            <li><Link href="/maintenance/privacy/controls">Camera controls</Link></li>
            <li><Link href="/maintenance/privacy/cameras">Assign purpose to camera</Link></li>
          </ul>
        </div>
      </section>
    </div>
  );
}
