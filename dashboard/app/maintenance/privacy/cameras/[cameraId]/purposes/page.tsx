"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { privacyApi } from "@/lib/api-client";

export default function CameraPurposeAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const cameraId = String(params.cameraId ?? "");

  const [purposes, setPurposes] = useState<any[]>([]);
  const [assigned, setAssigned] = useState<any[]>([]);
  const [purposeId, setPurposeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cameraId) return;
    setLoading(true);
    setError(null);

    void Promise.all([
      privacyApi.listPurposes(),
      privacyApi.listCameraPurposes(cameraId),
    ])
      .then(([purposeResponse, assignedResponse]) => {
        setPurposes(purposeResponse.data ?? []);
        setAssigned(assignedResponse.data ?? []);
        setPurposeId(purposeResponse.data?.[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [cameraId]);

  const handleAssign = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await privacyApi.assignCameraPurpose(cameraId, {
        purposeId,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        notes: notes || undefined,
      });
      router.refresh();
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
          <h1>Assign a Purpose to Camera</h1>
          <p style={{ color: "#555" }}>
            Map a lawful CCTV purpose to a specific camera and track assignment details.
          </p>
        </div>
        <Link href="/maintenance/privacy" style={{ color: "#2563eb" }}>
          Back to privacy
        </Link>
      </div>

      {error && <div style={{ marginBottom: 20, color: "#b91c1c" }}>{error}</div>}

      <form onSubmit={handleAssign} style={{ display: "grid", gap: 14, maxWidth: 720 }}>
        <label>
          <div style={{ marginBottom: 6 }}>Camera ID</div>
          <input
            value={cameraId}
            disabled
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb" }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Purpose</div>
          <select
            value={purposeId}
            onChange={(e) => setPurposeId(e.target.value)}
            required
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            {purposes.map((purpose) => (
              <option key={purpose.id} value={purpose.id}>
                {purpose.name} — {purpose.lawfulBasis}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <label>
            <div style={{ marginBottom: 6 }}>Start date</div>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
          <label>
            <div style={{ marginBottom: 6 }}>End date</div>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
        </div>

        <label>
          <div style={{ marginBottom: 6 }}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
            placeholder="Optional assignment details or justification"
          />
        </label>

        <button
          type="submit"
          disabled={submitting || loading || !purposeId}
          style={{ padding: "12px 18px", borderRadius: 8, border: "none", background: "#1d4ed8", color: "#fff", cursor: submitting ? "not-allowed" : "pointer" }}
        >
          {submitting ? "Assigning…" : "Assign purpose"}
        </button>
      </form>

      <section style={{ marginTop: 32, maxWidth: 720 }}>
        <h2 style={{ marginBottom: 12 }}>Assigned purposes</h2>
        {loading ? (
          <p>Loading assignments…</p>
        ) : assigned.length === 0 ? (
          <p style={{ color: "#4b5563" }}>No purposes assigned to this camera yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {assigned.map((assignment) => (
              <div key={assignment.id} style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{assignment.purpose?.name ?? assignment.purposeId}</h3>
                    <p style={{ margin: "6px 0", color: "#6b7280" }}>{assignment.purpose?.lawfulBasis ?? "Unknown lawful basis"}</p>
                  </div>
                  <span style={{ color: "#2563eb" }}>{assignment.notes ? "Notes added" : "No notes"}</span>
                </div>
                <p style={{ margin: "12px 0 0", color: "#374151" }}>
                  {assignment.startDate ? `From ${new Date(assignment.startDate).toLocaleString()}` : "No start date"}
                  {assignment.endDate ? ` to ${new Date(assignment.endDate).toLocaleString()}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
