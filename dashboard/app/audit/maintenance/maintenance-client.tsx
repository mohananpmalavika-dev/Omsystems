"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { cameraInventoryApi } from "@/lib/api-client";
import type { WorkOrder } from "@/lib/types";

type StatusFilter = "all" | WorkOrder["status"];
type SeverityFilter = "all" | WorkOrder["severity"];
type SlaFilter = "all" | "met" | "breached" | "at_risk" | "on_track" | "no_sla";

interface BranchOption {
  id: string;
  name: string;
}

export type SlaCategory = "met" | "breached" | "at_risk" | "on_track" | "no_sla";

export function getOrderSlaCategory(order: WorkOrder, now = Date.now()): SlaCategory {
  if (!order.slaDueAt || Number.isNaN(Date.parse(order.slaDueAt))) {
    return "no_sla";
  }
  const dueTime = Date.parse(order.slaDueAt);
  const isFinished = ["resolved", "closed"].includes(order.status);
  const finishTime = order.resolvedAt
    ? Date.parse(order.resolvedAt)
    : order.updatedAt
    ? Date.parse(order.updatedAt)
    : 0;

  if (isFinished) {
    return finishTime > 0 && finishTime <= dueTime ? "met" : "breached";
  }

  if (dueTime < now) {
    return "breached";
  }

  if (dueTime - now <= 4 * 60 * 60 * 1000) {
    return "at_risk";
  }

  return "on_track";
}

