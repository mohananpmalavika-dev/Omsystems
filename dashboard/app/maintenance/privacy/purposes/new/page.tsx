"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { privacyApi } from "@/lib/api-client";

export default function PrivacyPurposeNewPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [lawfulBasis, setLawfulBasis] = useState("");
  const [description, setDescription] = useState("");
  const [riskLevel, setRiskLevel] = useState("medium");
  const [dataCategories, setDataCategories] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await privacyApi.createPurpose({
        name,
        lawfulBasis,
        description,
        riskLevel,
        dataCategories: dataCategories.split(",").map((item) => item.trim()).filter(Boolean),
        active,
      });
      router.push("/maintenance/privacy/purposes");
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
          <h1>New Privacy Purpose</h1>
          <p style={{ color: "#555" }}>
            Capture lawful basis and risk level for CCTV processing purposes.
          </p>
        </div>
        <Link href="/maintenance/privacy/purposes" style={{ color: "#2563eb" }}>
          Back to purposes
        </Link>
      </div>

      {error && <div style={{ color: "#b91c1c", marginBottom: 16 }}>{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14, maxWidth: 620 }}>
        <label>
          <div style={{ marginBottom: 6 }}>Purpose name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Example: Loss prevention"
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Lawful basis</div>
          <input
            value={lawfulBasis}
            onChange={(e) => setLawfulBasis(e.target.value)}
            required
            placeholder="Example: legitimate_interest"
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Description</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Risk level</div>
          <select
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Data categories</div>
          <input
            value={dataCategories}
            onChange={(e) => setDataCategories(e.target.value)}
            placeholder="video, audio, metadata"
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>Active for current retention policy</span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          style={{ padding: "12px 18px", borderRadius: 8, border: "none", background: "#1d4ed8", color: "#fff", cursor: submitting ? "not-allowed" : "pointer" }}
        >
          {submitting ? "Creating…" : "Create purpose"}
        </button>
      </form>
    </div>
  );
}
