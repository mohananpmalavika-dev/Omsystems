"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { privacyApi } from "@/lib/api-client";

export default function PrivacyBreachNewPage() {
  const router = useRouter();
  const [branchNodeId, setBranchNodeId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [breachType, setBreachType] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [discoveredAt, setDiscoveredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [description, setDescription] = useState("");
  const [remediation, setRemediation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await privacyApi.reportBreach({
        branchNodeId: branchNodeId || undefined,
        cameraId: cameraId || undefined,
        breachType,
        severity,
        discoveredAt: new Date(discoveredAt).toISOString(),
        description: description || undefined,
        remediation: remediation || undefined,
      });

      router.push("/maintenance/privacy/breaches");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1>Report a Privacy Breach</h1>
          <p style={{ color: "#555" }}>
            Log a new privacy breach so it can be triaged and tracked by the CCTV privacy team.
          </p>
        </div>
        <Link href="/maintenance/privacy/breaches" style={{ color: "#2563eb" }}>
          Back to breaches
        </Link>
      </div>

      {error && <div style={{ marginBottom: 20, color: "#b91c1c" }}>{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14, maxWidth: 700 }}>
        <label>
          <div style={{ marginBottom: 6 }}>Branch node ID (optional)</div>
          <input
            value={branchNodeId}
            onChange={(e) => setBranchNodeId(e.target.value)}
            placeholder="Branch node UUID"
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Camera ID (optional)</div>
          <input
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            placeholder="Camera UUID"
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Breach type</div>
          <input
            value={breachType}
            onChange={(e) => setBreachType(e.target.value)}
            required
            placeholder="Example: unauthorized_recording"
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Severity</div>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Discovered at</div>
          <input
            type="datetime-local"
            value={discoveredAt}
            onChange={(e) => setDiscoveredAt(e.target.value)}
            required
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Description</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Describe what happened and what systems were affected."
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Remediation plan</div>
          <textarea
            value={remediation}
            onChange={(e) => setRemediation(e.target.value)}
            rows={4}
            placeholder="Outline next steps for containment and prevention."
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          style={{ padding: "12px 18px", borderRadius: 8, border: "none", background: "#1d4ed8", color: "#fff", cursor: submitting ? "not-allowed" : "pointer" }}
        >
          {submitting ? "Reporting…" : "Report breach"}
        </button>
      </form>
    </div>
  );
}
