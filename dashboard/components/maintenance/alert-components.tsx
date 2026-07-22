"use client";

import React from "react";

// ============================================================================
// Alert Filters
// ============================================================================

interface AlertFiltersProps {
  severityFilter: string;
  categoryFilter: string;
  statusFilter: string;
  onSeverityChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRefresh: () => void;
}

export function AlertFilters({
  severityFilter,
  categoryFilter,
  statusFilter,
  onSeverityChange,
  onCategoryChange,
  onStatusChange,
  onRefresh,
}: AlertFiltersProps) {
  const selectStyle = {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    fontSize: 14,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        padding: 16,
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        background: "#fff",
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "center",
      }}
    >
      <div style={{ flex: "0 0 auto" }}>
        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
          Severity
        </label>
        <select
          value={severityFilter}
          onChange={(e) => onSeverityChange(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </div>

      <div style={{ flex: "0 0 auto" }}>
        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
          Category
        </label>
        <select
          value={categoryFilter}
          onChange={(e) => onCategoryChange(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Categories</option>
          <option value="health">Health</option>
          <option value="maintenance">Maintenance</option>
          <option value="sla">SLA</option>
          <option value="predictive">Predictive</option>
        </select>
      </div>

      <div style={{ flex: "0 0 auto" }}>
        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
          Status
        </label>
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <div style={{ flex: "1 1 auto" }} />

      <button
        onClick={onRefresh}
        style={{
          padding: "8px 16px",
          border: "1px solid #d1d5db",
          borderRadius: 8,
          background: "#fff",
          fontSize: 14,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>🔄</span>
        Refresh
      </button>
    </div>
  );
}

// ============================================================================
// Alert Card
// ============================================================================

interface AlertCardProps {
  alert: {
    id: string;
    severity: string;
    category: string;
    title: string;
    description: string;
    createdAt: string;
    acknowledgedAt?: string;
    acknowledgedBy?: string;
    resolvedAt?: string;
    status: string;
    assetId?: string;
    branchNodeId?: string;
    metadata?: any;
  };
  onAcknowledge?: () => void;
  onResolve?: () => void;
}

export function AlertCard({ alert, onAcknowledge, onResolve }: AlertCardProps) {
  const getSeverityConfig = (severity: string) => {
    switch (severity) {
      case "critical":
        return {
          bg: "#fef2f2",
          border: "#ef4444",
          text: "#991b1b",
          icon: "🔴",
          label: "Critical",
        };
      case "warning":
        return {
          bg: "#fffbeb",
          border: "#f59e0b",
          text: "#92400e",
          icon: "⚠️",
          label: "Warning",
        };
      case "info":
        return {
          bg: "#f0f9ff",
          border: "#3b82f6",
          text: "#1e40af",
          icon: "ℹ️",
          label: "Info",
        };
      default:
        return {
          bg: "#f9fafb",
          border: "#d1d5db",
          text: "#374151",
          icon: "•",
          label: "Unknown",
        };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return { bg: "#fef2f2", text: "#991b1b", label: "Active" };
      case "acknowledged":
        return { bg: "#fffbeb", text: "#92400e", label: "Acknowledged" };
      case "resolved":
        return { bg: "#f0fdf4", text: "#166534", label: "Resolved" };
      default:
        return { bg: "#f9fafb", text: "#374151", label: status };
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "health":
        return "❤️";
      case "maintenance":
        return "🔧";
      case "sla":
        return "⏰";
      case "predictive":
        return "🔮";
      default:
        return "📋";
    }
  };

  const config = getSeverityConfig(alert.severity);
  const statusBadge = getStatusBadge(alert.status);
  const timeAgo = getTimeAgo(new Date(alert.createdAt));

  return (
    <div
      style={{
        padding: 20,
        border: `2px solid ${config.border}`,
        borderRadius: 12,
        background: config.bg,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 24 }}>{config.icon}</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: config.text,
                  padding: "2px 8px",
                  background: "#fff",
                  borderRadius: 4,
                }}>
                  {config.label}
                </span>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: statusBadge.text,
                  padding: "2px 8px",
                  background: statusBadge.bg,
                  borderRadius: 4,
                }}>
                  {statusBadge.label}
                </span>
                <span style={{ fontSize: 12, color: "#666" }}>
                  {getCategoryIcon(alert.category)} {alert.category}
                </span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: config.text, margin: 0 }}>
                {alert.title}
              </h3>
            </div>
          </div>
          <p style={{ fontSize: 14, color: "#374151", margin: "8px 0", lineHeight: 1.6 }}>
            {alert.description}
          </p>
        </div>
      </div>

      {/* Metadata */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 12, color: "#666" }}>Created:</span>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {new Date(alert.createdAt).toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>{timeAgo}</div>
        </div>

        {alert.acknowledgedAt && (
          <div>
            <span style={{ fontSize: 12, color: "#666" }}>Acknowledged:</span>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {new Date(alert.acknowledgedAt).toLocaleString()}
            </div>
            {alert.acknowledgedBy && (
              <div style={{ fontSize: 12, color: "#9ca3af" }}>by {alert.acknowledgedBy}</div>
            )}
          </div>
        )}

        {alert.resolvedAt && (
          <div>
            <span style={{ fontSize: 12, color: "#666" }}>Resolved:</span>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {new Date(alert.resolvedAt).toLocaleString()}
            </div>
          </div>
        )}

        {(alert.assetId || alert.branchNodeId) && (
          <div>
            <span style={{ fontSize: 12, color: "#666" }}>Related:</span>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {alert.assetId && <div>Asset: {alert.assetId.slice(0, 8)}...</div>}
              {alert.branchNodeId && <div>Branch: {alert.branchNodeId.slice(0, 8)}...</div>}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {alert.status === "active" && (
        <div style={{ display: "flex", gap: 12, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
          <button
            onClick={onAcknowledge}
            style={{
              padding: "8px 16px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              background: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            ✓ Acknowledge
          </button>
          <button
            onClick={onResolve}
            style={{
              padding: "8px 16px",
              border: "1px solid #10b981",
              borderRadius: 8,
              background: "#10b981",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            ✓ Resolve
          </button>
        </div>
      )}

      {alert.status === "acknowledged" && (
        <div style={{ display: "flex", gap: 12, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
          <button
            onClick={onResolve}
            style={{
              padding: "8px 16px",
              border: "1px solid #10b981",
              borderRadius: 8,
              background: "#10b981",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            ✓ Mark as Resolved
          </button>
        </div>
      )}

      {alert.status === "resolved" && (
        <div style={{
          paddingTop: 16,
          borderTop: "1px solid #e5e7eb",
          color: "#10b981",
          fontSize: 14,
          fontWeight: 500,
        }}>
          ✓ This alert has been resolved
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return date.toLocaleDateString();
}
