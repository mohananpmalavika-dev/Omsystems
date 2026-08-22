"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { maintenanceApi } from "@/lib/api-client";

export default function WorkOrdersListPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi.listWorkOrders().then((r) => setItems(r.data)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
  }, []);

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
            <th>Order ID</th>
            <th>Task</th>
            <th>Asset</th>
            <th>Priority</th>
            <th>Status</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td><span className="module-id">{it.id}</span></td>
              <td><strong className="module-row-title">{it.title}</strong></td>
              <td>{it.assetId ?? 'Not linked'}</td>
              <td><span className={`module-priority ${(it.priority || '').toLowerCase()}`}>{it.priority ?? 'Normal'}</span></td>
              <td><ModuleStatus value={it.status} /></td>
              <td className="module-row-action">
                <Link href={`/maintenance/workorders/${it.id}`}>View details</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </ModulePage>
  );
}
