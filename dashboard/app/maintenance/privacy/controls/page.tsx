"use client";

import React, { useEffect, useState } from "react";
import { Camera, LockKeyhole, ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/page-hero";
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
    <div className="privacy-controls-page">
      <PageHero eyebrow="Privacy enforcement" title="Camera privacy controls" description="Review encryption, audio approval, and governance ownership for a selected camera." icon={LockKeyhole} />

      <div className="privacy-control-selector">
        <span className="privacy-camera-icon"><Camera size={17} /></span>
        <label>Camera ID
          <input
            value={cameraId}
            onChange={(event) => setCameraId(event.target.value)}
          />
        </label>
      </div>

      {error && <div className="page-alert error">{error}</div>}

      {loading ? (
        <div className="privacy-controls-state">Loading privacy controls…</div>
      ) : (
        <section className="privacy-controls-panel">
          <header><div><span>Control posture</span><h2>Protection settings</h2></div><ShieldCheck size={20} /></header>
          <div className="privacy-control-grid">
            <div><span>Audio recording</span><strong>{controls?.audioRecordingApproved ? "Approved" : "Not approved"}</strong></div>
            <div><span>Encryption</span><strong>{controls?.encryptionEnabled ? "Enabled" : "Disabled"}</strong></div>
            <div><span>Data protection officer</span><strong>{controls?.dataProtectionOfficer ?? "Not assigned"}</strong></div>
            <div><span>Last reviewed</span><strong>{controls?.lastReviewedAt ?? "Never"}</strong></div>
          </div>
          <footer><p>Apply the approved baseline for this camera and record the responsible data protection officer.</p><button className="btn-primary" onClick={updateControls}>Apply approved baseline</button></footer>
        </section>
      )}
    </div>
  );
}
