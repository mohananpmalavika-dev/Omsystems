"use client";

import React from "react";
import Link from "next/link";

// ============================================================================
// Health Overview Card
// ============================================================================

interface HealthOverviewCardProps {
  title: string;
  value: number | string;
  unit?: string;
  subtitle?: string;
  status: "healthy" | "warning" | "critical";
  icon?: string;
}

export function HealthOverviewCard({
  title,
  value,
  unit,
  subtitle,
  status,
  icon,
}: HealthOverviewCardProps) {
  const statusColors = {
    healthy: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
    warning: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" },
    critical: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" },
  };

  const colors = statusColors[status];

  return (
    <div
      style={{
        padding: 20,
        border: `2px solid ${colors.border}`,
        borderRadius: 12,
        background: colors.bg,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#666", margin: 0 }}>
          {title}
        </h3>
        {icon && <span style={{ fontSize: 24 }}>{icon}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 36, fontWeight: 700, color: colors.text }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 18, color: colors.text }}>{unit}</span>
        )}
      </div>
      {subtitle && (
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "#666" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Camera Health Grid
// ============================================================================

interface Camera {
  id: string;
  name?: string;
  serialNumber?: string;
  status: string;
  lastCheck?: string;
  fps?: number;
  bitrate?: number;
  temperature?: number;
  recordingRunning?: boolean;
}

interface CameraHealthGridProps {
  cameras: Camera[];
}

export function CameraHealthGrid({ cameras }: CameraHealthGridProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
      case "operational":
        return "#10b981";
      case "degraded":
        return "#f59e0b";
      case "offline":
        return "#ef4444";
      default:
        return "#9ca3af";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online":
      case "operational":
        return "✅";
      case "degraded":
        return "⚠️";
      case "offline":
        return "🔴";
      default:
        return "❓";
    }
  };

  return (
    <div
      style={{
        padding: 20,
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Camera Health</h2>
        <span style={{ color: "#666", fontSize: 14 }}>
          {cameras.length} cameras monitored
        </span>
      </div>

      {cameras.length === 0 ? (
        <p style={{ color: "#666", textAlign: "center", padding: 40 }}>
          No camera health data available
        </p>
      ) : (
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: 12, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#666" }}>
                  Status
                </th>
                <th style={{ padding: 12, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#666" }}>
                  Camera
                </th>
                <th style={{ padding: 12, textAlign: "right", fontSize: 12, fontWeight: 600, color: "#666" }}>
                  FPS
                </th>
                <th style={{ padding: 12, textAlign: "right", fontSize: 12, fontWeight: 600, color: "#666" }}>
                  Temp
                </th>
                <th style={{ padding: 12, textAlign: "center", fontSize: 12, fontWeight: 600, color: "#666" }}>
                  Recording
                </th>
              </tr>
            </thead>
            <tbody>
              {cameras.map((camera) => (
                <tr
                  key={camera.id}
                  style={{ borderBottom: "1px solid #f1f5f9" }}
                >
                  <td style={{ padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{getStatusIcon(camera.status)}</span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: getStatusColor(camera.status),
                        }}
                      >
                        {camera.status}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: 12 }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>
                        {camera.name || camera.serialNumber || camera.id.slice(0, 8)}
                      </div>
                      {camera.serialNumber && (
                        <div style={{ fontSize: 12, color: "#666" }}>
                          {camera.serialNumber}
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: 12, textAlign: "right" }}>
                    {camera.fps !== undefined ? (
                      <span style={{ color: camera.fps < 20 ? "#ef4444" : "#10b981" }}>
                        {camera.fps} fps
                      </span>
                    ) : (
                      <span style={{ color: "#9ca3af" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: 12, textAlign: "right" }}>
                    {camera.temperature !== undefined ? (
                      <span style={{ color: camera.temperature > 60 ? "#ef4444" : "#666" }}>
                        {camera.temperature}°C
                      </span>
                    ) : (
                      <span style={{ color: "#9ca3af" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: 12, textAlign: "center" }}>
                    {camera.recordingRunning !== undefined ? (
                      camera.recordingRunning ? "🔴" : "⏸️"
                    ) : (
                      <span style={{ color: "#9ca3af" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Storage Health Card
// ============================================================================

interface StorageHealthCardProps {
  data: any;
}

export function StorageHealthCard({ data }: StorageHealthCardProps) {
  if (!data) return null;

  const usagePercentage = data.averageUsagePercentage || 0;
  const getUsageColor = (pct: number) => {
    if (pct >= 90) return "#ef4444";
    if (pct >= 80) return "#f59e0b";
    return "#10b981";
  };

  return (
    <div
      style={{
        padding: 20,
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <h2 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span>💾</span>
        Storage Health
      </h2>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 14, color: "#666" }}>Average Usage</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: getUsageColor(usagePercentage) }}>
            {usagePercentage.toFixed(1)}%
          </span>
        </div>
        <div style={{
          height: 12,
          background: "#e5e7eb",
          borderRadius: 6,
          overflow: "hidden",
        }}>
          <div
            style={{
              height: "100%",
              width: `${usagePercentage}%`,
              background: getUsageColor(usagePercentage),
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>Total Devices</p>
          <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700 }}>
            {data.totalDevices || 0}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>Healthy</p>
          <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "#10b981" }}>
            {data.healthy || 0}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>Warning</p>
          <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>
            {data.warning || 0}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>Critical</p>
          <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "#ef4444" }}>
            {data.critical || 0}
          </p>
        </div>
      </div>

      {data.devicesNearingCapacity > 0 && (
        <div style={{
          marginTop: 16,
          padding: 12,
          background: "#fffbeb",
          border: "1px solid #fcd34d",
          borderRadius: 8,
        }}>
          <span style={{ fontSize: 14, color: "#92400e" }}>
            ⚠️ {data.devicesNearingCapacity} device(s) over 80% capacity
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Network Health Card
// ============================================================================

interface NetworkHealthCardProps {
  data: any[];
}

export function NetworkHealthCard({ data }: NetworkHealthCardProps) {
  if (!data || data.length === 0) return null;

  const healthyCount = data.filter((b) => b.status === "healthy").length;
  const warningCount = data.filter((b) => b.status === "warning").length;
  const criticalCount = data.filter((b) => b.status === "critical").length;

  const avgLatency =
    data.reduce((sum, b) => sum + (b.latencyMs || 0), 0) / data.length;
  const avgPacketLoss =
    data.reduce((sum, b) => sum + (b.packetLoss || 0), 0) / data.length;

  return (
    <div
      style={{
        padding: 20,
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <h2 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span>🌐</span>
        Network Health
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ textAlign: "center", padding: 12, background: "#f0fdf4", borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#10b981" }}>
            {healthyCount}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>Healthy</p>
        </div>
        <div style={{ textAlign: "center", padding: 12, background: "#fffbeb", borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>
            {warningCount}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>Warning</p>
        </div>
        <div style={{ textAlign: "center", padding: 12, background: "#fef2f2", borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#ef4444" }}>
            {criticalCount}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>Critical</p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, color: "#666" }}>Avg. Latency</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: avgLatency > 100 ? "#ef4444" : "#10b981" }}>
            {avgLatency.toFixed(0)}ms
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, color: "#666" }}>Avg. Packet Loss</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: avgPacketLoss > 1 ? "#ef4444" : "#10b981" }}>
            {avgPacketLoss.toFixed(2)}%
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, color: "#666" }}>Monitored Branches</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {data.length}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// UPS Health Card
// ============================================================================

interface UpsHealthCardProps {
  data: any;
}

export function UpsHealthCard({ data }: UpsHealthCardProps) {
  if (!data) return null;

  const avgBatteryHealth = data.averageBatteryHealth || 0;
  const avgRuntime = data.averageRuntime || 0;

  const getBatteryColor = (health: number) => {
    if (health >= 85) return "#10b981";
    if (health >= 70) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div
      style={{
        padding: 20,
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <h2 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span>🔋</span>
        UPS / Power Health
      </h2>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 14, color: "#666" }}>Avg. Battery Health</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: getBatteryColor(avgBatteryHealth) }}>
            {avgBatteryHealth}%
          </span>
        </div>
        <div style={{
          height: 12,
          background: "#e5e7eb",
          borderRadius: 6,
          overflow: "hidden",
        }}>
          <div
            style={{
              height: "100%",
              width: `${avgBatteryHealth}%`,
              background: getBatteryColor(avgBatteryHealth),
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>Total Devices</p>
          <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700 }}>
            {data.totalDevices || 0}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>Avg. Runtime</p>
          <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700 }}>
            {Math.floor(avgRuntime)} min
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>Healthy</p>
          <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "#10b981" }}>
            {data.healthy || 0}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>Need Attention</p>
          <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "#ef4444" }}>
            {(data.warning || 0) + (data.critical || 0)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Active Alerts Panel
// ============================================================================

interface Alert {
  id: string;
  severity: string;
  title: string;
  description: string;
  createdAt: string;
  status: string;
}

interface ActiveAlertsPanelProps {
  alerts: Alert[];
}

export function ActiveAlertsPanel({ alerts }: ActiveAlertsPanelProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" };
      case "warning":
        return { bg: "#fffbeb", border: "#f59e0b", text: "#92400e" };
      case "info":
        return { bg: "#f0f9ff", border: "#3b82f6", text: "#1e40af" };
      default:
        return { bg: "#f9fafb", border: "#d1d5db", text: "#374151" };
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return "🔴";
      case "warning":
        return "⚠️";
      case "info":
        return "ℹ️";
      default:
        return "•";
    }
  };

  return (
    <div
      style={{
        padding: 20,
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        background: "#fff",
        height: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Active Alerts</h2>
        <Link
          href="/maintenance/alerts"
          style={{ fontSize: 14, color: "#2563eb", textDecoration: "none" }}
        >
          View All →
        </Link>
      </div>

      {alerts.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#666" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <p style={{ margin: 0 }}>No active alerts</p>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#9ca3af" }}>
            All systems are healthy
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, maxHeight: 400, overflowY: "auto" }}>
          {alerts.map((alert) => {
            const colors = getSeverityColor(alert.severity);
            const timeAgo = Math.floor(
              (Date.now() - new Date(alert.createdAt).getTime()) / 60000
            );

            return (
              <div
                key={alert.id}
                style={{
                  padding: 12,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  background: colors.bg,
                }}
              >
                <div style={{ display: "flex", alignItems: "start", gap: 8, marginBottom: 4 }}>
                  <span>{getSeverityIcon(alert.severity)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: colors.text, marginBottom: 4 }}>
                      {alert.title}
                    </div>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                      {alert.description}
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                      {timeAgo < 1 ? "Just now" : `${timeAgo}m ago`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Health Metric Chart (Placeholder)
// ============================================================================

export function HealthMetricChart({ title, data }: { title: string; data: any[] }) {
  return (
    <div
      style={{
        padding: 20,
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <h3 style={{ marginBottom: 16 }}>{title}</h3>
      <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
        Chart visualization coming soon
      </div>
    </div>
  );
}
