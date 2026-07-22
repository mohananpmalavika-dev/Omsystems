"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { cameraInventoryApi } from "@/lib/api-client";

export default function PrivacyCameraSelectorPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [cameraOptions, setCameraOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCameras = async () => {
      setLoading(true);
      setError(null);

      try {
        const branchResponse = await cameraInventoryApi.listBranches("device:configure");
        const branchesWithCameras = await Promise.all(
          branchResponse.data.map(async (branch: any) => {
            const camerasResponse = await cameraInventoryApi.listByBranch(branch.id, "analytics:view");
            return camerasResponse.data.map((camera: any) => ({
              ...camera,
              branchName: branch.name,
            }));
          })
        );

        setCameraOptions(branchesWithCameras.flat());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void loadCameras();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1>Select a Camera</h1>
          <p style={{ color: "#555" }}>
            Choose a camera to assign a privacy purpose and review its current purpose assignments.
          </p>
        </div>
        <Link href="/maintenance/privacy" style={{ color: "#2563eb" }}>
          Back to privacy
        </Link>
      </div>

      {error && (
        <div style={{ marginBottom: 20, padding: 14, background: "#fee", border: "1px solid #fbb", borderRadius: 10, color: "#900" }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading cameras…</p>
      ) : cameraOptions.length === 0 ? (
        <p style={{ color: "#4b5563" }}>No cameras available for assignment.</p>
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          {(() => {
            const groups = cameraOptions.reduce((acc: Record<string, any[]>, camera) => {
              const branch = camera.branchName || "Unassigned branch";
              if (!acc[branch]) acc[branch] = [];
              acc[branch].push(camera);
              return acc;
            }, {} as Record<string, any[]>);

            return Object.entries(groups).map(([branchName, cameras]) => (
              <div key={branchName}>
                <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{branchName}</h2>
                <div style={{ display: "grid", gap: 12 }}>
                  {cameras.map((camera) => (
                    <Link
                      key={camera.id}
                      href={`/maintenance/privacy/cameras/${encodeURIComponent(camera.id)}/purposes`}
                      style={{
                        display: "block",
                        padding: 18,
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        background: "#fff",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <strong>{camera.name || camera.model || camera.id}</strong>
                          <p style={{ margin: "8px 0 0", color: "#6b7280" }}>{camera.vendor ? camera.vendor.toUpperCase() : "Unknown vendor"}</p>
                        </div>
                        <span style={{ color: "#2563eb" }}>{camera.status}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
