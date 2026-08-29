"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";
import type { MaintenanceAsset, WorkOrder } from "@/lib/types";

function assetLabel(asset: MaintenanceAsset) {
  const identity = [asset.make, asset.model].filter(Boolean).join(" ");
  return `${asset.assetType}${identity ? ` — ${identity}` : ""}`;
}

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [problem, setProblem] = useState("");
  const [assetId, setAssetId] = useState("");
  const [severity, setSeverity] = useState<WorkOrder["severity"]>("medium");
  const [eta, setEta] = useState("");
  const [assets, setAssets] = useState<MaintenanceAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void maintenanceApi.listAssets()
      .then((response) => {
        if (active) setAssets(response.data);
      })
      .catch((reason: unknown) => {
        if (active) {
          setAssetsError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (active) setAssetsLoading(false);
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
      await maintenanceApi.createWorkOrder({
        problem: problem.trim(),
        assetId: assetId || undefined,
        severity,
        eta: eta ? new Date(eta).toISOString() : undefined,
      });
      router.push("/maintenance/workorders");
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
          <span>Field service</span>
          <h1>Create work order</h1>
          <p>Define the problem, severity, affected asset, and expected service time.</p>
        </div>
      </header>

      <form className="work-order-form" onSubmit={handleSubmit}>
        <div className="work-order-form-grid">
          <label className="work-order-field work-order-field-wide">
            <span>Problem and required work <em>Required</em></span>
            <textarea
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              placeholder="Describe the observed issue, required work, and any access notes."
              minLength={5}
              maxLength={2000}
              rows={6}
              required
            />
          </label>
          <label className="work-order-field">
            <span>Affected asset <em>Optional</em></span>
            <select
              value={assetId}
              onChange={(event) => setAssetId(event.target.value)}
              disabled={assetsLoading}
            >
              <option value="">{assetsLoading ? "Loading assets…" : "No linked asset"}</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>
              ))}
            </select>
            {assetsError && <small role="alert">Asset directory unavailable: {assetsError}</small>}
          </label>
          <label className="work-order-field">
            <span>Severity</span>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as WorkOrder["severity"])}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="work-order-field work-order-schedule-field">
            <span>Expected service time <em>Optional</em></span>
            <input
              type="datetime-local"
              value={eta}
              onChange={(event) => setEta(event.target.value)}
            />
          </label>
        </div>

        {error && <p className="work-order-form-error" role="alert">{error}</p>}

        <footer className="work-order-form-footer">
          <p>A unique work-order number is generated securely when this record is created.</p>
          <button type="submit" disabled={loading || problem.trim().length < 5}>
            {loading ? "Creating…" : "Create work order"}
          </button>
        </footer>
      </form>
    </main>
  );
}
