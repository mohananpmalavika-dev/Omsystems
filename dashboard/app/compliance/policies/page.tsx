"use client";

import React, { useEffect, useState } from "react";
import { complianceApi } from "@/lib/api-client";
import type { CompliancePolicy } from "@/lib/types";

export default function CompliancePoliciesPage() {
  const [policies, setPolicies] = useState<CompliancePolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void complianceApi.listPolicies().then((res) => {
      setPolicies(res.data as CompliancePolicy[]);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to load policies");
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Compliance policies</h1>
      <p>Policies define how frameworks apply to cameras, locations, and retention.</p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : policies.length === 0 ? (
        <p>No compliance policies defined yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Policy name</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Framework</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Retention</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id}>
                <td style={{ padding: 8 }}>{policy.policyName}</td>
                <td style={{ padding: 8 }}>{policy.frameworkId}</td>
                <td style={{ padding: 8 }}>{policy.normalRetentionDays ?? "—"} days</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
