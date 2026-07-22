"use client";

import React, { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  HealthOverviewCard,
  CameraHealthGrid,
  StorageHealthCard,
  NetworkHealthCard,
  UpsHealthCard,
  HealthMetricChart,
  ActiveAlertsPanel,
} from "@/components/maintenance/health-components";

export default function HealthMonitoringPage() {
  const [collectorStatus, setCollectorStatus] = useState<any>(null);
  const [healthSummary, setHealthSummary] = useState<any>(null);
  const [cameraHealth, setCameraHealth] = useState<any[]>([]);
  const [storageHealth, setStorageHealth] = useState<any>(null);
  const [networkHealth, setNetworkHealth] = useState<any[]>([]);
  const [upsHealth, setUpsHealth] = useState<any>(null);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchHealthData = async () => {
    try {
      setError(null);

      const [
        collector,
        summary,
        cameras,
        storage,
        network,
        ups,
        alerts,
      ] = await Promise.all([
        fetch("/api/v1/maintenance/health/collector/status").then(r => r.json()),
        fetch("/api/v1/maintenance/dashboard/health").then(r => r.json()),
        fetch("/api/v1/maintenance/health/cameras/realtime?limit=100").then(r => r.json()),
        fetch("/api/v1/maintenance/health/storage/summary").then(r => r.json()),
        fetch("/api/v1/maintenance/health/network/branches").then(r => r.json()),
        fetch("/api/v1/maintenance/health/power/summary").then(r => r.json()),
        fetch("/api/v1/maintenance/alerts?severity=critical&status=active").then(r => r.json()),
      ]);

      setCollectorStatus(collector);
      setHealthSummary(summary);
      setCameraHealth(cameras.data || []);
      setStorageHealth(storage);
      setNetworkHealth(network.data || []);
      setUpsHealth(ups);
      setActiveAlerts(alerts.data || []);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load health data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealthData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRunHealthCheck = async () => {
    try {
      await fetch("/api/v1/maintenance/health/check/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentType: "all" }),
      });
      
      // Wait 2 seconds then refresh
      setTimeout(fetchHealthData, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger health check");
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="content" style={{ padding: 20, textAlign: "center" }}>
          <p>Loading health monitoring data...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="content">
        <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
          {/* Header */}
          <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 style={{ fontSize: 32, marginBottom: 8 }}>Health Monitoring</h1>
              <p style={{ color: "#666", margin: 0 }}>
                Real-time system health • Last updated: {lastUpdate.toLocaleTimeString()}
              </p>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={fetchHealthData}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                🔄 Refresh
              </button>
              <button
                onClick={handleRunHealthCheck}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #2563eb",
                  borderRadius: 8,
                  background: "#2563eb",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                ▶️ Run Health Check
              </button>
            </div>
          </header>

          {error && (
            <div style={{
              marginBottom: 20,
              padding: 16,
              background: "#fee",
              border: "1px solid #fbb",
              borderRadius: 8,
              color: "#800",
            }}>
              {error}
            </div>
          )}

          {/* Collector Status */}
          {collectorStatus && (
            <div style={{
              marginBottom: 24,
              padding: 16,
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              background: collectorStatus.running ? "#f0fdf4" : "#fef2f2",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24 }}>
                  {collectorStatus.running ? "✅" : "⚠️"}
                </span>
                <div>
                  <strong>Health Collector Service:</strong>{" "}
                  {collectorStatus.running ? "Running" : "Stopped"}
                  {collectorStatus.collectors && (
                    <span style={{ marginLeft: 8, color: "#666" }}>
                      ({collectorStatus.collectors.join(", ")})
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Overview Cards */}
          <section style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}>
            <HealthOverviewCard
              title="Overall Health"
              value={healthSummary?.healthPercentage || 0}
              unit="%"
              status={
                (healthSummary?.healthPercentage || 0) >= 95 ? "healthy" :
                (healthSummary?.healthPercentage || 0) >= 80 ? "warning" : "critical"
              }
              icon="❤️"
            />
            <HealthOverviewCard
              title="Cameras Online"
              value={healthSummary?.camerasOnline || 0}
              subtitle={`of ${healthSummary?.camerasCount || 0} total`}
              status={
                (healthSummary?.camerasOffline || 0) === 0 ? "healthy" :
                (healthSummary?.camerasOffline || 0) <= 2 ? "warning" : "critical"
              }
              icon="📹"
            />
            <HealthOverviewCard
              title="Storage Alerts"
              value={healthSummary?.storageAlerts || 0}
              status={(healthSummary?.storageAlerts || 0) === 0 ? "healthy" : "warning"}
              icon="💾"
            />
            <HealthOverviewCard
              title="Active Alerts"
              value={activeAlerts.length}
              status={activeAlerts.length === 0 ? "healthy" : "critical"}
              icon="🚨"
            />
          </section>

          {/* Main Content Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 24 }}>
            {/* Camera Health */}
            <div>
              <CameraHealthGrid cameras={cameraHealth} />
            </div>

            {/* Active Alerts */}
            <div>
              <ActiveAlertsPanel alerts={activeAlerts} />
            </div>
          </div>

          {/* Component Health Cards */}
          <section style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}>
            <StorageHealthCard data={storageHealth} />
            <NetworkHealthCard data={networkHealth} />
            <UpsHealthCard data={upsHealth} />
          </section>

          {/* Health Trends - Placeholder for charts */}
          <section style={{
            padding: 20,
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            background: "#fff",
          }}>
            <h2 style={{ marginBottom: 16 }}>Health Trends (24 Hours)</h2>
            <p style={{ color: "#666" }}>
              Real-time health metrics visualization coming soon. Integration with charting library required.
            </p>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
