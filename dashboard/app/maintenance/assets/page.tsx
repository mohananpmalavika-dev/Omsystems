"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { maintenanceApi } from "@/lib/api-client";
import type { MaintenanceAsset } from "@/lib/types";

export default function AssetsListPage() {
  const [assets, setAssets] = useState<MaintenanceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void maintenanceApi.listAssets()
      .then((response) => {
        if (active) setAssets(response.data);
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
            <th>Asset</th>
            <th>Identity</th>
            <th>Category</th>
            <th>Location</th>
            <th>Status</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.id}>
              <td><strong className="module-row-title">{asset.assetType}</strong></td>
              <td>
                <span className="module-id">
                  {[asset.make, asset.model, asset.serialNumber].filter(Boolean).join(" · ") || "Not reported"}
                </span>
              </td>
              <td><span className="module-category">{asset.category}</span></td>
              <td>{asset.location || "Not reported"}</td>
              <td><ModuleStatus value={asset.status} /></td>
              <td className="module-row-action">
                <Link href={`/maintenance/assets/${asset.id}`}>View details</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </ModulePage>
  );
}
