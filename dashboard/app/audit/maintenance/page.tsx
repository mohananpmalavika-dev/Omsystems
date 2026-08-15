"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ClipboardCheck, RefreshCw } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { maintenanceApi } from "@/lib/api-client";
import type { WorkOrder } from "@/lib/types";

type StatusFilter = "all" | WorkOrder["status"];
type SeverityFilter = "all" | WorkOrder["severity"];

export default function MaintenanceAuditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchNodeId = searchParams.get("branchNodeId");
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");

  const loadWorkOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await maintenanceApi.listWorkOrders();
      setWorkOrders(Array.isArray(response?.data) ? response.data as WorkOrder[] : []);
    } catch (reason) {
      setWorkOrders([]);
      setError(reason instanceof Error ? reason.message : "Unable to load maintenance work orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkOrders();
  }, [loadWorkOrders]);

  const visibleOrders = useMemo(() => workOrders.filter((order) => (
    (!branchNodeId || order.branchNodeId === branchNodeId) &&
    (status === "all" || order.status === status) &&
    (severity === "all" || order.severity === severity)
  )), [branchNodeId, severity, status, workOrders]);

  const summary = useMemo(() => {
    const openOrders = visibleOrders.filter((order) => !["resolved", "closed"].includes(order.status));
    const overdueOrders = openOrders.filter((order) => order.slaDueAt && Date.parse(order.slaDueAt) < Date.now());
    return {
      open: openOrders.length,
      assigned: visibleOrders.filter((order) => order.status === "assigned").length,
      inProgress: visibleOrders.filter((order) => order.status === "in_progress").length,
      urgent: visibleOrders.filter((order) => ["critical", "high"].includes(order.severity)).length,
      overdue: overdueOrders.length,
    };
  }, [visibleOrders]);

  return (
    <ModulePage
      eyebrow="Audit & activity"
      title="Maintenance audit"
      description={branchNodeId
        ? "Review maintenance evidence and work orders for the selected branch."
        : "Review maintenance evidence, ownership, priority, and service deadlines across the fleet."}
      icon={ClipboardCheck}
      actionHref="/maintenance"
      actionLabel="Open maintenance center"
      count={visibleOrders.length}
      countLabel="work orders"
      loading={loading}
      error={error}
      onRetry={() => void loadWorkOrders()}
      empty={visibleOrders.length === 0}
      emptyTitle="No matching work orders"
      emptyDescription="Maintenance work orders will appear here once they are created for this scope."
    >
      <section className="audit-maintenance-summary" aria-label="Maintenance work order summary">
        <Metric label="Open" value={summary.open} />
        <Metric label="Assigned" value={summary.assigned} />
        <Metric label="In progress" value={summary.inProgress} />
        <Metric label="High priority" value={summary.urgent} tone="danger" />
        <Metric label="Overdue" value={summary.overdue} tone={summary.overdue ? "danger" : undefined} />
      </section>

      <section className="module-filters" aria-label="Filter maintenance work orders">
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>
          Severity
          <select value={severity} onChange={(event) => setSeverity(event.target.value as SeverityFilter)}>
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <button className="module-retry" type="button" onClick={() => void loadWorkOrders()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </section>

      <div className="module-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Work order</th>
              <th>Issue</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Owner</th>
              <th>SLA due</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.map((order) => <tr key={order.id}>
              <td><span className="module-id">{order.workOrderNumber}</span></td>
              <td>
                <strong className="module-row-title">{order.problem}</strong>
                {order.assetId ? <span className="module-row-detail">Asset {order.assetId}</span> : null}
              </td>
              <td><span className={`module-priority ${order.severity}`}>{order.severity}</span></td>
              <td><ModuleStatus value={order.status} /></td>
              <td>{order.technician ?? "Unassigned"}</td>
              <td><DueDate value={order.slaDueAt} /></td>
              <td className="module-row-action">
                <button type="button" onClick={() => router.push(`/maintenance/workorders/${order.id}`)}>View details</button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </ModulePage>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return <div className={tone ? `audit-maintenance-metric ${tone}` : "audit-maintenance-metric"}>
    <span>{label}</span><strong>{value}</strong>
  </div>;
}

function DueDate({ value }: { value?: string }) {
  if (!value || Number.isNaN(Date.parse(value))) return <span className="module-row-detail">Not set</span>;
  const overdue = Date.parse(value) < Date.now();
  return <span className={overdue ? "module-row-detail module-overdue" : "module-row-detail"}>
    {new Date(value).toLocaleDateString()}{overdue ? " (overdue)" : ""}
  </span>;
}
