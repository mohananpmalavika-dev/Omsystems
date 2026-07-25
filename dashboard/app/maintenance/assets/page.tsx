"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { maintenanceApi } from "@/lib/api-client";

export default function AssetsListPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi.listAssets().then((res) => setAssets(res.data)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
  }, []);

  return (
    <ModulePage
      eyebrow="Fleet operations"
      title="Asset registry"
      description="Track every camera, recorder, storage node, network device, and supporting asset across the estate."
      icon={Boxes}
      actionHref="/maintenance/assets/new"
      actionLabel="Register asset"
      count={assets.length}
      countLabel="assets"
      loading={loading}
      error={error}
      empty={assets.length === 0}
      emptyTitle="No assets registered"
      emptyDescription="Register your first field device to begin lifecycle, ownership, and service tracking."
    >
      <div className="module-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset ID</th>
            <th>Device type</th>
            <th>Category</th>
            <th>Status</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.id}>
              <td><span className="module-id">{a.id}</span></td>
              <td><strong className="module-row-title">{a.assetType}</strong></td>
              <td><span className="module-category">{a.category}</span></td>
              <td><ModuleStatus value={a.status} /></td>
              <td className="module-row-action">
                <Link href={`/maintenance/assets/${a.id}`}>View details</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </ModulePage>
  );
}
