"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { privacyApi } from "@/lib/api-client";

export default function PrivacyControlsPage() {
  const [controls, setControls] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameraId, setCameraId] = useState("cam-001");

  useEffect(() => {
    setLoading(true);
    setError(null);
    void privacyApi.getCameraControls(cameraId)
      .then(setControls)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [cameraId]);

  const updateControls = async () => {
    setError(null);
    try {
      const result = await privacyApi.updateCameraControls(cameraId, {
        audioRecordingApproved: true,
        encryptionEnabled: true,
        dataProtectionOfficer: "dp0",
      });
      setControls(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1>Camera Privacy Controls</h1>
          <p style={{ color: "#555" }}>Review and update privacy controls for selected cameras.</p>
        </div>
        <Link href="/maintenance/privacy" style={{ color: "#2563eb" }}>
          Back to privacy
        </Link>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 420 }}>
        <label style={{ display: "block", marginBottom: 8 }}>
          Camera ID
          <input
            value={cameraId}
            onChange={(event) => setCameraId(event.target.value)}
            style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {loading ? (
        <p>Loading controls…</p>
      ) : (
        <div style={{ padding: 18, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", maxWidth: 680 }}>
          <p><strong>Audio recording approved:</strong> {controls?.audioRecordingApproved ? "Yes" : "No"}</p>
          <p><strong>Encryption enabled:</strong> {controls?.encryptionEnabled ? "Yes" : "No"}</p>
          <p><strong>Data protection officer:</strong> {controls?.dataProtectionOfficer ?? "Not set"}</p>
          <p><strong>Last reviewed:</strong> {controls?.lastReviewedAt ?? "Never"}</p>
          <button
            onClick={updateControls}
            style={{ marginTop: 16, padding: "12px 18px", borderRadius: 8, border: "none", background: "#1d4ed8", color: "#fff" }}
          >
            Apply sample controls
          </button>
        </div>
      )}
    </div>
  );
}
