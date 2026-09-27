"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { WorkflowNav } from "@/components/workflow-nav";
import { maintenanceApi } from "@/lib/api-client";
import type { MaintenanceAsset, WorkOrder } from "@/lib/types";

function assetLabel(asset: MaintenanceAsset | undefined) {
  if (!asset) return "Not linked";
  const identity = [asset.make, asset.model].filter(Boolean).join(" ");
  return identity || asset.assetType;
}

function SlaDueCell({ value, status }: { value?: string; status: WorkOrder["status"] }) {
  if (!value || Number.isNaN(Date.parse(value))) {
    return <span className="module-row-detail">Not set</span>;
  }
  const isClosed = ["resolved", "closed"].includes(status);
  const overdue = !isClosed && Date.parse(value) < Date.now();
  return (
    <span className={overdue ? "module-row-detail module-overdue" : "module-row-detail"}>
      {new Date(value).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
      {overdue ? " (overdue)" : ""}
    </span>
  );
}

export default function WorkOrdersListPage() {
  const [view, setView] = useState("board");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [assets, setAssets] = useState<MaintenanceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      maintenanceApi.listWorkOrders(),
      maintenanceApi.listAssets(),
    ])
      .then(([workOrders, assetResponse]) => {
        if (!active) return;
        setItems(workOrders.data);
        setAssets(assetResponse.data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const assetsById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const matchingItems = items.filter(item => `${item.problem} ${item.workOrderNumber} ${assetLabel(assetsById.get(item.assetId ?? ""))}`.toLowerCase().includes(query.trim().toLowerCase()));
  const lanes = [
    { id: "ready", title: "Ready for action", description: "Open and assigned", items: matchingItems.filter(item => ["open", "assigned"].includes(item.status)) },
    { id: "working", title: "In the field", description: "Work in progress", items: matchingItems.filter(item => item.status === "in_progress") },
    { id: "complete", title: "Resolved", description: "Resolved and closed", items: matchingItems.filter(item => ["resolved", "closed"].includes(item.status)) },
  ];

  return (
    <ModulePage
      presentation="board"
      eyebrow="Field service"
      title="Work orders"
      description="Coordinate corrective and preventive service work across branches, devices, and field teams with SLA oversight."
      icon={ClipboardCheck}
      actionHref="/maintenance/workorders/new"
      actionLabel="Create work order"
      count={items.length}
      countLabel="work orders"
      loading={loading}
      error={error}
      empty={items.length === 0}
      emptyTitle="No work orders"
      emptyDescription="Create a work order when an asset needs inspection, repair, replacement, or planned service."
    >
      <div className="work-order-board-page">
        <div className="service-board-toolbar"><WorkflowNav label="Work order view" value={view} onChange={setView} items={[{id:"board",label:"Service board"},{id:"table",label:"Record view"}]} /><input className="input" aria-label="Search work orders" placeholder="Find an order, asset or problem" value={query} onChange={event=>setQuery(event.target.value)}/></div>
        <div hidden={view!=="board"} className="service-board">
          {lanes.map(lane=><section key={lane.id} className={`service-board-lane service-board-${lane.id}`}><header><p className="workflow-kicker">{lane.description}</p><h2>{lane.title}<span>{lane.items.length}</span></h2></header><div>{lane.items.map(item=><Link className="service-order-card" href={`/maintenance/workorders/${item.id}`} key={item.id}><div><span className="module-id">{item.workOrderNumber}</span><span className={`module-priority ${item.severity}`}>{item.severity}</span></div><h3>{item.problem}</h3><p>{item.assetId?assetLabel(assetsById.get(item.assetId)):"No linked asset"}</p><footer><SlaDueCell value={item.slaDueAt} status={item.status}/><span>Open order ↗</span></footer></Link>)}{lane.items.length===0&&<p className="service-board-empty">No matching orders in this stage.</p>}</div></section>)}
        </div>
      <div hidden={view!=="table"} className="module-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Problem</th>
              <th>Asset</th>
              <th>Severity</th>
              <th>Status</th>
              <th>SLA Due</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {matchingItems.map((item) => (
              <tr key={item.id}>
                <td><span className="module-id">{item.workOrderNumber}</span></td>
                <td><strong className="module-row-title">{item.problem}</strong></td>
                <td>{item.assetId ? assetLabel(assetsById.get(item.assetId)) : "Not linked"}</td>
                <td>
                  <span className={`module-priority ${item.severity}`}>
                    {item.severity}
                  </span>
                </td>
                <td><ModuleStatus value={item.status} /></td>
                <td>
                  <SlaDueCell value={item.slaDueAt} status={item.status} />
                </td>
                <td className="module-row-action">
                  <Link href={`/maintenance/workorders/${item.id}`}>View details</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </ModulePage>
  );
}
