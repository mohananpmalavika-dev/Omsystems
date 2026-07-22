"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { privacyApi } from "@/lib/api-client";

export default function PrivacyBreachesPage() {
  const [breaches, setBreaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void privacyApi.listBreaches()
      .then((res) => setBreaches(res.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1>Privacy Breaches</h1>
          <p style={{ color: "#555" }}>Review reported privacy breaches and track their status.</p>
        </div>
        <Link href="/maintenance/privacy" style={{ color: "#2563eb" }}>
          Back to privacy
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <Link href="/maintenance/privacy/breaches/new" style={{ color: "#2563eb" }}>
          Report a breach
        </Link>
      </div>

      {loading ? (
        <p>Loading breaches…</p>
      ) : breaches.length === 0 ? (
        <p style={{ color: "#4b5563" }}>No breaches reported yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {breaches.map((breach) => (
            <div key={breach.id} style={{ padding: 18, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h2 style={{ margin: 0 }}>{breach.breachType.replace(/_/g, " ")}</h2>
                <span style={{ color: breach.status === "closed" ? "#16a34a" : breach.status === "investigating" ? "#ca8a04" : "#d97706" }}>
                  {breach.status}
                </span>
              </div>
              <p style={{ margin: "0 0 6px", color: "#4b5563" }}>Severity: {breach.severity}</p>
              <p style={{ margin: 0, color: "#374151" }}>{breach.description || "No description provided."}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
