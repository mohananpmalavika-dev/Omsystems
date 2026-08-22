"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assetId, setAssetId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await maintenanceApi.createWorkOrder({
        title,
        description: description || undefined,
        assetId: assetId || undefined,
        priority,
        scheduledAt: scheduledAt || undefined,
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
          <p>Define the task, priority, asset scope, and planned service window.</p>
        </div>
      </header>

      <form className="work-order-form" onSubmit={handleSubmit}>
        <div className="work-order-form-grid">
          <label className="work-order-field">
            <span>Title <em>Required</em></span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Replace camera power supply"
              required
            />
          </label>
          <label className="work-order-field">
            <span>Description <em>Optional</em></span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add the observed issue, required work, and any access notes."
              rows={4}
            />
          </label>
          <label className="work-order-field">
            <span>Asset ID <em>Optional</em></span>
            <input
              value={assetId}
              onChange={(event) => setAssetId(event.target.value)}
              placeholder="Asset or device identifier"
            />
          </label>
          <label className="work-order-field">
            <span>Priority</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="work-order-field work-order-schedule-field">
            <span>Scheduled for <em>Optional</em></span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
        </div>

        {error && <p className="work-order-form-error" role="alert">{error}</p>}

        <footer className="work-order-form-footer">
          <p>The work order can be assigned and refined after it is created.</p>
          <button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create work order"}
          </button>
        </footer>
      </form>
    </main>
  );
}
