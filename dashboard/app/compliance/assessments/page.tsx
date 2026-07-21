"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { complianceApi } from "@/lib/api-client";
import type { ComplianceAssessment } from "@/lib/types";

export default function ComplianceAssessmentsPage() {
  const [assessments, setAssessments] = useState<ComplianceAssessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void complianceApi.listAssessments().then((res) => {
      setAssessments(res.data as ComplianceAssessment[]);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to load assessments");
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Compliance assessments</h1>
      <p>Assessments capture compliance status and evidence for a framework and location.</p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : assessments.length === 0 ? (
        <p>No assessments have been created yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Assessment</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Framework</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Status</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {assessments.map((assessment) => (
              <tr key={assessment.id}>
                <td style={{ padding: 8 }}>
                  <Link href={`/compliance/assessments/${assessment.id}`}>Assessment {assessment.id.slice(0, 8)}</Link>
                </td>
                <td style={{ padding: 8 }}>{assessment.frameworkId}</td>
                <td style={{ padding: 8 }}>{assessment.status}</td>
                <td style={{ padding: 8 }}>{new Date(assessment.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
