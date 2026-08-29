"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { maintenanceApi, organizationApi } from "@/lib/api-client";
import type { MaintenanceAsset, MaintenanceVendor } from "@/lib/types";

type BranchOption = { id: string; name: string };

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [asset, setAsset] = useState<MaintenanceAsset | null>(null);
  const [vendors, setVendors] = useState<MaintenanceVendor[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      maintenanceApi.getAsset(id),
      maintenanceApi.listVendors(),
      organizationApi.listNodes({ type: "branch" }),
    ])
      .then(([assetResponse, vendorResponse, branchResponse]) => {
        if (!active) return;
        setAsset(assetResponse);
        setVendors(vendorResponse.data);
        setBranches(branchResponse.data);
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
  }, [id]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!asset || !id) return;
    setSaving(true);
    setError(null);
    try {
      await maintenanceApi.updateAsset(id, {
        category: asset.category,
        assetType: asset.assetType.trim(),
        serialNumber: asset.serialNumber?.trim() || null,
        make: asset.make?.trim() || null,
        model: asset.model?.trim() || null,
        firmwareVersion: asset.firmwareVersion?.trim() || null,
        warrantyExpiresAt: asset.warrantyExpiresAt || null,
        purchaseDate: asset.purchaseDate || null,
        installationDate: asset.installationDate || null,
        vendorId: asset.vendorId || null,
        branchNodeId: asset.branchNodeId || null,
        location: asset.location?.trim() || null,
        mountingHeight: asset.mountingHeight?.trim() || null,
        status: asset.status,
        notes: asset.notes?.trim() || null,
      });
      router.push("/maintenance/assets");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="record-form-page work-order-form-page">Loading asset…</main>;
  }
  if (!asset) {
    return (
      <main className="record-form-page work-order-form-page">
        <p className="work-order-form-error" role="alert">{error ?? "Asset not found."}</p>
      </main>
    );
  }

  return (
    <main className="record-form-page work-order-form-page">
      <header className="record-form-hero">
        <div>
          <span>Asset registry · {asset.id}</span>
          <h1>Asset details</h1>
          <p>Maintain field identity, ownership, placement, firmware, warranty, and lifecycle status.</p>
        </div>
      </header>

      <form className="work-order-form" onSubmit={handleSave}>
        <div className="work-order-form-grid">
          <label className="work-order-field">
            <span>Asset type <em>Required</em></span>
            <input
              value={asset.assetType}
              onChange={(event) => setAsset({ ...asset, assetType: event.target.value })}
              minLength={2}
              maxLength={200}
              required
            />
          </label>
          <label className="work-order-field">
            <span>Category</span>
            <select
              value={asset.category}
              onChange={(event) => setAsset({
                ...asset,
                category: event.target.value as MaintenanceAsset["category"],
              })}
            >
              <option value="camera">Camera</option>
              <option value="recorder">Recorder</option>
              <option value="storage">Storage</option>
              <option value="network">Network</option>
              <option value="power">Power</option>
              <option value="accessory">Accessory</option>
            </select>
          </label>
          <label className="work-order-field">
            <span>Make</span>
            <input value={asset.make ?? ""} onChange={(event) => setAsset({ ...asset, make: event.target.value })} maxLength={200} />
          </label>
          <label className="work-order-field">
            <span>Model</span>
            <input value={asset.model ?? ""} onChange={(event) => setAsset({ ...asset, model: event.target.value })} maxLength={200} />
          </label>
          <label className="work-order-field">
            <span>Serial number</span>
            <input value={asset.serialNumber ?? ""} onChange={(event) => setAsset({ ...asset, serialNumber: event.target.value })} maxLength={200} />
          </label>
          <label className="work-order-field">
            <span>Firmware version</span>
            <input value={asset.firmwareVersion ?? ""} onChange={(event) => setAsset({ ...asset, firmwareVersion: event.target.value })} maxLength={200} />
          </label>
          <label className="work-order-field">
            <span>Branch</span>
            <select
              value={asset.branchNodeId ?? ""}
              onChange={(event) => setAsset({ ...asset, branchNodeId: event.target.value || undefined })}
            >
              <option value="">Tenant-level asset</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          <label className="work-order-field">
            <span>Vendor</span>
            <select
              value={asset.vendorId ?? ""}
              onChange={(event) => setAsset({ ...asset, vendorId: event.target.value || undefined })}
            >
              <option value="">No linked vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </label>
          <label className="work-order-field">
            <span>Physical location</span>
            <input value={asset.location ?? ""} onChange={(event) => setAsset({ ...asset, location: event.target.value })} maxLength={200} />
          </label>
          <label className="work-order-field">
            <span>Mounting height</span>
            <input value={asset.mountingHeight ?? ""} onChange={(event) => setAsset({ ...asset, mountingHeight: event.target.value })} maxLength={100} />
          </label>
          <label className="work-order-field">
            <span>Purchase date</span>
            <input type="date" value={asset.purchaseDate ?? ""} onChange={(event) => setAsset({ ...asset, purchaseDate: event.target.value })} />
          </label>
          <label className="work-order-field">
            <span>Installation date</span>
            <input type="date" value={asset.installationDate ?? ""} onChange={(event) => setAsset({ ...asset, installationDate: event.target.value })} />
          </label>
          <label className="work-order-field">
            <span>Warranty expires</span>
            <input type="date" value={asset.warrantyExpiresAt ?? ""} onChange={(event) => setAsset({ ...asset, warrantyExpiresAt: event.target.value })} />
          </label>
          <label className="work-order-field">
            <span>Status</span>
            <select
              value={asset.status}
              onChange={(event) => setAsset({
                ...asset,
                status: event.target.value as MaintenanceAsset["status"],
              })}
            >
              <option value="operational">Operational</option>
              <option value="degraded">Degraded</option>
              <option value="maintenance_due">Maintenance due</option>
              <option value="offline">Offline</option>
              <option value="retired">Retired</option>
            </select>
          </label>
          <label className="work-order-field work-order-field-wide">
            <span>Notes</span>
            <textarea
              value={asset.notes ?? ""}
              onChange={(event) => setAsset({ ...asset, notes: event.target.value })}
              maxLength={2000}
              rows={4}
            />
          </label>
        </div>

        {error && <p className="work-order-form-error" role="alert">{error}</p>}

        <footer className="work-order-form-footer">
          <p>Created {new Date(asset.createdAt).toLocaleString()} · Last updated {new Date(asset.updatedAt).toLocaleString()}</p>
          <button type="submit" disabled={saving || asset.assetType.trim().length < 2}>
            {saving ? "Saving…" : "Save asset"}
          </button>
        </footer>
      </form>
    </main>
  );
}
