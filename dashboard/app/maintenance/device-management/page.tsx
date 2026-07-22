"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { deviceManagementApi } from "@/lib/api-client";

export default function DeviceManagementPage() {
  const [deviceId, setDeviceId] = useState("");
  const [rotationReason, setRotationReason] = useState("");
  const [rotationMode, setRotationMode] = useState<"scheduled" | "emergency">("scheduled");
  const [newPassword, setNewPassword] = useState("");
  const [rotationResult, setRotationResult] = useState<any>(null);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateType, setTemplateType] = useState("camera-configuration");
  const [templateCategory, setTemplateCategory] = useState("");
  const [templateSettings, setTemplateSettings] = useState("{\n  \"resolution\": \"1080p\"\n}");
  const [templateResult, setTemplateResult] = useState<any>(null);
  const [ipDeviceId, setIpDeviceId] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [subnet, setSubnet] = useState("");
  const [reservationStatus, setReservationStatus] = useState<"dhcp" | "static" | "reserved">("static");
  const [ipResult, setIpResult] = useState<any>(null);
  const [ipConflicts, setIpConflicts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      deviceManagementApi.listDeviceTemplates(),
      deviceManagementApi.getIpConflicts(),
    ])
      .then(([templatesRes, conflictsRes]) => {
        setTemplates(templatesRes.data ?? []);
        setIpConflicts(conflictsRes.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRotateCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    setRotationResult(null);
    setRotationError(null);

    try {
      const result = await deviceManagementApi.startPasswordRotation({
        deviceId,
        reason: rotationReason,
        rotationMode,
        newPassword,
      });
      setRotationResult(result);
      setDeviceId("");
      setRotationReason("");
      setNewPassword("");
    } catch (err) {
      setRotationError(err instanceof Error ? err.message : "Unable to rotate credentials.");
    }
  };

  const handleCreateTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    setTemplateResult(null);

    try {
      const settings = JSON.parse(templateSettings);
      const result = await deviceManagementApi.createDeviceTemplate({
        name: templateName,
        templateType,
        category: templateCategory,
        settings,
      });
      setTemplateResult(result);
      setTemplates((current) => [...current, result]);
      setTemplateName("");
      setTemplateCategory("");
      setTemplateSettings("{\n  \"resolution\": \"1080p\"\n}");
    } catch (err) {
      setTemplateResult({ error: err instanceof Error ? err.message : "Unable to create template." });
    }
  };

  const handleAssignIp = async (event: React.FormEvent) => {
    event.preventDefault();
    setIpResult(null);

    try {
      const result = await deviceManagementApi.assignDeviceIpAddress({
        deviceId: ipDeviceId,
        ipAddress,
        subnet,
        reservationStatus,
      });
      setIpResult(result);
      setIpDeviceId("");
      setIpAddress("");
      setSubnet("");
      setIpConflicts((current) => [...current, result.conflict ? result : []].flat());
    } catch (err) {
      setIpResult({ error: err instanceof Error ? err.message : "Unable to assign IP address." });
    }
  };

  return (
    <AppLayout>
      <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1>Device Management</h1>
          <p style={{ color: "#555" }}>
            Secure credential rotation, template lifecycle, and branch IP assignment for deployed devices.
          </p>
          <Link href="/maintenance" style={{ color: "#2563eb" }}>
            Back to maintenance dashboard
          </Link>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
            <h2>Password rotation</h2>
            <form onSubmit={handleRotateCredentials}>
              <label style={{ display: "block", marginBottom: 12 }}>
                Device ID
                <input
                  value={deviceId}
                  onChange={(event) => setDeviceId(event.target.value)}
                  placeholder="cam-001"
                  style={{ width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>
              <label style={{ display: "block", marginBottom: 12 }}>
                Reason
                <input
                  value={rotationReason}
                  onChange={(event) => setRotationReason(event.target.value)}
                  placeholder="Scheduled rotation"
                  style={{ width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>
              <label style={{ display: "block", marginBottom: 12 }}>
                Rotation mode
                <select
                  value={rotationMode}
                  onChange={(event) => setRotationMode(event.target.value as "scheduled" | "emergency")}
                  style={{ width: "100%", marginTop: 6, padding: 8 }}
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="emergency">Emergency</option>
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 12 }}>
                New password
                <input
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="StrongPass123!"
                  type="password"
                  style={{ width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>
              <button type="submit" style={{ padding: "10px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8 }}>
                Rotate credentials
              </button>
            </form>
            {rotationResult && (
              <div style={{ marginTop: 16, padding: 14, border: "1px solid #d1fae5", background: "#ecfdf5", borderRadius: 10 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>Rotation started</p>
                <p style={{ margin: 0 }}>Secret reference: {rotationResult.secretRef}</p>
                <p style={{ margin: 0 }}>Status: {rotationResult.status}</p>
              </div>
            )}
            {rotationError && <p style={{ color: "#b91c1c", marginTop: 16 }}>{rotationError}</p>}
          </div>

          <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
            <h2>IP address assignment</h2>
            <form onSubmit={handleAssignIp}>
              <label style={{ display: "block", marginBottom: 12 }}>
                Device ID
                <input
                  value={ipDeviceId}
                  onChange={(event) => setIpDeviceId(event.target.value)}
                  placeholder="cam-002"
                  style={{ width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>
              <label style={{ display: "block", marginBottom: 12 }}>
                IP address
                <input
                  value={ipAddress}
                  onChange={(event) => setIpAddress(event.target.value)}
                  placeholder="10.0.0.50"
                  style={{ width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>
              <label style={{ display: "block", marginBottom: 12 }}>
                Subnet
                <input
                  value={subnet}
                  onChange={(event) => setSubnet(event.target.value)}
                  placeholder="10.0.0.0/24"
                  style={{ width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>
              <label style={{ display: "block", marginBottom: 12 }}>
                Reservation status
                <select
                  value={reservationStatus}
                  onChange={(event) => setReservationStatus(event.target.value as "dhcp" | "static" | "reserved")}
                  style={{ width: "100%", marginTop: 6, padding: 8 }}
                >
                  <option value="static">Static</option>
                  <option value="dhcp">DHCP</option>
                  <option value="reserved">Reserved</option>
                </select>
              </label>
              <button type="submit" style={{ padding: "10px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8 }}>
                Assign IP
              </button>
            </form>
            {ipResult && <p style={{ marginTop: 16 }}>{ipResult.error ? ipResult.error : `Assigned ${ipResult.ipAddress}`}</p>}
            {ipConflicts.length > 0 && (
              <div style={{ marginTop: 16, padding: 14, border: "1px solid #fde68a", background: "#fef9c3", borderRadius: 10 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>IP conflicts detected</p>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {ipConflicts.map((conflict) => (
                    <li key={conflict.id || `${conflict.deviceId}-${conflict.ipAddress}`}>{conflict.deviceId}: {conflict.ipAddress}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section style={{ display: "grid", gap: 16, marginBottom: 24 }}>
          <div style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
            <h2>Create device template</h2>
            <form onSubmit={handleCreateTemplate}>
              <label style={{ display: "block", marginBottom: 12 }}>
                Name
                <input
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  style={{ width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>
              <label style={{ display: "block", marginBottom: 12 }}>
                Template type
                <select
                  value={templateType}
                  onChange={(event) => setTemplateType(event.target.value)}
                  style={{ width: "100%", marginTop: 6, padding: 8 }}
                >
                  <option value="camera-configuration">Camera configuration</option>
                  <option value="recording">Recording</option>
                  <option value="analytics">Analytics</option>
                  <option value="privacy">Privacy</option>
                  <option value="network">Network</option>
                  <option value="security-hardening">Security hardening</option>
                  <option value="location">Location</option>
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 12 }}>
                Category
                <input
                  value={templateCategory}
                  onChange={(event) => setTemplateCategory(event.target.value)}
                  style={{ width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>
              <label style={{ display: "block", marginBottom: 12 }}>
                Settings (JSON)
                <textarea
                  value={templateSettings}
                  onChange={(event) => setTemplateSettings(event.target.value)}
                  rows={8}
                  style={{ width: "100%", marginTop: 6, padding: 8, fontFamily: "monospace" }}
                />
              </label>
              <button type="submit" style={{ padding: "10px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8 }}>
                Create template
              </button>
            </form>
            {templateResult && (
              <div style={{ marginTop: 16, padding: 14, border: "1px solid #d1fae5", background: "#ecfdf5", borderRadius: 10 }}>
                {templateResult.error ? (
                  <p style={{ margin: 0, color: "#991b1b" }}>{templateResult.error}</p>
                ) : (
                  <p style={{ margin: 0 }}>Template created: {templateResult.name}</p>
                )}
              </div>
            )}
          </div>
        </section>

        <section style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <h2>Existing templates</h2>
          {loading ? (
            <p>Loading templates…</p>
          ) : templates.length === 0 ? (
            <p>No templates have been created yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 10 }}>Name</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Type</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Category</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: 10 }}>{template.name}</td>
                    <td style={{ padding: 10 }}>{template.templateType}</td>
                    <td style={{ padding: 10 }}>{template.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
