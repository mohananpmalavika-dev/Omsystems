/**
 * Phase 4: Maintenance Dashboard Components
 * React components for visualizing maintenance data, health metrics, and work orders
 */

"use client";

import React, { useState, useEffect } from "react";

// ============================================================================
// Types
// ============================================================================

interface HealthMetricDisplayProps {
  label: string;
  value: number;
  unit: string;
  status: "healthy" | "warning" | "critical";
  threshold?: { warning: number; critical: number };
  trend?: "up" | "down" | "stable";
}

interface ComponentHealthCardProps {
  componentType: string;
  componentId: string;
  componentName: string;
  status: "healthy" | "degraded" | "critical";
  metrics: Array<{
    name: string;
    value: number;
    unit: string;
    status: "healthy" | "warning" | "critical";
  }>;
  lastUpdate: Date;
  action?: () => void;
}

interface AlertListProps {
  alerts: Array<{
    id: string;
    severity: "info" | "warning" | "critical";
    title: string;
    description: string;
    timestamp: Date;
    acknowledged: boolean;
  }>;
  onAcknowledge?: (alertId: string) => void;
}

interface WorkOrderProps {
  id: string;
  title: string;
  description: string;
  status: "open" | "in-progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  assignedTo?: string;
  dueDate?: Date;
  createdDate: Date;
}

interface SLAComplianceProps {
  total: number;
  onTime: number;
  breached: number;
  breachPercentage: number;
}

interface DashboardMetricsProps {
  totalAssets: number;
  healthyAssets: number;
  degradedAssets: number;
  criticalAssets: number;
  activeWorkOrders: number;
  overdueWorkOrders: number;
  slaCompliance: number;
}

// ============================================================================
// Components
// ============================================================================

/**
 * Health Metric Display Component
 * Shows a single health metric with status indicator and trend
 */
export const HealthMetricDisplay: React.FC<HealthMetricDisplayProps> = ({
  label,
  value,
  unit,
  status,
  threshold,
  trend,
}) => {
  const statusColors = {
    healthy: "bg-green-100 text-green-800 border-green-300",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-300",
    critical: "bg-red-100 text-red-800 border-red-300",
  };

  const statusIndicator = {
    healthy: "🟢",
    warning: "🟡",
    critical: "🔴",
  };

  const trendIndicator = {
    up: "📈",
    down: "📉",
    stable: "➡️",
  };

  return (
    <div
      className={`p-4 rounded-lg border-2 ${statusColors[status]} flex items-center justify-between`}
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-2xl font-bold">
          {value}
          <span className="text-sm">{unit}</span>
        </p>
        {threshold && (
          <p className="text-xs mt-1">
            ⚠️ Warning: {threshold.warning}{unit} | 🔴 Critical: {threshold.critical}{unit}
          </p>
        )}
      </div>
      <div className="text-3xl">
        {statusIndicator[status]}
        {trend && <div className="text-2xl">{trendIndicator[trend]}</div>}
      </div>
    </div>
  );
};

/**
 * Component Health Card
 * Displays health status of a single component with all its metrics
 */
