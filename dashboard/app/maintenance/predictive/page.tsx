"use client";

import React, { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { ModulePage } from "@/components/module-page";
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
    <ModulePage
      eyebrow="Reliability intelligence"
      title="Predictive maintenance"
      description="Prioritize high-risk assets and forecast likely device failures before they interrupt recording coverage."
      icon={TrendingUp}
      count={alerts.length}
      countLabel="forecasts"
      loading={loading}
      error={error}
      empty={alerts.length === 0}
      emptyTitle="No predicted failures"
      emptyDescription="The fleet currently has no high-risk asset or forecast conditions that require proactive service."
    >
      <div className="module-table-wrap">
        <table>
          <thead><tr><th>Asset</th><th>Signal</th><th>Risk score</th><th>Failure window</th><th>Recommended action</th></tr></thead>
          <tbody>{alerts.map((alert) => (
            <tr key={alert.id}>
              <td><strong className="module-row-title">{alert.name}</strong></td>
              <td><span className={`module-priority ${alert.type === "high-risk" ? "critical" : "high"}`}>{alert.type === "high-risk" ? "High risk" : "Failure forecast"}</span></td>
              <td>{typeof alert.score === "number" ? alert.score.toFixed(2) : "Not scored"}</td>
              <td>{alert.nextFailureDays !== undefined ? `${alert.nextFailureDays} days` : "Not estimated"}</td>
              <td>{alert.details?.recommendation || alert.details?.message || "Review asset and schedule maintenance."}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </ModulePage>
  );
}
