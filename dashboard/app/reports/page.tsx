"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { reportsApi } from "@/lib/api-client";

export default function ReportsPage() {
  const [operations, setOperations] = useState<any>(null);
  const [privacy, setPrivacy] = useState<any>(null);
  const [incidents, setIncidents] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    void Promise.all([
      reportsApi.getOperationsSummary(),
      reportsApi.getPrivacySummary(),
      reportsApi.getIncidentSummary(),
    ])
      .then(([operationsData, privacyData, incidentData]) => {
        setOperations(operationsData);
        setPrivacy(privacyData);
        setIncidents(incidentData);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 32, margin: 0 }}>CCTV Reports</h1>
          <p style={{ color: "#555", maxWidth: 680 }}>
            Consolidated CCTV operations, privacy and incident metrics for branch security reporting.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/maintenance" style={{ color: "#2563eb" }}>Back to maintenance</Link>
          <Link href="/maintenance/privacy" style={{ color: "#2563eb" }}>Privacy dashboard</Link>
          <Link href="/incidents" style={{ color: "#2563eb" }}>Incidents</Link>
        </div>
      </header>

      {error && (
        <div style={{ marginBottom: 24, padding: 16, background: "#fee", border: "1px solid #fbb", borderRadius: 12, color: "#900" }}>
          {error}
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 24 }}>
        <Card label="Branches" value={loading ? "…" : String(operations?.branchCount ?? 0)} />
        <Card label="Cameras" value={loading ? "…" : String(operations?.cameraCount ?? 0)} detail={`${operations?.healthyCameraPercentage ?? 0}% healthy`} />
        <Card label="Open incidents" value={loading ? "…" : String(incidents?.openIncidentCount ?? 0)} detail={`${incidents?.criticalIncidentCount ?? 0} critical`} />
        <Card label="Active privacy purposes" value={loading ? "…" : String(privacy?.activePurposes ?? 0)} detail={`${privacy?.assignedPurposes ?? 0} assigned`} />
        <Card label="Open privacy breaches" value={loading ? "…" : String(privacy?.openBreaches ?? 0)} />
      </section>

      <section style={{ display: "grid", gap: 24, marginBottom: 24 }}>
        <Panel title="Operational summary" loading={loading}>
          <SummaryRow label="Total branches" value={operations?.branchCount ?? "—"} />
          <SummaryRow label="Total cameras" value={operations?.cameraCount ?? "—"} />
          <SummaryRow label="Online" value={operations?.onlineCount ?? "—"} />
          <SummaryRow label="Offline" value={operations?.offlineCount ?? "—"} />
          <SummaryRow label="Degraded" value={operations?.degradedCount ?? "—"} />
        </Panel>

        <Panel title="Privacy summary" loading={loading}>
          <SummaryRow label="Active purposes" value={privacy?.activePurposes ?? "—"} />
          <SummaryRow label="Assigned purposes" value={privacy?.assignedPurposes ?? "—"} />
          <SummaryRow label="Total controls" value={privacy?.totalControls ?? "—"} />
          <SummaryRow label="Open breaches" value={privacy?.openBreaches ?? "—"} />
        </Panel>

        <Panel title="Incident summary" loading={loading}>
          <SummaryRow label="Total incidents" value={incidents?.incidentCount ?? "—"} />
          <SummaryRow label="Open incidents" value={incidents?.openIncidentCount ?? "—"} />
          <SummaryRow label="Critical incidents" value={incidents?.criticalIncidentCount ?? "—"} />
        </Panel>
      </section>

      <section style={{ display: "grid", gap: 24, marginBottom: 24 }}>
        <Panel title="Camera status by branch" loading={loading}>
          {operations?.branchSummaries?.length ? (
            operations.branchSummaries.map((branch: any) => (
              <div key={branch.branchId} style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                <strong>{branch.branchName}</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 8 }}>
                  <Stat label="Total" value={branch.totalCameras} />
                  <Stat label="Online" value={branch.onlineCount} />
                  <Stat label="Offline" value={branch.offlineCount} />
                  <Stat label="Degraded" value={branch.degradedCount} />
                </div>
              </div>
            ))
          ) : (
            <p style={{ color: "#4b5563" }}>No branch camera details available.</p>
          )}
        </Panel>

        <Panel title="Recent incidents" loading={loading}>
          {incidents?.recentIncidents?.length ? (
            incidents.recentIncidents.map((incident: any) => (
              <div key={incident.id} style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                <strong>{incident.title}</strong>
                <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
                  {incident.severity ? `Severity: ${incident.severity}` : "Severity unknown"} · {incident.status}
                </p>
                <p style={{ margin: "6px 0 0", color: "#4b5563" }}>
                  {incident.occurredAt ? new Date(incident.occurredAt).toLocaleString() : "Date unavailable"}
                </p>
              </div>
            ))
          ) : (
            <p style={{ color: "#4b5563" }}>No recent incidents available.</p>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Card({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: "#fff", border: "1px solid #e5e7eb", minHeight: 120 }}>
      <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>{label}</p>
      <p style={{ margin: "12px 0 0", fontSize: 32, fontWeight: 700 }}>{value}</p>
      {detail && <p style={{ margin: "8px 0 0", color: "#6b7280" }}>{detail}</p>}
    </div>
  );
}

function Panel({ title, loading, children }: { title: string; loading: boolean; children: React.ReactNode }) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: "#fff", border: "1px solid #e5e7eb" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>{title}</h2>
      {loading ? <p>Loading data…</p> : children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ color: "#374151" }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontWeight: 700 }}>{value}</p>
    </div>
  );
}
