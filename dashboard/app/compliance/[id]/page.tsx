"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { complianceApi } from "@/lib/api-client";
import type { ComplianceAssessment, ComplianceFramework, CompliancePolicy } from "@/lib/types";

export default function ComplianceFrameworkDetailPage() {
  const pathname = usePathname();
  const id = pathname.split("/").pop() ?? "";
  const [framework, setFramework] = useState<ComplianceFramework | null>(null);
  const [policies, setPolicies] = useState<CompliancePolicy[]>([]);
  const [assessments, setAssessments] = useState<ComplianceAssessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    void Promise.all([
      complianceApi.getFramework(id),
      complianceApi.listPolicies(id),
      complianceApi.listAssessments({ frameworkId: id }),
    ]).then(([frameworkResult, policiesResult, assessmentsResult]) => {
      setFramework(frameworkResult as ComplianceFramework);
      setPolicies(policiesResult.data as CompliancePolicy[]);
      setAssessments(assessmentsResult.data as ComplianceAssessment[]);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to load framework details");
    }).finally(() => setLoading(false));
  }, [id]);

  if (!id) return <div style={{ padding: 16 }}>Invalid framework id</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>Compliance framework</h1>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {framework ? (
        <>
          <section style={{ marginBottom: 24 }}>
            <h2>{framework.name}</h2>
            <p>{framework.description || "No description provided."}</p>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><strong>Source</strong><div>{framework.source || "—"}</div></div>
              <div><strong>Status</strong><div>{framework.status || "—"}</div></div>
              <div><strong>Effective</strong><div>{framework.effectiveDate ? new Date(framework.effectiveDate).toLocaleDateString() : "—"}</div></div>
              <div><strong>Review</strong><div>{framework.reviewDate ? new Date(framework.reviewDate).toLocaleDateString() : "—"}</div></div>
            </dl>
          </section>

          <section style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Policies</h2>
              <Link href="/compliance/policies">Manage policies</Link>
            </div>
            {policies.length === 0 ? (
              <p>No policies are linked to this framework yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Policy</th>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Retention</th>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy) => (
                    <tr key={policy.id}>
                      <td style={{ padding: 8 }}>{policy.policyName}</td>
                      <td style={{ padding: 8 }}>{policy.normalRetentionDays ?? "—"} days</td>
                      <td style={{ padding: 8 }}>{policy.approvalAuthority || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Assessments</h2>
              <Link href="/compliance/assessments">Manage assessments</Link>
            </div>
            {assessments.length === 0 ? (
              <p>No assessments have been created for this framework.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Assessment</th>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Status</th>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((assessment) => (
                    <tr key={assessment.id}>
                      <td style={{ padding: 8 }}>
                        <Link href={`/compliance/assessments/${assessment.id}`}>Assessment {assessment.id.slice(0, 8)}</Link>
                      </td>
                      <td style={{ padding: 8 }}>{assessment.status}</td>
                      <td style={{ padding: 8 }}>{new Date(assessment.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : (
        !loading && <p>Framework not found.</p>
      )}
    </div>
  );
}
