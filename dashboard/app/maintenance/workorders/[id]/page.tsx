"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";
import type { MaintenanceAsset, WorkOrder } from "@/lib/types";

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function assetLabel(asset: MaintenanceAsset) {
  const identity = [asset.make, asset.model].filter(Boolean).join(" ");
  return `${asset.assetType}${identity ? ` — ${identity}` : ""}`;
}

export default function WorkOrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [item, setItem] = useState<WorkOrder | null>(null);
  const [assets, setAssets] = useState<MaintenanceAsset[]>([]);
  const [eta, setEta] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      maintenanceApi.getWorkOrder(id),
      maintenanceApi.listAssets(),
    ])
      .then(([workOrder, assetResponse]) => {
        if (!active) return;
        setItem(workOrder);
        setAssets(assetResponse.data);
        setEta(toDateTimeLocal(workOrder.eta));
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
    if (!item || !id) return;
    setSaving(true);
    setError(null);
    try {
      await maintenanceApi.updateWorkOrder(id, {
        problem: item.problem.trim(),
        assetId: item.assetId || null,
        severity: item.severity,
        technician: item.technician?.trim() || null,
        eta: eta ? new Date(eta).toISOString() : null,
        rootCause: item.rootCause?.trim() || null,
        actionTaken: item.actionTaken?.trim() || null,
        verification: item.verification?.trim() || null,
        status: item.status,
      });
      router.push("/maintenance/workorders");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="record-form-page work-order-form-page">Loading work order…</main>;
  }
  if (!item) {
    return (
      <main className="record-form-page work-order-form-page">
        <p className="work-order-form-error" role="alert">
          {error ?? "Work order not found."}
        </p>
      </main>
    );
  }

  return (
    <main className="record-form-page work-order-form-page">
      <header className="record-form-hero">
        <div>
          <span>Field service · {item.workOrderNumber}</span>
          <h1>Work order details</h1>
          <p>Update assignment, execution evidence, resolution, and lifecycle status.</p>
        </div>
      </header>

      <form className="work-order-form" onSubmit={handleSave}>
        <div className="work-order-form-grid">
          <label className="work-order-field work-order-field-wide">
            <span>Problem and required work <em>Required</em></span>
            <textarea
              value={item.problem}
              onChange={(event) => setItem({ ...item, problem: event.target.value })}
              minLength={5}
              maxLength={2000}
              rows={5}
              required
            />
          </label>
          <label className="work-order-field">
            <span>Affected asset</span>
            <select
              value={item.assetId ?? ""}
              onChange={(event) => setItem({ ...item, assetId: event.target.value || undefined })}
            >
              <option value="">No linked asset</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>
              ))}
            </select>
          </label>
          <label className="work-order-field">
            <span>Severity</span>
            <select
              value={item.severity}
              onChange={(event) => setItem({
                ...item,
                severity: event.target.value as WorkOrder["severity"],
              })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="work-order-field">
            <span>Technician <em>Optional</em></span>
            <input
              value={item.technician ?? ""}
              onChange={(event) => setItem({ ...item, technician: event.target.value })}
              maxLength={200}
              placeholder="Assigned technician or service team"
            />
          </label>
          <label className="work-order-field">
            <span>Expected service time <em>Optional</em></span>
            <input
              type="datetime-local"
              value={eta}
              onChange={(event) => setEta(event.target.value)}
            />
          </label>
          <label className="work-order-field">
            <span>Status</span>
            <select
              value={item.status}
              onChange={(event) => setItem({
                ...item,
                status: event.target.value as WorkOrder["status"],
              })}
            >
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label className="work-order-field work-order-field-wide">
            <span>Root cause <em>Optional</em></span>
            <textarea
              value={item.rootCause ?? ""}
              onChange={(event) => setItem({ ...item, rootCause: event.target.value })}
              maxLength={2000}
              rows={3}
            />
          </label>
          <label className="work-order-field work-order-field-wide">
            <span>Action taken <em>Optional</em></span>
            <textarea
              value={item.actionTaken ?? ""}
              onChange={(event) => setItem({ ...item, actionTaken: event.target.value })}
              maxLength={2000}
              rows={3}
            />
          </label>
          <label className="work-order-field work-order-field-wide">
            <span>Verification evidence <em>Optional</em></span>
            <textarea
              value={item.verification ?? ""}
              onChange={(event) => setItem({ ...item, verification: event.target.value })}
              maxLength={2000}
              rows={3}
              placeholder="Record the post-service test result or reviewer evidence."
            />
          </label>
        </div>

        {error && <p className="work-order-form-error" role="alert">{error}</p>}

        <footer className="work-order-form-footer">
          <p>Created {new Date(item.createdAt).toLocaleString()} · Last updated {new Date(item.updatedAt).toLocaleString()}</p>
          <button type="submit" disabled={saving || item.problem.trim().length < 5}>
            {saving ? "Saving…" : "Save work order"}
          </button>
        </footer>
      </form>
    </main>
  );
}
