"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi, cameraInventoryApi } from "@/lib/api-client";
import type { MaintenanceAsset, WorkOrder } from "@/lib/types";

function assetLabel(asset: MaintenanceAsset) {
  const identity = [asset.make, asset.model].filter(Boolean).join(" ");
  return `${asset.assetType}${identity ? ` — ${identity}` : ""}`;
}

function computeRecommendedSla(severity: WorkOrder["severity"]): string {
  const hours = severity === "critical" ? 4 : severity === "high" ? 12 : severity === "medium" ? 24 : 72;
  const target = new Date(Date.now() + hours * 60 * 60 * 1000);
  const local = new Date(target.getTime() - target.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [problem, setProblem] = useState("");
  const [assetId, setAssetId] = useState("");
  const [branchNodeId, setBranchNodeId] = useState("");
  const [severity, setSeverity] = useState<WorkOrder["severity"]>("medium");
  const [slaDueAt, setSlaDueAt] = useState(() => computeRecommendedSla("medium"));
  const [eta, setEta] = useState("");

  const [assets, setAssets] = useState<MaintenanceAsset[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      maintenanceApi.listAssets(),
      cameraInventoryApi.listBranches("device:configure").catch(() => ({ data: [] })),
    ])
      .then(([assetRes, branchRes]) => {
        if (!active) return;
        setAssets(assetRes.data);
        if (Array.isArray(branchRes?.data)) {
          setBranches(branchRes.data.map((b: any) => ({ id: b.id, name: b.name || b.id })));
        }
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

  const handleSeverityChange = (newSev: WorkOrder["severity"]) => {
    setSeverity(newSev);
    setSlaDueAt(computeRecommendedSla(newSev));
  };

  const handleAssetChange = (newAssetId: string) => {
    setAssetId(newAssetId);
    const selected = assets.find((a) => a.id === newAssetId);
    if (selected?.branchNodeId) {
      setBranchNodeId(selected.branchNodeId);
    }
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await maintenanceApi.createWorkOrder({
        problem: problem.trim(),
        assetId: assetId || undefined,
        branchNodeId: branchNodeId || undefined,
        severity,
        slaDueAt: slaDueAt ? new Date(slaDueAt).toISOString() : undefined,
        eta: eta ? new Date(eta).toISOString() : undefined,
      });
      router.push("/maintenance/workorders");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  const slaWindowHours = severity === "critical" ? 4 : severity === "high" ? 12 : severity === "medium" ? 24 : 72;

  return (
    <main className="record-form-page work-order-form-page">
      <header className="record-form-hero">
        <div>
          <span>Field service</span>
          <h1>Create work order</h1>
          <p>Define the problem, severity, affected asset, SLA due date, and expected service schedule.</p>
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
              rows={5}
              required
            />
          </label>
          <label className="work-order-field">
            <span>Affected asset <em>Optional</em></span>
            <select
              value={assetId}
              onChange={(event) => handleAssetChange(event.target.value)}
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
            <span>Branch location <em>Optional</em></span>
            <select
              value={branchNodeId}
              onChange={(event) => setBranchNodeId(event.target.value)}
            >
              <option value="">Fleet-wide / Unassigned</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          <label className="work-order-field">
            <span>Severity</span>
            <select
              value={severity}
              onChange={(event) => handleSeverityChange(event.target.value as WorkOrder["severity"])}
            >
              <option value="low">Low (72h SLA)</option>
              <option value="medium">Medium (24h SLA)</option>
              <option value="high">High (12h SLA)</option>
              <option value="critical">Critical (4h SLA)</option>
            </select>
          </label>
          <label className="work-order-field work-order-schedule-field">
            <span>SLA Due Date <em>Recommended {slaWindowHours}h</em></span>
            <input
              type="datetime-local"
              value={slaDueAt}
              onChange={(event) => setSlaDueAt(event.target.value)}
              required
            />
          </label>
          <label className="work-order-field work-order-schedule-field">
            <span>Expected service time (ETA) <em>Optional</em></span>
            <input
              type="datetime-local"
              value={eta}
              onChange={(event) => setEta(event.target.value)}
            />
          </label>
        </div>

        {error && <p className="work-order-form-error" role="alert">{error}</p>}

        <footer className="work-order-form-footer">
          <p>A unique work-order number is generated securely with SLA compliance tracking.</p>
          <button type="submit" disabled={loading || problem.trim().length < 5}>
            {loading ? "Creating…" : "Create work order"}
          </button>
        </footer>
      </form>
    </main>
  );
}
