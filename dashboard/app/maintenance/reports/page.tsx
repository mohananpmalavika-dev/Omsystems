"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function MaintenanceReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await maintenanceApi.listReports();
      setReports(result.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  const createReport = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const newReport = await maintenanceApi.generateReport({
        reportType: "preventive",
        periodStart: thirtyDaysAgo.toISOString().slice(0, 10),
        periodEnd: now.toISOString().slice(0, 10),
      });
      setMessage(`Generated report ${newReport.filename}`);
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1>Maintenance Reports</h1>
          <p style={{ color: "#555" }}>Generate and review maintenance reports for preventive, corrective, and AMC performance.</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/maintenance" style={{ color: "#2563eb" }}>Back to dashboard</Link>
          <button
            onClick={createReport}
            disabled={submitting}
            style={{ padding: "10px 18px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer" }}
          >
            {submitting ? "Generating…" : "Generate report"}
          </button>
        </div>
      </div>

      {message && <div style={{ marginBottom: 16, padding: 12, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", borderRadius: 8 }}>{message}</div>}
      {error && <p style={{ color: "red", marginBottom: 16 }}>{error}</p>}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "2px solid #e5e7eb" }}>Filename</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "2px solid #e5e7eb" }}>Type</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "2px solid #e5e7eb" }}>Period</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "2px solid #e5e7eb" }}>Generated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ padding: 12 }}>Loading reports…</td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 12 }}>No reports found.</td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: 12 }}>{report.filename}</td>
                  <td style={{ padding: 12 }}>{report.reportType}</td>
                  <td style={{ padding: 12 }}>{report.periodStart} → {report.periodEnd}</td>
                  <td style={{ padding: 12 }}>{new Date(report.generatedAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
