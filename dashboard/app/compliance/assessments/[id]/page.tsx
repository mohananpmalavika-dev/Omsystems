"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { complianceApi } from "@/lib/api-client";
import type { ComplianceAssessment, ComplianceCertificate } from "@/lib/types";

export default function ComplianceAssessmentDetailPage() {
  const pathname = usePathname();
  const id = pathname.split("/").pop() ?? "";
  const [assessment, setAssessment] = useState<ComplianceAssessment | null>(null);
  const [certificates, setCertificates] = useState<ComplianceCertificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    void Promise.all([
      complianceApi.getAssessment(id),
      complianceApi.listCertificates(id),
    ]).then(([assessmentResult, certificatesResult]) => {
      setAssessment(assessmentResult as ComplianceAssessment);
      setCertificates(certificatesResult.data as ComplianceCertificate[]);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to load assessment details");
    }).finally(() => setLoading(false));
  }, [id]);

  if (!id) return <div style={{ padding: 16 }}>Invalid assessment id</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>Assessment detail</h1>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {assessment ? (
        <>
          <section style={{ marginBottom: 24 }}>
            <h2>{assessment.id}</h2>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><strong>Framework</strong><div>{assessment.frameworkId}</div></div>
              <div><strong>Status</strong><div>{assessment.status}</div></div>
              <div><strong>Branch</strong><div>{assessment.branchNodeId ?? "—"}</div></div>
              <div><strong>Period</strong><div>{assessment.assessmentPeriodStart ?? "—"} — {assessment.assessmentPeriodEnd ?? "—"}</div></div>
              <div><strong>Created</strong><div>{new Date(assessment.createdAt).toLocaleString()}</div></div>
            </dl>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2>Certificate history</h2>
            {certificates.length === 0 ? (
              <p>No certificates issued for this assessment yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Certificate</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Status</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((certificate) => (
                    <tr key={certificate.id}>
                      <td style={{ padding: 8 }}>{certificate.title}</td>
                      <td style={{ padding: 8 }}>{certificate.status}</td>
                      <td style={{ padding: 8 }}>{certificate.issuedAt ? new Date(certificate.issuedAt).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : (
        !loading && <p>Assessment not found.</p>
      )}
    </div>
  );
}