export const ComponentHealthCard: React.FC<ComponentHealthCardProps> = ({
  componentType,
  componentId,
  componentName,
  status,
  metrics,
  lastUpdate,
  action,
}) => {
  const statusColors = {
    healthy: "border-l-4 border-green-500 bg-green-50",
    degraded: "border-l-4 border-yellow-500 bg-yellow-50",
    critical: "border-l-4 border-red-500 bg-red-50",
  };

  const statusBadge = {
    healthy: "bg-green-200 text-green-800",
    degraded: "bg-yellow-200 text-yellow-800",
    critical: "bg-red-200 text-red-800",
  };

  return (
    <div className={`p-4 rounded-lg shadow-md ${statusColors[status]}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold">{componentName}</h3>
          <p className="text-sm text-gray-600">
            {componentType} • ID: {componentId}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusBadge[status]}`}>
          {status.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {metrics.map((metric) => {
          const metricStatusColors = {
            healthy: "text-green-700",
            warning: "text-yellow-700",
            critical: "text-red-700",
          };
          return (
            <div key={metric.name} className="text-sm">
              <p className="text-gray-600">{metric.name}</p>
              <p className={`font-bold text-lg ${metricStatusColors[metric.status]}`}>
                {metric.value}
                <span className="text-xs ml-1">{metric.unit}</span>
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center text-xs text-gray-600">
        <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
        {action && (
          <button
            onClick={action}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Details
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Alert List Component
 * Displays active health and maintenance alerts
 */
export const AlertList: React.FC<AlertListProps> = ({
  alerts,
  onAcknowledge,
}) => {
  const severityColors = {
    info: "bg-blue-50 border-l-4 border-blue-500",
    warning: "bg-yellow-50 border-l-4 border-yellow-500",
    critical: "bg-red-50 border-l-4 border-red-500",
  };

  const severityBadge = {
    info: "bg-blue-200 text-blue-800",
    warning: "bg-yellow-200 text-yellow-800",
    critical: "bg-red-200 text-red-800",
  };

  return (
    <div className="space-y-3">
      {alerts.length === 0 ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          ✅ No active alerts
        </div>
      ) : (
        alerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-4 rounded-lg ${severityColors[alert.severity]}`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="font-bold text-sm">{alert.title}</p>
                <p className="text-sm text-gray-700 mt-1">{alert.description}</p>
                <p className="text-xs text-gray-600 mt-2">
                  {alert.timestamp.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <span className={`px-2 py-1 rounded text-xs font-medium ${severityBadge[alert.severity]}`}>
                  {alert.severity}
                </span>
                {!alert.acknowledged && onAcknowledge && (
                  <button
                    onClick={() => onAcknowledge(alert.id)}
                    className="px-3 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                  >
                    Ack
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

/**
 * Work Order Card Component
 * Displays a single work order with status and priority
 */
export const WorkOrderCard: React.FC<WorkOrderProps> = ({
  id,
  title,
  description,
  status,
  priority,
  assignedTo,
  dueDate,
  createdDate,
}) => {
  const statusColors = {
    open: "bg-gray-50 border-l-4 border-gray-500",
    "in-progress": "bg-blue-50 border-l-4 border-blue-500",
    resolved: "bg-green-50 border-l-4 border-green-500",
    closed: "bg-gray-100 border-l-4 border-gray-400",
  };

  const priorityBadge = {
    low: "bg-green-200 text-green-800",
    medium: "bg-yellow-200 text-yellow-800",
    high: "bg-orange-200 text-orange-800",
    critical: "bg-red-200 text-red-800",
  };

  const statusBadge = {
    open: "bg-gray-200 text-gray-800",
    "in-progress": "bg-blue-200 text-blue-800",
    resolved: "bg-green-200 text-green-800",
    closed: "bg-gray-300 text-gray-900",
  };

  const isOverdue = dueDate && new Date() > dueDate && status !== "resolved" && status !== "closed";

  return (
    <div className={`p-4 rounded-lg shadow-md ${statusColors[status]}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h4 className="font-bold text-lg">{title}</h4>
          <p className="text-sm text-gray-600">WO: {id}</p>
        </div>
        <div className="flex gap-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${priorityBadge[priority]}`}>
            {priority}
          </span>
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusBadge[status]}`}>
            {status}
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-700 mb-3">{description}</p>

      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        {assignedTo && (
          <div>
            <p className="text-gray-600">Assigned To</p>
            <p className="font-medium">{assignedTo}</p>
          </div>
        )}
        {dueDate && (
          <div>
            <p className="text-gray-600">Due Date</p>
            <p className={`font-medium ${isOverdue ? "text-red-600" : ""}`}>
              {dueDate.toLocaleDateString()} {isOverdue && "⚠️ OVERDUE"}
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-600">
        Created: {createdDate.toLocaleString()}
      </p>
    </div>
  );
};

/**
 * SLA Compliance Chart Component
 */
export const SLAComplianceChart: React.FC<SLAComplianceProps> = ({
  total,
  onTime,
  breached,
  breachPercentage,
}) => {
  const compliantPercentage = Math.round((onTime / total) * 100);

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h3 className="text-xl font-bold mb-4">SLA Compliance</h3>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium">Compliance Rate</span>
            <span className="text-sm font-bold">{compliantPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className={`h-4 rounded-full ${
                compliantPercentage >= 95
                  ? "bg-green-500"
                  : compliantPercentage >= 90
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${compliantPercentage}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-gray-50 rounded">
            <p className="text-2xl font-bold text-gray-700">{total}</p>
            <p className="text-xs text-gray-600">Total</p>
          </div>
          <div className="p-3 bg-green-50 rounded">
            <p className="text-2xl font-bold text-green-700">{onTime}</p>
            <p className="text-xs text-gray-600">On Time</p>
          </div>
          <div className="p-3 bg-red-50 rounded">
            <p className="text-2xl font-bold text-red-700">{breached}</p>
            <p className="text-xs text-gray-600">Breached</p>
          </div>
        </div>

        <div className="p-3 bg-orange-50 rounded border border-orange-200">
          <p className="text-sm text-orange-800">
            📊 {breachPercentage.toFixed(1)}% of work orders exceeded SLA targets
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Dashboard Metrics Summary Component
 */
export const DashboardMetricsSummary: React.FC<DashboardMetricsProps> = ({
  totalAssets,
  healthyAssets,
  degradedAssets,
  criticalAssets,
  activeWorkOrders,
  overdueWorkOrders,
  slaCompliance,
}) => {
  const metrics = [
    { label: "Total Assets", value: totalAssets, color: "bg-blue-100" },
    { label: "Healthy", value: healthyAssets, color: "bg-green-100" },
    { label: "Degraded", value: degradedAssets, color: "bg-yellow-100" },
    { label: "Critical", value: criticalAssets, color: "bg-red-100" },
    { label: "Active WOs", value: activeWorkOrders, color: "bg-purple-100" },
    { label: "Overdue WOs", value: overdueWorkOrders, color: "bg-orange-100" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className={`p-4 rounded-lg shadow-md ${metric.color} text-center`}
        >
          <p className="text-sm text-gray-600 font-medium">{metric.label}</p>
          <p className="text-3xl font-bold text-gray-800">{metric.value}</p>
        </div>
      ))}
      <div className="col-span-2 md:col-span-1 p-4 rounded-lg shadow-md bg-indigo-100 text-center">
        <p className="text-sm text-gray-600 font-medium">SLA Compliance</p>
        <p className="text-3xl font-bold text-indigo-800">{slaCompliance}%</p>
      </div>
    </div>
  );
};

/**
 * Maintenance Dashboard Main Container
 * Full dashboard layout with all components
 */
export const MaintenanceDashboard: React.FC<{
  data: {
    summary: DashboardMetricsProps;
    alerts: AlertListProps["alerts"];
    componentHealth: ComponentHealthCardProps[];
    workOrders: WorkOrderProps[];
    slaCompliance: SLAComplianceProps;
  };
}> = ({ data }) => {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Maintenance Dashboard
          </h1>
          <p className="text-gray-600 mt-2">
            Real-time asset health, work orders, and SLA monitoring
          </p>
        </div>

        {/* Metrics Summary */}
        <DashboardMetricsSummary {...data.summary} />

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Alerts & SLA */}
          <div className="lg:col-span-1 space-y-6">
            {/* Alerts */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-bold mb-4">Active Alerts</h2>
              <AlertList alerts={data.alerts} />
            </div>

            {/* SLA Compliance */}
            <SLAComplianceChart {...data.slaCompliance} />
          </div>

          {/* Middle & Right: Components & Work Orders */}
          <div className="lg:col-span-2 space-y-6">
            {/* Component Health */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-bold mb-4">Component Health</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.componentHealth.map((component) => (
                  <ComponentHealthCard key={component.componentId} {...component} />
                ))}
              </div>
            </div>

            {/* Work Orders */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-bold mb-4">Recent Work Orders</h2>
              <div className="space-y-3">
                {data.workOrders.map((wo) => (
                  <WorkOrderCard key={wo.id} {...wo} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
