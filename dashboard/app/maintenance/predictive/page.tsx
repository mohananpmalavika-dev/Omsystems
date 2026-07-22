"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function MaintenancePredictivePage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    void Promise.all([maintenanceApi.listHighRiskAssets(), maintenanceApi.listFailureForecast()])
      .then(([highRisk, forecast]) => {
        setAlerts([
          ...(highRisk.data ?? []).map((item: any) => ({
            id: item.id,
            name: item.assetId || item.deviceType || "Unknown asset",
            type: "high-risk",
            score: item.score,
            details: item.details,
            nextFailureDays: item.details?.estimated_failure_days,
          })),
          ...(forecast.data ?? []).map((item: any) => ({
            id: `forecast-${item.id}`,
            name: item.assetId || item.deviceType || "Unknown asset",
            type: "forecast",
            score: item.score,
            details: item.details,
            nextFailureDays: item.details?.estimated_failure_days,
          })),
        ]);
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
          <h1>Predictive Maintenance</h1>
          <p style={{ color: "#555" }}>View high-risk alerts and failure forecasts for proactive maintenance.</p>
        </div>
        <Link href="/maintenance" style={{ color: "#2563eb" }}>Back to dashboard</Link>
      </div>

      {error && <p style={{ color: "red", marginBottom: 16 }}>{error}</p>}
      {loading && <p>Loading predictive maintenance data…</p>}

      <div style={{ display: "grid", gap: 16 }}>
        {alerts.length === 0 && !loading ? (
          <p style={{ color: "#4b5563" }}>No predictive alerts available.</p>
        ) : (
          alerts.map((alert) => (
            <div key={alert.id} style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <strong>{alert.name}</strong>
                <span style={{ color: alert.type === "high-risk" ? "#b91c1c" : "#c2410c" }}>
                  {alert.type === "high-risk" ? "High risk" : "Failure forecast"}
                </span>
              </div>
              <p style={{ margin: "8px 0", color: "#374151" }}>
                Score: {alert.score.toFixed(2)}
              </p>
              <p style={{ margin: "8px 0", color: "#4b5563" }}>
                {alert.details?.recommendation || alert.details?.message || "Review asset and schedule maintenance."}
              </p>
              {alert.nextFailureDays !== undefined && (
                <p style={{ margin: 0, color: "#6b7280" }}>
                  Estimated failure in {alert.nextFailureDays} day(s)
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
