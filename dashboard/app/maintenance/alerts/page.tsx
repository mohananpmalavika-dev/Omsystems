"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Radio, RefreshCw } from "lucide-react";
import { AlertCard, AlertFilters } from "@/components/maintenance/alert-components";
import { PageHero } from "@/components/page-hero";

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
      <div className="content maintenance-alerts-page">
        <div className="module-state"><RefreshCw className="module-spinner" size={24} /><strong>Loading maintenance alerts</strong><span>Connecting to the alert evaluation engine…</span></div>
      </div>
    );
  }

  return (
    <div className="content maintenance-alerts-page">
        <div className="maintenance-alerts-inner">
          <PageHero eyebrow="Fleet exceptions" title="Maintenance alert management" description="Monitor active equipment conditions, validate alert-engine status, and coordinate acknowledgement and resolution." icon={Bell} actions={<button className="btn-secondary" onClick={() => void fetchAlerts()}><RefreshCw size={15} /> Refresh</button>} />

          {error && (
            <div className="page-alert error">
              {error}
            </div>
          )}

          {/* Alert Engine Status */}
          {engineStatus && (
            <div className={`maintenance-engine-state ${engineStatus.running ? "running" : "stopped"}`}>
              <div>
                <span className="maintenance-engine-icon">{engineStatus.running ? <Radio size={18} /> : <AlertTriangle size={18} />}</span>
                <div>
                  <strong>Alert engine {engineStatus.running ? "running" : "stopped"}</strong>
                  <span>{engineStatus.activeAlertCount} active alerts · {engineStatus.rules} rules configured</span>
                </div>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <section className="maintenance-alert-summary">
            <div>
              <h3>Total alerts</h3><p>{summary.total}</p><small>Current filtered scope</small>
            </div>
            <div className="critical">
              <h3>Critical</h3><p>{summary.critical}</p><small>Immediate response</small>
            </div>
            <div className="warning">
              <h3>Warning</h3><p>{summary.warning}</p><small>Needs review</small>
            </div>
            <div className="info">
              <h3>Informational</h3><p>{summary.info}</p><small>Awareness only</small>
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
          <section className="maintenance-alert-list">
            {filteredAlerts.length === 0 ? (
              <div className="module-state maintenance-alert-empty">
                <span className="module-empty-icon"><CheckCircle2 size={24} /></span>
                <strong>No alerts found</strong>
                <span>
                  {statusFilter === "active"
                    ? "All systems are healthy"
                    : "Try adjusting your filters"}
                </span>
              </div>
            ) : (
              <div className="maintenance-alert-cards">
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
  );
}
