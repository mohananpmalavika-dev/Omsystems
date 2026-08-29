"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi, organizationApi } from "@/lib/api-client";
import type { MaintenanceAsset, MaintenanceVendor } from "@/lib/types";

type BranchOption = { id: string; name: string };

export default function NewAssetPage() {
  const router = useRouter();
  const [assetType, setAssetType] = useState("");
  const [category, setCategory] = useState<MaintenanceAsset["category"]>("camera");
  const [serialNumber, setSerialNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [firmwareVersion, setFirmwareVersion] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [branchNodeId, setBranchNodeId] = useState("");
  const [location, setLocation] = useState("");
  const [installationDate, setInstallationDate] = useState("");
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<MaintenanceAsset["status"]>("operational");
  const [vendors, setVendors] = useState<MaintenanceVendor[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      maintenanceApi.listVendors(),
      organizationApi.listNodes({ type: "branch" }),
    ])
      .then(([vendorResponse, branchResponse]) => {
        if (!active) return;
        setVendors(vendorResponse.data);
        setBranches(branchResponse.data);
      })
      .catch((reason: unknown) => {
        if (active) setDirectoryError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setDirectoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await maintenanceApi.createAsset({
        category,
        assetType: assetType.trim(),
        serialNumber: serialNumber.trim() || undefined,
        make: make.trim() || undefined,
        model: model.trim() || undefined,
        firmwareVersion: firmwareVersion.trim() || undefined,
        vendorId: vendorId || undefined,
        branchNodeId: branchNodeId || undefined,
        location: location.trim() || undefined,
        installationDate: installationDate || undefined,
        warrantyExpiresAt: warrantyExpiresAt || undefined,
        notes: notes.trim() || undefined,
        status,
      });
      router.push("/maintenance/assets");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="record-form-page work-order-form-page">
      <header className="record-form-hero">
        <div>
          <span>Asset registry</span>
          <h1>Register asset</h1>
          <p>Add a real field asset with its identity, ownership, location, and lifecycle status.</p>
        </div>
      </header>

      <form className="work-order-form" onSubmit={handleSubmit}>
        <div className="work-order-form-grid">
          <label className="work-order-field">
            <span>Asset type <em>Required</em></span>
            <input
              value={assetType}
              onChange={(event) => setAssetType(event.target.value)}
              minLength={2}
              maxLength={200}
              placeholder="e.g. 4K dome camera"
              required
            />
          </label>
          <label className="work-order-field">
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as MaintenanceAsset["category"])}
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
            <span>Make <em>Optional</em></span>
            <input value={make} onChange={(event) => setMake(event.target.value)} maxLength={200} />
          </label>
          <label className="work-order-field">
            <span>Model <em>Optional</em></span>
            <input value={model} onChange={(event) => setModel(event.target.value)} maxLength={200} />
          </label>
          <label className="work-order-field">
            <span>Serial number <em>Optional</em></span>
            <input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} maxLength={200} />
          </label>
          <label className="work-order-field">
            <span>Firmware version <em>Optional</em></span>
            <input value={firmwareVersion} onChange={(event) => setFirmwareVersion(event.target.value)} maxLength={200} />
          </label>
          <label className="work-order-field">
            <span>Branch <em>Optional</em></span>
            <select
              value={branchNodeId}
              onChange={(event) => setBranchNodeId(event.target.value)}
              disabled={directoryLoading}
            >
              <option value="">{directoryLoading ? "Loading branches…" : "Tenant-level asset"}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          <label className="work-order-field">
            <span>Vendor <em>Optional</em></span>
            <select
              value={vendorId}
              onChange={(event) => setVendorId(event.target.value)}
              disabled={directoryLoading}
            >
              <option value="">{directoryLoading ? "Loading vendors…" : "No linked vendor"}</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </label>
          <label className="work-order-field">
            <span>Physical location <em>Optional</em></span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={200}
              placeholder="e.g. Main entrance, north wall"
            />
          </label>
          <label className="work-order-field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as MaintenanceAsset["status"])}
            >
              <option value="operational">Operational</option>
              <option value="degraded">Degraded</option>
              <option value="maintenance_due">Maintenance due</option>
              <option value="offline">Offline</option>
              <option value="retired">Retired</option>
            </select>
          </label>
          <label className="work-order-field">
            <span>Installation date <em>Optional</em></span>
            <input type="date" value={installationDate} onChange={(event) => setInstallationDate(event.target.value)} />
          </label>
          <label className="work-order-field">
            <span>Warranty expires <em>Optional</em></span>
            <input type="date" value={warrantyExpiresAt} onChange={(event) => setWarrantyExpiresAt(event.target.value)} />
          </label>
          <label className="work-order-field work-order-field-wide">
            <span>Notes <em>Optional</em></span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
              rows={4}
            />
          </label>
        </div>

        {directoryError && <p className="work-order-form-error" role="alert">Directory unavailable: {directoryError}</p>}
        {error && <p className="work-order-form-error" role="alert">{error}</p>}

        <footer className="work-order-form-footer">
          <p>Only branches and vendors available to your signed-in account can be linked.</p>
          <button type="submit" disabled={loading || assetType.trim().length < 2}>
            {loading ? "Registering…" : "Register asset"}
          </button>
        </footer>
      </form>
    </main>
  );
}
