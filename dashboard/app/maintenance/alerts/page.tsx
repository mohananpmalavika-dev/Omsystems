"use client";

import React, { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { AlertCard, AlertFilters } from "@/components/maintenance/alert-components";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [filteredAlerts, setFilteredAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState<any>(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const fetchAlerts = async () => {
    try {
      setError(null);

      const params = new URLSearchParams();
      if (severityFilter !== "all") params.append("severity", severityFilter);
      if (categoryFilter !== "all") params.append("category", categoryFilter);
      if (statusFilter !== "all") params.append("status", statusFilter);

      const [alertsData, engineData] = await Promise.all([
        fetch(`/api/v1/maintenance/alerts?${params.toString()}`).then((r) => r.json()),
        fetch("/api/v1/maintenance/alerts/engine/status").then((r) => r.json()),
      ]);

      setAlerts(alertsData.data || []);
      setFilteredAlerts(alertsData.data || []);
      setEngineStatus(engineData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [severityFilter, categoryFilter, statusFilter]);

  const handleAcknowledge = async (alertId: string) => {
    try {
      await fetch(`/api/v1/maintenance/alerts/${alertId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Acknowledged from dashboard" }),
      });

      // Refresh alerts
      fetchAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge alert");
    }
  };

  const handleResolve = async (alertId: string) => {
    const resolution = prompt("Enter resolution notes:");
    if (!resolution) return;

    try {
      await fetch(`/api/v1/maintenance/alerts/${alertId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      });

      // Refresh alerts
      fetchAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve alert");
    }
  };

  const summary = {
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === "critical" && a.status === "active").length,
    warning: alerts.filter((a) => a.severity === "warning" && a.status === "active").length,
    info: alerts.filter((a) => a.severity === "info" && a.status === "active").length,
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="content" style={{ padding: 20, textAlign: "center" }}>
          <p>Loading alerts...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="content">
        <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
          {/* Header */}
          <header style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 32, marginBottom: 8 }}>Alert Management</h1>
            <p style={{ color: "#666", margin: 0 }}>
              Monitor and manage system alerts • Real-time monitoring
            </p>
          </header>

          {error && (
            <div
              style={{
                marginBottom: 20,
                padding: 16,
                background: "#fee",
                border: "1px solid #fbb",
                borderRadius: 8,
                color: "#800",
              }}
            >
              {error}
            </div>
          )}

          {/* Alert Engine Status */}
          {engineStatus && (
            <div
              style={{
                marginBottom: 24,
                padding: 16,
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                background: engineStatus.running ? "#f0fdf4" : "#fef2f2",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24 }}>
                  {engineStatus.running ? "✅" : "⚠️"}
                </span>
                <div>
                  <strong>Alert Engine:</strong> {engineStatus.running ? "Running" : "Stopped"}
                  <span style={{ marginLeft: 12, color: "#666" }}>
                    {engineStatus.activeAlertCount} active alert(s) • {engineStatus.rules} rules configured
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
              <h3 style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>Total Alerts</h3>
              <p style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>{summary.total}</p>
            </div>
            <div style={{ padding: 20, border: "2px solid #ef4444", borderRadius: 12, background: "#fef2f2" }}>
              <h3 style={{ fontSize: 14, color: "#991b1b", marginBottom: 8 }}>Critical</h3>
              <p style={{ fontSize: 32, fontWeight: 700, margin: 0, color: "#991b1b" }}>
                {summary.critical}
              </p>
            </div>
            <div style={{ padding: 20, border: "2px solid #f59e0b", borderRadius: 12, background: "#fffbeb" }}>
              <h3 style={{ fontSize: 14, color: "#92400e", marginBottom: 8 }}>Warning</h3>
              <p style={{ fontSize: 32, fontWeight: 700, margin: 0, color: "#92400e" }}>
                {summary.warning}
              </p>
            </div>
            <div style={{ padding: 20, border: "2px solid #3b82f6", borderRadius: 12, background: "#f0f9ff" }}>
              <h3 style={{ fontSize: 14, color: "#1e40af", marginBottom: 8 }}>Info</h3>
              <p style={{ fontSize: 32, fontWeight: 700, margin: 0, color: "#1e40af" }}>
                {summary.info}
              </p>
            </div>
          </section>

          {/* Filters */}
          <AlertFilters
            severityFilter={severityFilter}
            categoryFilter={categoryFilter}
            statusFilter={statusFilter}
            onSeverityChange={setSeverityFilter}
            onCategoryChange={setCategoryFilter}
            onStatusChange={setStatusFilter}
            onRefresh={fetchAlerts}
          />

          {/* Alerts List */}
          <section style={{ marginTop: 24 }}>
            {filteredAlerts.length === 0 ? (
              <div
                style={{
                  padding: 60,
                  textAlign: "center",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
                <h3 style={{ fontSize: 20, marginBottom: 8 }}>No alerts found</h3>
                <p style={{ color: "#666" }}>
                  {statusFilter === "active"
                    ? "All systems are healthy"
                    : "Try adjusting your filters"}
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {filteredAlerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={() => handleAcknowledge(alert.id)}
                    onResolve={() => handleResolve(alert.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
