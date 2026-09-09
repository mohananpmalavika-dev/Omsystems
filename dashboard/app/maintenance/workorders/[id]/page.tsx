"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
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
  const [slaDueAt, setSlaDueAt] = useState("");
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
        setSlaDueAt(toDateTimeLocal(workOrder.slaDueAt));
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
        slaDueAt: slaDueAt ? new Date(slaDueAt).toISOString() : null,
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
  const needsAssignee = item.status === "assigned" || item.status === "in_progress";
  const needsResolutionEvidence = item.status === "resolved" || item.status === "closed";
  const canSave = item.problem.trim().length >= 5
    && (!needsAssignee || Boolean(item.technician?.trim()))
    && (!needsResolutionEvidence || Boolean(item.actionTaken?.trim() && item.verification?.trim()));

  // Compute SLA status info
  const now = Date.now();
  let slaBanner = null;
  if (item.slaDueAt && !Number.isNaN(Date.parse(item.slaDueAt))) {
    const dueTime = Date.parse(item.slaDueAt);
    const isClosed = ["resolved", "closed"].includes(item.status);
    const finishTime = item.resolvedAt
      ? Date.parse(item.resolvedAt)
      : item.updatedAt
      ? Date.parse(item.updatedAt)
      : 0;

    if (isClosed) {
      const met = finishTime > 0 && finishTime <= dueTime;
      slaBanner = (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 16px",
            marginBottom: "16px",
            borderRadius: "8px",
            background: met ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${met ? "#a7f3d0" : "#fecaca"}`,
            color: met ? "#065f46" : "#991b1b",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          {met ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <div>
            <strong>{met ? "SLA Target Met" : "SLA Target Breached"}</strong>
            <span style={{ display: "block", fontSize: "11px", opacity: 0.9 }}>
              Due: {new Date(item.slaDueAt).toLocaleString()} · Resolved:{" "}
              {new Date(finishTime).toLocaleString()}
            </span>
          </div>
        </div>
      );
    } else {
      const overdue = dueTime < now;
      const atRisk = !overdue && dueTime - now <= 4 * 3600 * 1000;
      slaBanner = (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 16px",
            marginBottom: "16px",
            borderRadius: "8px",
            background: overdue ? "#fef2f2" : atRisk ? "#fffbeb" : "#eff6ff",
            border: `1px solid ${overdue ? "#fecaca" : atRisk ? "#fde68a" : "#bfdbfe"}`,
            color: overdue ? "#991b1b" : atRisk ? "#92400e" : "#1e40af",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          {overdue ? <AlertCircle size={18} /> : <Clock size={18} />}
          <div>
            <strong>{overdue ? "SLA Overdue / Breached" : atRisk ? "SLA At Risk (<4h Remaining)" : "Active In SLA"}</strong>
            <span style={{ display: "block", fontSize: "11px", opacity: 0.9 }}>
              Target deadline: {new Date(item.slaDueAt).toLocaleString()}
            </span>
          </div>
        </div>
      );
    }
  }

  return (
    <main className="record-form-page work-order-form-page">
      <header className="record-form-hero">
        <div>
          <span>Field service · {item.workOrderNumber}</span>
          <h1>Work order details</h1>
          <p>Update assignment, execution evidence, resolution, and SLA lifecycle status.</p>
        </div>
      </header>

      {slaBanner}

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
            <span>Technician <em>{needsAssignee ? "Required" : "Optional"}</em></span>
            <input
              value={item.technician ?? ""}
              onChange={(event) => setItem({ ...item, technician: event.target.value })}
              maxLength={200}
              placeholder="Assigned technician or service team"
            />
          </label>
          <label className="work-order-field">
            <span>SLA Target Deadline <em>Optional</em></span>
            <input
              type="datetime-local"
              value={slaDueAt}
              onChange={(event) => setSlaDueAt(event.target.value)}
            />
          </label>
          <label className="work-order-field">
            <span>Expected service time (ETA) <em>Optional</em></span>
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
            <span>Action taken <em>{needsResolutionEvidence ? "Required" : "Optional"}</em></span>
            <textarea
              value={item.actionTaken ?? ""}
              onChange={(event) => setItem({ ...item, actionTaken: event.target.value })}
              maxLength={2000}
              rows={3}
            />
          </label>
          <label className="work-order-field work-order-field-wide">
            <span>Verification evidence <em>{needsResolutionEvidence ? "Required" : "Optional"}</em></span>
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
          <button type="submit" disabled={saving || !canSave}>
            {saving ? "Saving…" : "Save work order"}
          </button>
        </footer>
      </form>
    </main>
  );
}
