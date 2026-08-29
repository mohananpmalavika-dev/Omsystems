"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { maintenanceApi } from "@/lib/api-client";
import type { MaintenanceAsset, WorkOrder } from "@/lib/types";

function assetLabel(asset: MaintenanceAsset | undefined) {
  if (!asset) return "Not linked";
  const identity = [asset.make, asset.model].filter(Boolean).join(" ");
  return identity || asset.assetType;
}

export default function WorkOrdersListPage() {
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

  return (
    <ModulePage
      eyebrow="Field service"
      title="Work orders"
      description="Coordinate corrective and preventive service work across branches, devices, and field teams."
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
      <div className="module-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Problem</th>
              <th>Asset</th>
              <th>Severity</th>
              <th>Status</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
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
                <td className="module-row-action">
                  <Link href={`/maintenance/workorders/${item.id}`}>View details</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModulePage>
  );
}