export default function MaintenanceAuditClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialBranch = searchParams?.get("branchNodeId") ?? "";

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>(initialBranch);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [status, setStatus] = useState<StatusFilter>("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("all");
  const [search, setSearch] = useState("");

  // Sync selected branch if query param changes externally
  useEffect(() => {
    const current = searchParams?.get("branchNodeId") ?? "";
    setSelectedBranch(current);
  }, [searchParams]);

  // Load branches list for filter dropdown
  useEffect(() => {
    let active = true;
    void cameraInventoryApi.listBranches("analytics:view")
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res?.data)
          ? res.data.map((b: any) => ({ id: b.id, name: b.name || b.id }))
          : [];
        setBranches(list);
      })
      .catch(() => {
        // Non-blocking branch directory fetch
      });
    return () => {
      active = false;
    };
  }, []);

  // Fetch work orders scoped to branch
  const loadWorkOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedBranch) params.set("branchNodeId", selectedBranch);

      const response = await fetch(`/api/audit/maintenance?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Control plane responded with HTTP ${response.status}`);
      }
      const json = await response.json();
      setWorkOrders(Array.isArray(json?.data) ? (json.data as WorkOrder[]) : []);
    } catch (reason) {
      setWorkOrders([]);
      setError(reason instanceof Error ? reason.message : "Unable to load maintenance work orders.");
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  useEffect(() => {
    void loadWorkOrders();
  }, [loadWorkOrders]);

  const handleBranchChange = (branchId: string) => {
    setSelectedBranch(branchId);
    if (branchId) {
      router.push(`/audit/maintenance?branchNodeId=${encodeURIComponent(branchId)}`);
    } else {
      router.push("/audit/maintenance");
    }
  };

  // Authoritative scope-level metrics (unaffected by local table filter toggles)
  const scopeSummary = useMemo(() => {
    const now = Date.now();
    const openOrders = workOrders.filter((wo) => !["resolved", "closed"].includes(wo.status));
    const closedOrders = workOrders.filter((wo) => ["resolved", "closed"].includes(wo.status));
    const urgentOrders = workOrders.filter((wo) => ["critical", "high"].includes(wo.severity));

    const closedWithSla = closedOrders.filter((wo) => Boolean(wo.slaDueAt));
    const onTimeOrders = closedWithSla.filter((wo) => {
      const dueTime = Date.parse(wo.slaDueAt!);
      const finishTime = wo.resolvedAt ? Date.parse(wo.resolvedAt) : (wo.updatedAt ? Date.parse(wo.updatedAt) : 0);
      return finishTime > 0 && finishTime <= dueTime;
    });

    const openBreaches = openOrders.filter((wo) => wo.slaDueAt && Date.parse(wo.slaDueAt) < now);
    const closedLateOrders = closedWithSla.filter((wo) => {
      const dueTime = Date.parse(wo.slaDueAt!);
      const finishTime = wo.resolvedAt ? Date.parse(wo.resolvedAt) : (wo.updatedAt ? Date.parse(wo.updatedAt) : 0);
      return finishTime > dueTime;
    });

    const evaluatedCount = closedWithSla.length + openBreaches.length;
    const breachedTotal = closedLateOrders.length + openBreaches.length;
    const complianceRate = evaluatedCount > 0
      ? Math.round((onTimeOrders.length / evaluatedCount) * 100)
      : 100;

    return {
      total: workOrders.length,
      backlog: openOrders.length,
      assigned: workOrders.filter((wo) => wo.status === "assigned").length,
      inProgress: workOrders.filter((wo) => wo.status === "in_progress").length,
      urgent: urgentOrders.length,
      breached: breachedTotal,
      activeOverdue: openBreaches.length,
      onTime: onTimeOrders.length,
      evaluated: evaluatedCount,
      complianceRate,
    };
  }, [workOrders]);

  // Filtered visible orders
  const visibleOrders = useMemo(() => {
    const now = Date.now();
    const searchLower = search.trim().toLowerCase();

    return workOrders.filter((order) => {
      if (status !== "all" && order.status !== status) return false;
      if (severity !== "all" && order.severity !== severity) return false;

      if (slaFilter !== "all") {
        const category = getOrderSlaCategory(order, now);
        if (category !== slaFilter) return false;
      }

      if (searchLower) {
        const matchNumber = order.workOrderNumber?.toLowerCase().includes(searchLower);
        const matchProblem = order.problem?.toLowerCase().includes(searchLower);
        const matchAsset = order.assetId?.toLowerCase().includes(searchLower);
        const matchTech = order.technician?.toLowerCase().includes(searchLower);
        if (!matchNumber && !matchProblem && !matchAsset && !matchTech) {
          return false;
        }
      }

      return true;
    });
  }, [search, severity, slaFilter, status, workOrders]);

  // Export filtered orders as CSV
  const handleExportCsv = () => {
    const branchName = branches.find((b) => b.id === selectedBranch)?.name || selectedBranch || "fleet";
    const now = Date.now();
    const headers = [
      "Work Order Number",
      "Problem",
      "Branch ID",
      "Asset ID",
      "Severity",
      "Status",
      "Assigned Technician",
      "Created At",
      "SLA Due Date",
      "Resolved At",
      "SLA Audit Status",
    ];

    const rows = visibleOrders.map((wo) => {
      const slaCat = getOrderSlaCategory(wo, now);
      const slaLabel =
        slaCat === "met" ? "SLA Met" :
        slaCat === "breached" ? "SLA Breached" :
        slaCat === "at_risk" ? "At Risk (<4h)" :
        slaCat === "on_track" ? "On Track" : "No SLA";

      return [
        wo.workOrderNumber,
        `"${(wo.problem || "").replace(/"/g, '""')}"`,
        wo.branchNodeId || "",
        wo.assetId || "",
        wo.severity,
        wo.status,
        `"${(wo.technician || "").replace(/"/g, '""')}"`,
        wo.createdAt,
        wo.slaDueAt || "",
        wo.resolvedAt || "",
        slaLabel,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `maintenance_sla_audit_${branchName}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const branchTitle = branches.find((b) => b.id === selectedBranch)?.name;

  return (
    <ModulePage
      eyebrow="Audit & compliance"
      title="Maintenance & SLA Audit"
      description={
        selectedBranch
          ? `Review corrective maintenance evidence, ownership, SLA compliance, and service deadlines for ${branchTitle || selectedBranch}.`
          : "Review maintenance evidence, ownership, SLA targets, and service breach telemetry across the fleet."
      }
      icon={CalendarClock}
      actionHref="/maintenance"
      actionLabel="Open maintenance center"
      count={visibleOrders.length}
      countLabel="work orders"
      loading={loading}
      error={error}
      onRetry={() => void loadWorkOrders()}
      empty={visibleOrders.length === 0}
      emptyTitle="No matching work orders"
      emptyDescription="No maintenance work orders found matching the selected scope and filters."
    >
      {/* SLA & Maintenance KPI Summary Header */}
      <section className="audit-maintenance-summary" aria-label="Maintenance work order summary" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Metric label="Audited orders" value={scopeSummary.total} />
        <Metric label="Active backlog" value={scopeSummary.backlog} />
        <Metric
          label="SLA Compliance"
          value={scopeSummary.evaluated > 0 ? scopeSummary.complianceRate : "—"}
          suffix={scopeSummary.evaluated > 0 ? "%" : ""}
          tone={scopeSummary.complianceRate < 90 && scopeSummary.evaluated > 0 ? "danger" : undefined}
        />
        <Metric
          label="SLA Breached"
          value={scopeSummary.breached}
          tone={scopeSummary.breached > 0 ? "danger" : undefined}
        />
        <Metric
          label="High / Critical"
          value={scopeSummary.urgent}
          tone={scopeSummary.urgent > 0 ? "danger" : undefined}
        />
        <Metric
          label="On-Time Closed"
          value={scopeSummary.onTime}
        />
      </section>

      {/* Filter Toolbar */}
      <section className="module-filters" aria-label="Filter maintenance work orders" style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
        {/* Branch Scope Dropdown */}
        <label style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Branch scope</span>
          <select
            value={selectedBranch}
            onChange={(e) => handleBranchChange(e.target.value)}
            style={{ height: "34px", padding: "0 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
          >
            <option value="">All Branches (Fleet-wide)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        {/* Status Filter */}
        <label style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            style={{ height: "34px", padding: "0 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </label>

        {/* Severity Filter */}
        <label style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Severity</span>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as SeverityFilter)}
            style={{ height: "34px", padding: "0 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>

        {/* SLA Status Filter */}
        <label style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>SLA Audit</span>
          <select
            value={slaFilter}
            onChange={(e) => setSlaFilter(e.target.value as SlaFilter)}
            style={{ height: "34px", padding: "0 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
          >
            <option value="all">All SLA states</option>
            <option value="met">SLA Met (On-time)</option>
            <option value="breached">SLA Breached / Overdue</option>
            <option value="at_risk">At Risk (&lt;4h remaining)</option>
            <option value="on_track">On Track (In SLA)</option>
            <option value="no_sla">No SLA Target</option>
          </select>
        </label>

        {/* Search Box */}
        <label style={{ display: "flex", flexDirection: "column", gap: "3px", flex: "1 1 180px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Search evidence</span>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search WO#, issue, asset, or technician..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                height: "34px",
                paddingLeft: "30px",
                paddingRight: "10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "12px",
              }}
            />
          </div>
        </label>

        {/* Action Buttons: Export & Refresh */}
        <div style={{ display: "flex", gap: "8px", marginLeft: "auto", alignSelf: "flex-end" }}>
          <button
            className="module-retry"
            type="button"
            onClick={handleExportCsv}
            disabled={visibleOrders.length === 0}
            title="Download CSV report of filtered work orders"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "11px" }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            className="module-retry"
            type="button"
            onClick={() => void loadWorkOrders()}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "11px" }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </section>

      {/* Main Audit Evidence Table */}
      <div className="module-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Work order</th>
              {!selectedBranch && <th>Branch</th>}
              <th>Issue & Asset</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Owner</th>
              <th>SLA Due</th>
              <th>SLA Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.map((order) => {
              const slaCat = getOrderSlaCategory(order);
              return (
                <tr key={order.id}>
                  <td>
                    <span className="module-id">{order.workOrderNumber}</span>
                  </td>
                  {!selectedBranch && (
                    <td>
                      <span className="module-row-detail" style={{ fontWeight: 600 }}>
                        {branches.find((b) => b.id === order.branchNodeId)?.name || order.branchNodeId || "Fleet"}
                      </span>
                    </td>
                  )}
                  <td>
                    <strong className="module-row-title">{order.problem}</strong>
                    {order.assetId ? <span className="module-row-detail">Asset: {order.assetId}</span> : null}
                  </td>
                  <td>
                    <span className={`module-priority ${order.severity}`}>{order.severity}</span>
                  </td>
                  <td>
                    <ModuleStatus value={order.status} />
                  </td>
                  <td>{order.technician ?? "Unassigned"}</td>
                  <td>
                    <DueDate value={order.slaDueAt} />
                  </td>
                  <td>
                    <SlaBadge category={slaCat} order={order} />
                  </td>
                  <td className="module-row-action">
                    <button
                      type="button"
                      onClick={() => router.push(`/maintenance/workorders/${order.id}`)}
                      style={{ cursor: "pointer" }}
                    >
                      View details
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ModulePage>
  );
}

function Metric({
  label,
  value,
  tone,
  suffix = "",
}: {
  label: string;
  value: number | string;
  tone?: "danger";
  suffix?: string;
}) {
  return (
    <div className={tone ? `audit-maintenance-metric ${tone}` : "audit-maintenance-metric"}>
      <span>{label}</span>
      <strong>
        {value}
        {suffix}
      </strong>
    </div>
  );
}

function DueDate({ value }: { value?: string }) {
  if (!value || Number.isNaN(Date.parse(value))) return <span className="module-row-detail">Not set</span>;
  const overdue = Date.parse(value) < Date.now();
  return (
    <span className={overdue ? "module-row-detail module-overdue" : "module-row-detail"}>
      {new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
      {overdue ? " (overdue)" : ""}
    </span>
  );
}

function SlaBadge({ category, order }: { category: SlaCategory; order: WorkOrder }) {
  if (category === "met") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 8px",
          borderRadius: "9999px",
          fontSize: "11px",
          fontWeight: 600,
          background: "#ecfdf5",
          color: "#047857",
          border: "1px solid #a7f3d0",
        }}
        title={`Met on ${order.resolvedAt ? new Date(order.resolvedAt).toLocaleString() : new Date(order.updatedAt).toLocaleString()}`}
      >
        <CheckCircle2 size={12} /> SLA Met
      </span>
    );
  }

  if (category === "breached") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 8px",
          borderRadius: "9999px",
          fontSize: "11px",
          fontWeight: 600,
          background: "#fef2f2",
          color: "#b91c1c",
          border: "1px solid #fecaca",
        }}
        title="Deadline passed without on-time resolution"
      >
        <AlertCircle size={12} /> Breached
      </span>
    );
  }

  if (category === "at_risk") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 8px",
          borderRadius: "9999px",
          fontSize: "11px",
          fontWeight: 600,
          background: "#fffbeb",
          color: "#b45309",
          border: "1px solid #fde68a",
        }}
        title="Due in under 4 hours"
      >
        <Clock size={12} /> At Risk (&lt;4h)
      </span>
    );
  }

  if (category === "on_track") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 8px",
          borderRadius: "9999px",
          fontSize: "11px",
          fontWeight: 600,
          background: "#eff6ff",
          color: "#1d4ed8",
          border: "1px solid #bfdbfe",
        }}
        title="Currently on track"
      >
        <Clock size={12} /> In SLA
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "9999px",
        fontSize: "11px",
        fontWeight: 600,
        background: "#f1f5f9",
        color: "#64748b",
        border: "1px solid #e2e8f0",
      }}
    >
      No SLA
    </span>
  );
}
