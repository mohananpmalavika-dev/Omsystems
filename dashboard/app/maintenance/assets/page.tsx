"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Boxes, Download, Filter, Search } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { maintenanceApi, organizationApi } from "@/lib/api-client";
import type { MaintenanceAsset, MaintenanceVendor } from "@/lib/types";

type BranchOption = { id: string; name: string };

export default function AssetsListPage() {
  const [assets, setAssets] = useState<MaintenanceAsset[]>([]);
  const [vendors, setVendors] = useState<MaintenanceVendor[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadData = () => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      maintenanceApi.listAssets(),
      maintenanceApi.listVendors().catch(() => ({ data: [] as MaintenanceVendor[] })),
      organizationApi.listNodes({ type: "branch" }).catch(() => ({ data: [] as BranchOption[] })),
    ])
      .then(([assetResponse, vendorResponse, branchResponse]) => {
        if (!active) return;
        setAssets(assetResponse.data);
        setVendors(vendorResponse.data || []);
        setBranches(branchResponse.data || []);
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
  };

  useEffect(() => {
    return loadData();
  }, []);

  const vendorMap = useMemo(() => {
    const map = new Map<string, string>();
    vendors.forEach((v) => map.set(v.id, v.name));
    return map;
  }, [vendors]);

  const branchMap = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [branches]);

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (categoryFilter !== "all" && asset.category !== categoryFilter) return false;
      if (statusFilter !== "all" && asset.status !== statusFilter) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const vendorName = (asset.vendorId ? vendorMap.get(asset.vendorId) : "")?.toLowerCase() || "";
      const branchName = (asset.branchNodeId ? branchMap.get(asset.branchNodeId) : "")?.toLowerCase() || "";

      return (
        asset.assetType.toLowerCase().includes(q) ||
        (asset.make && asset.make.toLowerCase().includes(q)) ||
        (asset.model && asset.model.toLowerCase().includes(q)) ||
        (asset.serialNumber && asset.serialNumber.toLowerCase().includes(q)) ||
        (asset.location && asset.location.toLowerCase().includes(q)) ||
        vendorName.includes(q) ||
        branchName.includes(q)
      );
    });
  }, [assets, categoryFilter, statusFilter, searchQuery, vendorMap, branchMap]);

  const exportAllAssetReport = () => {
    if (assets.length === 0) return;

    const headers = [
      "Asset ID",
      "Asset Type",
      "Category",
      "Make / Manufacturer",
      "Model",
      "Serial Number",
      "Firmware Version",
      "Branch",
      "Vendor / Supplier",
      "Physical Location",
      "Mounting Height",
      "Status",
      "Purchase Date",
      "Installation Date",
      "Warranty Expiry Date",
      "Notes",
      "Created At",
      "Updated At",
    ];

    const rows = assets.map((a) => {
      const branchName = a.branchNodeId ? branchMap.get(a.branchNodeId) || a.branchNodeId : "Tenant-level";
      const vendorName = a.vendorId ? vendorMap.get(a.vendorId) || a.vendorId : "Not linked";

      return [
        a.id,
        a.assetType,
        a.category,
        a.make || "",
        a.model || "",
        a.serialNumber || "",
        a.firmwareVersion || "",
        branchName,
        vendorName,
        a.location || "",
        a.mountingHeight || "",
        a.status,
        a.purchaseDate ? a.purchaseDate.split("T")[0] : "",
        a.installationDate ? a.installationDate.split("T")[0] : "",
        a.warrantyExpiresAt ? a.warrantyExpiresAt.split("T")[0] : "",
        a.notes || "",
        a.createdAt ? a.createdAt.split("T")[0] : "",
        a.updatedAt ? a.updatedAt.split("T")[0] : "",
      ];
    });

    const csvContent =
      "\uFEFF" +
      [
        headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")),
      ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `Hardware_Asset_Registry_Report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
      onRetry={loadData}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", padding: "4px 0" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", flex: 1 }}>
          <div style={{ position: "relative", minWidth: "240px", maxWidth: "340px", flex: 1 }}>
            <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted, #888)" }} />
            <input
              type="text"
              placeholder="Search assets, make, serial, vendor, branch…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px 7px 32px",
                borderRadius: "6px",
                border: "1px solid var(--border, #333)",
                background: "var(--bg-panel, rgba(255,255,255,0.04))",
                color: "inherit",
                fontSize: "13px",
              }}
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: "6px",
              border: "1px solid var(--border, #333)",
              background: "var(--bg-panel, rgba(255,255,255,0.04))",
              color: "inherit",
              fontSize: "13px",
            }}
          >
            <option value="all">All Categories</option>
            <option value="camera">Camera</option>
            <option value="recorder">Recorder</option>
            <option value="storage">Storage</option>
            <option value="network">Network</option>
            <option value="power">Power</option>
            <option value="accessory">Accessory</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: "6px",
              border: "1px solid var(--border, #333)",
              background: "var(--bg-panel, rgba(255,255,255,0.04))",
              color: "inherit",
              fontSize: "13px",
            }}
          >
            <option value="all">All Statuses</option>
            <option value="operational">Operational</option>
            <option value="degraded">Degraded</option>
            <option value="maintenance_due">Maintenance due</option>
            <option value="offline">Offline</option>
            <option value="retired">Retired</option>
          </select>
        </div>

        <button
          type="button"
          onClick={exportAllAssetReport}
          disabled={assets.length === 0}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            borderRadius: "6px",
            border: "1px solid rgba(16, 185, 129, 0.4)",
            background: "rgba(16, 185, 129, 0.12)",
            color: "#10b981",
            fontWeight: 600,
            fontSize: "13px",
            cursor: assets.length === 0 ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
          }}
          title="Download full CSV report with all asset fields"
        >
          <Download size={15} />
          Export All Asset Report
        </button>
      </div>

      <div className="module-table-wrap" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Identity</th>
              <th>Category</th>
              <th>Branch</th>
              <th>Vendor</th>
              <th>Purchase Date</th>
              <th>Installation Date</th>
              <th>Warranty Expires</th>
              <th>Location</th>
              <th>Status</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", padding: "24px", color: "var(--muted, #888)" }}>
                  No matching assets found
                </td>
              </tr>
            ) : (
              filteredAssets.map((asset) => {
                const branchName = asset.branchNodeId ? branchMap.get(asset.branchNodeId) || "Linked" : "Tenant-level";
                const vendorName = asset.vendorId ? vendorMap.get(asset.vendorId) || "Linked" : "—";
                const purchaseDateStr = asset.purchaseDate ? asset.purchaseDate.split("T")[0] : "—";
                const installDateStr = asset.installationDate ? asset.installationDate.split("T")[0] : "—";
                const warrantyDateStr = asset.warrantyExpiresAt ? asset.warrantyExpiresAt.split("T")[0] : "—";

                return (
                  <tr key={asset.id}>
                    <td><strong className="module-row-title">{asset.assetType}</strong></td>
                    <td>
                      <span className="module-id">
                        {[asset.make, asset.model, asset.serialNumber].filter(Boolean).join(" · ") || "Not reported"}
                      </span>
                    </td>
                    <td><span className="module-category">{asset.category}</span></td>
                    <td><span style={{ fontSize: "13px" }}>{branchName}</span></td>
                    <td><span style={{ fontSize: "13px", color: asset.vendorId ? "inherit" : "var(--muted, #888)" }}>{vendorName}</span></td>
                    <td><span style={{ fontSize: "13px", whiteSpace: "nowrap" }}>{purchaseDateStr}</span></td>
                    <td><span style={{ fontSize: "13px", whiteSpace: "nowrap" }}>{installDateStr}</span></td>
                    <td><span style={{ fontSize: "13px", whiteSpace: "nowrap" }}>{warrantyDateStr}</span></td>
                    <td>{asset.location || "Not reported"}</td>
                    <td><ModuleStatus value={asset.status} /></td>
                    <td className="module-row-action">
                      <Link href={`/maintenance/assets/${asset.id}`}>View details</Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </ModulePage>
  );
}

