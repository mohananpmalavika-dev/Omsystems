"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { privacyApi } from "@/lib/api-client";

export default function PrivacyPurposesPage() {
  const [purposes, setPurposes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void privacyApi.listPurposes()
      .then((res) => setPurposes(res.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1>Privacy Purposes</h1>
          <p style={{ color: "#555" }}>Define and review lawful CCTV processing purposes.</p>
        </div>
        <Link href="/maintenance/privacy/purposes/new" style={{ color: "#2563eb" }}>
          New purpose
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <Link href="/maintenance/privacy/cameras" style={{ color: "#2563eb" }}>
          Assign purpose to a camera
        </Link>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {loading ? (
          <p>Loading purposes…</p>
        ) : purposes.length === 0 ? (
          <p style={{ color: "#4b5563" }}>There are no purposes yet.</p>
        ) : (
          purposes.map((purpose) => (
            <div key={purpose.id} style={{ padding: 18, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ margin: 0 }}>{purpose.name}</h2>
                  <p style={{ margin: "6px 0", color: "#6b7280" }}>{purpose.lawfulBasis}</p>
                </div>
                <span style={{ color: purpose.active ? "#16a34a" : "#6b7280" }}>
                  {purpose.active ? "Active" : "Inactive"}
                </span>
              </div>
              <p style={{ margin: "12px 0 0", color: "#374151" }}>{purpose.description || "No description provided."}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
